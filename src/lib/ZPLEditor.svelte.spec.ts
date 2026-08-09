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

	it('snaps scaling for barcodes and generic objects on object:scaling', async () => {
		let scalingHandler: ((e: { target: fabric.Object }) => void) | null = null;
		const originalOn = fabric.Canvas.prototype.on;
		const spy = vi.spyOn(fabric.Canvas.prototype, 'on').mockImplementation(function (
			this: any,
			eventName: string,
			handler: any
		) {
			if (eventName === 'object:scaling') {
				scalingHandler = handler;
			}
			return originalOn.call(this, eventName, handler);
		});

		render(ZPLEditor);
		await tick();

		spy.mockRestore();

		expect(scalingHandler).toBeTypeOf('function');

		// 1. Test barcode object scaling (integer scale lock, minimum 1)
		const barcodeObj = new fabric.Image(document.createElement('img'));
		(barcodeObj as any).zplType = 'barcode';
		barcodeObj.set({ scaleX: 2.7, scaleY: 2.1 });
		scalingHandler!({ target: barcodeObj });
		expect(barcodeObj.scaleX).toBe(3);
		expect(barcodeObj.scaleY).toBe(3);

		barcodeObj.set({ scaleX: 0.4, scaleY: 0.2 });
		scalingHandler!({ target: barcodeObj });
		expect(barcodeObj.scaleX).toBe(1);
		expect(barcodeObj.scaleY).toBe(1);

		// 2. Test non-barcode object scaling (snap visual width & height to integer pixels)
		const rectObj = new fabric.Rect({ width: 100, height: 50, scaleX: 1.456, scaleY: 2.123 });
		(rectObj as any).zplType = 'rectangle';
		(rectObj as any).zplRounding = 4;
		scalingHandler!({ target: rectObj });
		// targetWidth = Math.round(100 * 1.456) = 146 -> scaleX = 146 / 100 = 1.46
		// targetHeight = Math.round(50 * 2.123) = 106 -> scaleY = 106 / 50 = 2.12
		expect(rectObj.scaleX).toBeCloseTo(1.46);
		expect(rectObj.scaleY).toBeCloseTo(2.12);
		expect(rectObj.width! * rectObj.scaleX!).toBe(146);
		expect(rectObj.height! * rectObj.scaleY!).toBe(106);
	});

	it('uses CG Triumvirate as default fontFamily for text objects', async () => {
		let addedTextObj: fabric.IText | null = null;
		const originalAdd = fabric.Canvas.prototype.add;
		const spy = vi.spyOn(fabric.Canvas.prototype, 'add').mockImplementation(function (
			this: any,
			...args: any[]
		) {
			const obj = args[0];
			if (obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) {
				addedTextObj = obj as fabric.IText;
			}
			return originalAdd.apply(this, args);
		});

		render(ZPLEditor);
		await tick();

		spy.mockRestore();

		expect(addedTextObj).not.toBeNull();
		if (addedTextObj) {
			expect((addedTextObj as fabric.IText).fontFamily).toBe(
				'CG Triumvirate, Helvetica, Arial, sans-serif'
			);
		}
	});
});
