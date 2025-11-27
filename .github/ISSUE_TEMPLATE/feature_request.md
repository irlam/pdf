---
name: Feature request
about: Suggest an idea for this project
title: ''
labels: ''
assignees: Copilot

---

You are helping improve and extend my GitHub repo: https://github.com/irlam/pdf

Context
- This repo is a small web app for working with PDF files.
- Stack: plain HTML/CSS/JavaScript plus a bit of PHP (see /api, /path.php).
- It must deploy on simple shared hosting (Plesk, Apache, PHP 8.x), with NO Node/Express or Docker at runtime.
- It’s fine to use a browser-based PDF library (e.g. pdf-lib or PDF.js), but all dependencies must be vendored locally (under /vendor or /assets) – no external CDNs in production.

Your job
1. Understand the current code:
   - Read README.md, index.html, help.html, export.html, path.php, and all code in /app, /api, /assets, /tools, /vendor.
   - Summarise in README.md what the app currently does, how a user uses it, and the current limitations.

2. Refactor and clean up:
   - Organise JS into clear modules (no huge inline scripts).
   - Remove dead code and obvious duplication.
   - Improve naming, add comments/JSDoc where helpful, and keep everything vanilla JS (no frameworks).
   - Make the layout responsive and mobile-friendly, ensuring it works well on phones and tablets.
   - Standardise styling (buttons, inputs, spacing, typography) so it feels like one cohesive tool.

3. UX improvements:
   - Add drag-and-drop support for PDF upload, plus a visible “Select file(s)” button.
   - Show a simple progress / “working…” state during heavy operations.
   - Display useful error messages for unsupported files, too-large files, or failed operations.
   - Add a basic “Help” / “How to use this tool” section or modal and link to it clearly from the UI.

4. New PDF features (only implement ones that make sense for this codebase; don’t break existing behaviour):
   - Multi-PDF merge: allow selecting multiple PDFs, show them in order, and export a merged PDF.
   - Split: choose a range of pages (e.g. 1–3, 4–6) and export each range as a new PDF.
   - Reorder & rotate pages: show page thumbnails, let the user drag to reorder and rotate pages, then export.
   - Optional watermark / stamp: allow entering short text (e.g. “Confidential” or “Draft”) and overlay it on each page.
   - Basic “optimize/compress” option if the chosen PDF library supports it.

   All of these should work purely client-side where possible (operating on files in the browser). Only add PHP endpoints under /api if there is a clear reason, and keep them simple.

5. Reliability & compatibility:
   - Make sure the app works in current versions of Chrome, Edge, Firefox, and Safari.
   - Handle large PDFs gracefully: show a message if an operation may take a while and avoid freezing the UI.
   - Add basic input validation and defensive checks in PHP (no assumptions about paths or user input).

6. Documentation & polish:
   - Expand README.md:
     - What the tool does.
     - How to run it locally (simple steps using a PHP dev server or dropping into a Plesk site).
     - Key features, limitations, and any large dependencies.
   - Add or update .gitignore so unnecessary files (IDE configs, tmp, cache, etc.) are not committed.
   - If useful, add a tiny “About” section in the UI mentioning it’s a simple self-hosted PDF utility.

General rules
- Keep the project self-contained and easy to copy to a Plesk shared host (no external services).
- Prefer incremental, readable changes over clever one-liners.
- Do not introduce a database or heavy frameworks; this should stay as a lightweight tool.

Start by summarising the current state of the repo (features + structure), then propose a short plan of changes, and then implement those changes step by step.
