<?php
declare(strict_types=1);
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    $method = $_SERVER['REQUEST_METHOD'];
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true) && ($_SERVER['HTTP_X_CELTECH_REQUEST'] ?? '') !== '1') fail(403, 'Missing application request header');
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2000000) fail(413, 'Request too large');
    $raw = file_get_contents('php://input', false, null, 0, 2000001);
    if (strlen($raw) > 2000000) fail(413, 'Request too large');
    $body = [];
    if ($raw !== '') {
        $decoded = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        if (!$decoded instanceof stdClass) fail(422, 'Expected a JSON object');
        $body = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    }
    echo json_encode(dispatch(database(), $method, $path, $body), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
} catch (ApiError $e) {
    http_response_code($e->status); echo json_encode(['detail' => $e->getMessage()]);
} catch (JsonException $e) {
    http_response_code(422); echo json_encode(['detail' => 'Invalid JSON']);
} catch (Throwable $e) {
    error_log('Celtech API error: ' . $e->getMessage());
    http_response_code(500); echo json_encode(['detail' => 'Server error. Check the PHP terminal and required extensions.']);
}
