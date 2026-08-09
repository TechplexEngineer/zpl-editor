# ZPL Placeholders and CSV Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named `{{placeholder}}` authoring for text and barcode payloads to `ZPLEditor`, plus a separate CSV merge example that explicitly maps values and downloads one safely rendered ZPL file per valid row.

**Architecture:** Keep ordinary ZPL as the canonical template and derive placeholder metadata by scanning `^FD...^FS` fields; editor metadata is advisory and the standalone merge route can operate on ZPL alone. Put syntax analysis, context-aware encoding, typed value providers, CSV parsing, and row-isolated generation in framework-independent TypeScript modules, then connect them to the Fabric editor and a separate `/merge` Svelte route.

**Tech Stack:** Svelte 5 runes, TypeScript 6, Fabric 5, SvelteKit 2, Vitest 4 (Node and browser projects), Playwright browser provider, browser `File`/`Blob`/`URL` APIs.

## Global Constraints

- V1 template syntax is named interpolation only: `{{name}}`; do not add sections, conditions, loops, helpers, dotted paths, or arbitrary expressions.
- Placeholder names match `^[A-Za-z_][A-Za-z0-9_-]*$`.
- Supported placements are visible text `^FD` content and barcode payload `^FD` content only; reject tokens in commands, geometry, font settings, symbology settings, images, and raw fragments.
- Preserve placeholder tokens byte-for-byte as `{{name}}` in editor-generated and downloaded template ZPL.
- Treat ZPL as the source of truth. Metadata improves editor display and diagnostics but is not required for merging a saved template.
- Keep CSV upload and mapping UI out of `src/lib/ZPLEditor.svelte`; expose it only in the standalone `/merge` example.
- Require an explicit mapping for every discovered name. Do not auto-confirm matching headers, and do not silently substitute blanks for unmapped or missing fields.
- Empty CSV cells are valid empty strings. A selected column that is absent from the header is a mapping error.
- Resolve values through typed providers (`csv-column`, `literal`, `blank`) so later date providers can be added without changing template syntax.
- Encode resolved values for their individual ZPL field context; never interpolate raw CSV/literal bytes directly into commands.
- Generate and download individual `.zpl` files only. Do not build a combined batch, ZIP, printer discovery, or direct printing integration.
- A bad row must not suppress successful rows; diagnostics use one-based CSV row numbers with the header at row 1, so the first data row is row 2.
- Use deterministic collision-safe filenames `label-row-000002.zpl`, `label-row-000003.zpl`, and so on.
- Do not add a runtime CSV or Mustache dependency: the required grammar is deliberately smaller and is covered by local typed utilities.

---

## File Map

### New library files

- `src/lib/template/types.ts` — shared placeholder, diagnostic, mapping, provider, and generation result types.
- `src/lib/template/analyzeTemplate.ts` — strict token scanner, ZPL field/context discovery, malformed-token checks, and unique-name discovery.
- `src/lib/template/analyzeTemplate.test.ts` — syntax, placement, duplicate-use, and context tests.
- `src/lib/template/placeholderPreview.ts` — editor insertion and visual-preview helpers that never mutate canonical token text.
- `src/lib/template/placeholderPreview.test.ts` — name validation, selection insertion, Fabric style ranges, and barcode preview tests.
- `src/lib/template/encodeZplField.ts` — context-aware `^FH\` hex encoding and barcode character validation.
- `src/lib/template/encodeZplField.test.ts` — command delimiter, escape-marker, newline, Unicode, empty, and symbology tests.
- `src/lib/template/providers.ts` — discriminated typed providers and row resolution.
- `src/lib/template/providers.test.ts` — CSV column, literal, blank, and missing-column behavior.
- `src/lib/template/renderTemplate.ts` — provider resolution, contextual replacement, independent label validation, row-isolated generation, and filenames.
- `src/lib/template/renderTemplate.test.ts` — interpolation-only rendering and mixed-success generation tests.
- `src/lib/csv/parseCsv.ts` — dependency-free header-row CSV parser with quoted-field support.
- `src/lib/csv/parseCsv.test.ts` — header, quoted comma/quote/newline, duplicate header, uneven row, CRLF, and empty-cell tests.
- `src/lib/components/CsvMergeExample.svelte` — four-step template/CSV/mapping/generation example UI.
- `src/lib/components/CsvMergeExample.svelte.spec.ts` — browser tests for explicit mapping, preview, diagnostics, and individual downloads.
- `src/routes/merge/+page.svelte` — standalone merge example route wrapper.
- `src/routes/merge/page.svelte.spec.ts` — route smoke/separation test.
- `src/lib/template/fixtures/inventory-template.zpl` — placeholder-bearing end-to-end fixture.
- `src/lib/template/fixtures/inventory.csv` — header-row CSV fixture containing valid, empty, and invalid rows.
- `src/lib/template/fixtures/inventory.expected.ts` — explicit mappings, expected files, and expected row diagnostic.

### Existing files to modify

- `src/lib/zpl/zplCompiler.ts` — preserve canonical placeholder text in generated text/barcode fields; metadata locations are derived from the resulting ZPL analyzer.
- `src/lib/zpl/zplCompiler.test.ts` — prove exact token serialization from Fabric text and barcode data.
- `src/lib/ZPLEditor.svelte` — placeholder insertion controls, inline validation, preview styling, barcode preview substitution, and metadata callback.
- `src/lib/ZPLEditor.svelte.spec.ts` — browser tests for text/barcode insertion and author-facing errors.
- `src/lib/index.ts` — export public template analysis/render/provider types and functions.
- `src/routes/+page.svelte` — add navigation to `/merge`; do not embed merge state or CSV controls.
- `src/routes/page.svelte.spec.ts` — assert merge is navigation-only and editor remains mounted across its existing tabs.
- `README.md` — document named-token scope, editor metadata callback, public renderer API, and standalone example.

---

### Task 1: Define the stable template and merge contracts

**Files:**
- Create: `src/lib/template/types.ts`
- Test: `src/lib/zpl/types.test.ts`

**Interfaces:**
- Consumes: existing `BarcodeFormat` from `src/lib/zpl/types.ts`.
- Produces: `PlaceholderContext`, `PlaceholderOccurrence`, `TemplateDiagnostic`, `TemplateAnalysis`, `ValueProvider`, `PlaceholderMapping`, `CsvDocument`, `MappingValidationError`, `RowRenderError`, `GeneratedLabel`, and `BatchRenderResult` used verbatim by all later tasks.

- [ ] **Step 1: Add a failing compile-time contract test**

Extend `src/lib/zpl/types.test.ts` with a runtime assertion whose assignment forces TypeScript to verify the public shapes:

```ts
import type {
	PlaceholderOccurrence,
	ValueProvider,
	BatchRenderResult
} from '../template/types.js';

