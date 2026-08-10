# zpl-editor

`zpl-editor` is a Svelte library for building reusable WYSIWYG Zebra Programming Language (ZPL) editors inside Svelte applications.

The goal of the project is to make label design feel visual in the browser while still producing real ZPL output that can be copied, stored, previewed, and sent to Zebra-compatible printers.

## What it provides

- A reusable `ZPLEditor` Svelte component
- Visual canvas-based label editing
- Real-time ZPL generation
- Bindable label size, height, width, and DPI settings
- Support for text, rectangles, circles, lines, barcodes, and images
- A local demo app for previewing the component during development

## Installation

```bash
npm install zpl-editor
```

## Basic usage

```svelte
<script lang="ts">
	import { ZPLEditor } from 'zpl-editor';

	let width = 4;
	let height = 6;
	let dpi = 300;
	let zpl = '';
</script>

<ZPLEditor bind:width bind:height bind:dpi bind:zpl />
```

## Placeholder authoring and CSV merge

Use placeholders to turn a ZPL label into a reusable template. A placeholder is written as
`{{name}}`, where `name` must match the exact regular expression
`/^[A-Za-z_][A-Za-z0-9_-]*$/`: it starts with a letter or underscore, followed by letters,
numbers, underscores, or hyphens.

The editor can insert placeholders only into selected text and supported barcode data. Template
analysis rejects a placeholder in other ZPL placements, malformed delimiters, and invalid names.
Pass `onTemplateAnalysis` to receive the current `TemplateAnalysis` whenever the editor updates
the generated template, including named, location-aware diagnostics that should prevent a merge.

```svelte
<script lang="ts">
	import { ZPLEditor, type TemplateAnalysis } from 'zpl-editor';

	let templateAnalysis: TemplateAnalysis;
</script>

<ZPLEditor onTemplateAnalysis={(analysis) => (templateAnalysis = analysis)} />
```

CSV headers are never mapped automatically, even when a header and placeholder have the same
name. Choose a provider explicitly for every discovered placeholder: a CSV column, a fixed
literal, or a blank value. Empty CSV cells and empty fixed literals are valid values. Rendering
produces one `.zpl` file per valid CSV row; invalid rows are reported independently, so the valid
rows remain available as individual downloads.

### Merge API

```ts
import { analyzeTemplate, parseCsv, renderCsvRows, type PlaceholderMapping } from 'zpl-editor';

const template = `^XA
^FO40,40^A0N,30,30^FDItem: {{sku}}^FS
^FO40,90^BCN,80,Y,N,N^FD{{lot-code}}^FS
^FO40,190^A0N,24,24^FD{{note}}^FS
^FO40,230^A0N,24,24^FD{{optionalField}}^FS
^XZ`;

const analysis = analyzeTemplate(template);
if (analysis.diagnostics.length > 0) {
	throw new Error(analysis.diagnostics.map((diagnostic) => diagnostic.message).join(' '));
}

const csv = parseCsv(`sku,lot\nA-100,LOT-42\nB-200,LOT-43\n`);
const mapping: PlaceholderMapping = {
	sku: { kind: 'csv-column', column: 'sku' },
	'lot-code': { kind: 'csv-column', column: 'lot' },
	note: { kind: 'literal', value: '' },
	optionalField: { kind: 'blank' }
};

const result = renderCsvRows(template, csv, mapping);

if (result.errors.length > 0) {
	for (const error of result.errors) {
		console.error(`Row ${error.rowNumber}: ${error.message}`);
	}
} else {
	for (const label of result.generated) {
		console.log(label.filename, label.zpl);
	}
}
```

### V1 scope

V1 intentionally does not create a combined download, batch ZPL file, ZIP archive, printer
discovery, or print action. It also does not provide date-based value providers such as
`currentDate` or `dateOffset`; these would be future provider variants, not new placeholder
syntax.

## Component API

The exported component is available as both the default export and a named export:

```ts
import ZPLEditor, { ZPLEditor as NamedZPLEditor } from 'zpl-editor';
```

### Props

| Prop       | Type                    | Default | Description                                                       |
| ---------- | ----------------------- | ------- | ----------------------------------------------------------------- |
| `width`    | `number`                | `4.0`   | Label width in inches                                             |
| `height`   | `number`                | `6.0`   | Label height in inches                                            |
| `dpi`      | `number`                | `300`   | Printer resolution                                                |
| `zpl`      | `string`                | `''`    | Two-way bound generated ZPL output                                |
| `visible`  | `boolean`               | `true`  | Re-renders the canvas when shown in tabbed or conditional layouts |
| `onChange` | `(zpl: string) => void` | noop    | Callback fired whenever the generated ZPL changes                 |

## Development

Install dependencies:

```bash
npm install
```

Start the local demo app:

```bash
npm run dev
```

Run the existing checks:

```bash
npm run check
npm run lint
npm test
```

Build the library package:

```bash
npm run build
```

## Repository structure

- `src/lib/ZPLEditor.svelte` – reusable editor component
- `src/lib/zpl` – ZPL generation and rendering helpers
- `src/routes/+page.svelte` – showcase/demo app

## Current focus

The library is currently centered on delivering a reusable editor component for Svelte apps that need in-browser ZPL label design, live ZPL output, and a simple preview workflow.
