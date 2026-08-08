import { describe, it, expect } from 'vitest';
import { renderBarcodeDataUrl } from './barcodeRenderer.js';

describe('barcodeRenderer', () => {
  it('generates a valid data URL for QR code', async () => {
    const dataUrl = await renderBarcodeDataUrl('HELLO ZPL', 'QR');
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('generates a valid data URL for DATAMATRIX code', async () => {
    const dataUrl = await renderBarcodeDataUrl('DATAMATRIX TEST', 'DATAMATRIX');
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
