# ZPL Editor Constraints Design

## Purpose
The purpose of this document is to outline the design for constraining the ZPL editor's WYSIWYG canvas to native ZPL capabilities. By ensuring invalid states are unrepresentable, we can guarantee that the canvas rendering closely matches the final ZPL printer output without relying on hacks like rendering the entire canvas to a bitmap.

## Architecture & Constraints

### 1. Rotation Constraints
ZPL natively supports rotation in 90-degree increments (0°, 90°, 180°, 270°). To enforce this:
- We will set `fabric.Object.prototype.snapThreshold = 45`.
- Because `snapAngle` is already 90, a threshold of 45 means the rotation handle will act as a 4-way toggle switch. Arbitrary rotation (e.g., 45°) becomes impossible.

### 2. Coordinate & Dimension Snapping
Printers operate on a rigid dot grid based on DPI. To match this:
- We will intercept Fabric's `object:moving` and `object:scaling` events.
- We will force `left`, `top`, and calculated dimensions (`width * scaleX`, `height * scaleY`) to round to exact integers (dots).
- This ensures elements fall perfectly on the dot grid, exactly where they will print.

### 3. Typography Parity
Browser fonts render differently than printer built-in fonts (like ZPL's `^A0`). To minimize text wrapping and kerning discrepancies:
- We will add a CSS `@font-face` declaration for **CG Triumvirate** (Zebra's default `^A0` font).
- We will update `addText` and the default font family in Fabric to use `CG Triumvirate`.
- The user will place the font files in the `static/` directory.

### 4. Barcode Scaling constraints
ZPL barcodes scale using integer-based magnification factors (e.g., narrow bar width = 1, 2, 3 dots).
- We will add a specific scaling lock for barcode elements.
- When a user resizes a barcode, `scaleX` and `scaleY` will be constrained to integer values.
- This maps directly to the ZPL integer magnification parameter and prevents barcodes from jumping in size when printed.

## Data Flow
- User interacts with Fabric.js Canvas.
- Event listeners (`object:moving`, `object:scaling`, `object:rotating`) fire.
- Event handlers clamp values to integers or snap targets before `updateZPL()` compiles the ZPL string.
- The compiled ZPL is 100% faithful to the visual representation.

## Testing Strategy
- Verify that objects cannot be rotated to arbitrary angles (e.g., 45°).
- Check the property inspector to ensure coordinates remain integers when dragging objects.
- Ensure text renders with CG Triumvirate and matches the expected character widths.
- Ensure barcodes resize in discrete, integer-based steps.
