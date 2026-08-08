import { describe, it, expect } from 'vitest';
import { generateZPLHeader, formatTextZPL, formatRectZPL, formatBarcodeZPL, getZPLOrientation } from './zplCompiler.js';

describe('ZPL Compiler Utility Functions', () => {
  it('maps degrees to ZPL orientation code', () => {
    expect(getZPLOrientation(0)).toBe('N');
    expect(getZPLOrientation(90)).toBe('R');
    expect(getZPLOrientation(180)).toBe('I');
    expect(getZPLOrientation(270)).toBe('B');
  });

  it('generates standard ZPL header with correct dimensions', () => {
    const header = generateZPLHeader(1200, 1800);
    expect(header).toContain('^XA');
    expect(header).toContain('^PW1200');
    expect(header).toContain('^LL1800');
  });

  it('formats text ZPL with rotation orientation', () => {
    const zpl = formatTextZPL({ x: 100, y: 150, text: 'Hello', fontSize: 36, angle: 90 });
    expect(zpl).toBe('^FO100,150^A0R,36,36^FDHello^FS\r\n');
  });

  it('formats rectangle ZPL and swaps dimensions on 90deg rotation', () => {
    const zpl = formatRectZPL({ x: 50, y: 50, width: 200, height: 100, strokeWidth: 4, angle: 90 });
    expect(zpl).toBe('^FO50,50^GB100,200,4,B,0^FS\r\n');
  });

  it('formats QR barcode ZPL correctly', () => {
    const zpl = formatBarcodeZPL({ x: 50, y: 50, text: 'TEST', format: 'QR', width: 200, height: 200, angle: 0 });
    expect(zpl).toContain('^BQN,2,5^FDQA,TEST^FS');
  });

  it('formats Code 128 barcode ZPL correctly', () => {
    const zpl = formatBarcodeZPL({ x: 10, y: 20, text: 'BAR123', format: 'CODE128', width: 200, height: 80, angle: 0 });
    expect(zpl).toBe('^FO10,20^BY2^BCN,80,Y,N,N^FDBAR123^FS\r\n');
  });

  it('formats DataMatrix barcode ZPL correctly', () => {
    const zpl = formatBarcodeZPL({ x: 30, y: 40, text: 'DM123', format: 'DATAMATRIX', width: 100, height: 100, angle: 0 });
    expect(zpl).toBe('^FO30,40^BXN,5,200^FDDM123^FS\r\n');
  });
});
