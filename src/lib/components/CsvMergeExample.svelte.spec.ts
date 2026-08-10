import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CsvMergeExample from './CsvMergeExample.svelte';

const textTemplate = '^XA^FO1,1^A0N,20,20^FD{{sku}} {{description}}^FS^XZ';

async function enterTemplate(template: string) {
	await page.getByLabelText('ZPL template').fill(template);
}

async function uploadCsv(source: string, name = 'items.csv') {
	await page.getByLabelText('Upload CSV').upload(new File([source], name, { type: 'text/csv' }));
}

describe('CsvMergeExample', () => {
	it('requires explicit mappings before previewing and generating a representative row', async () => {
		render(CsvMergeExample);

		await enterTemplate(textTemplate);
		await uploadCsv('SKU,Description\nA1,Widget');

		const generate = page.getByRole('button', { name: 'Generate labels' });
		await expect.element(generate).toBeDisabled();

		await page.getByLabelText('Source for sku').selectOptions('csv-column');
		await page.getByLabelText('CSV column for sku').selectOptions('SKU');
		await expect.element(generate).toBeDisabled();

		await page.getByLabelText('Source for description').selectOptions('literal');
		await page.getByLabelText('Fixed value for description').fill('Fixed');

		await expect.element(generate).toBeEnabled();
		await expect
			.element(page.getByLabelText('Representative preview'))
			.toHaveTextContent('A1 Fixed');
		await expect.element(page.getByText('Preview represents CSV row 2.')).toBeInTheDocument();

		await generate.click();

		await expect.element(page.getByText('1 generated, 0 failed')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Download label-row-000002.zpl' }))
			.toBeInTheDocument();
	});

	it('offers all CSV headers without guessing from a different placeholder name', async () => {
		render(CsvMergeExample);

		await enterTemplate('^XA^FO1,1^A0N,20,20^FD{{sku}}^FS^XZ');
		await uploadCsv('Inventory ID,Description\nA1,Widget');

		const generate = page.getByRole('button', { name: 'Generate labels' });
		await expect.element(generate).toBeDisabled();
		await expect.element(page.getByLabelText('Source for sku')).toHaveValue('');

		await page.getByLabelText('Source for sku').selectOptions('csv-column');
		const header = page.getByLabelText('CSV column for sku');
		await expect.element(header.getByRole('option', { name: 'Inventory ID' })).toBeInTheDocument();
		await expect.element(header.getByRole('option', { name: 'Description' })).toBeInTheDocument();
		await expect.element(generate).toBeDisabled();
	});

	it('treats Blank as complete and accepts an empty value from a CSV column', async () => {
		render(CsvMergeExample);

		await enterTemplate(textTemplate);
		await uploadCsv('SKU,Description\n,Widget');
		await page.getByLabelText('Source for sku').selectOptions('csv-column');
		await page.getByLabelText('CSV column for sku').selectOptions('SKU');
		await page.getByLabelText('Source for description').selectOptions('blank');

		const generate = page.getByRole('button', { name: 'Generate labels' });
		await expect.element(generate).toBeEnabled();
		await generate.click();

		await expect.element(page.getByText('1 generated, 0 failed')).toBeInTheDocument();
	});

	it('accepts an explicitly selected empty fixed value', async () => {
		render(CsvMergeExample);

		await enterTemplate('^XA^FO1,1^A0N,20,20^FD{{sku}}^FS^XZ');
		await uploadCsv('Ignored\nrow');
		await page.getByLabelText('Source for sku').selectOptions('literal');

		await expect.element(page.getByLabelText('Fixed value for sku')).toHaveValue('');
		await expect.element(page.getByRole('button', { name: 'Generate labels' })).toBeEnabled();
	});

	it('keeps valid row downloads when a later CODE39 row fails and exposes no batch actions', async () => {
		render(CsvMergeExample);

		await enterTemplate('^XA^FO1,1^B3N,N,60,Y,N^FD{{sku}}^FS^XZ');
		await uploadCsv('SKU\nGOOD\nlowercase');
		await page.getByLabelText('Source for sku').selectOptions('csv-column');
		await page.getByLabelText('CSV column for sku').selectOptions('SKU');
		await page.getByRole('button', { name: 'Generate labels' }).click();

		await expect.element(page.getByText('1 generated, 1 failed')).toBeInTheDocument();
		await expect.element(page.getByText(/Row 3/)).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Download label-row-000002.zpl' }))
			.toBeInTheDocument();
		await expect.element(page.getByText('Download all', { exact: true })).not.toBeInTheDocument();
		await expect.element(page.getByText('Print', { exact: true })).not.toBeInTheDocument();
		await expect.element(page.getByLabelText('Printer')).not.toBeInTheDocument();
		await expect.element(page.getByText(/combined batch/i)).not.toBeInTheDocument();
	});

	it('renders multiple barcode errors for one row while retaining another row download', async () => {
		render(CsvMergeExample);

		await enterTemplate('^XA^FO1,1^B3N,N,60,Y,N^FD{{sku}}^FS^FO1,80^BCN,60,Y,N,N^FD{{sku}}^FS^XZ');
		await uploadCsv('SKU\nGOOD\nBAD\x01');
		await page.getByLabelText('Source for sku').selectOptions('csv-column');
		await page.getByLabelText('CSV column for sku').selectOptions('SKU');
		await page.getByRole('button', { name: 'Generate labels' }).click();

		await expect.element(page.getByText(/CODE39 values may contain/)).toBeInTheDocument();
		await expect.element(page.getByText(/CODE128 values may contain/)).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Download label-row-000002.zpl' }))
			.toBeInTheDocument();
	});
});
