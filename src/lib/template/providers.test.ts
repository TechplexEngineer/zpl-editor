import { describe, expect, it } from 'vitest';
import { ProviderResolutionError, resolveProvider } from './providers.js';

describe('resolveProvider', () => {
	it('returns an explicitly empty CSV cell', () => {
		expect(resolveProvider({ kind: 'csv-column', column: 'SKU' }, { SKU: '' })).toBe('');
	});

	it('returns literal and blank provider values', () => {
		expect(resolveProvider({ kind: 'literal', value: '^fixed~' }, {})).toBe('^fixed~');
		expect(resolveProvider({ kind: 'blank' }, {})).toBe('');
	});

	it('throws a provider resolution error for an absent CSV column', () => {
		expect(() => resolveProvider({ kind: 'csv-column', column: 'Missing' }, { SKU: 'A1' })).toThrow(
		'CSV column "Missing" is not present in this row'
	);
		expect(() => resolveProvider({ kind: 'csv-column', column: 'Missing' }, {})).toThrow(
		ProviderResolutionError
	);
	});
});
