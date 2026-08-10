import type { BarcodeFormat } from '../zpl/types.js';

export type PlaceholderName = string;
export type PlaceholderContext = { kind: 'text' } | { kind: 'barcode'; format: BarcodeFormat };

export interface PlaceholderOccurrence {
	name: PlaceholderName;
	token: string;
	start: number;
	end: number;
	fieldStart: number;
	fieldEnd: number;
	locationId: string;
	context: PlaceholderContext;
}

export type TemplateDiagnosticCode = 'MALFORMED_TOKEN' | 'INVALID_NAME' | 'UNSUPPORTED_PLACEMENT';

export interface TemplateDiagnostic {
	code: TemplateDiagnosticCode;
	message: string;
	start: number;
	end: number;
	name?: string;
	locationId?: string;
}

export interface TemplateAnalysis {
	placeholders: string[];
	occurrences: PlaceholderOccurrence[];
	diagnostics: TemplateDiagnostic[];
}

export type ValueProvider =
	{ kind: 'csv-column'; column: string } | { kind: 'literal'; value: string } | { kind: 'blank' };

export type PlaceholderMapping = Record<string, ValueProvider>;

export interface CsvDocument {
	headers: string[];
	rows: Array<{ rowNumber: number; values: Record<string, string> }>;
}

export interface MappingValidationError {
	placeholder: string;
	code: 'UNMAPPED' | 'MISSING_COLUMN';
	message: string;
}

export interface RowRenderError {
	rowNumber: number;
	code: 'PROVIDER_ERROR' | 'INVALID_VALUE' | 'INVALID_RENDERED_ZPL';
	message: string;
	placeholder?: string;
}

export interface GeneratedLabel {
	rowNumber: number;
	filename: string;
	zpl: string;
}

export interface BatchRenderResult {
	generated: GeneratedLabel[];
	errors: RowRenderError[];
}
