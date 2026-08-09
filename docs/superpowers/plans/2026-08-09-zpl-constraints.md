# ZPL Editor Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the Fabric.js canvas in `ZPLEditor.svelte` to strictly snap rotations, coordinates, and scales so that invalid ZPL states are unrepresentable.

**Architecture:** We will hook into Fabric.js object events (`object:moving`, `object:scaling`) and modify global prototype defaults to forcefully snap values to integers and 90-degree increments. We will also introduce a custom web font for ZPL text parity.

**Tech Stack:** Svelte 5, Fabric.js

## Global Constraints
- Do not add complex warning UI elements; rely on hard snapping.
- Assume `CG Triumvirate` will be available at `/fonts/CG-Triumvirate.woff2` (user will provide).

---

### Task 1: Strict Rotation Snapping

**Files:**
- Modify: `src/lib/ZPLEditor.svelte`

**Interfaces:**
- Consumes: `fabric.Object.prototype`

- [ ] **Step 1: Update snapThreshold**

In `ZPLEditor.svelte`, inside the `onMount` block (around line 72), change the `snapThreshold` from 10 to 45.

```javascript
// Set default snap angle for all objects
fabric.Object.prototype.snapAngle = 90;
fabric.Object.prototype.snapThreshold = 45;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ZPLEditor.svelte
git commit -m "feat: enforce 90-degree rotation snapping for all objects"
```

---

### Task 2: Coordinate Snapping (object:moving)

**Files:**
- Modify: `src/lib/ZPLEditor.svelte`

**Interfaces:**
- Consumes: Fabric.js `object:moving` event.

- [ ] **Step 1: Add moving event handler**

In `ZPLEditor.svelte`, inside `onMount`, add an `object:moving` event listener that rounds `left` and `top`.

```javascript
fabricCanvas.on('object:moving', (e) => {
	const obj = e.target;
	if (obj) {
		obj.set({
			left: Math.round(obj.left || 0),
			top: Math.round(obj.top || 0)
		});
	}
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ZPLEditor.svelte
git commit -m "feat: snap object coordinates to integers while moving"
```

---

### Task 3: Barcode & Dimension Snapping (object:scaling)

**Files:**
- Modify: `src/lib/ZPLEditor.svelte`

**Interfaces:**
- Consumes: Fabric.js `object:scaling` event.

- [ ] **Step 1: Refactor scaling event handler**

In `ZPLEditor.svelte`, locate the existing `object:scaling` event handler (around line 90) and update it to enforce integer dimensions and strict barcode scaling.

```javascript
fabricCanvas.on('object:scaling', (e) => {
	const obj = e.target;
	if (!obj) return;
	
	if (obj.zplType === 'barcode') {
		const scale = Math.max(1, Math.round(Math.max(obj.scaleX || 1, obj.scaleY || 1)));
		obj.set({
			scaleX: scale,
			scaleY: scale
		});
	} else {
		// Snap the visual width and height to integer pixels
		if (obj.width && obj.scaleX) {
			const targetWidth = Math.round(obj.width * obj.scaleX);
			obj.set('scaleX', targetWidth / obj.width);
		}
		if (obj.height && obj.scaleY) {
			const targetHeight = Math.round(obj.height * obj.scaleY);
			obj.set('scaleY', targetHeight / obj.height);
		}
	}

	if (obj.zplType === 'rectangle') {
		const rectObj = obj;
		const roundingVal = rectObj.zplRounding || 0;
		const w = (rectObj.width || 0) * (rectObj.scaleX || 1);
		const h = (rectObj.height || 0) * (rectObj.scaleY || 1);
		const rx = (roundingVal / 8) * (Math.min(w, h) / 2);
		rectObj.set({
			rx: rx / (rectObj.scaleX || 1),
			ry: rx / (rectObj.scaleY || 1)
		});
	}
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ZPLEditor.svelte
git commit -m "feat: snap object dimensions and lock barcode magnification to integers"
```

---

### Task 4: Typography Parity (CG Triumvirate)

**Files:**
- Modify: `src/lib/ZPLEditor.svelte`

**Interfaces:**
- Consumes: CSS `@font-face` and Fabric.js `IText` instantiation.

- [ ] **Step 1: Define @font-face**

In `ZPLEditor.svelte`'s `<style>` block, add the `@font-face`:

```css
	@font-face {
		font-family: 'CG Triumvirate';
		src: url('/fonts/CG-Triumvirate.woff2') format('woff2'),
		     url('/fonts/CG-Triumvirate.woff') format('woff'),
		     url('/fonts/CG-Triumvirate.ttf') format('truetype');
		font-weight: normal;
		font-style: normal;
		font-display: swap;
	}
```

- [ ] **Step 2: Update addText default font**

In `ZPLEditor.svelte`, locate the `addText` function and change the `fontFamily`:

```javascript
	function addText(content = 'Text', x = 50, y = 50, size = 36) {
		if (!fabricCanvas) return;
		const textObj = new fabric.IText(content, {
			left: x,
			top: y,
			fontSize: size,
			fontFamily: 'CG Triumvirate, Helvetica, Arial, sans-serif',
			fill: '#000000',
			snapAngle: 90
		});
		textObj.zplType = 'text';
		fabricCanvas.add(textObj);
		fabricCanvas.setActiveObject(textObj);
	}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ZPLEditor.svelte
git commit -m "feat: set CG Triumvirate as default font for ZPL text parity"
```
