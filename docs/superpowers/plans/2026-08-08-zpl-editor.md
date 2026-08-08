# ZPL Editor Svelte Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Svelte 5 library component (`ZPLEditor`) with a 3-column layout that uses FabricJS for label canvas editing, generates ZPL in real time, supports 90° rotation snapping, text, rectangles, barcodes, and images, and includes a interactive demo site with live ZPL preview and Labelary print preview.

**Architecture:** A FabricJS canvas is initialized inside `ZPLEditor.svelte`. Svelte reactive state holds the properties of the currently selected FabricJS object. Canvas modifications trigger a real-time ZPL compilation pass via `zplCompiler.ts`, updating a bindable `zpl` prop.

**Tech Stack:** Svelte 5, FabricJS (`fabric`), `jsbarcode`, `qrcode`, TypeScript, Vite, Vitest.

## Global Constraints

- Target framework: Svelte 5 (`^5.0.0`)
- Layout: 3-column layout (Left: Palette, Middle: Canvas, Right: Inspector; Top: Toolbar)
- Default DPI: 300 DPI (configurable)
- Rotation snapping: 90° increments (`0°`, `90°`, `180°`, `270°`)
- Image encoding: Inline `^GF` graphic field format

---

### Task 1: Package Dependencies & Type Definitions

**Files:**

- Modify: `package.json`
- Create: `src/lib/zpl/types.ts`
- Test: `src/lib/zpl/types.test.ts`

**Interfaces:**

- Consumes: None
- Produces: `LabelConfig`, `ZPLElementType`, `BarcodeFormat`, `ZPLCompilerResult`, `EditorSelection`

- [ ] **Step 1: Install dependencies**

Run: `npm install fabric@^5.3.0 jsbarcode qrcode`
Run: `npm install -D @types/fabric @types/jsbarcode @types/qrcode`

- [ ] **Step 2: Write failing test for type utilities**

Create `src/lib/zpl/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { inchesToDots, dotsToInches } from './types';

describe('DPI Conversions', () => {
	it('converts inches to dots at 300 DPI', () => {
		expect(inchesToDots(4, 300)).toBe(1200);
		expect(inchesToDots(6, 300)).toBe(1800);
	});

	it('converts dots to inches at 300 DPI', () => {
		expect(dotsToInches(1200, 300)).toBe(4);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/zpl/types.test.ts`
Expected: FAIL (modules not found)

- [ ] **Step 4: Implement types and DPI helper functions**

Create `src/lib/zpl/types.ts`:

```typescript
export type BarcodeFormat = 'QR' | 'CODE128' | 'CODE39';
export type RotationAngle = 0 | 90 | 180 | 270;

export interface LabelConfig {
	widthInches: number;
	heightInches: number;
	dpi: number; // default 300
}

export function inchesToDots(inches: number, dpi: number): number {
	return Math.round(inches * dpi);
}

export function dotsToInches(dots: number, dpi: number): number {
	return Number((dots / dpi).toFixed(3));
}

export interface ZPLCompilerResult {
	zpl: string;
}

export interface InspectorState {
	id?: string;
	type?: 'text' | 'rectangle' | 'barcode' | 'image';
	text?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontSize?: number;
	angle: RotationAngle;
	barcodeFormat?: BarcodeFormat;
	borderThickness?: number;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/zpl/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/zpl/types.ts src/lib/zpl/types.test.ts
git commit -m "feat: setup ZPL types and DPI conversion utilities"
```

---

### Task 2: Image Dithering & Binary Conversion Module

**Files:**

- Create: `src/lib/zpl/imageDither.ts`
- Test: `src/lib/zpl/imageDither.test.ts`

**Interfaces:**

- Consumes: None
- Produces: `ditherToMonochrome(imageData, threshold): Uint8ClampedArray`, `rgbaToZplGF(rgbaData, width, height): string`

- [ ] **Step 1: Write failing unit test for image GRF string generator**

