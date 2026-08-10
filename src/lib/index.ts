import ZPLEditor from './ZPLEditor.svelte';

export { ZPLEditor };
export default ZPLEditor;

export { analyzeTemplate, isPlaceholderName } from './template/analyzeTemplate.js';
export { parseCsv, CsvParseError } from './csv/parseCsv.js';
export { resolveProvider, ProviderResolutionError } from './template/providers.js';
export { validateMapping, renderTemplateRow, renderCsvRows } from './template/renderTemplate.js';
export type {
	PlaceholderContext,
	PlaceholderOccurrence,
	TemplateAnalysis,
	TemplateDiagnostic,
	MappingValidationError,
	ValueProvider,
	PlaceholderMapping,
	CsvDocument,
	RowRenderError,
	GeneratedLabel,
	BatchRenderResult
} from './template/types.js';
