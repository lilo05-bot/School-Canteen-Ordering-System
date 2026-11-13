<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/core.php';
echo "Reset an owner's password. Input is visible; use a private terminal.\nUsername [merza]: ";
$name = trim(fgets(STDIN)) ?: 'merza';
echo 'New password (8–128 characters): '; $password = rtrim(fgets(STDIN), "\r\n");
echo 'Confirm password: '; $confirm = rtrim(fgets(STDIN), "\r\n");
if ($password !== $confirm || strlen($password) < 8 || strlen($password) > 128) exit("Passwords must match and contain 8–128 characters.\n");
try {
    $db = database();
    transaction($db, function () use ($db, $name, $password) {
        $u = query($db, "SELECT * FROM users WHERE username=? AND role='owner'", [$name])->fetch();
        if (!$u) fail(404, 'Owner account not found');
        $salt = bin2hex(random_bytes(16));
        query($db, 'UPDATE users SET salt=?,password_hash=? WHERE id=?', [$salt, passwordHash($password, $salt), $u['id']]);
        query($db, 'DELETE FROM sessions WHERE user_id=?', [$u['id']]);
        recordActivity($db, $u, 'Accounts', 'Owner password reset through server administration; previous sessions revoked.');
    });
    echo "Password updated. Log in again.\n";
} catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
