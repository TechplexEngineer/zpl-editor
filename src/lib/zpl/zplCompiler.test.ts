import { describe, it, expect } from 'vitest';
import { generateZPLHeader, formatTextZPL, formatRectZPL, formatBarcodeZPL, getZPLOrientation, compileFabricCanvasToZPL } from './zplCompiler.js';

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
    const zpl = formatTextZPL({ x: 100, y: 150, text: 'Hello', height: 36, width: 36, angle: 90 });
    expect(zpl).toBe('^FO100,150^A0R,36,36^FDHello^FS\r\n');
  });


  it('formats stretched text ZPL correctly', () => {
    const zpl = formatTextZPL({ x: 80, y: 120, text: 'Stretched', height: 48, width: 24, angle: 0 });
    expect(zpl).toBe('^FO80,120^A0N,48,24^FDStretched^FS\r\n');
  });

  it('formats rectangle ZPL correctly', () => {
    const zpl = formatRectZPL({ x: 50, y: 50, width: 200, height: 100, strokeWidth: 4, angle: 90 });
    expect(zpl).toBe('^FO50,50^GB100,200,4,B,0^FS\r\n');
  });

  it('formats rectangle ZPL with corner rounding parameter', () => {
    const zpl = formatRectZPL({ x: 50, y: 50, width: 200, height: 100, strokeWidth: 4, angle: 0, rounding: 5 });
    expect(zpl).toBe('^FO50,50^GB200,100,4,B,5^FS\r\n');
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

  it('compiles fabric canvas objects to ZPL, including circle, diagonal line, and rounded rectangle', () => {
    const mockObjects = [
      {
        left: 10,
        top: 20,
        angle: 0,
        zplType: 'circle',
        radius: 30,
        scaleX: 1,
        scaleY: 1,
        strokeWidth: 3
      },
      {
        zplType: 'line',
        x1: -75,
        y1: 50,
        x2: 75,
        y2: -50,
        strokeWidth: 4,
        calcTransformMatrix: () => [1, 0, 0, 1, 115, 100]
      },
      {
        left: 50,
        top: 50,
        angle: 0,
        zplType: 'rectangle',
        width: 200,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        strokeWidth: 4,
        zplRounding: 6
      }
    ];
    const mockCanvas = {
      getObjects: () => mockObjects
    } as any;
    const zpl = compileFabricCanvasToZPL(mockCanvas, { widthInches: 4, heightInches: 6, dpi: 300 });
    expect(zpl).toContain('^FO10,20^GC60,3,B^FS');
    expect(zpl).toContain('^FO40,50^GD150,100,4,B,R^FS');
    expect(zpl).toContain('^FO50,50^GB200,100,4,B,6^FS');
  });
});
