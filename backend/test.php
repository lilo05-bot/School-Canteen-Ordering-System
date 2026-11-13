<?php
declare(strict_types=1);
require __DIR__ . '/core.php';
$temp = sys_get_temp_dir() . '/celtech-php-' . bin2hex(random_bytes(8)) . '.sqlite3';
putenv('CELTECH_DATABASE=' . $temp);
putenv('CELTECH_OWNER_PASSWORD=' . bin2hex(random_bytes(16)));
function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
function rejected(callable $action, int $status): void {
    try { $action(); } catch (ApiError $e) { check($e->status === $status, 'Unexpected rejection code'); return; }
    throw new RuntimeException('Expected request rejection');
}
function asUser(PDO $db, string $name): void {
    $id = query($db, 'SELECT id FROM users WHERE username=?', [$name])->fetchColumn();
    $token = bin2hex(random_bytes(32));
    query($db, 'INSERT INTO sessions VALUES(?,?,?)', [hash('sha256', $token), $id, time() + 3600]);
    $_COOKIE['celtech_session'] = $token;
}
try {
    $db = database();
    check(passwordHash('password', str_repeat('00', 16)) === hash_pbkdf2('sha256', 'password', str_repeat("\0", 16), 600000, 64), 'PBKDF2 mismatch');
    $db->exec('DELETE FROM sessions'); $_COOKIE = [];
    rejected(fn() => dispatch($db, 'GET', '/api/owners', []), 401);
    $student = dispatch($db, 'POST', '/api/auth/register', ['number' => '2026-001', 'password' => 'Student-test-123']);
    check($student['number'] === '2026-001', 'Student registration failed');
    dispatch($db, 'POST', '/api/auth/login', ['username' => '2026-001', 'password' => 'Student-test-123', 'role' => 'Student']);
    rejected(fn() => dispatch($db, 'POST', '/api/auth/login', ['username' => '2026-001', 'password' => 'wrong', 'role' => 'Student']), 401);
    asUser($db, '2026-001');
    rejected(fn() => dispatch($db, 'GET', '/api/owners', []), 403);
    $products = dispatch($db, 'GET', '/api/products', []);
    $p = $products[0];
    $cart = ['items' => [['id' => $p['id'], 'quantity' => 2]], 'request_id' => 'php-regression-0001'];
    $order = dispatch($db, 'POST', '/api/orders', $cart);
    check($order['status'] === 'Pending' && $order['total'] === $p['price'] * 2, 'Order calculation failed');
    $repeat = dispatch($db, 'POST', '/api/orders', $cart);
    check($repeat['id'] === $order['id'], 'Order idempotency failed');
    check((int) query($db, 'SELECT stock FROM products WHERE id=?', [$p['id']])->fetchColumn() === $p['stock'] - 2, 'Stock reservation failed');
    $badCart = ['items' => [['id' => $p['id'], 'quantity' => 1], ['id' => 999999, 'quantity' => 1]], 'request_id' => 'php-rollback-00001'];
    rejected(fn() => dispatch($db, 'POST', '/api/orders', $badCart), 409);
    check((int) query($db, 'SELECT stock FROM products WHERE id=?', [$p['id']])->fetchColumn() === $p['stock'] - 2, 'Stock rollback failed');
    rejected(fn() => dispatch($db, 'POST', '/api/orders/' . $order['id'] . '/ready', []), 403);
    asUser($db, 'merza');
    $newOwner = dispatch($db, 'POST', '/api/owners', ['username' => 'staff.one', 'password' => 'Owner-test-123']);
    check($newOwner['username'] === 'staff.one', 'Owner creation failed');
    rejected(fn() => dispatch($db, 'POST', '/api/owners', ['username' => 'STAFF.ONE', 'password' => 'Owner-test-123']), 409);
    dispatch($db, 'POST', '/api/auth/login', ['username' => 'staff.one', 'password' => 'Owner-test-123', 'role' => 'Canteen owner']);
    asUser($db, 'staff.one');
    $added = dispatch($db, 'POST', '/api/products', ['name' => 'Test snack', 'price' => '15.25', 'category' => 'Food', 'photo' => '']);
    check($added['stock'] === 0 && $added['price'] === 15.25, 'Product creation failed');
    $stock = dispatch($db, 'PATCH', '/api/products/' . $added['id'] . '/stock', ['stock' => 10]);
    check($stock['stock'] === 10, 'Stock update failed');
    rejected(fn() => photo('data:image/png;base64,YmFk'), 422);
    $ready = dispatch($db, 'POST', '/api/orders/' . $order['id'] . '/ready', []);
    check($ready['status'] === 'Ready', 'Ready transition failed');
    rejected(fn() => dispatch($db, 'POST', '/api/orders/' . $order['id'] . '/collect', ['cash' => 0]), 422);
    $receipt = dispatch($db, 'POST', '/api/orders/' . $order['id'] . '/collect', ['cash' => $order['total'] + 10]);
    check($receipt['status'] === 'Collected' && $receipt['payment']['change'] === 10, 'Receipt calculation failed');
    rejected(fn() => dispatch($db, 'POST', '/api/orders/' . $order['id'] . '/collect', ['cash' => $order['total'] + 10]), 409);
    check(count(dispatch($db, 'GET', '/api/activity', [])) > 0, 'Activity log missing');
    rejected(fn() => dispatch($db, 'POST', '/api/products/' . $added['id'], []), 404);
    dispatch($db, 'DELETE', '/api/products/' . $added['id'], []);
    asUser($db, '2026-001');
    $history = dispatch($db, 'GET', '/api/orders', []);
    check(count($history) === 1 && $history[0]['payment']['change'] === 10, 'Student receipt history failed');
    dispatch($db, 'POST', '/api/auth/logout', []);
    rejected(fn() => dispatch($db, 'GET', '/api/auth/me', []), 401);
    echo "PHP regression checks passed.\n";
} catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
finally {
    $db = null;
    foreach ([$temp, $temp . '-wal', $temp . '-shm'] as $file) if (is_file($file)) unlink($file);
}
