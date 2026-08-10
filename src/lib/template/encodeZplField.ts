import type { BarcodeFormat } from '../zpl/types.js';

const textEncoder = new TextEncoder();

export function encodeZplFieldValue(value: string, hexIndicator = '\\'): string {
	const indicatorByte = hexIndicator.charCodeAt(0);
	return Array.from(textEncoder.encode(value), (byte) =>
		byte >= 0x20 && byte <= 0x7e && byte !== 0x5e && byte !== 0x7e && byte !== indicatorByte
			? String.fromCharCode(byte)
			: `${hexIndicator}${byte.toString(16).toUpperCase().padStart(2, '0')}`
	).join('');
}

export function validateBarcodeValue(value: string, format: BarcodeFormat): string | undefined {
	switch (format) {
		case 'CODE39':
			return /^[A-Z0-9 .\-$/+%]*$/.test(value)
				? undefined
				: 'CODE39 values may contain only uppercase letters, digits, spaces, and . - $ / + %';
		case 'CODE128':
			return /^[\x20-\x7E]*$/.test(value)
				? undefined
				: 'CODE128 values may contain only printable ASCII characters';
		case 'QR':
		case 'DATAMATRIX':
			return undefined;
		default: {
			const exhaustive: never = format;
			return exhaustive;
		}
	}
}
