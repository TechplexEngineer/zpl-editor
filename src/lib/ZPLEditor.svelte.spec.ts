import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ZPLEditor from './ZPLEditor.svelte';
import { fabric } from 'fabric';
import { renderBarcodeDataUrl } from './zpl/barcodeRenderer.js';
import { tick } from 'svelte';

const DEFAULT_BARCODE_DATA_URL =
	'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

vi.mock('./zpl/barcodeRenderer.js', () => ({
	renderBarcodeDataUrl: vi.fn(async () =>
		'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
	)
}));

afterEach(() => {
	vi.mocked(renderBarcodeDataUrl).mockImplementation(async () => DEFAULT_BARCODE_DATA_URL);
});

async function renderEditor(props: Record<string, unknown> = {}) {
	const addSpy = vi.spyOn(fabric.Canvas.prototype, 'add');
	const callsBeforeRender = addSpy.mock.calls.length;
	render(ZPLEditor, { props } as any);

	await vi.waitFor(() => expect(addSpy.mock.calls.length).toBeGreaterThan(callsBeforeRender));
	const canvas = addSpy.mock.instances.at(-1) as fabric.Canvas;
	await vi.waitFor(() =>
		expect(canvas.getObjects().some((item) => (item as any).zplType === 'barcode')).toBe(true)
	);
	return canvas;
}

async function selectObject(canvas: fabric.Canvas, zplType: string) {
	const object = canvas.getObjects().find((item) => (item as any).zplType === zplType);
	expect(object).toBeDefined();
	canvas.setActiveObject(object!);
	canvas.fire('selection:updated', { selected: [object], target: object } as any);
	await tick();
	return object!;
}

describe('ZPLEditor Barcode Scaling Restriction', () => {
	it('restricts controls and scaling on barcodes', async () => {
		const setSpy = vi.spyOn(fabric.Image.prototype, 'set');
		const setControlsVisibilitySpy = vi.spyOn(fabric.Image.prototype, 'setControlsVisibility');

		render(ZPLEditor);

		// Wait for images to load (the sample barcode uses renderBarcodeDataUrl and fabric.Image.fromURL)
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Check if setControlsVisibility was called with all middle controls set to false
		expect(setControlsVisibilitySpy).toHaveBeenCalledWith(
			expect.objectContaining({
				mt: false,
				mb: false,
				ml: false,
				mr: false
			})
		);

		// Check if lockUniScaling: true was set on the image
		expect(setSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				lockUniScaling: true
			})
		);
	});
});

describe('ZPLEditor placeholder authoring', () => {
	it('inserts a named placeholder into the selected text and reports its analysis', async () => {
		const onChange = vi.fn();
		const onTemplateAnalysis = vi.fn();
		const canvas = await renderEditor({ onChange, onTemplateAnalysis });
		const textObject = (await selectObject(canvas, 'text')) as fabric.Textbox;

		const nameInput = page.getByLabelText('Placeholder name');
		await expect.element(nameInput).toBeInTheDocument();
		await nameInput.fill('sku');
		await page.getByRole('button', { name: 'Insert placeholder' }).click();

		expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('{{sku}}'));
		expect(onTemplateAnalysis).toHaveBeenLastCalledWith(
			expect.objectContaining({ placeholders: ['sku'] })
		);
		expect(textObject.text).toContain('{{sku}}');
		const tokenStart = textObject.text!.indexOf('{{sku}}');
		expect(textObject.getSelectionStyles(tokenStart, tokenStart + 7)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ fill: '#1e3a8a', textBackgroundColor: '#dbeafe' })
			])
		);
	});

	it('inserts a named placeholder into the selected barcode source value', async () => {
		const onChange = vi.fn();
		const canvas = await renderEditor({ onChange });
		await vi.waitFor(() =>
			expect(canvas.getObjects().some((item) => (item as any).zplType === 'barcode')).toBe(true)
		);
		await selectObject(canvas, 'barcode');

		const nameInput = page.getByLabelText('Placeholder name');
		await nameInput.fill('lot-code');
		await page.getByRole('button', { name: 'Insert placeholder' }).click();

		expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('{{lot-code}}'));
		expect(vi.mocked(renderBarcodeDataUrl)).toHaveBeenLastCalledWith(
			expect.stringContaining('[lot-code]'),
			'QR'
		);
		await expect.element(page.getByText('lot-code', { exact: true })).toBeInTheDocument();
	});

	it('rejects an invalid placeholder name without changing the generated ZPL', async () => {
		const onChange = vi.fn();
		const canvas = await renderEditor({ onChange });
		await selectObject(canvas, 'text');
		const callsBeforeInsertion = onChange.mock.calls.length;

		await page.getByLabelText('Placeholder name').fill('9sku');
		await page.getByRole('button', { name: 'Insert placeholder' }).click();

		await expect.element(page.getByRole('alert')).toHaveTextContent(
			'Placeholder names must start with a letter or underscore'
		);
		expect(onChange).toHaveBeenCalledTimes(callsBeforeInsertion);
		expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining('{{9sku}}'));
	});

	it('shows contextual diagnostics for malformed placeholder content', async () => {
		const canvas = await renderEditor();
		await selectObject(canvas, 'text');

		await page.getByLabelText('Text Content:').fill('{{9sku}}');

		await expect
			.element(page.getByText(/Placeholder “9sku” at field-1:/))
			.toBeInTheDocument();
	});

	it('does not apply a delayed placeholder preview after barcode data changes', async () => {
		const staleDataUrl = 'data:image/gif;base64,stale-preview';
		let resolveStaleRender!: (dataUrl: string) => void;
		const staleRender = new Promise<string>((resolve) => {
			resolveStaleRender = resolve;
		});
		vi.mocked(renderBarcodeDataUrl).mockImplementation(async (text) => {
			if (text.includes('[lot-code]')) return staleRender;
			return DEFAULT_BARCODE_DATA_URL;
		});

		const canvas = await renderEditor();
		const barcode = (await selectObject(canvas, 'barcode')) as fabric.Image & {
			zplData: string;
		};
		const setSrcSpy = vi.spyOn(barcode, 'setSrc');

		await page.getByLabelText('Placeholder name').fill('lot-code');
		await page.getByRole('button', { name: 'Insert placeholder' }).click();
		await vi.waitFor(() => expect(barcode.zplData).toContain('{{lot-code}}'));

		await page.getByLabelText('Barcode Value:').fill('fresh-value');
		await vi.waitFor(() => expect(barcode.zplData).toBe('fresh-value'));

		resolveStaleRender(staleDataUrl);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(setSrcSpy).not.toHaveBeenCalledWith(staleDataUrl, expect.any(Function));
	});
});