it('keeps placeholder and provider contracts discriminated', () => {
	const occurrence: PlaceholderOccurrence = {
		name: 'sku', token: '{{sku}}', start: 12, end: 19,
		fieldStart: 8, fieldEnd: 22, locationId: 'field-1',
		context: { kind: 'barcode', format: 'CODE128' }
	};
	const provider: ValueProvider = { kind: 'csv-column', column: 'SKU' };
	const result: BatchRenderResult = { generated: [], errors: [] };
	expect([occurrence.context.kind, provider.kind, result.errors]).toEqual([
		'barcode', 'csv-column', []
	]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test:unit -- --run src/lib/zpl/types.test.ts`

Expected: FAIL because `src/lib/template/types.ts` does not exist.

- [ ] **Step 3: Add the shared discriminated unions**

Create `src/lib/template/types.ts` with these exact contracts:

```ts
import type { BarcodeFormat } from '../zpl/types.js';

export type PlaceholderName = string;
export type PlaceholderContext =
	| { kind: 'text' }
	| { kind: 'barcode'; format: BarcodeFormat };

export interface PlaceholderOccurrence {
	name: PlaceholderName;
	token: string;
	start: number;
	end: number;
	fieldStart: number;
	fieldEnd: number;
	locationId: string;
	context: PlaceholderContext;
}

export type TemplateDiagnosticCode =
	| 'MALFORMED_TOKEN'
	| 'INVALID_NAME'
	| 'UNSUPPORTED_PLACEMENT';

export interface TemplateDiagnostic {
	code: TemplateDiagnosticCode;
	message: string;
	start: number;
	end: number;
	name?: string;
	locationId?: string;
}

export interface TemplateAnalysis {
	placeholders: string[];
	occurrences: PlaceholderOccurrence[];
	diagnostics: TemplateDiagnostic[];
}

export type ValueProvider =
	| { kind: 'csv-column'; column: string }
	| { kind: 'literal'; value: string }
	| { kind: 'blank' };

export type PlaceholderMapping = Record<string, ValueProvider>;

export interface CsvDocument {
	headers: string[];
	rows: Array<{ rowNumber: number; values: Record<string, string> }>;
}

export interface MappingValidationError {
	placeholder: string;
	code: 'UNMAPPED' | 'MISSING_COLUMN';
	message: string;
}

export interface RowRenderError {
	rowNumber: number;
	code: 'PROVIDER_ERROR' | 'INVALID_VALUE' | 'INVALID_RENDERED_ZPL';
	message: string;
	placeholder?: string;
}

export interface GeneratedLabel {
	rowNumber: number;
	filename: string;
	zpl: string;
}

export interface BatchRenderResult {
	generated: GeneratedLabel[];
	errors: RowRenderError[];
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm run test:unit -- --run src/lib/zpl/types.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contracts**

```bash
git add src/lib/template/types.ts src/lib/zpl/types.test.ts
git commit -m "feat: define placeholder merge contracts"
```

---

### Task 2: Analyze strict named tokens and ZPL placement

**Files:**
- Create: `src/lib/template/analyzeTemplate.ts`
- Create: `src/lib/template/analyzeTemplate.test.ts`

**Interfaces:**
- Consumes: `TemplateAnalysis`, `PlaceholderOccurrence`, and `BarcodeFormat`.
- Produces: `PLACEHOLDER_NAME_PATTERN`, `isPlaceholderName(name: string): boolean`, and `analyzeTemplate(zpl: string): TemplateAnalysis`.

- [ ] **Step 1: Write failing discovery and duplicate-use tests**

```ts
import { describe, expect, it } from 'vitest';
import { analyzeTemplate } from './analyzeTemplate.js';

describe('analyzeTemplate', () => {
	it('discovers unique names while retaining every text and barcode occurrence', () => {
		const zpl = '^XA^FO1,1^A0N,20,20^FDSKU {{sku}}^FS' +
			'^FO1,30^BCN,60,Y,N,N^FD{{sku}}-{{lot-code}}^FS^XZ';
		const result = analyzeTemplate(zpl);
		expect(result.placeholders).toEqual(['sku', 'lot-code']);
		expect(result.occurrences.map(({ name, context }) => [name, context])).toEqual([
			['sku', { kind: 'text' }],
			['sku', { kind: 'barcode', format: 'CODE128' }],
			['lot-code', { kind: 'barcode', format: 'CODE128' }]
		]);
		expect(result.diagnostics).toEqual([]);
	});

	it.each([
		['^XA^FO1,1^A0N,20,20^FD{{}}^FS^XZ', 'INVALID_NAME'],
		['^XA^FO1,1^A0N,20,20^FD{{9sku}}^FS^XZ', 'INVALID_NAME'],
		['^XA^FO1,1^A0N,20,20^FD{{sku name}}^FS^XZ', 'INVALID_NAME'],
		['^XA^FO1,1^A0N,20,20^FD{{sku^FS^XZ', 'MALFORMED_TOKEN'],
		['^XA^PW{{width}}^XZ', 'UNSUPPORTED_PLACEMENT'],
		['^XA^FO1,1^GB10,10,1^FD{{raw}}^FS^XZ', 'UNSUPPORTED_PLACEMENT']
	])('reports %s as %s', (zpl, code) => {
		expect(analyzeTemplate(zpl).diagnostics[0]?.code).toBe(code);
	});
});
```

- [ ] **Step 2: Run the analyzer test and verify it fails**

Run: `npm run test:unit -- --run src/lib/template/analyzeTemplate.test.ts`

Expected: FAIL because `analyzeTemplate.ts` does not exist.

- [ ] **Step 3: Implement a scanner, not a general Mustache evaluator**

Implement `PLACEHOLDER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/` and a single left-to-right brace scanner. First locate every `^FD`/`^FS` interval and classify it from commands between the previous `^FO` and `^FD`: `^A`/`^FB` means text; `^BQN` means `QR`; `^BX` means `DATAMATRIX`; `^BC` means `CODE128`; `^B3` means `CODE39`; any other field is unsupported. For every `{{`, require a later `}}`, reject nested `{`/`}`, reject a stray `}}`, validate the exact inner name without trimming, and emit absolute offsets. Use `field-${oneBasedIndex}` for `locationId`, preserve first-appearance order in `placeholders`, and keep all valid duplicate occurrences.

Core loop shape:

```ts
export const PLACEHOLDER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function isPlaceholderName(name: string): boolean {
	return PLACEHOLDER_NAME_PATTERN.test(name);
}

export function analyzeTemplate(zpl: string): TemplateAnalysis {
	const fields = findFieldIntervals(zpl);
	const occurrences: PlaceholderOccurrence[] = [];
	const diagnostics: TemplateDiagnostic[] = [];
	// Advance cursor by token end on success and by two characters on malformed input.
	// Associate a token only when token.start >= field.contentStart and token.end <= field.fieldEnd.
	return {
		placeholders: [...new Set(occurrences.map((item) => item.name))],
		occurrences,
		diagnostics
	};
}
```

- [ ] **Step 4: Add field-location assertions**

Add a test asserting every occurrence has `token === zpl.slice(start, end)`, the two barcode occurrences share one `locationId`, and `fieldStart < start < end <= fieldEnd`. This prevents later rendering from relying on guessed offsets.

- [ ] **Step 5: Run focused tests**

Run: `npm run test:unit -- --run src/lib/template/analyzeTemplate.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit strict analysis**

```bash
git add src/lib/template/analyzeTemplate.ts src/lib/template/analyzeTemplate.test.ts
git commit -m "feat: discover and validate zpl placeholders"
```

---

### Task 3: Add editor insertion and preview helpers

**Files:**
- Create: `src/lib/template/placeholderPreview.ts`
- Create: `src/lib/template/placeholderPreview.test.ts`

**Interfaces:**
- Consumes: `isPlaceholderName()` and canonical strings stored in Fabric `Textbox.text` / barcode `zplData`.
- Produces: `insertPlaceholder(source: string, name: string, start?: number, end?: number): string`, `placeholderPreviewText(source: string): string`, and `placeholderStyleRanges(source: string): Array<{ start: number; end: number }>`.

- [ ] **Step 1: Write failing pure-helper tests**

```ts
it('inserts at a selection without altering surrounding text', () => {
	expect(insertPlaceholder('SKU: selected', 'sku', 5, 13)).toBe('SKU: {{sku}}');
});

it('uses recognizable preview text while leaving canonical input unchanged', () => {
	const source = 'Lot {{lot}} / {{sku}}';
	expect(placeholderPreviewText(source)).toBe('Lot [lot] / [sku]');
	expect(source).toBe('Lot {{lot}} / {{sku}}');
	expect(placeholderStyleRanges(source)).toEqual([
		{ start: 4, end: 11 }, { start: 14, end: 21 }
	]);
});

it('rejects invalid names before insertion', () => {
	expect(() => insertPlaceholder('SKU', '9 sku', 3, 3)).toThrow('letters, digits, underscores, or hyphens');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- --run src/lib/template/placeholderPreview.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement exact insertion and display-only preview conversion**

Clamp selection indices to `[0, source.length]`, replace the selected span with `{{${name}}}`, and throw for a name that fails `isPlaceholderName`. `placeholderPreviewText` replaces only valid tokens with `[name]`; malformed text remains visible unchanged so it can be corrected. `placeholderStyleRanges` uses `analyzeTokenText` logic over ordinary content and returns half-open ranges including braces.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm run test:unit -- --run src/lib/template/placeholderPreview.test.ts`

Expected: PASS.

```bash
git add src/lib/template/placeholderPreview.ts src/lib/template/placeholderPreview.test.ts
git commit -m "feat: add placeholder insertion and preview helpers"
```

---

### Task 4: Preserve tokens and add placeholder authoring to `ZPLEditor`

**Files:**
- Modify: `src/lib/zpl/zplCompiler.ts:30-133`
- Modify: `src/lib/zpl/zplCompiler.test.ts`
- Modify: `src/lib/ZPLEditor.svelte:1-159,484-617,801-883`
- Modify: `src/lib/ZPLEditor.svelte.spec.ts`

**Interfaces:**
- Consumes: `analyzeTemplate`, `insertPlaceholder`, `placeholderPreviewText`, `placeholderStyleRanges`, and `TemplateAnalysis`.
- Produces: optional editor prop `onTemplateAnalysis?: (analysis: TemplateAnalysis) => void`; exact `{{name}}` compiler output; text and barcode inspector controls labeled `Placeholder name` and `Insert placeholder`.

- [ ] **Step 1: Add failing compiler tests for exact preservation**

Add two objects to a mock canvas and assert the literal tokens survive compilation:

```ts
it('preserves named tokens in text and barcode field data', () => {
	const canvas = { getObjects: () => [
		{ type: 'textbox', zplType: 'text', text: 'SKU {{sku}}', left: 1, top: 2,
			fontSize: 20, width: 100, scaleX: 1, scaleY: 1, angle: 0 },
		{ type: 'image', zplType: 'barcode', zplData: '{{sku}}-{{lot}}',
			barcodeFormat: 'CODE128', left: 1, top: 30, width: 100, height: 40,
			scaleX: 1, scaleY: 1, angle: 0 }
	] } as any;
	const zpl = compileFabricCanvasToZPL(canvas, { widthInches: 2, heightInches: 1, dpi: 300 });
	expect(zpl).toContain('^FDSKU {{sku}}^FS');
	expect(zpl).toContain('^FD{{sku}}-{{lot}}^FS');
});
```

- [ ] **Step 2: Add failing browser tests for text and barcode controls**

In `ZPLEditor.svelte.spec.ts`, render the editor, select the default text through Fabric canvas objects, type `sku` in `Placeholder name`, click `Insert placeholder`, and assert the `onChange` spy last received ZPL containing `{{sku}}`. Repeat with the default barcode and `lot-code`; mock `renderBarcodeDataUrl` so the test is deterministic. Add invalid-name coverage asserting `9sku` shows an inline error and does not call insertion.

- [ ] **Step 3: Run the focused tests and verify failures**

Run: `npm run test:unit -- --run src/lib/zpl/zplCompiler.test.ts src/lib/ZPLEditor.svelte.spec.ts`

Expected: compiler preservation passes with current string serialization, while editor tests fail because controls and metadata callback are absent.

- [ ] **Step 4: Add editor analysis state and callback**

Extend props and `updateZPL()`:

```ts
onTemplateAnalysis = (_analysis: TemplateAnalysis) => {}
// prop type: onTemplateAnalysis?: (analysis: TemplateAnalysis) => void

const analysis = analyzeTemplate(generated);
onTemplateAnalysis(analysis);
```

Add `placeholderName`, `placeholderError`, and references to the text/barcode value inputs. The insertion handler must reject unsupported active object types, call `insertPlaceholder` with `selectionStart`/`selectionEnd`, update `text` or `zplData`, then call `updateZPL()`.

- [ ] **Step 5: Visually distinguish tokens without corrupting source values**

For text objects, keep `Textbox.text` canonical and apply Fabric per-character styles for each range returned by `placeholderStyleRanges`: dark-blue fill plus light-blue background. Reapply styles after text edits and insertion. For barcodes, keep `zplData` canonical but call `renderBarcodeDataUrl(placeholderPreviewText(zplData), format)` so the preview encodes `[sku]`; show chips beneath the input for names discovered in that payload. Never pass preview text to `compileFabricCanvasToZPL`.

- [ ] **Step 6: Add both inspector controls and contextual diagnostics**

Under both `Text Content` and `Barcode Value`, render the same named insertion row:

```svelte
<div class="placeholder-control">
	<input aria-label="Placeholder name" bind:value={placeholderName} placeholder="sku" />
	<button type="button" onclick={insertIntoActiveContent}>Insert placeholder</button>
</div>
{#if placeholderError}<p class="field-error" role="alert">{placeholderError}</p>{/if}
```

Show diagnostics as `Placeholder “name” at field-N: message`, satisfying author-facing name/location requirements.

- [ ] **Step 7: Run compiler/editor tests and checks**

Run: `npm run test:unit -- --run src/lib/zpl/zplCompiler.test.ts src/lib/ZPLEditor.svelte.spec.ts`

Expected: PASS.

Run: `npm run check`

Expected: PASS with 0 errors.

- [ ] **Step 8: Commit editor authoring**

```bash
git add src/lib/zpl/zplCompiler.ts src/lib/zpl/zplCompiler.test.ts src/lib/ZPLEditor.svelte src/lib/ZPLEditor.svelte.spec.ts
git commit -m "feat: author named placeholders in the editor"
```

---

### Task 5: Parse simple header-row CSV deterministically

**Files:**
- Create: `src/lib/csv/parseCsv.ts`
- Create: `src/lib/csv/parseCsv.test.ts`

**Interfaces:**
- Produces: `CsvParseError extends Error` with `rowNumber`; `parseCsv(source: string): CsvDocument`.
- CSV rules: comma delimiter, RFC-style doubled quotes, quoted commas/newlines, LF or CRLF, no automatic whitespace trimming, UTF-8 BOM removed only from the first header, blank cells retained, trailing wholly blank record omitted.

- [ ] **Step 1: Write failing parser tests**

```ts
it('parses quoted fields and retains empty cells', () => {
	const csv = parseCsv('\uFEFFSKU,Description,Lot\r\nA1,"Widget, blue",\r\nA2,"line 1\nline 2",L2');
	expect(csv.headers).toEqual(['SKU', 'Description', 'Lot']);
	expect(csv.rows).toEqual([
		{ rowNumber: 2, values: { SKU: 'A1', Description: 'Widget, blue', Lot: '' } },
		{ rowNumber: 3, values: { SKU: 'A2', Description: 'line 1\nline 2', Lot: 'L2' } }
	]);
});

it.each([
	['SKU,SKU\nA,B', 1, 'Duplicate header "SKU"'],
	['SKU,Lot\nA', 2, 'Expected 2 columns but found 1'],
	['SKU\n"A', 2, 'Unterminated quoted field']
])('rejects invalid CSV', (source, rowNumber, message) => {
	expect(() => parseCsv(source)).toThrowError(expect.objectContaining({ rowNumber, message }));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- --run src/lib/csv/parseCsv.test.ts`

Expected: FAIL because `parseCsv.ts` does not exist.

- [ ] **Step 3: Implement the finite-state CSV parser**

Use `field`, `record`, `records`, `inQuotes`, and `physicalLine` state. A quote starts a quoted field only at field offset zero; `""` inside quotes appends one quote; commas/newlines terminate only outside quotes. After parsing, validate non-empty unique headers and exact row width, then map each data row to its header without converting values.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:unit -- --run src/lib/csv/parseCsv.test.ts`

Expected: PASS.

```bash
git add src/lib/csv/parseCsv.ts src/lib/csv/parseCsv.test.ts
git commit -m "feat: parse header row csv data"
```

---

### Task 6: Resolve typed providers and encode field data safely

**Files:**
- Create: `src/lib/template/providers.ts`
- Create: `src/lib/template/providers.test.ts`
- Create: `src/lib/template/encodeZplField.ts`
- Create: `src/lib/template/encodeZplField.test.ts`

**Interfaces:**
- Produces: `ProviderResolutionError`, `resolveProvider(provider: ValueProvider, row: Record<string,string>): string`, `encodeZplFieldValue(value: string): string`, and `validateBarcodeValue(value: string, format: BarcodeFormat): string | undefined`.
- Encoding contract: rendered fields use `^FH\`; UTF-8 bytes for `^`, `~`, `\`, CR, LF, and non-ASCII bytes are emitted as uppercase `\HH`; printable ASCII other than those three ZPL-significant characters remains literal.

- [ ] **Step 1: Write failing provider tests**

```ts
expect(resolveProvider({ kind: 'csv-column', column: 'SKU' }, { SKU: '' })).toBe('');
expect(resolveProvider({ kind: 'literal', value: '^fixed~' }, {})).toBe('^fixed~');
expect(resolveProvider({ kind: 'blank' }, {})).toBe('');
expect(() => resolveProvider({ kind: 'csv-column', column: 'Missing' }, { SKU: 'A1' }))
	.toThrow('CSV column "Missing" is not present in this row');
```

- [ ] **Step 2: Write failing encoding and symbology tests**

```ts
expect(encodeZplFieldValue('A^B~C\\D\n')).toBe('A\\5EB\\7EC\\5CD\\0A');
expect(encodeZplFieldValue('')).toBe('');
expect(encodeZplFieldValue('é')).toBe('\\C3\\A9');
expect(validateBarcodeValue('ABC-123', 'CODE39')).toBeUndefined();
expect(validateBarcodeValue('abc', 'CODE39')).toContain('CODE39');
expect(validateBarcodeValue('A\nB', 'CODE128')).toContain('CODE128');
```

- [ ] **Step 3: Run and verify failures**

Run: `npm run test:unit -- --run src/lib/template/providers.test.ts src/lib/template/encodeZplField.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement provider resolution with exhaustive typing**

Use a `switch (provider.kind)` and an exhaustive `never` branch. Check column presence with `Object.hasOwn(row, provider.column)`, not truthiness, so empty cells resolve successfully.

- [ ] **Step 5: Implement byte-safe field encoding and barcode validation**

Use `new TextEncoder().encode(value)` and hex-escape the specified bytes. Validate CODE39 against `/^[A-Z0-9 .\-$\/+%]*$/`; validate CODE128 as printable ASCII `/^[\x20-\x7E]*$/`; permit arbitrary UTF-8 for QR and DataMatrix after ZPL field encoding. Return a message rather than throwing so the batch renderer can attach a row number.

- [ ] **Step 6: Run tests and commit**

Run: `npm run test:unit -- --run src/lib/template/providers.test.ts src/lib/template/encodeZplField.test.ts`

Expected: PASS.

```bash
git add src/lib/template/providers.ts src/lib/template/providers.test.ts src/lib/template/encodeZplField.ts src/lib/template/encodeZplField.test.ts
git commit -m "feat: resolve and safely encode merge values"
```

---

### Task 7: Render templates and isolate row failures

**Files:**
- Create: `src/lib/template/renderTemplate.ts`
- Create: `src/lib/template/renderTemplate.test.ts`
- Create: `src/lib/template/fixtures/inventory-template.zpl`
- Create: `src/lib/template/fixtures/inventory.csv`
- Create: `src/lib/template/fixtures/inventory.expected.ts`

**Interfaces:**
- Consumes: `analyzeTemplate`, `resolveProvider`, `encodeZplFieldValue`, `validateBarcodeValue`, `CsvDocument`, and `PlaceholderMapping`.
- Produces: `MappingValidationError`, `validateMapping(analysis: TemplateAnalysis, mapping: Partial<PlaceholderMapping>, headers: string[]): MappingValidationError[]`, `renderTemplateRow(template: string, analysis: TemplateAnalysis, mapping: PlaceholderMapping, row: Record<string,string>): string`, and `renderCsvRows(template: string, csv: CsvDocument, mapping: PlaceholderMapping): BatchRenderResult`.

- [ ] **Step 1: Write failing mapping tests**

```ts
const analysis = analyzeTemplate('^XA^FO1,1^A0N,20,20^FD{{sku}} {{lot}}^FS^XZ');
expect(validateMapping(analysis, { sku: { kind: 'csv-column', column: 'SKU' } }, ['SKU']))
	.toEqual([{ placeholder: 'lot', code: 'UNMAPPED', message: 'Choose a source for “lot”.' }]);
expect(validateMapping(analysis, {
	sku: { kind: 'csv-column', column: 'Missing' }, lot: { kind: 'blank' }
}, ['SKU'])[0]?.code).toBe('MISSING_COLUMN');
```

- [ ] **Step 2: Write failing contextual-render tests**

Assert duplicate `{{sku}}` uses both resolve, literal `{{sku}}` text inside a provider value is not recursively evaluated, `^`/`~` cannot terminate a field, and the renderer inserts one `^FH\` immediately before each affected `^FD`. Also assert template diagnostics throw before row rendering and extra mapping keys do not create syntax.

```ts
expect(rendered).toContain('^FH\\^FDSKU A\\5EB\\7EC^FS');
expect(rendered).not.toContain('{{sku}}');
expect(renderTemplateRow(template, analysis, { sku: { kind: 'literal', value: '{{other}}' } }, {}))
	.toContain('^FD{{other}}^FS');
```

- [ ] **Step 3: Write the mixed-success fixture test**

Use `inventory-template.zpl` with text `{{description}}` and CODE39 data `{{sku}}`; use three CSV data rows where row 2 is valid, row 3 has an empty description but valid SKU, and row 4 has lowercase CODE39 data. Assert files are exactly `label-row-000002.zpl` and `label-row-000003.zpl`, row 3 contains an empty encoded replacement, and the only error is row 4 `INVALID_VALUE` for `sku`.

- [ ] **Step 4: Run and verify failures**

Run: `npm run test:unit -- --run src/lib/template/renderTemplate.test.ts`

Expected: FAIL because the renderer is absent.

- [ ] **Step 5: Implement mapping validation and one-pass contextual rendering**

Reject any template analysis diagnostic. Require `Object.hasOwn(mapping, name)` for every discovered name. Resolve a name once per row, but encode it separately per occurrence context. Rebuild each `^FD...^FS` field from rightmost occurrence to leftmost so absolute offsets remain stable, add `^FH\` before `^FD` once, and never rescan resolved values.

- [ ] **Step 6: Implement row isolation and rendered-label checks**

For each CSV row, catch provider/validation errors and append one or more `RowRenderError` values while continuing. A rendered label is valid only when it begins with `^XA`, ends with `^XZ` ignoring the repository's CRLF, contains no analyzed placeholders, and has balanced `^FD`/`^FS` pairs. Generate the fixed padded row filename only after validation succeeds.

- [ ] **Step 7: Run focused and complete Node tests**

Run: `npm run test:unit -- --run src/lib/template/renderTemplate.test.ts src/lib/template/analyzeTemplate.test.ts src/lib/template/providers.test.ts src/lib/template/encodeZplField.test.ts src/lib/csv/parseCsv.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the merge engine and fixture**

```bash
git add src/lib/template/renderTemplate.ts src/lib/template/renderTemplate.test.ts src/lib/template/fixtures
git commit -m "feat: render valid csv rows as individual zpl labels"
```

---

### Task 8: Build the standalone four-step merge example

**Files:**
- Create: `src/lib/components/CsvMergeExample.svelte`
- Create: `src/lib/components/CsvMergeExample.svelte.spec.ts`
- Create: `src/routes/merge/+page.svelte`
- Create: `src/routes/merge/page.svelte.spec.ts`
- Modify: `src/routes/+page.svelte:36-68`
- Modify: `src/routes/page.svelte.spec.ts`

**Interfaces:**
- Consumes: `analyzeTemplate`, `parseCsv`, `validateMapping`, `renderTemplateRow`, `renderCsvRows`, and all mapping/result types.
- Produces: isolated `/merge` workflow with template textarea/file load, CSV file input, one explicit mapping control per placeholder, representative preview, result summary, row errors, and individual download buttons.

- [ ] **Step 1: Add failing route separation tests**

In `src/routes/page.svelte.spec.ts`, assert the editor page has a link named `CSV Merge Example` targeting `/merge` and no `Upload CSV` input. In `src/routes/merge/page.svelte.spec.ts`, render the merge route and assert headings `1. Choose template`, `2. Upload CSV`, `3. Map values`, and `4. Generate` exist while `🏷️ ZPL Editor` does not.

- [ ] **Step 2: Add failing browser flow test**

Render `CsvMergeExample`, enter `^XA^FO1,1^A0N,20,20^FD{{sku}} {{description}}^FS^XZ`, upload a `File(['SKU,Description\nA1,Widget'], 'items.csv', { type: 'text/csv' })`, and assert Generate remains disabled until both mapping selects are explicitly changed. Map `sku` to column `SKU` and `description` to fixed value `Fixed`, verify representative preview contains `A1 Fixed`, click Generate, and assert one result row named `label-row-000002.zpl`.

- [ ] **Step 3: Add failing blank, mismatch, and partial-failure UI tests**

Cover these precise behaviors:

- a template name with no equal header still offers every uploaded header and requires user selection;
- selecting `Blank` completes a mapping and empty CSV cells are accepted;
- selecting `Fixed value` reveals a text input whose empty string is a valid literal;
- an invalid CODE39 row appears as `Row 3` while the valid row still has its download button;
- there is no `Download all`, `Print`, printer selector, or combined batch control.

- [ ] **Step 4: Run browser tests and verify failures**

Run: `npm run test:unit -- --run src/lib/components/CsvMergeExample.svelte.spec.ts src/routes/merge/page.svelte.spec.ts src/routes/page.svelte.spec.ts`

Expected: FAIL because the route and component are absent.

- [ ] **Step 5: Implement template and CSV steps**

Use a textarea plus optional `.zpl,text/plain` file input for the template; show discovered names and analyzer diagnostics immediately. Use an `.csv,text/csv` file input, `await file.text()`, and `parseCsv`; display headers and data-row count. Disable later steps while either source has errors.

- [ ] **Step 6: Implement explicit mapping state**

Keep `mappingDraft: Record<string, ValueProvider | undefined>`. Each placeholder select starts at `Choose source…` even when a header matches. Options are `CSV column`, `Blank`, and `Fixed value`; choosing CSV reveals a required header select, choosing fixed reveals a string input. Feed only complete values to `validateMapping` and display its messages next to the relevant placeholder.

- [ ] **Step 7: Implement representative preview and generation**

Preview the first CSV row only after all mappings validate, showing escaped/rendered ZPL in `<pre>` and a note that it represents CSV row 2. Generate by calling `renderCsvRows`; render `N generated, M failed`, a download button per `GeneratedLabel`, and a row-numbered list for errors.

Use this download helper per button:

```ts
function downloadLabel(label: GeneratedLabel) {
	const url = URL.createObjectURL(new Blob([label.zpl], { type: 'text/plain;charset=utf-8' }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = label.filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 8: Add navigation without coupling editor state**

Add `<a href="/merge">CSV Merge Example</a>` to the existing demo navigation. Do not import the merge component, CSV parser, providers, or merge state into `src/routes/+page.svelte` or `src/lib/ZPLEditor.svelte`.

- [ ] **Step 9: Run browser tests and commit**

Run: `npm run test:unit -- --run src/lib/components/CsvMergeExample.svelte.spec.ts src/routes/merge/page.svelte.spec.ts src/routes/page.svelte.spec.ts`

Expected: PASS.

```bash
git add src/lib/components/CsvMergeExample.svelte src/lib/components/CsvMergeExample.svelte.spec.ts src/routes/merge src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat: add standalone csv merge example"
```

---

### Task 9: Publish the library API and document the constrained feature

**Files:**
- Modify: `src/lib/index.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed public utility contracts.
- Produces: package exports for `analyzeTemplate`, `isPlaceholderName`, `parseCsv`, `resolveProvider`, `validateMapping`, `renderTemplateRow`, `renderCsvRows`, and their public types.

- [ ] **Step 1: Add public exports**

Add explicit exports rather than a wildcard so internal preview/encoding helpers remain implementation details:

```ts
export { analyzeTemplate, isPlaceholderName } from './template/analyzeTemplate.js';
export { parseCsv, CsvParseError } from './csv/parseCsv.js';
export { resolveProvider, ProviderResolutionError } from './template/providers.js';
export { validateMapping, renderTemplateRow, renderCsvRows } from './template/renderTemplate.js';
export type {
	PlaceholderContext, PlaceholderOccurrence, TemplateAnalysis, TemplateDiagnostic,
	MappingValidationError,
	ValueProvider, PlaceholderMapping, CsvDocument, RowRenderError,
	GeneratedLabel, BatchRenderResult
} from './template/types.js';
```

- [ ] **Step 2: Document editor authoring and merge API**

Add README sections that state the exact name regex, supported text/barcode placement, `onTemplateAnalysis` callback, explicit mapping rule, empty-cell behavior, individual-file output, and V1 non-goals. Include a complete TypeScript example using all three provider variants and checking `result.errors` before iterating `result.generated`.

- [ ] **Step 3: Run package checks**

Run: `npm run check`

Expected: PASS with 0 errors.

Run: `npm run lint`

Expected: PASS with no Prettier or ESLint findings.

Run: `npm test`

Expected: PASS in both `client` and `server` Vitest projects.

Run: `npm run build`

Expected: Vite build, `svelte-package`, and `publint` all PASS.

- [ ] **Step 4: Commit public API and documentation**

```bash
git add src/lib/index.ts README.md
git commit -m "docs: publish placeholder merge api"
```

---

## Final Acceptance Verification

- [ ] In the editor, insert `sku` into selected text and `lot-code` into barcode data; confirm the canvas preview distinguishes both and exported ZPL contains exact `{{sku}}` and `{{lot-code}}` tokens.
- [ ] Paste the fixture template into `/merge`, upload the fixture CSV, and confirm every discovered name begins unmapped even when a header matches.
- [ ] Map one name to a column, one to blank, and one to a fixed string; confirm an empty fixed string and empty CSV cell are accepted.
- [ ] Confirm malformed tokens, invalid names, and a token in `^PW` show named/location-aware template errors and prevent generation.
- [ ] Confirm values containing `^`, `~`, backslash, newline, and UTF-8 cannot create new ZPL commands and render through `^FH\` encoding.
- [ ] Confirm a bad barcode row reports its CSV row number while every valid row retains an individual `.zpl` download.
- [ ] Confirm the merge page has no combined download, batch ZPL, ZIP, printer discovery, or print action.
- [ ] Run `npm run check && npm run lint && npm test && npm run build` in an environment with dependencies installed; all commands must pass before merging.

## Implementation Notes for the Executor

- This worktree currently has no installed `node_modules`; repository inspection on 2026-08-09 found `npm test` stopping at `vitest: command not found` and `npm run check` stopping at `svelte-kit: command not found`. Run `npm ci` before the first red/green cycle if dependencies remain absent; do not mistake the missing binaries for feature-test failures.
- Do not rewrite the large existing `ZPLEditor.svelte` component as part of this feature. Add focused helpers and small inspector blocks around its current `updateZPL`, text, and barcode paths.
- Do not use Labelary to validate merged rows. The existing demo preview is remote and unsuitable for deterministic row generation; merge correctness belongs in the local analyzer/renderer tests.
- Future `currentDate(format, timezone)` and `dateOffset(days, format, timezone)` should become new `ValueProvider` variants plus merge controls. They must not add new token grammar, and V1 must not include those variants.
