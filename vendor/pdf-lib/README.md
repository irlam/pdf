# PDF-lib for DWG Viewer

This directory should contain pdf-lib for generating PDF exports from the DWG viewer.

## Required Files

1. **pdf-lib.min.js** - PDF generation library

## Download Instructions

### Option 1: Download from CDN

```bash
curl -o pdf-lib.min.js https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js
```

### Option 2: npm

```bash
npm install pdf-lib@1.17.1
cp node_modules/pdf-lib/dist/pdf-lib.min.js .
```

### Option 3: From GitHub

Download from: https://github.com/Hopding/pdf-lib/releases

## Note

There is also a `pdf-lib.min.js` in the parent `/vendor/` directory. 
This directory provides an organized alternative path for the DWG viewer.

## After Download

Directory should contain:
```
/vendor/pdf-lib/
├── README.md          (this file)
└── pdf-lib.min.js     (~525KB)
```
