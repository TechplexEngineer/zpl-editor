import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import type { BarcodeFormat } from './types.js';

export async function renderBarcodeDataUrl(text: string, format: BarcodeFormat): Promise<string> {
	if (format === 'QR') {
		return await QRCode.toDataURL(text || 'QR CODE', { margin: 1, width: 200 });
	}

	if (format === 'DATAMATRIX') {
		if (typeof document !== 'undefined') {
			try {
				const canvas = document.createElement('canvas');
				(bwipjs as any).toCanvas(canvas, {
					bcid: 'datamatrix',
					text: text || 'DATAMATRIX',
					scale: 3
				});
				return canvas.toDataURL('image/png');
			} catch {
				// Fallback on canvas error
			}
		}
		// Fallback if in SSR/Node environment or on render error
		return await QRCode.toDataURL(text || 'DATAMATRIX', { margin: 1, width: 200 });
	}

	const jsbarcodeFormat = format === 'CODE128' ? 'CODE128' : 'CODE39';

	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas');
		JsBarcode(canvas, text || 'BARCODE', {
			format: jsbarcodeFormat,
			displayValue: true,
			height: 60,
			margin: 5
		});
		return canvas.toDataURL('image/png');
	}

	// Fallback if in SSR/Node environment
	return await QRCode.toDataURL(text || 'BARCODE', { margin: 1, width: 200 });
}
