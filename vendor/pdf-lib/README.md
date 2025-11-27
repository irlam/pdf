# PDF-lib for DWG Viewer

This directory should contain pdf-lib for generating PDF exports from the DWG viewer.

## Required Files

1. **pdf-lib.min.js** - PDF generation library

## Download Instructions

The DWG viewer (`/tools/dwg.html`) expects pdf-lib at this location.

### Option 1: Copy from existing vendor directory

```bash
# PDF-lib is already available in the parent directory
cp /path/to/pdf/vendor/pdf-lib.min.js /path/to/pdf/vendor/pdf-lib/pdf-lib.min.js
```

### Option 2: Download from CDN

```bash
curl -o pdf-lib.min.js https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js
```

### Option 3: npm

```bash
npm install pdf-lib@1.17.1
cp node_modules/pdf-lib/dist/pdf-lib.min.js .
```

## After Download

Directory should contain:
```
/vendor/pdf-lib/
├── README.md          (this file)
└── pdf-lib.min.js     (~525KB)
```
