# PDF Editor — Self-Hosted Web Tool

A lightweight, self-hosted web application for working with PDF files. Runs entirely in the browser with optional PHP backend support for file uploads. Designed for simple shared hosting environments (Plesk, Apache, PHP 8.x) — no Node.js, Docker, or external services required.

## What It Does

This tool provides a comprehensive suite of PDF editing and manipulation features:

### Core Editor (`index.html`)
- **Text Editing**: Cover existing text and replace with new content (fonts, sizes, colors, alignment)
- **Secure Redaction**: Rebuild affected pages as masked images, removing underlying content from the exported PDF (affected pages lose searchable text)
- **Image Placement**: Insert PNG/JPG images anywhere on the page
- **Watermark/Stamp**: Add semi-transparent text overlays like "DRAFT" or "CONFIDENTIAL"
- **Drawing Tools**: Add boxes, lines, arrows, and dimension annotations with dedicated stroke colour, width and dashed controls. Boxes have a separate fill colour. Select staged drawings and use **Update selected drawings** to change their style (supports Undo/Redo). Drawing colours are independent of text colours and retained when applying/downloading the PDF.
- **Page Operations**: Insert, duplicate, delete, rotate, and reorder pages
- **Find & Replace**: Search for text runs and overlay replacements
- **Zoom & Pan**: Navigate large documents with smooth controls
- **Snap & Grid**: Align annotations precisely with configurable grid snapping
- **Scale Calibration**: Auto-detect or manually calibrate drawing scales for accurate measurements
- **Undo/Redo**: Full history of all edits
- **Drag & Drop**: Simply drag PDF files onto the editor to open them

### Professional workspace
- **Document layout**: Page thumbnails on the left, a scrollable editing toolbar above the document, and contextual properties on the right. Both side panels can be collapsed; phones use drawers.
- **Editable drafts**: Automatic and manual browser drafts include the PDF, annotations, images, custom fonts, page rotations and measurement scale. Restore the latest draft after a reload. Drafts are stored locally in IndexedDB, with a 100 MB document limit; storage quotas still depend on the browser.
- **Review tools**: Highlights with adjustable opacity, freehand pen, ellipses, revision clouds and numbered comments/callouts. Comments remain editable until applied and become visible PDF content on export.
- **Stamps and signatures**: Approved, Reviewed, Draft, Confidential, Rejected and a saved custom stamp. Draw and reuse a visual signature locally; this is not a certificate-based digital signature.
- **Measurements**: Calibrated line dimensions, polygon area and open-path perimeter. Set scale and units in Measurement scale; click points and choose Finish measurement or press Enter. Each area/perimeter annotation retains its own scale and units.
- **Page management**: Navigate thumbnails, drag to reorder, or use page buttons to insert, duplicate, delete and move pages. Page operations retain staged annotations and clear the annotation undo history after remapping pages.
- **Export reliability**: Per-page coordinates keep marks positioned across zoom changes, different page sizes and draft restores. Invalid uploads preserve the current document.

### Additional Tools
- **Merge** (`/tools/merge.html`): Combine multiple PDFs into a single document with drag-to-reorder
- **Split** (`/tools/split.html`): Extract page ranges into separate PDF files
- **Crop** (`/tools/crop.html`): Define crop regions (soft CropBox or hard raster crop)
- **Convert** (`/tools/convert.html`): PDF↔image, PDF→text, images→PDF, text→PDF
- **Print / Batch Print** (`/tools/print.html`): Print a single PDF or merge multiple PDFs into one print job
- **DWG Viewer** (`/tools/dwg.html`): Open DWG files (with server-side DXF conversion), measure, and export to PDF
- **Exports** (`/export.html`): Extract text as CSV/JSON, convert overlay annotations to SVG/DXF

## How to Use

1. **Open the Editor**: Navigate to `index.html` in your browser
2. **Load a PDF**: Click the file picker or drag & drop a PDF onto the page
3. **Choose a Tool**: Select from the toolbar (Select, Edit Text, Redact, Image, drawing tools, etc.)
4. **Make Edits**: Draw, type, or place content on the page
5. **Keep an Editable Copy**: Drafts save automatically in this browser; use **Save draft** for an immediate checkpoint.
6. **Save/Download**: Use the top **Download PDF** button, or expand **Apply / server versions** to apply annotations or save on your server. Applying permanently embeds annotations and resets annotation history.
7. **Recover**: **Restore draft** reopens the latest editable draft. Export retains a pre-apply draft, so restoring it can recover annotations. The draft still contains the original document, including content later redacted; use **Clear draft** in Apply / server versions when finished.

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

