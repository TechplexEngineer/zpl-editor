<script lang="ts">
	import { onMount } from 'svelte';
	import { fabric } from 'fabric';
	import { inchesToDots, dotsToInches, type BarcodeFormat, type RotationAngle } from './zpl/types.js';
	import { compileFabricCanvasToZPL } from './zpl/zplCompiler.js';
	import { renderBarcodeDataUrl } from './zpl/barcodeRenderer.js';
	import { rgbaToZplGF } from './zpl/imageDither.js';

	// Props with Svelte 5 bindable syntax
	let {
		width = $bindable(4.0),
		height = $bindable(6.0),
		dpi = $bindable(300),
		zpl = $bindable(''),
		visible = true,
		onChange = (zplString: string) => {}
	} = $props<{
		width?: number;
		height?: number;
		dpi?: number;
		zpl?: string;
		visible?: boolean;
		onChange?: (zplString: string) => void;
	}>();

	// Local reactive states
	let canvasElement: HTMLCanvasElement;
	let fabricCanvas: fabric.Canvas | null = null;
	let zoomScale = $state(0.5); // Default zoom scale to fit 300DPI canvas comfortably
	let activeObject = $state<any>(null);
	let copiedNotification = $state(false);

	// Calculated label dot dimensions
	let pwDots = $derived(inchesToDots(width, dpi));
	let llDots = $derived(inchesToDots(height, dpi));

	// Synchronize Fabric canvas size when props change
	$effect(() => {
		const w = pwDots;
		const h = llDots;
		if (fabricCanvas) {
			fabricCanvas.setDimensions({ width: w, height: h });
			fabricCanvas.calcOffset();
			fabricCanvas.renderAll();
			updateZPL();
		}
	});

	// Recalculate canvas offset and redraw when element becomes visible
	$effect(() => {
		if (visible && fabricCanvas) {
			fabricCanvas.calcOffset();
			fabricCanvas.renderAll();
		}
	});

	onMount(() => {
		fabricCanvas = new fabric.Canvas(canvasElement, {
			width: pwDots,
			height: llDots,
			backgroundColor: '#ffffff',
			selection: true
		});

		// Set default snap angle for all objects
		fabric.Object.prototype.snapAngle = 90;
		fabric.Object.prototype.snapThreshold = 10;

		// Attach events
		fabricCanvas.on('selection:created', handleSelection);
		fabricCanvas.on('selection:updated', handleSelection);
		fabricCanvas.on('selection:cleared', () => {
			activeObject = null;
		});

		fabricCanvas.on('object:modified', updateZPL);
		fabricCanvas.on('object:added', updateZPL);
		fabricCanvas.on('object:removed', updateZPL);

		// Add default sample elements
		addText('Sample Label', 100, 100, 48);
		addBarcode('https://example.com', 100, 200, 'QR');

		return () => {
			fabricCanvas?.dispose();
		};
	});

	function handleSelection(e: any) {
		activeObject = fabricCanvas?.getActiveObject() || null;
	}

	function updateZPL() {
		if (!fabricCanvas) return;
		const generated = compileFabricCanvasToZPL(fabricCanvas, {
			widthInches: width,
			heightInches: height,
			dpi
		});
		zpl = generated;
		onChange(generated);
		// Trigger activeObject property sync
		activeObject = fabricCanvas.getActiveObject() || null;
	}

	function addText(content = 'Text', x = 50, y = 50, size = 36) {
		if (!fabricCanvas) return;
		const textObj = new fabric.IText(content, {
			left: x,
			top: y,
			fontSize: size,
			fontFamily: 'Helvetica, Arial, sans-serif',
			fill: '#000000',
			snapAngle: 90
		});
		(textObj as any).zplType = 'text';
		fabricCanvas.add(textObj);
		fabricCanvas.setActiveObject(textObj);
	}

	function addRectangle(x = 50, y = 50, w = 200, h = 100) {
		if (!fabricCanvas) return;
		const rectObj = new fabric.Rect({
			left: x,
			top: y,
			width: w,
			height: h,
			fill: 'transparent',
			stroke: '#000000',
			strokeWidth: 4,
			snapAngle: 90
		});
		(rectObj as any).zplType = 'rectangle';
		fabricCanvas.add(rectObj);
		fabricCanvas.setActiveObject(rectObj);
	}

	async function addBarcode(text = 'BARCODE', x = 50, y = 50, format: BarcodeFormat = 'QR') {
		if (!fabricCanvas) return;
		const dataUrl = await renderBarcodeDataUrl(text, format);
		
		fabric.Image.fromURL(dataUrl, (img) => {
			img.set({
				left: x,
				top: y,
				snapAngle: 90
			});
			(img as any).zplType = 'barcode';
			(img as any).zplData = text;
			(img as any).barcodeFormat = format;
			
			fabricCanvas?.add(img);
			fabricCanvas?.setActiveObject(img);
			updateZPL();
		});
	}

	function handleImageUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || !input.files[0] || !fabricCanvas) return;

		const file = input.files[0];
		const reader = new FileReader();

		reader.onload = (event) => {
			const imgObj = new Image();
			imgObj.src = event.target?.result as string;

			imgObj.onload = () => {
				const tempCanvas = document.createElement('canvas');
				tempCanvas.width = imgObj.width;
				tempCanvas.height = imgObj.height;
				const ctx = tempCanvas.getContext('2d')!;
				ctx.drawImage(imgObj, 0, 0);

				const imgData = ctx.getImageData(0, 0, imgObj.width, imgObj.height);
				const gfHex = rgbaToZplGF(imgData.data, imgObj.width, imgObj.height);

				fabric.Image.fromURL(tempCanvas.toDataURL(), (fImg) => {
					fImg.set({
						left: 50,
						top: 50,
						snapAngle: 90
					});
					(fImg as any).zplType = 'image';
					(fImg as any).zplGFData = gfHex;

					fabricCanvas?.add(fImg);
					fabricCanvas?.setActiveObject(fImg);
					updateZPL();
				});
			};
		};

		reader.readAsDataURL(file);
	}

	function deleteSelected() {
		if (!fabricCanvas || !activeObject) return;
		fabricCanvas.remove(activeObject);
		fabricCanvas.discardActiveObject();
		activeObject = null;
		updateZPL();
	}

	function copyZPL() {
		navigator.clipboard.writeText(zpl);
		copiedNotification = true;
		setTimeout(() => {
			copiedNotification = false;
		}, 2000);
	}

	// Active Object Property Handlers
	function updateActiveProp(key: string, value: any) {
		if (!activeObject || !fabricCanvas) return;
		activeObject.set(key, value);
		activeObject.setCoords();
		fabricCanvas.renderAll();
		updateZPL();
	}

	async function updateBarcodeFormat(newFormat: BarcodeFormat) {
		if (!activeObject || (activeObject as any).zplType !== 'barcode') return;
		(activeObject as any).barcodeFormat = newFormat;
		const text = (activeObject as any).zplData || 'BARCODE';
		const newDataUrl = await renderBarcodeDataUrl(text, newFormat);
		activeObject.setSrc(newDataUrl, () => {
			fabricCanvas?.renderAll();
			updateZPL();
		});
	}

	async function updateBarcodeText(newText: string) {
		if (!activeObject || (activeObject as any).zplType !== 'barcode') return;
		(activeObject as any).zplData = newText;
		const format = (activeObject as any).barcodeFormat || 'QR';
		const newDataUrl = await renderBarcodeDataUrl(newText, format);
		activeObject.setSrc(newDataUrl, () => {
			fabricCanvas?.renderAll();
			updateZPL();
		});
	}
