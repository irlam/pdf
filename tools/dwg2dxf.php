<?php
// /tools/dwg2dxf.php
// DWG -> DXF converter for your Plesk host (self-contained paths).
// Requires one of these binaries uploaded to /tools/bin/ and chmod 755:
//   - LibreDWG:  dwg2dxf          (preferred)
//   - ODA:       ODAFileConverter (optional fallback)

declare(strict_types=1);

// ---- config (self-contained paths) ----
$PATH_LIBREDWG = __DIR__ . '/bin/dwg2dxf';
$PATH_ODA      = __DIR__ . '/bin/ODAFileConverter';

$PUBLIC_OUT_DIR = $_SERVER['DOCUMENT_ROOT'] . '/uploads/dxf/';
$PUBLIC_BASE_URL = '/uploads/dxf/';

$MAX_BYTES = 150 * 1024 * 1024; // 150 MB

@ini_set('max_execution_time', '300');
@ini_set('memory_limit', '1024M');

// ensure output dir
if (!is_dir($PUBLIC_OUT_DIR)) { @mkdir($PUBLIC_OUT_DIR, 0755, true); }

function fail($msg, $code=400){
  http_response_code($code);
  header('Content-Type: application/json');
  echo json_encode(['ok'=>false,'error'=>$msg], JSON_UNESCAPED_SLASHES);
  exit;
}
function have_exec(): bool {
  return function_exists('exec') && !in_array('exec', array_map('trim', explode(',', (string)ini_get('disable_functions'))), true);
}

// GET -> tiny upload form (handy for manual tests)
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  ?>
  <!doctype html><meta charset="utf-8">
  <title>DWG → DXF</title>
  <link rel="stylesheet" href="/assets/ui.css">
  <div class="wrap" style="max-width:680px;margin:30px auto;color:#e5e7eb">
    <h2>DWG → DXF Converter</h2>
    <form method="post" enctype="multipart/form-data" class="bar" style="gap:10px">
      <input type="file" name="dwg" accept=".dwg" required>
      <select name="ver">
        <option value="">Auto</option>
        <option value="r2013">DXF R2013</option>
        <option value="r2010">DXF R2010</option>
        <option value="r2007">DXF R2007</option>
        <option value="r2004">DXF R2004</option>
        <option value="r2000">DXF R2000</option>
        <option value="r14">DXF R14</option>
        <option value="r12">DXF R12</option>
      </select>
      <button type="submit">Convert</button>
    </form>
  </div>
  <?php
  exit;
}

if (!isset($_FILES['dwg']) || $_FILES['dwg']['error'] !== UPLOAD_ERR_OK) fail('Upload failed.');
if (!have_exec()) fail('exec() disabled by hosting.');

$tmpName = $_FILES['dwg']['tmp_name'];
$origName = $_FILES['dwg']['name'];
$size = (int)$_FILES['dwg']['size'];
if ($size <= 0 || $size > $MAX_BYTES) fail('File too large or empty.');
if (strtolower(pathinfo($origName, PATHINFO_EXTENSION)) !== 'dwg') fail('Only .dwg files are accepted.');

$workRoot = sys_get_temp_dir() . '/dwg2dxf_' . bin2hex(random_bytes(6));
if (!mkdir($workRoot, 0700, true)) fail('Cannot create temp dir.');
$inPath  = $workRoot . '/in.dwg';
$outPath = $workRoot . '/out.dxf';
if (!move_uploaded_file($tmpName, $inPath)) fail('Cannot store upload.');

$ver = isset($_POST['ver']) ? trim($_POST['ver']) : '';
$verFlagLibre = $ver ? (' --as ' . escapeshellarg($ver)) : '';
$verOda = $ver ? strtoupper($ver) : 'ACAD2013';

$used = null; $rc=0; $out=[]; $cmd='';

// 1) LibreDWG
if (is_executable($PATH_LIBREDWG)) {
  $cmd = escapeshellcmd($PATH_LIBREDWG) . ' -y' . $verFlagLibre . ' ' . escapeshellarg($inPath) . ' ' . escapeshellarg($outPath);
  exec($cmd . ' 2>&1', $out, $rc);
  if ($rc === 0 && file_exists($outPath) && filesize($outPath) > 0) $used = 'libredwg';
}

// 2) ODA fallback
if ($used === null && is_executable($PATH_ODA)) {
  $srcDir = $workRoot . '/src';
  $dstDir = $workRoot . '/dst';
  @mkdir($srcDir, 0700, true); @mkdir($dstDir, 0700, true);
  $base = 'input.dwg'; rename($inPath, $srcDir . '/' . $base);
  $cmd = escapeshellcmd($PATH_ODA) . ' ' .
         escapeshellarg($srcDir) . ' ' . escapeshellarg($dstDir) . ' ' .
         escapeshellarg($base)   . ' ' . escapeshellarg($verOda) . ' 0 1';
  exec($cmd . ' 2>&1', $out, $rc);
  $maybe = $dstDir . '/' . preg_replace('/\.dwg$/i', '.dxf', $base);
  if (file_exists($maybe) && filesize($maybe) > 0) { $outPath = $maybe; $used = 'oda'; }
}

if (!file_exists($outPath) || filesize($outPath) === 0) {
  @array_unshift($out, "Command: ".$cmd);
  fail("Conversion failed.\n".implode("\n", $out), 500);
}

// publish DXF so viewer can fetch it
$slug = preg_replace('/[^a-z0-9]+/i', '-', pathinfo($origName, PATHINFO_FILENAME));
$finalName = $slug . '-' . date('Ymd-His') . '.dxf';
$publicPath = $PUBLIC_OUT_DIR . $finalName;
$publicUrl  = $PUBLIC_BASE_URL . $finalName;
if (!@rename($outPath, $publicPath)) { @copy($outPath, $publicPath); }

header('Content-Type: application/json');
echo json_encode([
  'ok'     => true,
  'engine' => $used,
  'url'    => $publicUrl,                       // DXF URL
  'viewer' => '/tools/dwg.html?src='.rawurlencode($publicUrl) // deep link
], JSON_UNESCAPED_SLASHES);
