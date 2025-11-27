# PDF Editor — Self-Hosted Web Tool

A lightweight, self-hosted web application for working with PDF files. Runs entirely in the browser with optional PHP backend support for file uploads. Designed for simple shared hosting environments (Plesk, Apache, PHP 8.x) — no Node.js, Docker, or external services required.

## What It Does

This tool provides a comprehensive suite of PDF editing and manipulation features:

### Core Editor (`index.html`)
- **Text Editing**: Cover existing text and replace with new content (fonts, sizes, colors, alignment)
- **Redaction**: Draw opaque boxes to permanently hide sensitive content
- **Image Placement**: Insert PNG/JPG images anywhere on the page
- **Drawing Tools**: Add boxes, lines, arrows, and dimension annotations
- **Page Operations**: Insert, duplicate, delete, rotate, and reorder pages
- **Find & Replace**: Search for text runs and overlay replacements
- **Zoom & Pan**: Navigate large documents with smooth controls
- **Snap & Grid**: Align annotations precisely with configurable grid snapping
- **Scale Calibration**: Auto-detect or manually calibrate drawing scales for accurate measurements
- **Undo/Redo**: Full history of all edits

### Additional Tools
- **Crop** (`/tools/crop.html`): Define crop regions (soft CropBox or hard raster crop)
- **Convert** (`/tools/convert.html`): PDF↔image, PDF→text, images→PDF, text→PDF
- **DWG Viewer** (`/tools/dwg.html`): Open DWG files (with server-side DXF conversion), measure, and export to PDF
- **Exports** (`/export.html`): Extract text as CSV/JSON, convert overlay annotations to SVG/DXF

## How to Use

1. **Open the Editor**: Navigate to `index.html` in your browser
2. **Load a PDF**: Click the file picker or drag & drop a PDF onto the page
3. **Choose a Tool**: Select from the toolbar (Select, Edit Text, Redact, Image, drawing tools, etc.)
4. **Make Edits**: Draw, type, or place content on the page
5. **Apply Changes**: Click "Apply to PDF" to embed your edits into the document
6. **Save/Download**: Download the edited file or upload to your server

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` + drag | Pan the view |
| `Ctrl` + wheel | Zoom in/out |
| `G` | Toggle grid visibility |
| `S` | Toggle snap |
| Arrow keys | Nudge selection (Shift = 10px) |
| `Alt` + Arrows | Resize selection |
| `Alt` + `R` | Rotate item +90° (Shift = -90°) |
| `Alt` + `P` | Rotate page +90° (Shift = -90°) |

## Running Locally

### Option 1: PHP Development Server (Recommended)
```bash
cd /path/to/pdf
php -S localhost:8000
```
Then open http://localhost:8000 in your browser.

### Option 2: Apache/Nginx on Plesk/cPanel
Simply upload all files to your `public_html` directory. No build step or configuration required.

### Option 3: Any Static Server
Most features work without PHP. The PHP endpoints are only needed for:
- Saving edited PDFs to the server (`/api/save.php`)
- DWG→DXF conversion (`/tools/dwg2dxf.php`)

For static hosting, use the Download button instead of Save.

## Project Structure

```
/
├── index.html          # Main PDF editor
├── help.html           # Documentation & tutorials
├── export.html         # Text/overlay export tools
├── path.php            # Debug helper (shows server path)
├── favicon.ico
│
├── /api/
│   └── save.php        # Handles PDF uploads/versioning
│
├── /app/
│   ├── addons-draw.js  # Drawing tools (box, line, arrow, dimension)
│   └── exporters.js    # CSV/JSON/SVG/DXF export logic
│
├── /assets/
│   └── ui.css          # Shared UI styles
│
├── /tools/
│   ├── crop.html       # Cropping interface
│   ├── convert.html    # Format conversion
│   ├── dwg.html        # DWG/DXF viewer
│   └── dwg2dxf.php     # Server-side DWG conversion
│
├── /vendor/            # Self-hosted dependencies
│   ├── pdf.min.js      # PDF.js for rendering
│   ├── pdf.worker.min.js
│   └── pdf-lib.min.js  # pdf-lib for editing
│
└── /storage/           # Saved PDF versions (server-side)
```

## Dependencies

All dependencies are vendored locally — no external CDNs in production:

| Library | Version | Purpose |
|---------|---------|---------|
| [PDF.js](https://mozilla.github.io/pdf.js/) | 4.x (legacy build) | Rendering PDFs in the browser |
| [pdf-lib](https://pdf-lib.js.org/) | 1.17.1 | Creating/modifying PDFs |
| [Three.js](https://threejs.org/) | (for DWG viewer) | 3D/2D rendering of DXF geometry |
| [dxf-parser](https://github.com/gdsestimating/dxf-parser) | (for DWG viewer) | Parsing DXF files |

## Limitations

- **Font Fidelity**: Editing existing text covers and replaces it; exact font matching requires uploading TTF files
- **Complex PDFs**: Very large or highly complex PDFs may be slow to process
- **DWG Conversion**: Requires server-side LibreDWG or ODA converter binaries
- **Browser Support**: Works in Chrome, Edge, Firefox, Safari (current versions)

## About

A simple, self-hosted PDF utility for teams who need to make quick edits, annotations, or conversions without cloud services or complex infrastructure. Perfect for construction drawings, contracts, forms, and general document workflows.