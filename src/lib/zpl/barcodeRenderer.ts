import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { BarcodeFormat } from './types.js';

export async function renderBarcodeDataUrl(text: string, format: BarcodeFormat): Promise<string> {
  if (format === 'QR') {
    return await QRCode.toDataURL(text || 'QR CODE', { margin: 1, width: 200 });
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
