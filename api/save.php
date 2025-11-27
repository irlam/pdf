<?php
// /api/save.php
declare(strict_types=1);
header('Content-Type: application/json');

$baseDir = __DIR__ . '/../storage';
if (!is_dir($baseDir)) { mkdir($baseDir, 0775, true); }

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
  http_response_code(400);
  echo json_encode(['ok'=>false,'error'=>'No file']); exit;
}

$fname = 'edited-' . date('Ymd-His') . '.pdf';
$path = $baseDir . '/' . $fname;
if (!move_uploaded_file($_FILES['file']['tmp_name'], $path)) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'Cannot write file']); exit;
}

echo json_encode(['ok'=>true,'path'=>"/storage/$fname"]);
