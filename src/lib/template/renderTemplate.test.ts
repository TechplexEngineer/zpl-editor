import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csv/parseCsv.js';
import { analyzeTemplate } from './analyzeTemplate.js';
import { expectedInventoryLabels } from './fixtures/inventory.expected.js';
import { renderCsvRows, renderTemplateRow, validateMapping } from './renderTemplate.js';
import type { CsvDocument } from './types.js';

const fixture = (name: string) =>
	readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

describe('validateMapping', () => {
	it('reports every unmapped placeholder', () => {
		const analysis = analyzeTemplate('^XA^FO1,1^A0N,20,20^FD{{sku}} {{lot}}^FS^XZ');

		expect(
			validateMapping(analysis, { sku: { kind: 'csv-column', column: 'SKU' } }, ['SKU'])
		).toEqual([{ placeholder: 'lot', code: 'UNMAPPED', message: 'Choose a source for “lot”.' }]);
	});

	it('reports a mapped CSV column that is absent from the headers', () => {
		const analysis = analyzeTemplate('^XA^FO1,1^A0N,20,20^FD{{sku}} {{lot}}^FS^XZ');

		expect(
			validateMapping(
				analysis,
				{ sku: { kind: 'csv-column', column: 'Missing' }, lot: { kind: 'blank' } },
				['SKU']
			)[0]?.code
		).toBe('MISSING_COLUMN');
	});

	it('requires an own mapping property instead of an inherited one', () => {
		const analysis = analyzeTemplate('^XA^FO1,1^A0N,20,20^FD{{sku}}^FS^XZ');
		const mapping = Object.create({ sku: { kind: 'blank' } });

		expect(validateMapping(analysis, mapping, [])).toEqual([
			{ placeholder: 'sku', code: 'UNMAPPED', message: 'Choose a source for “sku”.' }
		]);
	});
});

describe('renderTemplateRow', () => {
	it('replaces duplicate occurrences and escapes each affected field exactly once', () => {
		const template = '^XA^FO1,1^A0N,20,20^FD{{sku}}^FS' + '^FO1,30^A0N,20,20^FDSKU {{sku}}^FS^XZ';
		const analysis = analyzeTemplate(template);

		const rendered = renderTemplateRow(
			template,
			analysis,
			{ sku: { kind: 'csv-column', column: 'SKU' } },
			{ SKU: 'A^B~C' }
		);

		expect(rendered).toContain('^FH\\^FDA\\5EB\\7EC^FS');
		expect(rendered).toContain('^FH\\^FDSKU A\\5EB\\7EC^FS');
		expect(rendered.match(/\^FH\\/g)).toHaveLength(2);
		expect(rendered).not.toContain('{{sku}}');
	});

	it('does not recursively evaluate placeholder text returned by a provider', () => {
		const template = '^XA^FO1,1^A0N,20,20^FD{{sku}} {{other}}^FS^XZ';
		const analysis = analyzeTemplate(template);

		expect(
			renderTemplateRow(
				template,
				analysis,
				{
					sku: { kind: 'literal', value: '{{other}}' },
					other: { kind: 'literal', value: 'DONE' }
				},
				{}
			)
		).toContain('^FD{{other}} DONE^FS');
	});

	it('validates a resolved value in each barcode occurrence context', () => {
		const template = '^XA^FO1,1^A0N,20,20^FD{{sku}}^FS' + '^FO1,30^B3N,N,60,Y,N^FD{{sku}}^FS^XZ';

		expect(() =>
			renderTemplateRow(
				template,
				analyzeTemplate(template),
				{ sku: { kind: 'literal', value: 'lowercase' } },
				{}
			)
		).toThrow(/CODE39/);
	});

	it('throws for template diagnostics before trying to render a row', () => {
		const template = '^XA^PW{{width}}^XZ';

		expect(() =>
			renderTemplateRow(
				template,
				analyzeTemplate(template),
				{ width: { kind: 'csv-column', column: 'Missing' } },
				{}
			)
		).toThrow(/template diagnostic/i);
	});

	it('ignores extra mapping keys instead of inserting their values', () => {
		const template = '^XA^FO1,1^A0N,20,20^FD{{sku}}^FS^XZ';
		const rendered = renderTemplateRow(
			template,
			analyzeTemplate(template),
			{
				sku: { kind: 'literal', value: 'A1' },
				unused: { kind: 'literal', value: '^FS^FO9,9^FDINJECTED' }
			},
			{}
		);

		expect(rendered).toBe('^XA^FO1,1^A0N,20,20^FH\\^FDA1^FS^XZ');
	});
});

