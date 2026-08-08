import { describe, it, expect } from 'vitest';
import { inchesToDots, dotsToInches } from './types.js';

describe('DPI Conversions', () => {
	it('converts inches to dots at 300 DPI', () => {
		expect(inchesToDots(4, 300)).toBe(1200);
		expect(inchesToDots(6, 300)).toBe(1800);
	});

	it('converts dots to inches at 300 DPI', () => {
		expect(dotsToInches(1200, 300)).toBe(4);
	});
});
