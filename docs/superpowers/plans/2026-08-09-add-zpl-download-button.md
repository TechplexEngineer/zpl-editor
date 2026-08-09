# Add Download ZPL Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download ZPL" button using `URL.createObjectURL` next to "Copy ZPL" in `ZPLEditor.svelte` and `src/routes/+page.svelte`.

**Architecture:** Add a helper `downloadZPL()` function in `ZPLEditor.svelte` and `src/routes/+page.svelte` that creates a text `Blob`, calls `URL.createObjectURL(blob)`, constructs a hidden `<a>` element with `download="label.zpl"`, triggers a click, and revokes the URL via `URL.revokeObjectURL(url)`. Style the button to fit nicely next to "Copy ZPL".

**Tech Stack:** Svelte 5, TypeScript, Web APIs (`URL.createObjectURL`, `Blob`, `document.createElement`).

## Global Constraints

- Must use `URL.createObjectURL` to initiate file download.
- Button must be placed adjacent to the "Copy ZPL" button.
- Filename should default to `label.zpl`.

---

### Task 1: Add Download ZPL button to ZPLEditor component

**Files:**
- Modify: `src/lib/ZPLEditor.svelte:538-544`, `src/lib/ZPLEditor.svelte:649-654`, `src/lib/ZPLEditor.svelte:1176-1185`

**Interfaces:**
- Consumes: `zpl` string state in `ZPLEditor.svelte`.
- Produces: `downloadZPL()` function and Download ZPL UI button in `ZPLEditor.svelte`.

- [ ] **Step 1: Write `downloadZPL()` function in `ZPLEditor.svelte`**

```ts
	function downloadZPL() {
		const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'label.zpl';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
```

- [ ] **Step 2: Add Download ZPL button next to Copy ZPL in markup**

```svelte
		<div class="toolbar-actions">
			<button class="btn btn-secondary" onclick={downloadZPL}>
				Download ZPL
			</button>
			<button class="btn btn-accent" onclick={copyZPL}>
				{copiedNotification ? '✓ Copied!' : 'Copy ZPL'}
			</button>
		</div>
```

- [ ] **Step 3: Add CSS for `.btn-secondary` in `ZPLEditor.svelte`**

```css
	.btn-secondary {
		background: #475569;
		color: #ffffff;
	}

	.btn-secondary:hover {
		background: #334155;
	}
```

- [ ] **Step 4: Verify type checking and tests**

Run: `npm run check && npm test`
Expected: PASS with 0 errors

---

### Task 2: Add Download ZPL button to Demo Page ZPL View

**Files:**
- Modify: `src/routes/+page.svelte:68-75`, `src/routes/+page.svelte:200-210`

**Interfaces:**
- Consumes: `zplOutput` state in `src/routes/+page.svelte`.
- Produces: `downloadZPL()` function and Download ZPL UI button in `+page.svelte`.

- [ ] **Step 1: Write `downloadZPL()` function in `src/routes/+page.svelte`**

```ts
	function downloadZPL() {
		if (!zplOutput) return;
		const blob = new Blob([zplOutput], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'label.zpl';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
```

- [ ] **Step 2: Add Download ZPL button next to Copy ZPL in markup**

```svelte
				<div class="zpl-header">
					<h2>Real-Time Generated ZPL Code</h2>
					<div class="zpl-actions">
						<button class="download-btn" onclick={downloadZPL}>
							Download ZPL
						</button>
						<button class="copy-btn" onclick={() => navigator.clipboard.writeText(zplOutput)}>
							Copy ZPL
						</button>
					</div>
				</div>
```

- [ ] **Step 3: Add CSS for `.zpl-actions` and `.download-btn` in `+page.svelte`**

```css
	.zpl-actions {
		display: flex;
		gap: 0.5rem;
	}

	.download-btn {
		background: #475569;
		color: #ffffff;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 600;
		cursor: pointer;
	}

	.download-btn:hover {
		background: #334155;
	}
```

- [ ] **Step 4: Verify type checking and tests**

Run: `npm run check && npm test`
Expected: PASS with 0 errors
