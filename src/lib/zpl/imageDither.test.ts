import { describe, it, expect } from 'vitest';
import { rgbaToZplGF } from './imageDither.js';

describe('imageDither', () => {
  it('converts 8x1 black pixel row to hex GRF string', () => {
    // 8 black pixels (RGBA: 0,0,0,255)
    const pixels = new Uint8ClampedArray(8 * 4);
    for (let i = 0; i < 8 * 4; i += 4) {
      pixels[i] = 0;       // R
      pixels[i + 1] = 0;   // G
      pixels[i + 2] = 0;   // B
      pixels[i + 3] = 255; // A
    }
    const gf = rgbaToZplGF(pixels, 8, 1);
    expect(gf).toBe('^GFA,1,1,1,FF');
  });

  it('converts 8x1 white pixel row to 00 hex GRF string', () => {
    // 8 white pixels (RGBA: 255,255,255,255)
    const pixels = new Uint8ClampedArray(8 * 4);
    for (let i = 0; i < 8 * 4; i += 4) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }
    const gf = rgbaToZplGF(pixels, 8, 1);
    expect(gf).toBe('^GFA,1,1,1,00');
  });
});
