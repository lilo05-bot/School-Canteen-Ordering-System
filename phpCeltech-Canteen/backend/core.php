<?php
declare(strict_types=1);

final class ApiError extends RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function fail(int $status, string $message): never { throw new ApiError($status, $message); }
function timestamp(): string { return gmdate('Y-m-d\TH:i:s') . '+00:00'; }
function query(PDO $db, string $sql, array $params = []): PDOStatement {
    $stmt = $db->prepare($sql); $stmt->execute($params); return $stmt;
}
function transaction(PDO $db, callable $action): mixed {
    $db->exec('BEGIN IMMEDIATE');
    try { $result = $action(); $db->exec('COMMIT'); return $result; }
    catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
}
// Same PBKDF2 parameters as the previous Python backend; existing logins still work.
function passwordHash(string $password, string $salt): string {
    return hash_pbkdf2('sha256', $password, hex2bin($salt), 600000, 64);
}
function createUser(PDO $db, string $username, string $password, string $role): void {
    $salt = bin2hex(random_bytes(16));
    query($db, 'INSERT INTO users(username,salt,password_hash,role,created_at) VALUES(?,?,?,?,?)',
        [$username, $salt, passwordHash($password, $salt), $role, timestamp()]);
}
function database(): PDO {
    $path = getenv('CELTECH_DATABASE') ?: __DIR__ . '/data/celtech.sqlite3';
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0700, true);
    $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=15000; PRAGMA journal_mode=WAL;');
    $db->exec("
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('student','owner')),created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',price_cents INTEGER NOT NULL CHECK(price_cents>0),category TEXT NOT NULL,photo TEXT NOT NULL DEFAULT '',stock INTEGER NOT NULL CHECK(stock>=0),active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE,user_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Pending','Ready','Collected')),total_cents INTEGER NOT NULL,items TEXT NOT NULL,payment TEXT,request_id TEXT NOT NULL,UNIQUE(user_id,request_id));
        CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL,actor TEXT NOT NULL,category TEXT NOT NULL,detail TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS login_attempts(address TEXT NOT NULL,attempted REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id,created_at);
        CREATE INDEX IF NOT EXISTS attempts_time ON login_attempts(attempted);
    ");
    transaction($db, function () use ($db) {
        if (!query($db, "SELECT id FROM users WHERE role='owner' LIMIT 1")->fetch()) {
            $password = getenv('CELTECH_OWNER_PASSWORD');
            if (!$password || strlen($password) < 8 || strlen($password) > 128)
                fail(503, 'First setup: set CELTECH_OWNER_PASSWORD to an 8–128 character password, then restart PHP.');
            createUser($db, 'merza', $password, 'owner');
        }
        if (!query($db, 'SELECT id FROM products LIMIT 1')->fetch()) {
            foreach (json_decode(file_get_contents(__DIR__ . '/seed_products.json'), true, 512, JSON_THROW_ON_ERROR) as $p)
                query($db, 'INSERT INTO products(name,description,price_cents,category,photo,stock) VALUES(?,?,?,?,?,20)',
                    [$p['name'], $p['description'], (int) round($p['price'] * 100), $p['category'], $p['photo']]);
        }
    });
    return $db;
}
function displayName(array $u): string { return ($u['role'] === 'owner' ? 'Owner ' : 'Student ') . $u['username']; }
function account(array $u): array { return ['name' => displayName($u), 'owner' => $u['role'] === 'owner']; }
function recordActivity(PDO $db, array $u, string $category, string $detail): void {
    query($db, 'INSERT INTO activity(created_at,actor,category,detail) VALUES(?,?,?,?)', [timestamp(), displayName($u), $category, $detail]);
}
function authenticated(PDO $db, ?string $role = null): array {
    $token = $_COOKIE['celtech_session'] ?? '';
    $u = query($db, 'SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE token_hash=? AND expires>?', [hash('sha256', $token), time()])->fetch();
    if (!$token || !$u) fail(401, 'Please log in again.');
    if ($role && $u['role'] !== $role) fail(403, $role === 'owner' ? 'Canteen owner access required' : 'Only students can place orders');
    return $u;
}
function fields(array $body, array $allowed, array $required): void {
    if (array_diff(array_keys($body), $allowed) || array_diff($required, array_keys($body))) fail(422, 'Invalid request fields');
}
function text(array $body, string $key, int $min, int $max): string {
    $v = $body[$key] ?? null;
    if (!is_string($v) || strlen($v) < $min || strlen($v) > $max) fail(422, "Invalid $key length");
    return $v;
}
function integer(mixed $v, int $min, int $max): int {
    if (!is_int($v) || $v < $min || $v > $max) fail(422, 'Invalid integer quantity');
    return $v;
}
function cents(mixed $v): int {
    if ((!is_string($v) && !is_int($v) && !is_float($v)) || !preg_match('/^\d+(?:\.\d{1,2})?$/D', (string) $v) || (float) $v > 1000000)
        fail(422, 'Use a valid peso amount with at most two decimal places');
    return (int) round((float) $v * 100);
}
function cookie(string $token, int $expires): void {
    setcookie('celtech_session', $token, ['expires' => $expires, 'path' => '/api', 'secure' => getenv('CELTECH_COOKIE_SECURE') === 'true', 'httponly' => true, 'samesite' => 'Strict']);
}
function throttle(PDO $db, string $address, int $limit): void {
    transaction($db, function () use ($db, $address, $limit) {
        query($db, 'DELETE FROM login_attempts WHERE attempted<?', [time() - 900]);
        if ((int) query($db, 'SELECT COUNT(*) FROM login_attempts WHERE address=?', [$address])->fetchColumn() >= $limit) fail(429, 'Too many attempts. Try again in 15 minutes.');
        query($db, 'INSERT INTO login_attempts VALUES(?,?)', [$address, time()]);
    });
}
function addAccount(PDO $db, array $b, string $role, ?array $actor): array {
    $key = $role === 'owner' ? 'username' : 'number';
    fields($b, [$key, 'password'], [$key, 'password']);
    $name = trim(text($b, $key, 3, 30)); $password = text($b, 'password', 8, 128);
    if ($role === 'student') $name = strtoupper($name);
    if (!preg_match($role === 'owner' ? '/^[A-Za-z0-9_.-]{3,30}$/D' : '/^[A-Z0-9-]{3,30}$/D', $name)
        || in_array(strtolower($name), ['owner', 'merza14345'], true)) fail(422, 'Invalid or reserved account name');
    return transaction($db, function () use ($db, $name, $password, $role, $actor, $key) {
        if (query($db, 'SELECT id FROM users WHERE lower(username)=lower(?)', [$name])->fetch()) fail(409, 'This username or student number already has an account');
        createUser($db, $name, $password, $role);
        $u = query($db, 'SELECT * FROM users WHERE username=?', [$name])->fetch();
        recordActivity($db, $actor ?? $u, 'Accounts', "Created $role account $name.");
        return [$key => $name, 'createdAt' => $u['created_at']];
    });
}
function product(array $p): array {
    return ['id' => (int) $p['id'], 'name' => $p['name'], 'description' => $p['description'], 'price' => $p['price_cents'] / 100, 'category' => $p['category'], 'photo' => $p['photo'], 'stock' => (int) $p['stock'], 'tag' => '', 'calories' => 0];
}
function photo(string $value): string {
    if ($value === '') return '';
    if (strlen($value) > 900000 || !preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$~D', $value, $m)) fail(422, 'Upload a JPG, PNG, or WebP image');
    $raw = base64_decode($m[2], true); $size = $raw === false ? false : @getimagesizefromstring($raw);
    if (!$size || !in_array($size['mime'], ['image/jpeg', 'image/png', 'image/webp'], true) || $size[0] * $size[1] > 12000000) fail(422, 'Invalid image or dimensions too large');
    $source = @imagecreatefromstring($raw);
    if (!$source) fail(422, 'Could not read the uploaded image');
    $scale = min(1, 600 / max($size[0], $size[1]));
    $output = imagecreatetruecolor(max(1, (int) ($size[0] * $scale)), max(1, (int) ($size[1] * $scale)));
    imagefill($output, 0, 0, imagecolorallocate($output, 255, 255, 255));
    imagecopyresampled($output, $source, 0, 0, 0, 0, imagesx($output), imagesy($output), $size[0], $size[1]);
    ob_start(); imagejpeg($output, null, 80); $jpeg = ob_get_clean();
    imagedestroy($source); imagedestroy($output);
    return 'data:image/jpeg;base64,' . base64_encode($jpeg);
}
function findOrder(PDO $db, string $id): array {
    $o = query($db, 'SELECT orders.*,users.username FROM orders JOIN users ON orders.user_id=users.id WHERE orders.id=?', [$id])->fetch();
    if (!$o) fail(404, 'Order not found'); return $o;
}
function orderJson(array $o): array {
    return ['id' => $o['id'], 'number' => $o['number'], 'student' => 'Student ' . $o['username'], 'createdAt' => $o['created_at'], 'status' => $o['status'], 'total' => $o['total_cents'] / 100, 'items' => json_decode($o['items'], true), 'payment' => $o['payment'] ? json_decode($o['payment'], true) : null];
}
function dispatch(PDO $db, string $method, string $path, array $b): mixed {
    $address = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    if ($method === 'GET' && $path === '/api/health') return ['status' => 'ok', 'storage' => 'sqlite', 'backend' => 'php'];
    if ($method === 'POST' && $path === '/api/auth/register') {
        throttle($db, 'register:' . $address, 20); http_response_code(201); return addAccount($db, $b, 'student', null);
    }
    if ($method === 'POST' && $path === '/api/auth/login') {
        fields($b, ['username', 'password', 'role'], ['username', 'password', 'role']);
        $name = trim(text($b, 'username', 1, 30)); $password = text($b, 'password', 1, 128);
        if (!in_array($b['role'], ['Student', 'Canteen owner'], true)) fail(422, 'Invalid role');
        $role = $b['role'] === 'Student' ? 'student' : 'owner';
        if ($role === 'student') $name = strtoupper($name);
        throttle($db, $address, 15);
        $u = query($db, 'SELECT * FROM users WHERE username=?', [$name])->fetch();
        $valid = hash_equals($u['password_hash'] ?? str_repeat('0', 64), passwordHash($password, $u['salt'] ?? str_repeat('0', 32)));
        if (!$valid || !$u || $u['role'] !== $role) fail(401, 'Incorrect student number or username, or password');
        $token = bin2hex(random_bytes(32));
        transaction($db, function () use ($db, $address, $token, $u) {
            query($db, 'DELETE FROM login_attempts WHERE address=?', [$address]);
            query($db, 'DELETE FROM sessions WHERE expires<? OR token_hash=?', [time(), hash('sha256', $_COOKIE['celtech_session'] ?? '')]);
            query($db, 'INSERT INTO sessions VALUES(?,?,?)', [hash('sha256', $token), $u['id'], time() + 28800]);
        });
        cookie($token, time() + 28800); return account($u);
    }
    if ($method === 'POST' && $path === '/api/auth/logout') {
        query($db, 'DELETE FROM sessions WHERE token_hash=?', [hash('sha256', $_COOKIE['celtech_session'] ?? '')]);
        cookie('', time() - 3600); return ['ok' => true];
    }
    $u = authenticated($db);
    if ($method === 'GET' && $path === '/api/auth/me') return account($u);
    if (in_array($path, ['/api/students', '/api/owners'], true)) {
        authenticated($db, 'owner'); $role = $path === '/api/owners' ? 'owner' : 'student'; $key = $role === 'owner' ? 'username' : 'number';
        if ($method === 'GET') return array_map(fn($r) => [$key => $r['username'], 'createdAt' => $r['created_at']], query($db, 'SELECT username,created_at FROM users WHERE role=? ORDER BY created_at DESC', [$role])->fetchAll());
        if ($method === 'POST') { http_response_code(201); return addAccount($db, $b, $role, $u); }
    }
    if ($method === 'GET' && $path === '/api/products') return array_map('product', query($db, 'SELECT * FROM products WHERE active=1 ORDER BY id')->fetchAll());
    if ($method === 'POST' && $path === '/api/products') {
        authenticated($db, 'owner'); fields($b, ['name', 'price', 'category', 'photo'], ['name', 'price', 'category']);
        $name = trim(text($b, 'name', 1, 60)); $price = cents($b['price']);
        if (!$name || !$price || !in_array($b['category'], ['Food', 'Beverages'], true)) fail(422, 'Enter a valid name, category, and price greater than zero');
        $image = photo(text($b + ['photo' => ''], 'photo', 0, 900000));
        http_response_code(201);
        return transaction($db, function () use ($db, $b, $name, $price, $image, $u) {
            query($db, 'INSERT INTO products(name,price_cents,category,photo,stock) VALUES(?,?,?,?,0)', [$name, $price, $b['category'], $image]);
            $id = $db->lastInsertId(); recordActivity($db, $u, 'Products', "Added $name; starting stock: 0.");
            return product(query($db, 'SELECT * FROM products WHERE id=?', [$id])->fetch());
        });
    }
    if (preg_match('~^/api/products/([1-9][0-9]*)(/stock)?$~D', $path, $m) && (($method === 'PATCH' && isset($m[2])) || ($method === 'DELETE' && !isset($m[2])))) {
        authenticated($db, 'owner');
        if ($method === 'PATCH') { fields($b, ['stock'], ['stock']); integer($b['stock'], 0, 1000000); }
        return transaction($db, function () use ($db, $m, $method, $b, $u) {
            $p = query($db, 'SELECT * FROM products WHERE id=? AND active=1', [$m[1]])->fetch();
            if (!$p) fail(404, 'Product not found');
            if ($method === 'DELETE') {
                query($db, 'UPDATE products SET active=0 WHERE id=?', [$m[1]]);
                recordActivity($db, $u, 'Products', 'Removed ' . $p['name'] . '.'); return ['ok' => true];
            }
            query($db, 'UPDATE products SET stock=? WHERE id=?', [$b['stock'], $m[1]]);
            if ((int) $p['stock'] !== $b['stock']) recordActivity($db, $u, 'Stock', "{$p['name']} — stock updated from {$p['stock']} to {$b['stock']} units.");
            return product(query($db, 'SELECT * FROM products WHERE id=?', [$m[1]])->fetch());
        });
    }
    if ($method === 'GET' && $path === '/api/orders') {
        $sql = 'SELECT orders.*,users.username FROM orders JOIN users ON orders.user_id=users.id';
        return array_map('orderJson', query($db, $sql . ($u['role'] === 'owner' ? '' : ' WHERE orders.user_id=?') . ' ORDER BY orders.created_at', $u['role'] === 'owner' ? [] : [$u['id']])->fetchAll());
    }
    if ($method === 'POST' && $path === '/api/orders') {
        authenticated($db, 'student'); fields($b, ['items', 'request_id'], ['items', 'request_id']);
        $request = text($b, 'request_id', 16, 100);
        if (!preg_match('/^[A-Za-z0-9-]+$/D', $request) || !is_array($b['items']) || !array_is_list($b['items']) || count($b['items']) < 1 || count($b['items']) > 100) fail(422, 'Invalid cart');
        $quantities = [];
        foreach ($b['items'] as $item) {
            if (!is_array($item)) fail(422, 'Invalid cart item');
            fields($item, ['id', 'quantity'], ['id', 'quantity']); $id = integer($item['id'], 1, PHP_INT_MAX);
            $quantities[$id] = ($quantities[$id] ?? 0) + integer($item['quantity'], 1, 1000);
        }
        http_response_code(201);
        return transaction($db, function () use ($db, $u, $request, $quantities) {
            $existing = query($db, 'SELECT id FROM orders WHERE user_id=? AND request_id=?', [$u['id'], $request])->fetch();
            if ($existing) return orderJson(findOrder($db, $existing['id']));
            $items = []; $total = 0;
            foreach ($quantities as $id => $quantity) {
                $p = query($db, 'SELECT * FROM products WHERE id=? AND active=1', [$id])->fetch();
                if (!$p || $quantity > $p['stock'] || $quantity > 1000) fail(409, 'Some products are unavailable in this quantity. Please update your order.');
                $items[] = ['name' => $p['name'], 'quantity' => $quantity, 'price' => $p['price_cents'] / 100];
                $total += $quantity * $p['price_cents'];
                query($db, 'UPDATE products SET stock=stock-? WHERE id=?', [$quantity, $id]);
            }
            $id = bin2hex(random_bytes(16)); $number = 'CT-' . strtoupper(substr($id, 0, 12));
            query($db, "INSERT INTO orders(id,number,user_id,created_at,status,total_cents,items,request_id) VALUES(?,?,?,?,'Pending',?,?,?)", [$id, $number, $u['id'], timestamp(), $total, json_encode($items), $request]);
            recordActivity($db, $u, 'Orders', "$number — pending order placed; stock reserved.");
            return orderJson(findOrder($db, $id));
        });
    }
    if ($method === 'POST' && preg_match('~^/api/orders/([a-f0-9]{32})/(ready|collect)$~D', $path, $m)) {
        authenticated($db, 'owner');
        if ($m[2] === 'collect') { fields($b, ['cash'], ['cash']); $cash = cents($b['cash']); }
        else { fields($b, [], []); $cash = 0; }
        return transaction($db, function () use ($db, $u, $m, $cash) {
            $o = findOrder($db, $m[1]); $collect = $m[2] === 'collect';
            if ($o['status'] !== ($collect ? 'Ready' : 'Pending')) fail(409, 'Order is not in the required state; payment may already be recorded');
            if ($collect) {
                if ($cash < $o['total_cents']) fail(422, 'Cash received must cover the order total');
                $payment = ['cash' => $cash / 100, 'change' => ($cash - $o['total_cents']) / 100, 'paidAt' => timestamp(), 'cashier' => displayName($u)];
                query($db, "UPDATE orders SET status='Collected',payment=? WHERE id=?", [json_encode($payment), $m[1]]);
                recordActivity($db, $u, 'Orders', $o['number'] . ' — collected; cash ₱' . number_format($cash / 100, 2) . ', change ₱' . number_format($payment['change'], 2) . '. Receipt saved.');
            } else {
                query($db, "UPDATE orders SET status='Ready' WHERE id=?", [$m[1]]);
                recordActivity($db, $u, 'Orders', $o['number'] . ' — ready for pickup.');
            }
            return orderJson(findOrder($db, $m[1]));
        });
    }
    if ($method === 'GET' && $path === '/api/activity') {
        authenticated($db, 'owner');
        return array_map(function ($r) { $r['id'] = (string) $r['id']; return $r; }, query($db, 'SELECT * FROM activity ORDER BY id DESC LIMIT 1000')->fetchAll());
    }
    fail(404, 'API route not found');
}
