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
