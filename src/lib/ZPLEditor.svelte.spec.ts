import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import ZPLEditor from './ZPLEditor.svelte';
import { fabric } from 'fabric';

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

	it('configures fabric.Object.prototype snapAngle to 90 and snapThreshold to 45', async () => {
		render(ZPLEditor);
		await tick();

		expect(fabric.Object.prototype.snapAngle).toBe(90);
		expect(fabric.Object.prototype.snapThreshold).toBe(45);
	});

	it('snaps object left and top coordinates to integers on object:moving', async () => {
		let movingHandler: ((e: { target: fabric.Object }) => void) | null = null;
		const originalOn = fabric.Canvas.prototype.on;
		const spy = vi.spyOn(fabric.Canvas.prototype, 'on').mockImplementation(function (
			this: any,
			eventName: string,
			handler: any
		) {
			if (eventName === 'object:moving') {
				movingHandler = handler;
			}
			return originalOn.call(this, eventName, handler);
		});

		render(ZPLEditor);
		await tick();

		spy.mockRestore();

		expect(movingHandler).toBeTypeOf('function');

		const testObj = new fabric.Rect({ left: 10.6, top: 25.3 });
		movingHandler!({ target: testObj });

		expect(testObj.left).toBe(11);
		expect(testObj.top).toBe(25);
	});
});


