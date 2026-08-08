# ZPL Text Stretching Design Spec

This document details the design for mapping stretched and non-uniformly scaled text from FabricJS onto ZPL font dimensions.

## Overview

In the Svelte ZPL Editor, users can scale and stretch text elements. FabricJS represents stretching using the `scaleX` and `scaleY` properties on the text object. Currently, the ZPL compiler ignores these scale factors and outputs font size based on the base `fontSize` property only. 

This spec introduces direct mapping of scaled text dimensions to native ZPL font commands.

## Proposed Changes

### ZPL Compiler (`src/lib/zpl/zplCompiler.ts`)

#### [MODIFY] [zplCompiler.ts](file:///Users/techplex/.gemini/antigravity/worktrees/zpl-editor/implement-zpl-text-stretching/src/lib/zpl/zplCompiler.ts)

We will modify `formatTextZPL` to accept `height` and `width` dimensions instead of `fontSize`:

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

We will modify `compileFabricCanvasToZPL` to calculate these dimensions dynamically using the text object's `fontSize`, `scaleX`, and `scaleY` properties:

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

## Verification Plan

### Automated Tests
* Update tests in `src/lib/zpl/zplCompiler.test.ts` to cover:
  * Default/regular text formatting (with equal height and width).
  * Stretched text formatting (with differing height and width values).

### Manual Verification
* Run `npm run test` to verify all tests pass.
* Verify the changes visually against a Labelary preview once code is integrated.
