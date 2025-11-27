# Custom Fonts for PDF Text Editing

This directory contains TrueType Font (TTF) files that can be used for text editing in the PDF Editor.

## Bundled Google Fonts

The following fonts are pre-installed and available in the Font dropdown:

| Font | Style | Usage |
|------|-------|-------|
| Roboto | Regular, Bold | Modern sans-serif, great for documents |
| Open Sans | Regular, Bold, Italic | Highly readable sans-serif |
| Lato | Regular, Bold, Italic | Elegant sans-serif |
| Merriweather | Regular, Bold | Serif font, good for body text |
| Source Sans Pro | Regular, Bold | Adobe's professional sans-serif |
| Source Code Pro | Regular, Bold | Monospace, great for code |

## Using Bundled Fonts

1. Open the PDF Editor
2. Select "Edit Text" tool
3. Choose a font from the "Google Fonts (Bundled)" section in the Font dropdown
4. Enter your text and draw a box on the PDF

## How Font Editing Works

When you edit text in a PDF:
1. The original text is **covered** with a white (or colored) rectangle
2. New text is **placed on top** using your selected font
3. Bundled fonts are automatically embedded in the PDF

## Using Custom Fonts

You can also upload your own fonts:

### Step 1: Obtain the Font File

You need a `.ttf` or `.otf` font file. Common sources:
- **From your computer**: 
  - Windows: `C:\Windows\Fonts\`
  - macOS: `/Library/Fonts/` or `~/Library/Fonts/`
  - Linux: `/usr/share/fonts/` or `~/.fonts/`
- **Google Fonts**: https://fonts.google.com (free, open-source fonts)
- **Font vendors**: Adobe Fonts, MyFonts, etc.

### Step 2: Upload the Font

In the PDF Editor:
1. Select **"Upload TTF/OTF..."** from the Font dropdown
2. Click the file picker that appears
3. Select your `.ttf` or `.otf` file
4. The font will be loaded for use in your session

## Font Licensing

⚠️ **Important**: The bundled fonts are open-source Google Fonts licensed under the SIL Open Font License (OFL) or Apache License 2.0. For custom fonts, ensure you have the appropriate license.

## Supported Formats

| Format | Extension | Support |
|--------|-----------|---------|
| TrueType | `.ttf` | ✅ Full |
| OpenType | `.otf` | ✅ Full |
| TrueType Collection | `.ttc` | ⚠️ First font only |
| OpenType Collection | `.otc` | ⚠️ First font only |

## Troubleshooting

### Font doesn't look right
- Some fonts have multiple weights (Light, Regular, Bold). Select the appropriate variant.
- Variable fonts may not render all variations correctly.

### Font not showing in dropdown
- Bundled fonts require the font files to be present in `/fonts/` directory
- Check that the file names match the expected names (e.g., `Roboto-Regular.ttf`)

### Bold/Italic not working with bundled fonts
- Select the Bold or Italic variant directly from the dropdown
- Example: Use "Roboto Bold" instead of "Roboto" with bold checkbox

## Available Font Files

```
/fonts/
├── Roboto-Regular.ttf
├── Roboto-Bold.ttf
├── Roboto-Italic.ttf
├── OpenSans-Regular.ttf
├── OpenSans-Bold.ttf
├── OpenSans-Italic.ttf
├── Lato-Regular.ttf
├── Lato-Bold.ttf
├── Lato-Italic.ttf
├── Merriweather-Regular.ttf
├── Merriweather-Bold.ttf
├── SourceSansPro-Regular.ttf
├── SourceSansPro-Bold.ttf
├── SourceCodePro-Regular.ttf
└── SourceCodePro-Bold.ttf
```
