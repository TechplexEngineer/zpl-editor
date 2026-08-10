import { analyzeTemplate } from './analyzeTemplate.js';
import { encodeZplFieldValue, validateBarcodeValue } from './encodeZplField.js';
import { resolveProvider } from './providers.js';
import type {
	BatchRenderResult,
	CsvDocument,
	MappingValidationError,
	PlaceholderMapping,
	PlaceholderOccurrence,
	RowRenderError,
	TemplateAnalysis
} from './types.js';

interface RenderProblem {
	code: 'PROVIDER_ERROR' | 'INVALID_VALUE';
	message: string;
	placeholder: string;
}

export function validateMapping(
	analysis: TemplateAnalysis,
	mapping: Partial<PlaceholderMapping>,
	headers: string[]
): MappingValidationError[] {
	const availableHeaders = new Set(headers);
	const errors: MappingValidationError[] = [];

	for (const placeholder of analysis.placeholders) {
		if (!Object.hasOwn(mapping, placeholder)) {
			errors.push({
				placeholder,
				code: 'UNMAPPED',
				message: `Choose a source for “${placeholder}”.`
			});
			continue;
		}

		const provider = mapping[placeholder];
		if (provider?.kind === 'csv-column' && !availableHeaders.has(provider.column)) {
			errors.push({
				placeholder,
				code: 'MISSING_COLUMN',
				message: `CSV column “${provider.column}” is not available for “${placeholder}”.`
			});
		}
	}

	return errors;
}

export function renderTemplateRow(
	template: string,
	analysis: TemplateAnalysis,
	mapping: PlaceholderMapping,
	row: Record<string, string>
): string {
	assertAnalyzable(analysis);
	const result = renderRow(template, analysis, mapping, row);
	const problem = result.problems[0];
	if (problem) throw new Error(problem.message);
	return result.zpl;
}

export function renderCsvRows(
	template: string,
	csv: CsvDocument,
	mapping: PlaceholderMapping
): BatchRenderResult {
	const analysis = analyzeTemplate(template);
	assertAnalyzable(analysis);

	const mappingErrors = validateMapping(analysis, mapping, csv.headers);
	if (mappingErrors.length > 0) {
		throw new Error(mappingErrors.map(({ message }) => message).join(' '));
	}

	const result: BatchRenderResult = { generated: [], errors: [] };
	for (const row of csv.rows) {
		const rendered = renderRow(template, analysis, mapping, row.values);
		if (rendered.problems.length > 0) {
			result.errors.push(
				...rendered.problems.map<RowRenderError>((problem) => ({
					rowNumber: row.rowNumber,
					...problem
				}))
			);
			continue;
		}

		if (!isValidRenderedLabel(rendered.zpl)) {
			result.errors.push({
				rowNumber: row.rowNumber,
				code: 'INVALID_RENDERED_ZPL',
				message: 'Rendered output is not a complete, balanced ZPL label.'
			});
			continue;
		}

		result.generated.push({
			rowNumber: row.rowNumber,
			filename: `label-row-${String(row.rowNumber).padStart(6, '0')}.zpl`,
			zpl: rendered.zpl
		});
	}

	return result;
}

function assertAnalyzable(analysis: TemplateAnalysis): void {
	if (analysis.diagnostics.length === 0) return;
	throw new Error(
		`Cannot render a template with template diagnostics: ${analysis.diagnostics
			.map(({ message }) => message)
			.join(' ')}`
	);
}

