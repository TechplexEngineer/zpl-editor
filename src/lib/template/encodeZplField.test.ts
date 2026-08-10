import { describe, expect, it } from 'vitest';
import { encodeZplFieldValue, validateBarcodeValue } from './encodeZplField.js';

describe('encodeZplFieldValue', () => {
	it('escapes ZPL-significant bytes while retaining safe printable ASCII', () => {
		expect(encodeZplFieldValue('A^B~C\\D\n')).toBe('A\\5EB\\7EC\\5CD\\0A');
	});

	it('keeps an empty value empty', () => {
		expect(encodeZplFieldValue('')).toBe('');
	});

	it('encodes non-ASCII values as uppercase UTF-8 bytes', () => {
		expect(encodeZplFieldValue('é')).toBe('\\C3\\A9');
	});
});

describe('validateBarcodeValue', () => {
	it('accepts CODE39 character set values', () => {
		expect(validateBarcodeValue('ABC-123', 'CODE39')).toBeUndefined();
	});

	it('rejects lowercase CODE39 values', () => {
		expect(validateBarcodeValue('abc', 'CODE39')).toContain('CODE39');
	});

	it('rejects non-printable CODE128 values', () => {
		expect(validateBarcodeValue('A\nB', 'CODE128')).toContain('CODE128');
	});

	it.each(['QR', 'DATAMATRIX'] as const)('permits UTF-8 values for %s', (format) => {
		expect(validateBarcodeValue('é\n', format)).toBeUndefined();
	});
});
