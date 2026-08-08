export function rgbaToZplGF(pixels: Uint8ClampedArray, width: number, height: number, threshold = 128): string {
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  let hexData = '';

  for (let y = 0; y < height; y++) {
    let currentByte = 0;
    let bitIndex = 0;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];

      // Luminance calculation: standard BT.601
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      // In ZPL GRF, 1 bit = black pixel (print), 0 bit = white pixel (no print)
      const isBlack = a > 128 && luminance < threshold;

      if (isBlack) {
        currentByte |= (1 << (7 - bitIndex));
      }

      bitIndex++;
      if (bitIndex === 8) {
        hexData += currentByte.toString(16).padStart(2, '0').toUpperCase();
        currentByte = 0;
        bitIndex = 0;
      }
    }

    if (bitIndex > 0) {
      hexData += currentByte.toString(16).padStart(2, '0').toUpperCase();
    }
  }

  return `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexData}`;
}
