# Custom Fonts for PDF Text Editing

This directory is for storing custom TrueType Font (TTF) files that can be used for exact font matching when editing PDF text.

## How Font Editing Works

When you edit text in a PDF:
1. The original text is **covered** with a white (or colored) rectangle
2. New text is **placed on top** using your selected font
3. For exact font matching, you need the original font file

## Using Custom Fonts

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
1. Select **"Custom TTF (upload)"** from the Font dropdown
2. Click the file picker that appears
3. Select your `.ttf` or `.otf` file
4. The font will be loaded for use in your session

### Step 3: Use the Font

1. Select the **"Edit Text"** tool
2. Type your replacement text
3. Draw a box over the text you want to replace
4. The text will be rendered using your custom font

## Pre-Installing Fonts (Optional)

If you frequently use specific fonts, you can store them here for easy access:

```
/fonts/
├── README.md           (this file)
├── Arial.ttf           (example)
├── Helvetica.ttf       (example)
├── TimesNewRoman.ttf   (example)
└── YourCustomFont.ttf  (your fonts)
```

**Note**: Font files stored here are not automatically loaded. You still need to upload them in the editor each session.

## Font Licensing

⚠️ **Important**: Only use fonts you have a license to use:
- System fonts may have usage restrictions
- Commercial fonts require proper licensing
- Google Fonts and other open-source fonts are safe for most uses

## Supported Formats

| Format | Extension | Support |
|--------|-----------|---------|
| TrueType | `.ttf` | ✅ Full |
| OpenType | `.otf` | ✅ Full |
| TrueType Collection | `.ttc` | ✅ Partial |
| OpenType Collection | `.otc` | ✅ Partial |

## Troubleshooting

### Font doesn't look right
- Some fonts have multiple weights (Light, Regular, Bold). Make sure you're using the correct weight file.
- Variable fonts may not render all variations correctly.

### Font upload fails
- Check that the file is a valid `.ttf` or `.otf` file
- File might be corrupted - try re-downloading
- Some DRM-protected fonts cannot be embedded

### Bold/Italic not working
- You need separate font files for Bold and Italic variants
- The editor can apply "faux" bold/italic, but it won't match true font variants
- Example: Use `Arial-Bold.ttf` for bold text, not `Arial.ttf` with bold checkbox

## Common Fonts and Where to Find Them

| Font | Type | Source |
|------|------|--------|
| Roboto | Sans-serif | [Google Fonts](https://fonts.google.com/specimen/Roboto) |
| Open Sans | Sans-serif | [Google Fonts](https://fonts.google.com/specimen/Open+Sans) |
| Lato | Sans-serif | [Google Fonts](https://fonts.google.com/specimen/Lato) |
| Merriweather | Serif | [Google Fonts](https://fonts.google.com/specimen/Merriweather) |
| Source Code Pro | Monospace | [Google Fonts](https://fonts.google.com/specimen/Source+Code+Pro) |
| Liberation Sans | Sans-serif | Free alternative to Arial |
| Liberation Serif | Serif | Free alternative to Times New Roman |