Create `src/lib/zpl/imageDither.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { rgbaToZplGF } from './imageDither';

describe('imageDither', () => {
	it('converts 8x1 black pixel row to hex GRF string', () => {
		// 8 black pixels (RGBA: 0,0,0,255)
		const pixels = new Uint8ClampedArray(8 * 4);
		for (let i = 0; i < 8 * 4; i += 4) {
			pixels[i] = 0; // R
			pixels[i + 1] = 0; // G
			pixels[i + 2] = 0; // B
			pixels[i + 3] = 255; // A
		}
		const gf = rgbaToZplGF(pixels, 8, 1);
		expect(gf).toContain('^GFA,1,1,1,FF');
	});
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:unit -- src/lib/zpl/imageDither.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `imageDither.ts`**

Create `src/lib/zpl/imageDither.ts`:

```typescript
export function rgbaToZplGF(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	threshold = 128
): string {
	const bytesPerRow = Math.ceil(width / 8);
	const totalBytes = bytesPerRow * height;
	let hexData = '';

	for (let y = 0; y < height; y++) {
		let currentByte = 0;
		let bitIndex = 0;
		for (let x = 0; x < width; x++) {
			const offset = (y * width + x) * 4;
			const r = pixels[offset];
			const g = pixels[offset + 1];
			const b = pixels[offset + 2];
			const a = pixels[offset + 3];

			// Luminance calculation
			const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
			const isBlack = a > 128 && luminance < threshold;

			if (isBlack) {
				currentByte |= 1 << (7 - bitIndex);
			}

			bitIndex++;
			if (bitIndex === 8) {
				hexData += currentByte.toString(16).padStart(2, '0').toUpperCase();
				currentByte = 0;
				bitIndex = 0;
			}
		}

		if (bitIndex > 0) {
			hexData += currentByte.toString(16).padStart(2, '0').toUpperCase();
		}
	}

	return `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexData}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/zpl/imageDither.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/zpl/imageDither.ts src/lib/zpl/imageDither.test.ts
git commit -m "feat: add image dithering and ZPL GF hex compilation"
```

---

### Task 3: Barcode Rendering Utilities

**Files:**

- Create: `src/lib/zpl/barcodeRenderer.ts`
- Test: `src/lib/zpl/barcodeRenderer.test.ts`

**Interfaces:**

- Consumes: `BarcodeFormat` from `src/lib/zpl/types.ts`
- Produces: `renderBarcodeDataUrl(text: string, format: BarcodeFormat): Promise<string>`

- [ ] **Step 1: Write failing test for barcode rendering**

Create `src/lib/zpl/barcodeRenderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderBarcodeDataUrl } from './barcodeRenderer';

describe('barcodeRenderer', () => {
	it('generates a valid data URL for QR code', async () => {
		const dataUrl = await renderBarcodeDataUrl('HELLO ZPL', 'QR');
		expect(dataUrl).toMatch(/^data:image\/png;base64,/);
	});
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:unit -- src/lib/zpl/barcodeRenderer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `barcodeRenderer.ts`**

Create `src/lib/zpl/barcodeRenderer.ts`:

```typescript
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { BarcodeFormat } from './types';

export async function renderBarcodeDataUrl(text: string, format: BarcodeFormat): Promise<string> {
	if (format === 'QR') {
		return await QRCode.toDataURL(text || 'QR CODE', { margin: 1, width: 200 });
	}

	const canvas = document.createElement('canvas');
	const jsbarcodeFormat = format === 'CODE128' ? 'CODE128' : 'CODE39';

	JsBarcode(canvas, text || 'BARCODE', {
		format: jsbarcodeFormat,
		displayValue: true,
		height: 60,
		margin: 5
	});

	return canvas.toDataURL('image/png');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/zpl/barcodeRenderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/zpl/barcodeRenderer.ts src/lib/zpl/barcodeRenderer.test.ts
git commit -m "feat: add client-side barcode rendering utility for canvas preview"
```

---

### Task 4: Real-time ZPL Compiler Engine

**Files:**

- Create: `src/lib/zpl/zplCompiler.ts`
- Test: `src/lib/zpl/zplCompiler.test.ts`

**Interfaces:**

- Consumes: `LabelConfig`, `RotationAngle` from `./types`
- Produces: `compileFabricCanvasToZPL(canvas: fabric.Canvas, config: LabelConfig): string`

- [ ] **Step 1: Write failing unit tests for ZPL code generation**

Create `src/lib/zpl/zplCompiler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateZPLHeader, formatTextZPL, formatRectZPL, formatBarcodeZPL } from './zplCompiler';

describe('ZPL Compiler', () => {
	it('generates standard ZPL header with correct dimensions', () => {
		const header = generateZPLHeader(1200, 1800);
		expect(header).toContain('^XA');
		expect(header).toContain('^PW1200');
		expect(header).toContain('^LL1800');
	});

	it('formats text ZPL with rotation orientation', () => {
		const zpl = formatTextZPL({ x: 100, y: 150, text: 'Hello', fontSize: 36, angle: 90 });
		expect(zpl).toBe('^FO100,150^A0R,36,36^FDHello^FS\r\n');
	});

	it('formats QR barcode ZPL correctly', () => {
		const zpl = formatBarcodeZPL({
			x: 50,
			y: 50,
			text: 'TEST',
			format: 'QR',
			width: 200,
			height: 200,
			angle: 0
		});
		expect(zpl).toContain('^BQN,2,4^FDQA,TEST^FS');
	});
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:unit -- src/lib/zpl/zplCompiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `zplCompiler.ts`**

Create `src/lib/zpl/zplCompiler.ts`:

```typescript
import type { fabric } from 'fabric';
import type { LabelConfig, RotationAngle, BarcodeFormat } from './types';
import { inchesToDots } from './types';

export function getZPLOrientation(angle: number): string {
	const norm = ((angle % 360) + 360) % 360;
	if (norm === 90) return 'R';
	if (norm === 180) return 'I';
	if (norm === 270) return 'B';
	return 'N';
}

export function generateZPLHeader(pwDots: number, llDots: number): string {
	return `^XA\r\n^PW${pwDots}\r\n^LL${llDots}\r\n^PR12\r\n^MD30\r\n^PON\r\n`;
}

export function formatTextZPL(opts: {
	x: number;
	y: number;
	text: string;
	fontSize: number;
	angle: number;
}): string {
	const orient = getZPLOrientation(opts.angle);
	const size = Math.round(opts.fontSize);
	return `^FO${Math.round(opts.x)},${Math.round(opts.y)}^A0${orient},${size},${size}^FD${opts.text}^FS\r\n`;
}

export function formatRectZPL(opts: {
	x: number;
	y: number;
	width: number;
	height: number;
	strokeWidth: number;
	angle: number;
}): string {
	let w = Math.round(opts.width);
	let h = Math.round(opts.height);
	const norm = ((opts.angle % 360) + 360) % 360;
	if (norm === 90 || norm === 270) {
		[w, h] = [h, w];
	}
	const t = Math.max(1, Math.round(opts.strokeWidth || 2));
	return `^FO${Math.round(opts.x)},${Math.round(opts.y)}^GB${w},${h},${t},B,0^FS\r\n`;
}

export function formatBarcodeZPL(opts: {
	x: number;
	y: number;
	text: string;
	format: BarcodeFormat;
	width: number;
	height: number;
	angle: number;
}): string {
	const orient = getZPLOrientation(opts.angle);
	const x = Math.round(opts.x);
	const y = Math.round(opts.y);

	if (opts.format === 'QR') {
		const mag = Math.max(1, Math.min(10, Math.round(opts.width / 40)));
		return `^FO${x},${y}^BQN,2,${mag}^FDQA,${opts.text}^FS\r\n`;
	} else if (opts.format === 'CODE128') {
		return `^FO${x},${y}^BY2^BC${orient},${Math.round(opts.height)},Y,N,N^FD${opts.text}^FS\r\n`;
	} else {
		return `^FO${x},${y}^BY2^B3${orient},N,${Math.round(opts.height)},Y,N^FD${opts.text}^FS\r\n`;
	}
}

export function compileFabricCanvasToZPL(canvas: fabric.Canvas, config: LabelConfig): string {
	const pw = inchesToDots(config.widthInches, config.dpi);
	const ll = inchesToDots(config.heightInches, config.dpi);
	let zpl = generateZPLHeader(pw, ll);

	const objects = canvas.getObjects();
	for (const obj of objects) {
		const x = obj.left || 0;
		const y = obj.top || 0;
		const angle = obj.angle || 0;
		const customType = (obj as any).zplType;

		if (customType === 'text' || obj.type === 'i-text' || obj.type === 'text') {
			const textObj = obj as fabric.IText;
			zpl += formatTextZPL({
				x,
				y,
				text: textObj.text || '',
				fontSize: textObj.fontSize || 36,
				angle
			});
		} else if (customType === 'rectangle' || obj.type === 'rect') {
			const rectObj = obj as fabric.Rect;
			zpl += formatRectZPL({
				x,
				y,
				width: (rectObj.width || 100) * (rectObj.scaleX || 1),
				height: (rectObj.height || 50) * (rectObj.scaleY || 1),
				strokeWidth: rectObj.strokeWidth || 2,
				angle
			});
		} else if (customType === 'barcode') {
			zpl += formatBarcodeZPL({
				x,
				y,
				text: (obj as any).zplData || 'BARCODE',
				format: (obj as any).barcodeFormat || 'QR',
				width: (obj.width || 100) * (obj.scaleX || 1),
				height: (obj.height || 100) * (obj.scaleY || 1),
				angle
			});
		} else if ((obj as any).zplGFData) {
			zpl += `^FO${Math.round(x)},${Math.round(y)}${(obj as any).zplGFData}^FS\r\n`;
		}
	}

	zpl += '^PQ1\r\n^XZ\r\n';
	return zpl;
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `npm run test:unit -- src/lib/zpl/zplCompiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/zpl/zplCompiler.ts src/lib/zpl/zplCompiler.test.ts
git commit -m "feat: implement ZPL compiler with coordinate transforms and barcode support"
```

---

### Task 5: ZPLEditor Svelte Component Implementation

**Files:**

- Create: `src/lib/ZPLEditor.svelte`
- Create: `src/lib/index.ts` (exporting `ZPLEditor`)
- Test: Manual browser test & check script

**Interfaces:**

- Consumes: `compileFabricCanvasToZPL`, `renderBarcodeDataUrl`, `rgbaToZplGF`, `LabelConfig`
- Produces: Svelte Component `<ZPLEditor bind:zpl={zplString} width={4} height={6} dpi={300} />`

- [ ] **Step 1: Implement `src/lib/ZPLEditor.svelte`**

Create `src/lib/ZPLEditor.svelte` with:

- Top toolbar: Width, Height, DPI, Zoom, Copy ZPL button.
- Left column (Palette): Add Text, Add Rectangle, Add Barcode, Add Image buttons.
- Middle column: Scrollable/centered FabricJS canvas container with visual grid background.
- Right column: Property inspector displaying selected object controls (X, Y, Width, Height, Text content, Font Size, Rotation dropdown [0°, 90°, 180°, 270°], Barcode Format dropdown).
- Fabric canvas event bindings (`selection:created`, `selection:updated`, `selection:cleared`, `object:modified`, `object:moving`, `object:scaling`, `object:rotating`) with `object.snapAngle = 90`.
- Real-time ZPL updating through bindable `zpl` prop.

- [ ] **Step 2: Export component in `src/lib/index.ts`**

Update `src/lib/index.ts`:

```typescript
import ZPLEditor from './ZPLEditor.svelte';
export { ZPLEditor };
export default ZPLEditor;
```

- [ ] **Step 3: Run check to verify Svelte & TypeScript compilation**

Run: `npm run check`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ZPLEditor.svelte src/lib/index.ts
git commit -m "feat: implement ZPLEditor 3-column Svelte component with property inspector and FabricJS canvas"
```

---

### Task 6: Create Interactive Demo Site

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/app.css` (or styling imports)
- Test: Manual verification in browser

- [ ] **Step 1: Build the Demo Page in `src/routes/+page.svelte`**

Implement `+page.svelte` to include:

1. Header title "ZPL Label Editor Showcase".
2. Split view with `<ZPLEditor bind:zpl={zplOutput} width={labelWidth} height={labelHeight} dpi={labelDpi} />`.
3. Code preview panel with syntax highlighting / dark code block showing `zplOutput` in real time.
4. Print Preview panel fetching http://labelary.com/v1/printers/{dpi}dpmm/labels/{width}x{height}/0/{zplOutput} as an image preview.
5. Quick preset buttons (4" x 6" Shipping, 2" x 1" Product, 3" x 2" Inventory).

- [ ] **Step 2: Start dev server and verify in browser**

Run: `npm run dev`
Open browser and verify:

- Canvas renders at 300 DPI cleanly.
- Adding text, rectangles, barcodes, and images works.
- Rotating snaps to 90 degrees.
- ZPL updates in real time in the code box.
- Labelary image preview loads correctly.

- [ ] **Step 3: Run `npm run check` and `npm run test`**

Run: `npm run check && npm run test`
Expected: All tests pass cleanly with zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: complete demo showcase page with real-time ZPL preview and Labelary integration"
```
