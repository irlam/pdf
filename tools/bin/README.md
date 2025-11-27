# DWG Converter Binaries

This directory contains the binaries required for DWG → DXF conversion.

## Required Binaries

You need **one** of the following converters installed in this directory:

### Option 1: LibreDWG (Recommended)

LibreDWG is an open-source library for reading and writing DWG files.

1. **Download LibreDWG**:
   - Ubuntu/Debian: `sudo apt-get install libredwg-utils`
   - From source: https://github.com/LibreDWG/libredwg

2. **Copy the binary**:
   ```bash
   # Find where dwg2dxf is installed
   which dwg2dxf
   
   # Copy to this directory
   cp /usr/bin/dwg2dxf /path/to/pdf/tools/bin/dwg2dxf
   ```

3. **Set permissions**:
   ```bash
   chmod 755 /path/to/pdf/tools/bin/dwg2dxf
   ```

### Option 2: ODA File Converter (Fallback)

ODA File Converter is a free converter from the Open Design Alliance.

1. **Download ODA File Converter**:
   - Visit: https://www.opendesign.com/guestfiles/oda_file_converter
   - Download the Linux version for your architecture

2. **Install and copy**:
   ```bash
   # Extract the downloaded archive
   # Copy the ODAFileConverter binary to this directory
   cp /path/to/ODAFileConverter /path/to/pdf/tools/bin/ODAFileConverter
   ```

3. **Set permissions**:
   ```bash
   chmod 755 /path/to/pdf/tools/bin/ODAFileConverter
   ```

## Verification

After installing, you can verify the setup by visiting:
- `/tools/dwg2dxf.php` - Shows a simple upload form
- Upload a `.dwg` file to test the conversion

## Troubleshooting

### "exec() disabled by hosting"
Your hosting provider has disabled the `exec()` function. Contact them to enable it, or use a VPS/dedicated server.

### "Conversion failed"
- Check that the binary has execute permissions (`chmod 755`)
- Verify the binary is compatible with your server's architecture
- Check PHP error logs for more details

### File size limits
The converter is configured for files up to 150MB. For larger files, adjust `$MAX_BYTES` in `/tools/dwg2dxf.php`.

## Directory Structure

After setup, this directory should contain:
```
/tools/bin/
├── README.md          (this file)
├── dwg2dxf           (LibreDWG binary)
└── ODAFileConverter   (optional ODA binary)
```
