<script lang="ts">
	import { resolve } from '$app/paths';
	import { parseCsv } from '$lib/csv/parseCsv.js';
	import { analyzeTemplate } from '$lib/template/analyzeTemplate.js';
	import {
		renderCsvRows,
		renderTemplateRow,
		validateMapping
	} from '$lib/template/renderTemplate.js';
	import type {
		BatchRenderResult,
		CsvDocument,
		GeneratedLabel,
		PlaceholderMapping,
		ValueProvider
	} from '$lib/template/types.js';

	let template = $state('');
	let csv = $state<CsvDocument>();
	let csvError = $state('');
	let mappingDraft = $state<Record<string, ValueProvider | undefined>>({});
	let result = $state<BatchRenderResult>();
	let generationError = $state('');

	let analysis = $derived(analyzeTemplate(template));
	let templateHasErrors = $derived(template.trim().length === 0 || analysis.diagnostics.length > 0);
	let csvHasErrors = $derived(!csv || csvError.length > 0);
	let completeMapping = $derived.by(() => {
		const mapping: Partial<PlaceholderMapping> = {};
		for (const placeholder of analysis.placeholders) {
			const provider = mappingDraft[placeholder];
			if (!provider || (provider.kind === 'csv-column' && provider.column === '')) continue;
			mapping[placeholder] = provider;
		}
		return mapping;
	});
	let mappingErrors = $derived(validateMapping(analysis, completeMapping, csv?.headers ?? []));
	let readyToGenerate = $derived(!templateHasErrors && !csvHasErrors && mappingErrors.length === 0);
	let preview = $derived.by(() => {
		const row = csv?.rows[0];
		if (!readyToGenerate || !row) return undefined;
		try {
			return {
				zpl: renderTemplateRow(
					template,
					analysis,
					completeMapping as PlaceholderMapping,
					row.values
				),
				rowNumber: row.rowNumber,
				error: ''
			};
		} catch (error) {
			return {
				zpl: '',
				rowNumber: row.rowNumber,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	});

	function resetOutput() {
		result = undefined;
		generationError = '';
	}

	function setTemplate(value: string) {
		template = value;
		mappingDraft = {};
		resetOutput();
	}

	async function loadTemplateFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		setTemplate(await file.text());
	}

	async function loadCsv(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		csv = undefined;
		csvError = '';
		mappingDraft = {};
		resetOutput();
		try {
			csv = parseCsv(await file.text());
		} catch (error) {
			csvError = error instanceof Error ? error.message : String(error);
		}
	}

	function setProvider(placeholder: string, kind: string) {
		let provider: ValueProvider | undefined;
		switch (kind) {
			case 'csv-column':
				provider = { kind: 'csv-column', column: '' };
				break;
			case 'literal':
				provider = { kind: 'literal', value: '' };
				break;
			case 'blank':
				provider = { kind: 'blank' };
				break;
		}
		mappingDraft = { ...mappingDraft, [placeholder]: provider };
		resetOutput();
	}

	function setColumn(placeholder: string, column: string) {
		mappingDraft = { ...mappingDraft, [placeholder]: { kind: 'csv-column', column } };
		resetOutput();
	}

	function setFixedValue(placeholder: string, value: string) {
		mappingDraft = { ...mappingDraft, [placeholder]: { kind: 'literal', value } };
		resetOutput();
	}

	function generate() {
		if (!readyToGenerate || !csv) return;
		generationError = '';
		try {
			result = renderCsvRows(template, csv, completeMapping as PlaceholderMapping);
		} catch (error) {
			result = undefined;
			generationError = error instanceof Error ? error.message : String(error);
		}
	}

	function downloadLabel(label: GeneratedLabel) {
		const url = URL.createObjectURL(new Blob([label.zpl], { type: 'text/plain;charset=utf-8' }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = label.filename;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>CSV Merge Example</title>
</svelte:head>

<main class="merge-example">
	<header>
		<a href={resolve('/')}>Back to ZPL Editor</a>
		<h1>CSV Merge Example</h1>
		<p>Create one ZPL label per CSV data row.</p>
	</header>

	<section>
		<h2>1. Choose template</h2>
		<label for="zpl-template">ZPL template</label>
		<textarea
			id="zpl-template"
			rows="7"
			value={template}
			oninput={(event) => setTemplate(event.currentTarget.value)}></textarea>
		<label for="template-file">Load template file</label>
		<input id="template-file" type="file" accept=".zpl,text/plain" onchange={loadTemplateFile} />

		{#if template.trim().length === 0}
			<p class="message">Enter or load a ZPL template.</p>
		{:else}
			<p>
				<strong>Placeholders:</strong>
				{analysis.placeholders.length > 0 ? analysis.placeholders.join(', ') : 'None'}
			</p>
		{/if}
		{#each analysis.diagnostics as diagnostic (`${diagnostic.code}-${diagnostic.start}-${diagnostic.end}`)}
			<p class="error">{diagnostic.message}</p>
		{/each}
	</section>

	<section>
		<h2>2. Upload CSV</h2>
		<label for="csv-file">Upload CSV</label>
		<input id="csv-file" type="file" accept=".csv,text/csv" onchange={loadCsv} />
		{#if csvError}
			<p class="error">{csvError}</p>
		{:else if csv}
			<p><strong>Headers:</strong> {csv.headers.join(', ')}</p>
			<p>{csv.rows.length} data {csv.rows.length === 1 ? 'row' : 'rows'}</p>
		{/if}
	</section>

	<section>
		<h2>3. Map values</h2>
		<fieldset disabled={templateHasErrors || csvHasErrors}>
			<legend>Placeholder mappings</legend>
			{#if analysis.placeholders.length === 0}
				<p>No placeholders to map.</p>
			{/if}
			{#each analysis.placeholders as placeholder (placeholder)}
				{@const provider = mappingDraft[placeholder]}
				<div class="mapping">
					<strong>{placeholder}</strong>
					<label for={`source-${placeholder}`}>Source for {placeholder}</label>
					<select
						id={`source-${placeholder}`}
						value={provider?.kind ?? ''}
						onchange={(event) => setProvider(placeholder, event.currentTarget.value)}
					>
						<option value="">Choose source…</option>
						<option value="csv-column">CSV column</option>
						<option value="blank">Blank</option>
						<option value="literal">Fixed value</option>
					</select>

					{#if provider?.kind === 'csv-column'}
						<label for={`column-${placeholder}`}>CSV column for {placeholder}</label>
						<select
							id={`column-${placeholder}`}
							value={provider.column}
							onchange={(event) => setColumn(placeholder, event.currentTarget.value)}
							required
						>
							<option value="">Choose column…</option>
							{#each csv?.headers ?? [] as header (header)}
								<option value={header}>{header}</option>
							{/each}
						</select>
					{:else if provider?.kind === 'literal'}
						<label for={`fixed-${placeholder}`}>Fixed value for {placeholder}</label>
						<input
							id={`fixed-${placeholder}`}
							type="text"
							value={provider.value}
							oninput={(event) => setFixedValue(placeholder, event.currentTarget.value)}
						/>
					{/if}

					{#each mappingErrors.filter((error) => error.placeholder === placeholder) as error (error.code)}
						<p class="error">{error.message}</p>
					{/each}
				</div>
			{/each}
		</fieldset>

		{#if preview}
			{#if preview.error}
				<p class="error">Row {preview.rowNumber}: {preview.error}</p>
			{:else}
				<h3>Representative preview</h3>
				<p>Preview represents CSV row {preview.rowNumber}.</p>
				<pre aria-label="Representative preview">{preview.zpl}</pre>
			{/if}
		{/if}
	</section>

	<section>
		<h2>4. Generate</h2>
		<button type="button" onclick={generate} disabled={!readyToGenerate}>Generate labels</button>
		{#if generationError}
			<p class="error">{generationError}</p>
		{/if}
		{#if result}
			<p>{result.generated.length} generated, {result.errors.length} failed</p>
			<ul class="results">
				{#each result.generated as label (label.rowNumber)}
					<li>
						<span>{label.filename}</span>
						<button type="button" onclick={() => downloadLabel(label)}>
							Download {label.filename}
						</button>
					</li>
				{/each}
			</ul>
			{#if result.errors.length > 0}
				<h3>Row errors</h3>
				<ul>
					{#each result.errors as error, index (`${index}-${error.rowNumber}-${error.code}-${error.placeholder ?? ''}`)}
						<li><strong>Row {error.rowNumber}:</strong> {error.message}</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0f172a;
		color: #e2e8f0;
		font-family: system-ui, sans-serif;
	}

	.merge-example {
		box-sizing: border-box;
		width: min(58rem, 100%);
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
	}

	header,
	section {
		margin-bottom: 1rem;
		padding: 1.25rem;
		border: 1px solid #334155;
		border-radius: 0.75rem;
		background: #1e293b;
	}

	h1,
	h2,
	h3 {
		margin-top: 0;
	}

	label,
	input,
	textarea,
	select,
	button {
		display: block;
		box-sizing: border-box;
	}

	label {
		margin: 0.75rem 0 0.3rem;
		font-weight: 600;
	}

	textarea,
	select,
	input[type='text'] {
		width: 100%;
		padding: 0.6rem;
		border: 1px solid #64748b;
		border-radius: 0.4rem;
		background: #0f172a;
		color: inherit;
	}

	textarea,
	pre {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}

	fieldset {
		padding: 0;
		border: 0;
	}

	.mapping {
		margin-top: 1rem;
		padding: 1rem;
		border: 1px solid #475569;
		border-radius: 0.5rem;
	}

	pre {
		overflow: auto;
		padding: 1rem;
		background: #020617;
		white-space: pre-wrap;
	}

	button {
		margin-top: 0.75rem;
		padding: 0.55rem 0.85rem;
		border: 0;
		border-radius: 0.4rem;
		background: #2563eb;
		color: white;
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	a {
		color: #93c5fd;
	}

	.error {
		color: #fca5a5;
	}

	.message {
		color: #cbd5e1;
	}

	.results {
		padding-left: 1.25rem;
	}

	.results li {
		margin-bottom: 0.75rem;
	}
</style>
