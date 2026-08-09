import { describe, expect, it } from 'vitest';
import { parseCsv } from './parseCsv.js';

describe('parseCsv', () => {
	it('parses quoted fields and retains empty cells', () => {
		const csv = parseCsv(
			'\uFEFFSKU,Description,Lot\r\nA1,"Widget, blue",\r\nA2,"line 1\nline 2",L2'
		);

		expect(csv.headers).toEqual(['SKU', 'Description', 'Lot']);
		expect(csv.rows).toEqual([
			{ rowNumber: 2, values: { SKU: 'A1', Description: 'Widget, blue', Lot: '' } },
			{
				rowNumber: 3,
				values: { SKU: 'A2', Description: 'line 1\nline 2', Lot: 'L2' }
			}
		]);
	});

	it.each([
		['SKU,SKU\nA,B', 1, 'Duplicate header "SKU"'],
		['SKU,Lot\nA', 2, 'Expected 2 columns but found 1'],
		['SKU\n"A', 2, 'Unterminated quoted field']
	])('rejects invalid CSV', (source, rowNumber, message) => {
		expect(() => parseCsv(source)).toThrowError(
			expect.objectContaining({ rowNumber, message })
		);
	});
});
