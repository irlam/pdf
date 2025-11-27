# Three.js for DWG Viewer

This directory should contain Three.js files for the DWG/DXF viewer.

## Required Files

1. **three.min.js** - Core Three.js library
2. **OrbitControls.js** - Camera controls for pan/zoom

## Download Instructions

### Option 1: Download from CDN (Recommended)

```bash
# Download Three.js r160 (stable version)
curl -o three.min.js https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js

# Download OrbitControls
curl -o OrbitControls.js https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js
```

### Option 2: npm

```bash
npm install three@0.160.0
cp node_modules/three/build/three.min.js .
cp node_modules/three/examples/js/controls/OrbitControls.js .
```

### Option 3: From GitHub

Download from: https://github.com/mrdoob/three.js/releases

## After Download

Directory should contain:
```
/vendor/three/
├── README.md          (this file)
├── three.min.js       (~650KB)
└── OrbitControls.js   (~25KB)
```

## Version Notes

The DWG viewer is compatible with Three.js r128+. Version r160 is recommended for best compatibility.
