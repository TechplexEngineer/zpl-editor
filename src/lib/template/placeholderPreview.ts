import { isPlaceholderName } from './analyzeTemplate.js';

const TOKEN_PATTERN = /\{\{([^{}]*)\}\}/g;

export function insertPlaceholder(
	source: string,
	name: string,
	start = source.length,
	end = start
): string {
	if (!isPlaceholderName(name)) {
		throw new Error(
			'Placeholder names must start with a letter or underscore and contain only letters, digits, underscores, or hyphens.'
		);
	}

	const clampedStart = clampIndex(start, source.length);
	const clampedEnd = clampIndex(end, source.length);
	const selectionStart = Math.min(clampedStart, clampedEnd);
	const selectionEnd = Math.max(clampedStart, clampedEnd);

	return `${source.slice(0, selectionStart)}{{${name}}}${source.slice(selectionEnd)}`;
}

export function placeholderPreviewText(source: string): string {
	return source.replace(TOKEN_PATTERN, (token, name: string) =>
		isPlaceholderName(name) ? `[${name}]` : token
	);
}

export function placeholderStyleRanges(source: string): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = [];

	for (const match of source.matchAll(TOKEN_PATTERN)) {
		const name = match[1] ?? '';
		if (isPlaceholderName(name)) {
			const start = match.index ?? 0;
			ranges.push({ start, end: start + match[0].length });
		}
	}

	return ranges;
}

function clampIndex(index: number, length: number): number {
	return Math.min(Math.max(index, 0), length);
}