## Setup

### DWG Conversion (Optional)

To enable DWG file conversion, you need to install converter binaries on your server:

1. **Create the bin directory** (if not exists):
   ```bash
   mkdir -p /path/to/pdf/tools/bin
   ```

2. **Install LibreDWG** (recommended):
   ```bash
   # Ubuntu/Debian
   sudo apt-get install libredwg-utils
   cp /usr/bin/dwg2dxf /path/to/pdf/tools/bin/dwg2dxf
   chmod 755 /path/to/pdf/tools/bin/dwg2dxf
   ```

   **OR install ODA File Converter** (alternative):
   - Download from: https://www.opendesign.com/guestfiles/oda_file_converter
   - Copy to `/tools/bin/ODAFileConverter`
   - Set permissions: `chmod 755 /path/to/pdf/tools/bin/ODAFileConverter`

3. **Verify**: Visit `/tools/dwg2dxf.php` and upload a test DWG file.

See `/tools/bin/README.md` for detailed instructions.

### DWG Viewer Dependencies

The DWG viewer requires additional JavaScript libraries in `/vendor/`:

```bash
# Three.js (for 3D/2D rendering)
cd /path/to/pdf/vendor/three
curl -o three.min.js https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js
curl -o OrbitControls.js https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js

# DXF Parser
cd /path/to/pdf/vendor/dxf-parser
curl -o dxf-parser.min.js https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js
```

**Note**: PDF-lib is already included at `/vendor/pdf-lib.min.js` and does not need to be downloaded separately.

### Custom Fonts for Text Editing

For exact font matching when editing PDF text:

1. **Obtain TTF/OTF font files** from:
   - Your system fonts folder
   - Google Fonts: https://fonts.google.com
   - Font vendors (with proper licensing)

2. **In the PDF Editor**:
   - Select "Custom TTF (upload)" from the Font dropdown
   - Upload your `.ttf` or `.otf` file
   - Use the "Edit Text" tool to replace text with your font

3. **Optional**: Store frequently-used fonts in `/fonts/` for documentation.

See `/fonts/README.md` for detailed instructions.

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
│   ├── studio.js       # Workspace, drafts, markup, page operations, secure redaction
│   ├── addons-draw.js  # Drawing tools (box, line, arrow, dimension)
│   └── exporters.js    # CSV/JSON/SVG/DXF export logic
│
├── /assets/
│   └── ui.css          # Shared UI styles
│
├── /fonts/             # Custom TTF/OTF fonts (user-provided)
│   └── README.md       # Font setup instructions
│
├── /tools/
│   ├── merge.html      # Multi-PDF merge tool
│   ├── split.html      # Split PDF by page ranges
│   ├── crop.html       # Cropping interface
│   ├── convert.html    # Format conversion
│   ├── dwg.html        # DWG/DXF viewer
│   ├── dwg2dxf.php     # Server-side DWG conversion
│   └── /bin/           # Converter binaries (user-provided)
│       └── README.md   # Binary setup instructions
│
├── /vendor/            # Self-hosted dependencies
│   ├── pdf.min.js      # PDF.js for rendering
│   ├── pdf.worker.min.js
│   ├── pdf-lib.min.js  # pdf-lib for editing (main editor)
│   ├── jszip.min.js    # ZIP file handling
│   ├── /three/         # Three.js (for DWG viewer)
│   ├── /dxf-parser/    # DXF parser (for DWG viewer)
│   └── /pdf-lib/       # pdf-lib copy (for DWG viewer)
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

## Development validation

Production still needs only HTML/CSS/JavaScript and optional PHP. The browser regression test is development tooling:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/studio.e2e.cjs
```

Set `PDF_STUDIO_BROWSER_EXECUTABLE` to use an existing Chromium executable. The test serves the repository on a temporary localhost port and exercises drawing colours, markup, signatures, comments, undo, zoom, invalid uploads, page operations, draft recovery, secure redaction, PDF export and mobile controls. It writes screenshots and a test PDF to a temporary directory, without touching server storage.

Secure-redaction export rebuilds the affected pages at approximately 150 dpi, capped at 16 million pixels per page to control memory. Text and native form fields/links on those pages become image content. Unaffected pages retain their original PDF content. The redacted export does not contain the original page streams, but any retained browser draft remains an unredacted source copy.

## About

A simple, self-hosted PDF utility for teams who need to make quick edits, annotations, or conversions without cloud services or complex infrastructure. Perfect for construction drawings, contracts, forms, and general document workflows.
