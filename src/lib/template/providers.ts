import type { ValueProvider } from './types.js';

export class ProviderResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderResolutionError';
	}
}

export function resolveProvider(provider: ValueProvider, row: Record<string, string>): string {
	switch (provider.kind) {
		case 'csv-column':
			if (!Object.hasOwn(row, provider.column)) {
				throw new ProviderResolutionError(
					`CSV column "${provider.column}" is not present in this row`
				);
			}
			return row[provider.column] as string;
		case 'literal':
			return provider.value;
		case 'blank':
			return '';
		default: {
			const exhaustive: never = provider;
			return exhaustive;
		}
	}
}
