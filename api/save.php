<?php
// /api/save.php
// Handles PDF upload with basic validation and version management
declare(strict_types=1);

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

// Configuration
$baseDir = __DIR__ . '/../storage';
$maxFileSize = 100 * 1024 * 1024; // 100 MB max
$allowedMimeTypes = ['application/pdf'];

// Helper function for error responses
function respond_error(string $message, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

// Ensure storage directory exists
if (!is_dir($baseDir)) {
    if (!@mkdir($baseDir, 0775, true)) {
        respond_error('Cannot create storage directory', 500);
    }
}

// Validate request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_error('Only POST method allowed', 405);
}

// Validate file upload
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE => 'File exceeds PHP upload limit',
        UPLOAD_ERR_FORM_SIZE => 'File exceeds form limit',
        UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write to disk',
    ];
    $errorCode = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    respond_error($errorMessages[$errorCode] ?? 'Upload failed', 400);
}

$uploadedFile = $_FILES['file'];

// Validate file size
if ($uploadedFile['size'] > $maxFileSize) {
    respond_error('File too large (max 100MB)', 413);
}

if ($uploadedFile['size'] === 0) {
    respond_error('Empty file uploaded', 400);
}

// Validate MIME type (check actual content, not just extension)
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($uploadedFile['tmp_name']);
if (!in_array($mimeType, $allowedMimeTypes, true)) {
    respond_error('Only PDF files are allowed', 415);
}

// Validate PDF header (first 5 bytes should be %PDF-)
$handle = fopen($uploadedFile['tmp_name'], 'rb');
if ($handle === false) {
    respond_error('Cannot read uploaded file', 500);
}
$header = fread($handle, 5);
fclose($handle);
if ($header !== '%PDF-') {
    respond_error('Invalid PDF file format', 415);
}

// Sanitize version name (if provided)
$versionName = '';
if (isset($_POST['name']) && is_string($_POST['name'])) {
    // Only allow alphanumeric, dash, underscore
    $versionName = preg_replace('/[^a-zA-Z0-9_-]/', '', substr(trim($_POST['name']), 0, 50));
}

// Get keep count (for version pruning)
$keepN = 5;
if (isset($_POST['keep']) && is_numeric($_POST['keep'])) {
    $keepN = max(1, min(20, (int)$_POST['keep']));
}

// Generate safe filename
$timestamp = date('Ymd-His');
$fname = 'edited-' . $timestamp . ($versionName ? '-' . $versionName : '') . '.pdf';
$path = $baseDir . '/' . $fname;

// Prevent path traversal (paranoid check)
$realBase = realpath($baseDir);
$expectedPath = $realBase . DIRECTORY_SEPARATOR . $fname;
if (strpos($expectedPath, $realBase) !== 0) {
    respond_error('Invalid file path', 400);
}

// Move uploaded file
if (!move_uploaded_file($uploadedFile['tmp_name'], $path)) {
    respond_error('Cannot save file', 500);
}

// Prune old versions (keep only last N files)
$files = glob($baseDir . '/edited-*.pdf');
if ($files !== false && count($files) > $keepN) {
    // Sort by modification time (oldest first)
    usort($files, function($a, $b) {
        return filemtime($a) - filemtime($b);
    });
    // Remove oldest files beyond keepN
    $toRemove = array_slice($files, 0, count($files) - $keepN);
    foreach ($toRemove as $oldFile) {
        @unlink($oldFile);
    }
}

echo json_encode([
    'ok' => true,
    'path' => '/storage/' . $fname,
    'size' => filesize($path),
    'timestamp' => $timestamp
]);
