import type { fabric } from 'fabric';
import type { LabelConfig, BarcodeFormat } from './types.js';
import { inchesToDots } from './types.js';

function transformLocalPoint(
	point: { x: number; y: number },
	matrix: number[]
): { x: number; y: number } {
	return {
		x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
		y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]
	};
}

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

export function formatTextZPL(opts: {
	x: number;
	y: number;
	text: string;
	height: number;
	width: number;
	angle: number;
}): string {
	const orient = getZPLOrientation(opts.angle);
	const h = Math.round(opts.height);
	const w = Math.round(opts.width);
	return `^FO${Math.round(opts.x)},${Math.round(opts.y)}^A0${orient},${h},${w}^FD${opts.text}^FS\r\n`;
}

export function formatRectZPL(opts: {
	x: number;
	y: number;
	width: number;
	height: number;
	strokeWidth: number;
	angle: number;
	rounding?: number;
}): string {
	let w = Math.round(opts.width);
	let h = Math.round(opts.height);
	const norm = ((opts.angle % 360) + 360) % 360;
	if (norm === 90 || norm === 270) {
		[w, h] = [h, w];
	}
	const t = Math.max(1, Math.round(opts.strokeWidth || 2));
	const r = Math.max(0, Math.min(8, Math.round(opts.rounding || 0)));
	return `^FO${Math.round(opts.x)},${Math.round(opts.y)}^GB${w},${h},${t},B,${r}^FS\r\n`;
}

export function formatBarcodeZPL(opts: {
	x: number;
	y: number;
	text: string;
	format: BarcodeFormat;
	width: number;
	height: number;
	angle: number;
}): string {
	const orient = getZPLOrientation(opts.angle);
	const x = Math.round(opts.x);
	const y = Math.round(opts.y);

	if (opts.format === 'QR') {
		const mag = Math.max(1, Math.min(10, Math.round(opts.width / 40)));
		return `^FO${x},${y}^BQN,2,${mag}^FDQA,${opts.text}^FS\r\n`;
	} else if (opts.format === 'DATAMATRIX') {
		const height = Math.max(2, Math.min(10, Math.round(opts.height / 20)));
		return `^FO${x},${y}^BX${orient},${height},200^FD${opts.text}^FS\r\n`;
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
				height: (textObj.fontSize || 36) * (textObj.scaleY || 1),
				width: (textObj.fontSize || 36) * (textObj.scaleX || 1),
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
				angle,
				rounding: (rectObj as any).zplRounding || 0
			});
		} else if (customType === 'circle' || obj.type === 'circle') {
			const circleObj = obj as fabric.Circle;
			const radius = circleObj.radius || 50;
			const scaleX = circleObj.scaleX || 1;
			const scaleY = circleObj.scaleY || 1;
			let diameterX = Math.round(radius * 2 * scaleX);
			let diameterY = Math.round(radius * 2 * scaleY);
			
			const norm = ((angle % 360) + 360) % 360;
			if (norm === 90 || norm === 270) {
				[diameterX, diameterY] = [diameterY, diameterX];
			}
			
			const t = Math.max(1, Math.round(circleObj.strokeWidth || 2));
			
			if (diameterX === diameterY) {
				zpl += `^FO${Math.round(x)},${Math.round(y)}^GC${diameterX},${t},B^FS\r\n`;
			} else {
				zpl += `^FO${Math.round(x)},${Math.round(y)}^GE${diameterX},${diameterY},${t},B^FS\r\n`;
			}
		} else if (customType === 'diagonalLine' || customType === 'line' || obj.type === 'line') {
			const lineObj = obj as fabric.Line;
			const matrix = lineObj.calcTransformMatrix();
			const p1 = transformLocalPoint({ x: lineObj.x1 || 0, y: lineObj.y1 || 0 }, matrix);
			const p2 = transformLocalPoint({ x: lineObj.x2 || 0, y: lineObj.y2 || 0 }, matrix);

			const minX = Math.min(p1.x, p2.x);
			const minY = Math.min(p1.y, p2.y);
			const maxX = Math.max(p1.x, p2.x);
			const maxY = Math.max(p1.y, p2.y);

			const w = Math.round(Math.max(1, maxX - minX));
			const h = Math.round(Math.max(1, maxY - minY));
			const t = Math.max(1, Math.round(lineObj.strokeWidth || 2));

			const sameSign = (p1.x < p2.x && p1.y < p2.y) || (p1.x > p2.x && p1.y > p2.y);
			const orientation = sameSign ? 'L' : 'R';

			zpl += `^FO${Math.round(minX)},${Math.round(minY)}^GD${w},${h},${t},B,${orientation}^FS\r\n`;
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