</script>

<div class="zpl-editor-container">
	<!-- TOP TOOLBAR -->
	<header class="toolbar">
		<div class="toolbar-section">
			<span class="logo">🏷️ ZPL Editor</span>
		</div>

		<div class="toolbar-controls">
			<label class="control-group">
				<span>Width (in):</span>
				<input type="number" step="0.25" min="0.5" max="12" bind:value={width} />
			</label>

			<label class="control-group">
				<span>Height (in):</span>
				<input type="number" step="0.25" min="0.5" max="12" bind:value={height} />
			</label>

			<label class="control-group">
				<span>DPI:</span>
				<select bind:value={dpi}>
					<option value={200}>200 DPI</option>
					<option value={300}>300 DPI (Default)</option>
					<option value={600}>600 DPI</option>
				</select>
			</label>

			<label class="control-group">
				<span>Zoom:</span>
				<input type="range" min="0.2" max="1.5" step="0.05" bind:value={zoomScale} />
				<span class="zoom-val">{Math.round(zoomScale * 100)}%</span>
			</label>
		</div>

		<div class="toolbar-actions">
			<button class="btn btn-accent" onclick={copyZPL}>
				{copiedNotification ? '✓ Copied!' : 'Copy ZPL'}
			</button>
		</div>
	</header>

	<!-- MAIN THREE-COLUMN LAYOUT -->
	<div class="editor-body">
		<!-- LEFT PALETTE SIDEBAR -->
		<aside class="sidebar palette">
			<h3>Add Elements</h3>
			<div class="tool-list">
				<button class="tool-btn" onclick={() => addText('Text')}>
					<span class="icon">T</span>
					<span>Text</span>
				</button>

				<button class="tool-btn" onclick={() => addRectangle()}>
					<span class="icon">▭</span>
					<span>Rectangle</span>
				</button>

				<button class="tool-btn" onclick={() => addBarcode('123456', 50, 50, 'QR')}>
					<span class="icon">🏁</span>
					<span>Barcode (QR)</span>
				</button>

				<button class="tool-btn" onclick={() => addBarcode('123456', 50, 50, 'CODE128')}>
					<span class="icon">║▌</span>
					<span>Code 128</span>
				</button>

				<button class="tool-btn" onclick={() => addBarcode('123456', 50, 50, 'DATAMATRIX')}>
					<span class="icon">▦</span>
					<span>DataMatrix</span>
				</button>

				<label class="tool-btn file-btn">
					<span class="icon">🖼️</span>
					<span>Image</span>
					<input type="file" accept="image/*" onchange={handleImageUpload} hidden />
				</label>
			</div>
		</aside>

		<!-- MIDDLE WORKSPACE CANVAS -->
		<main class="workspace">
			<div class="canvas-viewport">
				<div
					class="canvas-wrapper"
					style="width: {pwDots}px; height: {llDots}px; transform: scale({zoomScale}); transform-origin: top center;"
				>
					<canvas bind:this={canvasElement}></canvas>
				</div>
			</div>
		</main>

		<!-- RIGHT PROPERTY INSPECTOR -->
		<aside class="sidebar inspector">
			<h3>Properties</h3>

			{#if activeObject}
				<div class="prop-group">
					<span class="badge">{(activeObject.zplType || activeObject.type).toUpperCase()}</span>
					<button class="btn btn-danger btn-sm" onclick={deleteSelected}>Delete</button>
				</div>

				<div class="prop-grid">
					<label>
						<span>X (dots):</span>
						<input
							type="number"
							value={Math.round(activeObject.left || 0)}
							oninput={(e) => updateActiveProp('left', parseFloat(e.currentTarget.value))}
						/>
					</label>

					<label>
						<span>Y (dots):</span>
						<input
							type="number"
							value={Math.round(activeObject.top || 0)}
							oninput={(e) => updateActiveProp('top', parseFloat(e.currentTarget.value))}
						/>
					</label>
				</div>

				<div class="prop-grid">
					<label>
						<span>Rotation:</span>
						<select
							value={activeObject.angle || 0}
							onchange={(e) => updateActiveProp('angle', parseInt(e.currentTarget.value))}
						>
							<option value={0}>0° (Normal)</option>
							<option value={90}>90° (Rotated)</option>
							<option value={180}>180° (Inverted)</option>
							<option value={270}>270° (Bottom-up)</option>
						</select>
					</label>
				</div>

				{#if activeObject.zplType === 'text' || activeObject.type === 'i-text'}
					<div class="prop-field">
						<label>
							<span>Text Content:</span>
							<input
								type="text"
								value={activeObject.text || ''}
								oninput={(e) => updateActiveProp('text', e.currentTarget.value)}
							/>
						</label>
					</div>

					<div class="prop-field">
						<label>
							<span>Font Size (pt):</span>
							<input
								type="number"
								value={activeObject.fontSize || 36}
								oninput={(e) => updateActiveProp('fontSize', parseInt(e.currentTarget.value))}
							/>
						</label>
					</div>
				{/if}

				{#if activeObject.zplType === 'barcode'}
					<div class="prop-field">
						<label>
							<span>Barcode Format:</span>
							<select
								value={activeObject.barcodeFormat || 'QR'}
								onchange={(e) => updateBarcodeFormat(e.currentTarget.value as BarcodeFormat)}
							>
								<option value="QR">QR Code (Default)</option>
								<option value="DATAMATRIX">DataMatrix</option>
								<option value="CODE128">Code 128</option>
								<option value="CODE39">Code 39</option>
							</select>
						</label>
					</div>

					<div class="prop-field">
						<label>
							<span>Barcode Value:</span>
							<input
								type="text"
								value={activeObject.zplData || ''}
								oninput={(e) => updateBarcodeText(e.currentTarget.value)}
							/>
						</label>
					</div>
				{/if}

				{#if activeObject.zplType === 'rectangle' || activeObject.type === 'rect'}
					<div class="prop-grid">
						<label>
							<span>Width (dots):</span>
							<input
								type="number"
								value={Math.round((activeObject.width || 0) * (activeObject.scaleX || 1))}
								oninput={(e) => updateActiveProp('width', parseFloat(e.currentTarget.value))}
							/>
						</label>
						<label>
							<span>Height (dots):</span>
							<input
								type="number"
								value={Math.round((activeObject.height || 0) * (activeObject.scaleY || 1))}
								oninput={(e) => updateActiveProp('height', parseFloat(e.currentTarget.value))}
							/>
						</label>
					</div>
				{/if}
			{:else}
				<div class="no-selection">
					<p>Select an item on the canvas to inspect and edit its properties.</p>
					<div class="label-info">
						<div class="info-row">
							<span>Canvas Resolution:</span>
							<strong>{pwDots} × {llDots} dots</strong>
						</div>
						<div class="info-row">
							<span>Physical Size:</span>
							<strong>{width}" × {height}" @ {dpi} DPI</strong>
						</div>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	.zpl-editor-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100%;
		background-color: #0f172a;
		color: #f8fafc;
		font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		background: #1e293b;
		border-bottom: 1px solid #334155;
		gap: 1rem;
	}

	.logo {
		font-weight: 700;
		font-size: 1.15rem;
		letter-spacing: -0.02em;
	}

	.toolbar-controls {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: #94a3b8;
	}

	.control-group input[type='number'] {
		width: 4.5rem;
	}

	input, select {
		background: #0f172a;
		border: 1px solid #334155;
		color: #f8fafc;
		padding: 0.35rem 0.6rem;
		border-radius: 0.375rem;
		font-size: 0.85rem;
	}

	input:focus, select:focus {
		outline: 2px solid #3b82f6;
		border-color: transparent;
	}

	.zoom-val {
		font-size: 0.8rem;
		color: #64748b;
		min-width: 2.5rem;
	}

	.editor-body {
		display: grid;
		grid-template-columns: 220px 1fr 280px;
		flex: 1;
		overflow: hidden;
	}

	.sidebar {
		background: #1e293b;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		border-right: 1px solid #334155;
		overflow-y: auto;
	}

	.inspector {
		border-right: none;
		border-left: 1px solid #334155;
	}

	.sidebar h3 {
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #94a3b8;
		margin: 0;
	}

	.tool-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.8rem;
		background: #0f172a;
		border: 1px solid #334155;
		color: #f8fafc;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s ease;
	}

	.tool-btn:hover {
		background: #334155;
		border-color: #3b82f6;
	}

	.icon {
		font-size: 1.1rem;
		width: 1.5rem;
		text-align: center;
	}

	.file-btn {
		position: relative;
	}

	.workspace {
		background: #090d16;
		overflow: auto;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 2rem;
	}

	.canvas-viewport {
		display: flex;
		justify-content: center;
	}

	.canvas-wrapper {
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
		border: 2px dashed #3b82f6;
		background: #ffffff;
	}

	.prop-group {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.badge {
		background: #334155;
		color: #38bdf8;
		padding: 0.2rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.prop-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.prop-grid label, .prop-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: #94a3b8;
	}

	.prop-field input, .prop-field select {
		width: 100%;
	}

	.btn {
		padding: 0.4rem 0.8rem;
		border-radius: 0.375rem;
		border: none;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		transition: background 0.15s ease;
	}

	.btn-accent {
		background: #3b82f6;
		color: #ffffff;
	}

	.btn-accent:hover {
		background: #2563eb;
	}

	.btn-danger {
		background: #ef4444;
		color: #ffffff;
	}

	.btn-danger:hover {
		background: #dc2626;
	}

	.btn-sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
	}

	.no-selection {
		color: #64748b;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.label-info {
		background: #0f172a;
		padding: 0.75rem;
		border-radius: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 1px solid #334155;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}
</style>
