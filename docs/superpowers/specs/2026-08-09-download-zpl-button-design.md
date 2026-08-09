# Download ZPL Button Design Specification

## Goal
Add a "Download ZPL" button next to the existing "Copy ZPL" button in `ZPLEditor.svelte` and `src/routes/+page.svelte` using `URL.createObjectURL` to download generated ZPL code as a `.zpl` file.

## Proposed Changes

### `src/lib/ZPLEditor.svelte`
- Add helper function `downloadZPL()`:
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
- Add a "Download ZPL" button next to "Copy ZPL" in `.toolbar-actions`:
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
- Add `.btn-secondary` CSS styling matching the application design system:
  ```css
  .btn-secondary {
      background: #475569;
      color: #ffffff;
  }
  .btn-secondary:hover {
      background: #334155;
  }
  ```

### `src/routes/+page.svelte`
- Add helper function `downloadZPL()` using `zplOutput`.
- Add "Download ZPL" button next to "Copy ZPL" in `.zpl-header`:
  ```svelte
  <div class="zpl-header-actions">
      <button class="download-btn" onclick={downloadZPL}>
          Download ZPL
      </button>
      <button class="copy-btn" onclick={() => navigator.clipboard.writeText(zplOutput)}>
          Copy ZPL
      </button>
  </div>
  ```
- Add CSS styling for `.zpl-header-actions` and `.download-btn`.

## Verification Plan
1. Run `npm run check` to verify TypeScript & Svelte type checking.
2. Run `npm test` to verify unit tests pass.
3. Test button interactions manually / via unit tests if applicable.
