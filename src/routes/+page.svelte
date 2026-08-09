<script lang="ts">
	import ZPLEditor from '$lib/ZPLEditor.svelte';

	let labelWidth = $state(4.0);
	let labelHeight = $state(6.0);
	let labelDpi = $state(300);
	let zplOutput = $state('');
	let activeTab = $state<'editor' | 'zpl' | 'preview'>('editor');

	// Labelary preview URL generator
	let labelaryUrl = $derived.by(() => {
		if (!zplOutput) return '';
		const dpmm = Math.round(labelDpi / 25.4);
		return `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${labelWidth}x${labelHeight}/0/${encodeURIComponent(zplOutput)}`;
	});

	function downloadZPL() {
		if (!zplOutput) return;
		const blob = new Blob([zplOutput], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const timestamp = new Date().toISOString().replace(/:/g, '-');
		const a = document.createElement('a');
		a.href = url;
		a.download = `label-${timestamp}.zpl`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>ZPL Editor & Showcase Demo</title>
</svelte:head>

<div class="demo-wrapper">
	<nav class="demo-nav">
		<div class="brand">
			<span class="logo-icon">🖨️</span>
			<h1>Svelte ZPL Editor Demo</h1>
		</div>

		<div class="view-tabs">
			<button
				class="tab-btn"
				class:active={activeTab === 'editor'}
				onclick={() => (activeTab = 'editor')}
			>
				Editor
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'zpl'}
				onclick={() => (activeTab = 'zpl')}
			>
				ZPL Code
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'preview'}
				onclick={() => (activeTab = 'preview')}
			>
				Print Preview (Labelary)
			</button>
		</div>

		<div class="nav-spacer"></div>
	</nav>

	<div class="main-content">
		<div class="editor-tab-content" class:hidden={activeTab !== 'editor'}>
			<ZPLEditor
				bind:width={labelWidth}
				bind:height={labelHeight}
				bind:dpi={labelDpi}
				bind:zpl={zplOutput}
				visible={activeTab === 'editor'}
			/>
		</div>
		{#if activeTab === 'zpl'}
			<div class="zpl-view-container">
				<div class="zpl-header">
					<h2>Real-Time Generated ZPL Code</h2>
					<div class="zpl-actions">
						<button class="download-btn" onclick={downloadZPL}>
							Download ZPL
						</button>
						<button class="copy-btn" onclick={() => navigator.clipboard.writeText(zplOutput)}>
							Copy ZPL
						</button>
					</div>
				</div>
				<pre class="zpl-code"><code>{zplOutput}</code></pre>
			</div>
		{:else if activeTab === 'preview'}
			<div class="preview-container">
				<h2>Thermal Print Simulation (Labelary Engine)</h2>
				<p>
					This image is generated in real time directly from your compiled ZPL code via the Labelary
					API:
				</p>

				<div class="preview-card">
					{#if labelaryUrl}
						<img src={labelaryUrl} alt="ZPL Thermal Print Preview" class="labelary-img" />
					{:else}
						<p>Generating preview...</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0f172a;
		color: #f8fafc;
		font-family:
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
	}

	.demo-wrapper {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	.demo-nav {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 0.75rem 1.5rem;
		background: #1e293b;
		border-bottom: 1px solid #334155;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.brand h1 {
		font-size: 1.1rem;
		margin: 0;
		font-weight: 700;
	}

	.tab-btn {
		background: #0f172a;
		border: 1px solid #334155;
		color: #94a3b8;
		padding: 0.4rem 0.75rem;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.8rem;
		transition: all 0.15s ease;
	}

	.tab-btn:hover {
		color: #f8fafc;
		border-color: #3b82f6;
	}

	.tab-btn.active {
		background: #3b82f6;
		color: #ffffff;
		border-color: #3b82f6;
		font-weight: 600;
	}

	.view-tabs {
		display: flex;
		gap: 0.4rem;
	}

	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.editor-tab-content {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.hidden {
		display: none !important;
	}

	.zpl-view-container {
		padding: 2rem;
		max-width: 900px;
		margin: 0 auto;
		width: 100%;
	}

	.zpl-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.zpl-header h2 {
		margin: 0;
		font-size: 1.25rem;
	}

	.zpl-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.download-btn {
		background: #475569;
		color: #ffffff;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 600;
		cursor: pointer;
	}

	.download-btn:hover {
		background: #334155;
	}

	.copy-btn {
		background: #3b82f6;
		color: #ffffff;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 600;
		cursor: pointer;
	}

	.zpl-code {
		background: #090d16;
		border: 1px solid #334155;
		padding: 1.5rem;
		border-radius: 0.5rem;
		color: #38bdf8;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.95rem;
		line-height: 1.6;
		overflow-x: auto;
		white-space: pre-wrap;
	}

	.preview-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		gap: 1rem;
	}

	.preview-card {
		background: #ffffff;
		padding: 1.5rem;
		border-radius: 0.5rem;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		min-width: 300px;
		min-height: 300px;
	}

	.labelary-img {
		max-width: 100%;
		height: auto;
		border: 1px solid #cbd5e1;
	}
</style>
