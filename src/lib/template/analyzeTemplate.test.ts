import { describe, expect, it } from 'vitest';
import { analyzeTemplate, isPlaceholderName } from './analyzeTemplate.js';

describe('analyzeTemplate', () => {
	it('discovers unique names while retaining every text and barcode occurrence', () => {
		const zpl =
			'^XA^FO1,1^A0N,20,20^FDSKU {{sku}}^FS' +
			'^FO1,30^BCN,60,Y,N,N^FD{{sku}}-{{lot-code}}^FS^XZ';
		const result = analyzeTemplate(zpl);

		expect(result.placeholders).toEqual(['sku', 'lot-code']);
		expect(result.occurrences.map(({ name, context }) => [name, context])).toEqual([
			['sku', { kind: 'text' }],
			['sku', { kind: 'barcode', format: 'CODE128' }],
			['lot-code', { kind: 'barcode', format: 'CODE128' }]
		]);
		expect(result.diagnostics).toEqual([]);
	});

	it.each([
		['^XA^FO1,1^A0N,20,20^FD{{}}^FS^XZ', 'INVALID_NAME'],
		['^XA^FO1,1^A0N,20,20^FD{{9sku}}^FS^XZ', 'INVALID_NAME'],
		['^XA^FO1,1^A0N,20,20^FD{{sku name}}^FS^XZ', 'INVALID_NAME'],
		['^XA^FO1,1^A0N,20,20^FD{{sku^FS^XZ', 'MALFORMED_TOKEN'],
		['^XA^PW{{width}}^XZ', 'UNSUPPORTED_PLACEMENT'],
		['^XA^FO1,1^GB10,10,1^FD{{raw}}^FS^XZ', 'UNSUPPORTED_PLACEMENT'],
		['^XA^FO1,1^A0N,20,20^GB10,10,1^FD{{raw}}^FS^XZ', 'UNSUPPORTED_PLACEMENT']
	])('reports %s as %s', (zpl, code) => {
		expect(analyzeTemplate(zpl).diagnostics[0]?.code).toBe(code);
	});

	it('keeps a parsed token name and character offsets for unsupported command placement', () => {
		const zpl = '^XA^PW{{width}}^XZ';

		expect(analyzeTemplate(zpl).diagnostics[0]).toEqual({
			code: 'UNSUPPORTED_PLACEMENT',
			message: 'Placeholders are supported only in text and supported barcode fields.',
			start: 6,
			end: 15,
			name: 'width'
		});
	});

	it('keeps a determinable field location for a malformed token', () => {
		const zpl = '^XA^FO1,1^A0N,20,20^FD{{sku^FS^XZ';

		expect(analyzeTemplate(zpl).diagnostics[0]).toEqual(
			expect.objectContaining({
				code: 'MALFORMED_TOKEN',
				start: zpl.indexOf('{{sku'),
				locationId: 'field-1'
			})
		);
	});

	it('retains exact token and field offsets for occurrences in one barcode field', () => {
		const zpl = '^XA^FO1,30^BCN,60,Y,N,N^FD{{sku}}-{{lot-code}}^FS^XZ';
		const occurrences = analyzeTemplate(zpl).occurrences;

		expect(occurrences).toHaveLength(2);
		for (const occurrence of occurrences) {
			expect(occurrence.token).toBe(zpl.slice(occurrence.start, occurrence.end));
			expect(occurrence.fieldStart).toBeLessThan(occurrence.start);
			expect(occurrence.start).toBeLessThan(occurrence.end);
			expect(occurrence.end).toBeLessThanOrEqual(occurrence.fieldEnd);
		}
		expect(occurrences[0]?.locationId).toBe(occurrences[1]?.locationId);
	});

	it('accepts only exact placeholder names', () => {
		expect(isPlaceholderName('sku_2-lot')).toBe(true);
		expect(isPlaceholderName(' sku')).toBe(false);
		expect(isPlaceholderName('9sku')).toBe(false);
	});
});
