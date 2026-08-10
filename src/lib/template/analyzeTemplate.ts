import type { BarcodeFormat } from '../zpl/types.js';
import type {
	PlaceholderContext,
	PlaceholderOccurrence,
	TemplateAnalysis,
	TemplateDiagnostic
} from './types.js';

export const PLACEHOLDER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

interface FieldInterval {
	contentStart: number;
	fieldStart: number;
	fieldEnd: number;
	locationId: string;
	context?: PlaceholderContext;
}

export function isPlaceholderName(name: string): boolean {
	return PLACEHOLDER_NAME_PATTERN.test(name);
}

export function analyzeTemplate(zpl: string): TemplateAnalysis {
	const fields = findFieldIntervals(zpl);
	const occurrences: PlaceholderOccurrence[] = [];
	const diagnostics: TemplateDiagnostic[] = [];

	let cursor = 0;
	while (cursor < zpl.length) {
		const tokenStart = zpl.indexOf('{{', cursor);
		const strayClose = zpl.indexOf('}}', cursor);

		if (strayClose !== -1 && (tokenStart === -1 || strayClose < tokenStart)) {
			const field = findFieldContainingOffset(fields, strayClose);
			diagnostics.push({
				code: 'MALFORMED_TOKEN',
				message: 'Found a closing placeholder delimiter without an opening delimiter.',
				start: strayClose,
				end: strayClose + 2,
				...(field ? { locationId: field.locationId } : {})
			});
			cursor = strayClose + 2;
			continue;
		}

		if (tokenStart === -1) break;

		const token = readToken(zpl, tokenStart);
		if ('malformedAt' in token) {
			const field = findFieldContainingOffset(fields, tokenStart);
			diagnostics.push({
				code: 'MALFORMED_TOKEN',
				message: 'Placeholder tokens must contain one opening and one closing delimiter.',
				start: tokenStart,
				end: token.malformedAt + 1,
				...(field ? { locationId: field.locationId } : {})
			});
			cursor = tokenStart + 2;
			continue;
		}

		const field = fields.find(
			(item) => tokenStart >= item.contentStart && token.end <= item.fieldEnd
		);
		if (!field || !field.context) {
			diagnostics.push({
				code: 'UNSUPPORTED_PLACEMENT',
				message: 'Placeholders are supported only in text and supported barcode fields.',
				start: tokenStart,
				end: token.end,
				name: token.name,
				...(field ? { locationId: field.locationId } : {})
			});
			cursor = token.end;
			continue;
		}

		if (!isPlaceholderName(token.name)) {
			diagnostics.push({
				code: 'INVALID_NAME',
				message: 'Placeholder names must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens.',
				start: tokenStart,
				end: token.end,
				name: token.name,
				locationId: field.locationId
			});
			cursor = token.end;
			continue;
		}

		occurrences.push({
			name: token.name,
			token: zpl.slice(tokenStart, token.end),
			start: tokenStart,
			end: token.end,
			fieldStart: field.fieldStart,
			fieldEnd: field.fieldEnd,
			locationId: field.locationId,
			context: field.context
		});
		cursor = token.end;
	}

	return {
		placeholders: [...new Set(occurrences.map((item) => item.name))],
		occurrences,
		diagnostics
	};
}

function findFieldContainingOffset(
	fields: FieldInterval[],
	offset: number
): FieldInterval | undefined {
	return fields.find((field) => offset >= field.contentStart && offset < field.fieldEnd);
}

function findFieldIntervals(zpl: string): FieldInterval[] {
	const fields: FieldInterval[] = [];
	let searchStart = 0;

	while (searchStart < zpl.length) {
		const fieldStart = zpl.indexOf('^FD', searchStart);
		if (fieldStart === -1) break;

		const fsStart = zpl.indexOf('^FS', fieldStart + 3);
		if (fsStart === -1) break;

		const previousFo = zpl.lastIndexOf('^FO', fieldStart);
		fields.push({
			contentStart: fieldStart + 3,
			fieldStart,
			fieldEnd: fsStart,
			locationId: `field-${fields.length + 1}`,
			context: classifyField(zpl.slice(previousFo === -1 ? 0 : previousFo, fieldStart))
		});
		searchStart = fsStart + 3;
	}

	return fields;
}

function classifyField(commands: string): PlaceholderContext | undefined {
	const fieldCommands = [...commands.matchAll(/\^([A-Z0-9]{1,3})/g)]
		.map((match) => match[1] ?? '')
		.map(classifyFieldCommand)
		.filter((context): context is PlaceholderContext | 'unsupported' => context !== undefined);

	if (fieldCommands.length === 0 || fieldCommands.includes('unsupported')) {
		return undefined;
	}

	const contexts = fieldCommands as PlaceholderContext[];
	const first = contexts[0];
	if (!first || contexts.some((context) => !sameContext(context, first))) {
		return undefined;
	}

	return first;
}

function sameContext(left: PlaceholderContext, right: PlaceholderContext): boolean {
	return (
		left.kind === right.kind &&
		(left.kind !== 'barcode' ||
			(right.kind === 'barcode' && left.format === right.format))
	);
}

function classifyFieldCommand(command: string): PlaceholderContext | 'unsupported' | undefined {
	if (command.startsWith('A') || command.startsWith('FB')) return { kind: 'text' };
	if (command.startsWith('BQN')) return barcodeContext('QR');
	if (command.startsWith('BX')) return barcodeContext('DATAMATRIX');
	if (command.startsWith('BC')) return barcodeContext('CODE128');
	if (command.startsWith('B3')) return barcodeContext('CODE39');
	if (command.startsWith('B') && !command.startsWith('BY')) return 'unsupported';
	if (command.startsWith('G') || command.startsWith('TB') || command.startsWith('RF')) {
		return 'unsupported';
	}
}

function barcodeContext(format: BarcodeFormat): PlaceholderContext {
	return { kind: 'barcode', format };
}

function readToken(
	zpl: string,
	start: number
): { name: string; end: number } | { malformedAt: number } {
	for (let index = start + 2; index < zpl.length; index += 1) {
		if (zpl.startsWith('}}', index)) {
			return { name: zpl.slice(start + 2, index), end: index + 2 };
		}
		if (zpl[index] === '{' || zpl[index] === '}') {
			return { malformedAt: index };
		}
	}

	return { malformedAt: zpl.length - 1 };
}
