import { describe, expect, it } from 'vitest';
import {
	insertPlaceholder,
	placeholderPreviewText,
	placeholderStyleRanges
} from './placeholderPreview.js';

describe('placeholder preview helpers', () => {
	it('inserts at a selection without altering surrounding text', () => {
		expect(insertPlaceholder('SKU: selected', 'sku', 5, 13)).toBe('SKU: {{sku}}');
	});

	it('uses recognizable preview text while leaving canonical input unchanged', () => {
		const source = 'Lot {{lot}} / {{sku}}';
		expect(placeholderPreviewText(source)).toBe('Lot [lot] / [sku]');
		expect(source).toBe('Lot {{lot}} / {{sku}}');
		expect(placeholderStyleRanges(source)).toEqual([
			{ start: 4, end: 11 },
			{ start: 14, end: 21 }
		]);
	});

	it('rejects invalid names before insertion', () => {
		expect(() => insertPlaceholder('SKU', '9 sku', 3, 3)).toThrow(
			'letters, digits, underscores, or hyphens'
		);
	});

	it('clamps reversed selection bounds before inserting', () => {
		expect(insertPlaceholder('SKU', 'sku', 99, -2)).toBe('{{sku}}');
	});

	it('leaves malformed placeholder-like text unchanged in previews', () => {
		expect(placeholderPreviewText('{{bad token}} / {{sku')).toBe('{{bad token}} / {{sku');
		expect(placeholderStyleRanges('{{bad token}} / {{sku')).toEqual([]);
	});
});
