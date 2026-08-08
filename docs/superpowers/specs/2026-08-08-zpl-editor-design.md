# ZPL Editor Svelte Component Design Spec

This document details the design and architecture of the `ZPLEditor` Svelte 5 component. The component provides an interactive canvas-based label editor that translates visual elements (text, rectangles, barcodes, images) into zebra programming language (ZPL) code in real time.

---

## 1. Overview & Requirements

- **Technology**: Svelte 5, FabricJS, Vanilla CSS.
- **Layout**: Three-column layout.
  - **Top**: Configurable label settings (width, height, DPI) and export/zoom options.
  - **Left**: Palette of elements to add (Text, Rectangle, Barcode, Image).
  - **Center**: Interactive canvas displaying the label layout.
  - **Right**: Property inspector for the currently selected object.
- **Real-time ZPL**: ZPL is generated on any canvas change and exposed as a bindable Svelte prop.
- **Feature Parity**: Support text, rectangles, barcodes, and images.
- **Extended Features**:
  - Rotation snapped to 90-degree increments (`0°`, `90°`, `180°`, `270°`).
  - Multiple barcode formats (Code 39, Code 128, and QR Code as default).
  - Inline `^GF` graphics compilation for images.
  - Real-time print preview using the Labelary API.

---

## 2. UI Layout & Styling System

The editor UI will use a dark, premium theme with smooth micro-animations and typography.

```
+-----------------------------------------------------------------------+
| Toolbar: Width: [ 4.0 ]  Height: [ 6.0 ]  DPI: [ 300 ]  [Copy ZPL]    |
+------------------+---------------------------------+------------------+
| Palette (Tools)  | Canvas (Workspace)              | Property Inspector|
|                  |                                 |                  |
|  [T] Text        | +-----------------------------+ | Name: Textbox 1  |
|  [R] Rectangle   | |                             | | Text: "Hello"    |
|  [B] Barcode     | |          Canvas             | | X: 150  Y: 200   |
|  [I] Image       | |                             | | Font Size: 36    |
|                  | +-----------------------------+ | Rotation: [90°]  |
|                  |                                 |                  |
+------------------+---------------------------------+------------------+
```

### Theme Colors (CSS Variables)

- Background: `#0f172a` (slate-900)
- Panels: `#1e293b` (slate-800) with a backdrop blur and glassmorphism.
- Text: `#f8fafc` (slate-50)
- Borders: `#334155` (slate-700)
- Accent: `#3b82f6` (blue-500)

---

## 3. FabricJS Canvas & State Bridge

The canvas acts as the source of truth, and we bridge updates to a Svelte `$state` for editing.

### Canvas Scale & DPI Coordinate System

- The physical canvas dimensions in dots are calculated as:
  $$\text{Dots} = \text{Dimension (inches)} \times \text{DPI}$$
- FabricJS canvas width and height are set to these dot dimensions.
- CSS scaling is applied using `transform: scale()` to visual container parent to fit the screen.

### Object Definitions

1. **Text**: `fabric.IText`
   - Attributes: `text`, `fontSize`, `left` (X), `top` (Y), `angle` (Rotation).
2. **Rectangle**: `fabric.Rect`
   - Attributes: `width`, `height`, `left`, `top`, `angle`.
3. **Barcode**: `fabric.Group` or custom `fabric.Image`
   - Renders dynamically using a client-side library (`JsBarcode` for 1D, `qrcode` for QR codes) to generate a data URL and load it onto the canvas.
   - Custom attributes: `barcodeType` (`"QR"`, `"CODE128"`, `"CODE39"`), `barcodeData`.
4. **Image**: `fabric.Image`
   - Uploaded via file dialog, dithered to monochrome at original or custom resolution.
   - Custom attribute: `monochromeData` (Uint8ClampedArray).

### Rotation Constraint

- On all objects, we enforce:
  ```js
  object.snapAngle = 90;
  ```
- Any rotation event will snap the object to `0`, `90`, `180`, or `270` degrees.

---

## 4. ZPL Compilation Engine

The compiler loops over `canvas.getObjects()` and converts each to ZPL.

### Coordinate Transform for Rotated Elements

ZPL rotation moves the origin. We translate Fabric coordinates (`x`, `y` from top-left) to the correct ZPL `^FO` (Field Origin) values based on the object's angle:

- **0° (`N`)**: $X_{zpl} = X_{fabric}$, $Y_{zpl} = Y_{fabric}$
- **90° (`R`)**: $X_{zpl} = X_{fabric} + \text{width}$, $Y_{zpl} = Y_{fabric}$
- **180° (`I`)**: $X_{zpl} = X_{fabric} + \text{width}$, $Y_{zpl} = Y_{fabric} + \text{height}$
- **270° (`B`)**: $X_{zpl} = X_{fabric}$, $Y_{zpl} = Y_{fabric} + \text{height}$

### ZPL Element Code Blocks

1. **Text**:
   `^FO{x},{y}^A0{orientation},{height},{width}^FD{text}^FS`
   - Orientation: `N`, `R`, `I`, `B`
2. **Rectangle**:
   `^FO{x},{y}^GB{width},{height},{borderThickness},B,0^FS`
   - If rotated 90°/270°, width and height are swapped in the ZPL.
3. **QR Code**:
   `^FO{x},{y}^BQN,2,{magnification}^FDQA,{text}^FS`
   - Magnification: Integer calculated from object scale (typically 1 to 10).
4. **1D Barcode (Code 128 / Code 39)**:
   - Code 128: `^FO{x},{y}^BY{width}^BC{orientation},{height},Y,N,N^FD{text}^FS`
   - Code 39: `^FO{x},{y}^BY{width}^B3{orientation},N,{height},Y,N^FD{text}^FS`
5. **Image**:
   `^FO{x},{y}^GFA,{totalBytes},{totalBytes},{bytesPerRow},{hexData}^FS`
   - Hex data is computed by converting monochrome pixel bits (8 pixels per byte) to a hexadecimal string.

---

## 5. Verification Plan

- **Automated Tests**: Unit tests for ZPL generation and coordinate transformations using Vitest.
- **Manual Verification**: Run the Svelte dev server and verify in the browser:
  1. Palette buttons successfully insert elements.
  2. Element selection populates the property inspector in the right column.
  3. Dragging, resizing, and rotating elements snaps correctly.
  4. Real-time Labelary print preview renders the exact representation of the label design.
  5. Changing Width, Height, and DPI dynamically updates the canvas scale and output ZPL.
