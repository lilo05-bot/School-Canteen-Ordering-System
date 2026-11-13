<?php
// Development router. Only public/ is served; backend/data is never web-accessible.
declare(strict_types=1);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/')) { require __DIR__ . '/backend/api.php'; return true; }
$root = realpath(__DIR__ . '/public');
$target = realpath($root . '/' . rawurldecode($path));
if ($target && str_starts_with($target, $root . DIRECTORY_SEPARATOR) && is_file($target)) return false;
if ($path === '/' || !pathinfo($path, PATHINFO_EXTENSION)) { readfile($root . '/index.html'); return true; }
http_response_code(404); echo 'Not found';
