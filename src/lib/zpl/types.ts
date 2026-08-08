export type BarcodeFormat = 'QR' | 'CODE128' | 'CODE39' | 'DATAMATRIX';
export type RotationAngle = 0 | 90 | 180 | 270;

export interface LabelConfig {
	widthInches: number;
	heightInches: number;
	dpi: number; // default 300
}

export function inchesToDots(inches: number, dpi: number): number {
	return Math.round(inches * dpi);
}

export function dotsToInches(dots: number, dpi: number): number {
	return Number((dots / dpi).toFixed(3));
}

export interface ZPLCompilerResult {
	zpl: string;
}

export interface InspectorState {
	id?: string;
	type?: 'text' | 'rectangle' | 'barcode' | 'image';
	text?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontSize?: number;
	angle: RotationAngle;
	barcodeFormat?: BarcodeFormat;
	borderThickness?: number;
}
