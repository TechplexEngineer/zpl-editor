# ZPL Text Stretching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement text stretching support in the ZPL Editor by mapping FabricJS's scale properties to native ZPL font height and width.

**Architecture:** We will modify `formatTextZPL` to accept `height` and `width` parameters instead of `fontSize`. During ZPL compilation in `compileFabricCanvasToZPL`, we will calculate the final character height and width by multiplying the base `fontSize` of the text object by its `scaleY` and `scaleX` properties respectively.

**Tech Stack:** Svelte 5, TypeScript, Fabric.js, Vitest.

## Global Constraints

- Keep ZPL output vector-sharp using native `^A0` command settings.
- Do not increase the ZPL payload size unnecessarily.
- Do not break existing shape/barcode translation logic.

---

### Task 1: ZPL Compiler Text Stretching

**Files:**

- Modify: `src/lib/zpl/zplCompiler.ts`
- Modify: `src/lib/zpl/zplCompiler.test.ts`

**Interfaces:**

- Consumes: None (reads directly from `fabric.IText` properties).
- Produces: `formatTextZPL(opts: { x: number; y: number; text: string; height: number; width: number; angle: number }): string`

- [ ] **Step 1: Write the failing tests**

  Modify [zplCompiler.test.ts](file:///Users/techplex/.gemini/antigravity/worktrees/zpl-editor/implement-zpl-text-stretching/src/lib/zpl/zplCompiler.test.ts):
  Update the existing text formatting test and add a new test for stretched text.

  ```typescript
  it('formats text ZPL with rotation orientation', () => {
  	const zpl = formatTextZPL({ x: 100, y: 150, text: 'Hello', height: 36, width: 36, angle: 90 });
  	expect(zpl).toBe('^FO100,150^A0R,36,36^FDHello^FS\r\n');
  });

  it('formats stretched text ZPL correctly', () => {
  	const zpl = formatTextZPL({
  		x: 80,
  		y: 120,
  		text: 'Stretched',
  		height: 48,
  		width: 24,
  		angle: 0
  	});
  	expect(zpl).toBe('^FO80,120^A0N,48,24^FDStretched^FS\r\n');
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npm run test`
  Expected: Compile errors and test failure due to the updated `formatTextZPL` signature.

- [ ] **Step 3: Write minimal implementation**

  Modify [zplCompiler.ts](file:///Users/techplex/.gemini/antigravity/worktrees/zpl-editor/implement-zpl-text-stretching/src/lib/zpl/zplCompiler.ts):
  1. Update the signature and body of `formatTextZPL` to accept `height` and `width`:
     ```typescript
     export function formatTextZPL(opts: {
     	x: number;
     	y: number;
     	text: string;
     	height: number;
     	width: number;
     	angle: number;
     }): string {
     	const orient = getZPLOrientation(opts.angle);
     	const h = Math.round(opts.height);
     	const w = Math.round(opts.width);
     	return `^FO${Math.round(opts.x)},${Math.round(opts.y)}^A0${orient},${h},${w}^FD${opts.text}^FS\r\n`;
     }
     ```
  2. Update `compileFabricCanvasToZPL` to calculate dynamic `height` and `width`:
     ```typescript
     if (customType === 'text' || obj.type === 'i-text' || obj.type === 'text') {
     	const textObj = obj as fabric.IText;
     	zpl += formatTextZPL({
     		x,
     		y,
     		text: textObj.text || '',
     		height: (textObj.fontSize || 36) * (textObj.scaleY || 1),
     		width: (textObj.fontSize || 36) * (textObj.scaleX || 1),
     		angle
     	});
     }
     ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `npm run test`
  Expected: PASS

- [ ] **Step 5: Commit**

  Run:

  ```bash
  git add src/lib/zpl/zplCompiler.ts src/lib/zpl/zplCompiler.test.ts
  git commit -m "feat: map FabricJS text stretching to native ZPL font dimensions"
  ```
