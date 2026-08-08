import type { fabric } from 'fabric';
import type { LabelConfig, BarcodeFormat } from './types';
import { inchesToDots } from './types';

export function getZPLOrientation(angle: number): string {
  const norm = ((angle % 360) + 360) % 360;
  if (norm === 90) return 'R';
  if (norm === 180) return 'I';
  if (norm === 270) return 'B';
  return 'N';
}

export function generateZPLHeader(pwDots: number, llDots: number): string {
  return `^XA\r\n^PW${pwDots}\r\n^LL${llDots}\r\n^PR12\r\n^MD30\r\n^PON\r\n`;
}

export function formatTextZPL(opts: { x: number; y: number; text: string; fontSize: number; angle: number }): string {
  const orient = getZPLOrientation(opts.angle);
  const size = Math.round(opts.fontSize);
  return `^FO${Math.round(opts.x)},${Math.round(opts.y)}^A0${orient},${size},${size}^FD${opts.text}^FS\r\n`;
}

export function formatRectZPL(opts: { x: number; y: number; width: number; height: number; strokeWidth: number; angle: number }): string {
  let w = Math.round(opts.width);
  let h = Math.round(opts.height);
  const norm = ((opts.angle % 360) + 360) % 360;
  if (norm === 90 || norm === 270) {
    [w, h] = [h, w];
  }
  const t = Math.max(1, Math.round(opts.strokeWidth || 2));
  return `^FO${Math.round(opts.x)},${Math.round(opts.y)}^GB${w},${h},${t},B,0^FS\r\n`;
}

export function formatBarcodeZPL(opts: { x: number; y: number; text: string; format: BarcodeFormat; width: number; height: number; angle: number }): string {
  const orient = getZPLOrientation(opts.angle);
  const x = Math.round(opts.x);
  const y = Math.round(opts.y);

  if (opts.format === 'QR') {
    const mag = Math.max(1, Math.min(10, Math.round(opts.width / 40)));
    return `^FO${x},${y}^BQN,2,${mag}^FDQA,${opts.text}^FS\r\n`;
  } else if (opts.format === 'CODE128') {
    return `^FO${x},${y}^BY2^BC${orient},${Math.round(opts.height)},Y,N,N^FD${opts.text}^FS\r\n`;
  } else {
    return `^FO${x},${y}^BY2^B3${orient},N,${Math.round(opts.height)},Y,N^FD${opts.text}^FS\r\n`;
  }
}

export function compileFabricCanvasToZPL(canvas: fabric.Canvas, config: LabelConfig): string {
  const pw = inchesToDots(config.widthInches, config.dpi);
  const ll = inchesToDots(config.heightInches, config.dpi);
  let zpl = generateZPLHeader(pw, ll);

  const objects = canvas.getObjects();
  for (const obj of objects) {
    const x = obj.left || 0;
    const y = obj.top || 0;
    const angle = obj.angle || 0;
    const customType = (obj as any).zplType;

    if (customType === 'text' || obj.type === 'i-text' || obj.type === 'text') {
      const textObj = obj as fabric.IText;
      zpl += formatTextZPL({
        x,
        y,
        text: textObj.text || '',
        fontSize: textObj.fontSize || 36,
        angle
      });
    } else if (customType === 'rectangle' || obj.type === 'rect') {
      const rectObj = obj as fabric.Rect;
      zpl += formatRectZPL({
        x,
        y,
        width: (rectObj.width || 100) * (rectObj.scaleX || 1),
        height: (rectObj.height || 50) * (rectObj.scaleY || 1),
        strokeWidth: rectObj.strokeWidth || 2,
        angle
      });
    } else if (customType === 'barcode') {
      zpl += formatBarcodeZPL({
        x,
        y,
        text: (obj as any).zplData || 'BARCODE',
        format: (obj as any).barcodeFormat || 'QR',
        width: (obj.width || 100) * (obj.scaleX || 1),
        height: (obj.height || 100) * (obj.scaleY || 1),
        angle
      });
    } else if ((obj as any).zplGFData) {
      zpl += `^FO${Math.round(x)},${Math.round(y)}${(obj as any).zplGFData}^FS\r\n`;
    }
  }

  zpl += '^PQ1\r\n^XZ\r\n';
  return zpl;
}