function renderRow(
	template: string,
	analysis: TemplateAnalysis,
	mapping: PlaceholderMapping,
	row: Record<string, string>
): { zpl: string; problems: RenderProblem[] } {
	const values = new Map<string, string>();
	const problems: RenderProblem[] = [];

	for (const placeholder of analysis.placeholders) {
		const provider = Object.hasOwn(mapping, placeholder) ? mapping[placeholder] : undefined;
		if (!provider) {
			problems.push({
				code: 'PROVIDER_ERROR',
				placeholder,
				message: `No provider is mapped for “${placeholder}”.`
			});
			continue;
		}

		try {
			values.set(placeholder, resolveProvider(provider, row));
		} catch (error) {
			problems.push({
				code: 'PROVIDER_ERROR',
				placeholder,
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}

	const validatedContexts = new Set<string>();
	for (const occurrence of analysis.occurrences) {
		if (occurrence.context.kind !== 'barcode' || !values.has(occurrence.name)) continue;
		const contextKey = `${occurrence.name}\u0000${occurrence.context.format}`;
		if (validatedContexts.has(contextKey)) continue;
		validatedContexts.add(contextKey);

		const message = validateBarcodeValue(
			values.get(occurrence.name) as string,
			occurrence.context.format
		);
		if (message) {
			problems.push({
				code: 'INVALID_VALUE',
				placeholder: occurrence.name,
				message
			});
		}
	}

	if (problems.length > 0) return { zpl: template, problems };

	let zpl = template;
	const fields = groupOccurrencesByField(analysis.occurrences);
	for (const occurrences of [...fields.values()].sort(
		(left, right) => (right[0]?.fieldStart ?? 0) - (left[0]?.fieldStart ?? 0)
	)) {
		const first = occurrences[0];
		if (!first) continue;

		const existingHexIndicator = fieldHexIndicatorBefore(template, first.fieldStart);
		const hexIndicator = existingHexIndicator ?? '\\';
		const sourceField = template.slice(first.fieldStart, first.fieldEnd);
		let field = '';
		let fieldCursor = 0;
		for (const occurrence of [...occurrences].sort((left, right) => left.start - right.start)) {
			const relativeStart = occurrence.start - first.fieldStart;
			const relativeEnd = occurrence.end - first.fieldStart;
			field += preserveStaticFieldText(
				sourceField.slice(fieldCursor, relativeStart),
				existingHexIndicator
			);
			field += encodeZplFieldValue(values.get(occurrence.name) as string, hexIndicator);
			fieldCursor = relativeEnd;
		}
		field += preserveStaticFieldText(sourceField.slice(fieldCursor), existingHexIndicator);

		zpl =
			zpl.slice(0, first.fieldStart) +
			(existingHexIndicator === undefined ? '^FH\\' : '') +
			field +
			zpl.slice(first.fieldEnd);
	}

	return { zpl, problems };
}

function fieldHexIndicatorBefore(template: string, fieldStart: number): string | undefined {
	const match = template.slice(0, fieldStart).match(/\^FH([^~^]?)$/);
	if (!match) return undefined;
	return match[1] || '_';
}

function preserveStaticFieldText(value: string, existingHexIndicator: string | undefined): string {
	return existingHexIndicator === undefined ? value.replaceAll('\\', '\\5C') : value;
}

function groupOccurrencesByField(
	occurrences: PlaceholderOccurrence[]
): Map<number, PlaceholderOccurrence[]> {
	const fields = new Map<number, PlaceholderOccurrence[]>();
	for (const occurrence of occurrences) {
		const fieldOccurrences = fields.get(occurrence.fieldStart) ?? [];
		fieldOccurrences.push(occurrence);
		fields.set(occurrence.fieldStart, fieldOccurrences);
	}
	return fields;
}

function isValidRenderedLabel(zpl: string): boolean {
	const withoutTrailingNewlines = zpl.replace(/[\r\n]+$/, '');
	if (!withoutTrailingNewlines.startsWith('^XA') || !withoutTrailingNewlines.endsWith('^XZ')) {
		return false;
	}
	const renderedAnalysis = analyzeTemplate(zpl);
	if (renderedAnalysis.occurrences.length > 0 || renderedAnalysis.diagnostics.length > 0) {
		return false;
	}

	let fieldIsOpen = false;
	for (const match of zpl.matchAll(/\^(FD|FS)/g)) {
		if (match[1] === 'FD') {
			if (fieldIsOpen) return false;
			fieldIsOpen = true;
		} else {
			if (!fieldIsOpen) return false;
			fieldIsOpen = false;
		}
	}
	return !fieldIsOpen;
}