describe('renderCsvRows', () => {
	it('generates valid fixture rows and isolates a bad barcode row', () => {
		const result = renderCsvRows(
			fixture('inventory-template.zpl'),
			parseCsv(fixture('inventory.csv')),
			{
				description: { kind: 'csv-column', column: 'Description' },
				sku: { kind: 'csv-column', column: 'SKU' }
			}
		);

		expect(result.generated).toEqual(expectedInventoryLabels);
		expect(result.generated.map(({ filename }) => filename)).toEqual([
			'label-row-000002.zpl',
			'label-row-000003.zpl'
		]);
		expect(result.generated[1]?.zpl).toContain('^FH\\^FD^FS');
		expect(result.errors).toEqual([
			expect.objectContaining({ rowNumber: 4, code: 'INVALID_VALUE', placeholder: 'sku' })
		]);
	});

	it.each([
		['does not begin with ^XA', 'before^XA^XZ'],
		['does not end with ^XZ', '^XA^XZafter'],
		['has unbalanced field commands', '^XA^FS^XZ']
	])('reports INVALID_RENDERED_ZPL when a rendered label %s', (_case, template) => {
		const result = renderCsvRows(template, parseCsv('SKU\nA1'), {});

		expect(result.generated).toEqual([]);
		expect(result.errors).toEqual([
			expect.objectContaining({ rowNumber: 2, code: 'INVALID_RENDERED_ZPL' })
		]);
	});

	it('allows only trailing CRLF after a complete label', () => {
		const result = renderCsvRows('^XA^XZ\r\n', parseCsv('SKU\nA1'), {});

		expect(result.errors).toEqual([]);
		expect(result.generated[0]?.zpl).toBe('^XA^XZ\r\n');
	});

	it.each([
		['a different valid placeholder', '{{other}}'],
		['malformed placeholder delimiters', '{{'],
		['an invalid placeholder name', '{{not valid}}']
	])('rejects %s introduced by a provider value', (_case, value) => {
		const template = '^XA^FO1,1^A0N,20,20^FD{{sku}}^FS^XZ';
		const result = renderCsvRows(template, parseCsv('SKU\nA1'), {
			sku: { kind: 'literal', value }
		});

		expect(result.generated).toEqual([]);
		expect(result.errors[0]?.code).toBe('INVALID_RENDERED_ZPL');
	});

	it('reports provider failures on one row without suppressing later rows', () => {
		const template = '^XA^FO1,1^A0N,20,20^FD{{sku}}^FS^XZ';
		const csv: CsvDocument = {
			headers: ['SKU'],
			rows: [
				{ rowNumber: 8, values: {} },
				{ rowNumber: 9, values: { SKU: 'A1' } }
			]
		};

		const result = renderCsvRows(template, csv, {
			sku: { kind: 'csv-column', column: 'SKU' }
		});

		expect(result.errors).toEqual([
			expect.objectContaining({ rowNumber: 8, code: 'PROVIDER_ERROR', placeholder: 'sku' })
		]);
		expect(result.generated.map(({ rowNumber, filename }) => ({ rowNumber, filename }))).toEqual([
			{ rowNumber: 9, filename: 'label-row-000009.zpl' }
		]);
	});
});
