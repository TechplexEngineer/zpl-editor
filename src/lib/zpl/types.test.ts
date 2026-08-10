import { describe, it, expect } from 'vitest';
import { inchesToDots, dotsToInches } from './types.js';
import type { PlaceholderOccurrence, ValueProvider, BatchRenderResult } from '../template/types.js';

describe('DPI Conversions', () => {
	it('converts inches to dots at 300 DPI', () => {
		expect(inchesToDots(4, 300)).toBe(1200);
		expect(inchesToDots(6, 300)).toBe(1800);
	});

	it('converts dots to inches at 300 DPI', () => {
		expect(dotsToInches(1200, 300)).toBe(4);
	});
});

it('keeps placeholder and provider contracts discriminated', () => {
	const occurrence: PlaceholderOccurrence = {
		name: 'sku',
		token: '{{sku}}',
		start: 12,
		end: 19,
		fieldStart: 8,
		fieldEnd: 22,
		locationId: 'field-1',
		context: { kind: 'barcode', format: 'CODE128' }
	};
	const provider: ValueProvider = { kind: 'csv-column', column: 'SKU' };
	const result: BatchRenderResult = { generated: [], errors: [] };
	expect([occurrence.context.kind, provider.kind, result.errors]).toEqual([
		'barcode',
		'csv-column',
		[]
	]);
});
