<script lang="ts">
	import { onMount } from 'svelte';
	import { fabric } from 'fabric';
	import {
		inchesToDots,
		dotsToInches,
		type BarcodeFormat,
		type RotationAngle
	} from './zpl/types.js';
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

		fabricCanvas.on('object:modified', (e) => {
			const obj = e.target;
			if (obj && (obj as any).zplType === 'line') {
				centerLine(obj as fabric.Line);
			}
			updateZPL();
		});
		fabricCanvas.on('object:added', updateZPL);
		fabricCanvas.on('object:removed', updateZPL);
		fabricCanvas.on('object:scaling', (e) => {
			const obj = e.target;
			if (obj && (obj as any).zplType === 'rectangle') {
				const rectObj = obj as fabric.Rect;
				const roundingVal = (rectObj as any).zplRounding || 0;
				const w = (rectObj.width || 0) * (rectObj.scaleX || 1);
				const h = (rectObj.height || 0) * (rectObj.scaleY || 1);
				const rx = (roundingVal / 8) * (Math.min(w, h) / 2);
				rectObj.set({
					rx: rx / (rectObj.scaleX || 1),
					ry: rx / (rectObj.scaleY || 1)
				} as any);
			}
			if (obj && (obj as any).zplType === 'barcode') {
				const scale = Math.max(obj.scaleX || 1, obj.scaleY || 1);
				obj.set({
					scaleX: scale,
					scaleY: scale
				});
			}
		});

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
			strokeUniform: true,
			snapAngle: 90
		});
		(rectObj as any).zplType = 'rectangle';
		(rectObj as any).zplRounding = 0;
		fabricCanvas.add(rectObj);
		fabricCanvas.setActiveObject(rectObj);
	}

	function addCircle(x = 50, y = 50, r = 50) {
		if (!fabricCanvas) return;
		const circleObj = new fabric.Circle({
			left: x,
			top: y,
			radius: r,
			fill: 'transparent',
			stroke: '#000000',
			strokeWidth: 4,
			strokeUniform: true,
			lockUniScaling: true,
			snapAngle: 90
		});
		(circleObj as any).zplType = 'circle';
		fabricCanvas.add(circleObj);
		fabricCanvas.setActiveObject(circleObj);
	}

	const lineControls = {
		p1: new fabric.Control({
			x: -0.5,
			y: -0.5,
			actionHandler: function(eventData, transform, x, y) {
				const line = transform.target as fabric.Line;
				const canvas = line.canvas;
				if (!canvas) return false;
				
				const pointer = canvas.getPointer(eventData);
				const matrix = line.calcTransformMatrix();
				const p2Abs = fabric.util.transformPoint(
					new fabric.Point(line.x2 || 0, line.y2 || 0),
					matrix
				);
				
				let p1AbsX = pointer.x;
				let p1AbsY = pointer.y;

				// Snap near vertical (same X as p2)
				if (Math.abs(p1AbsX - p2Abs.x) < 15) {
					p1AbsX = p2Abs.x;
				}
				// Snap near horizontal (same Y as p2)
				if (Math.abs(p1AbsY - p2Abs.y) < 15) {
					p1AbsY = p2Abs.y;
				}
				
				const minX = Math.min(p1AbsX, p2Abs.x);
				const minY = Math.min(p1AbsY, p2Abs.y);
				const maxX = Math.max(p1AbsX, p2Abs.x);
				const maxY = Math.max(p1AbsY, p2Abs.y);
				const w = maxX - minX || 1;
				const h = maxY - minY || 1;
				
				const centerX = minX + w / 2;
				const centerY = minY + h / 2;
				
				line.set({
					left: centerX,
					top: centerY,
					width: w,
					height: h,
					scaleX: 1,
					scaleY: 1,
					angle: 0
				});
				line.x1 = p1AbsX - centerX;
				line.y1 = p1AbsY - centerY;
				line.x2 = p2Abs.x - centerX;
				line.y2 = p2Abs.y - centerY;
				
				line.setCoords();
				updateZPL();
				canvas.requestRenderAll();
				return true;
			},
			cursorStyle: 'pointer',
			render: function(ctx, left, top, styleOverride, fabricObject) {
				ctx.save();
				ctx.beginPath();
				ctx.arc(left, top, 6, 0, 2 * Math.PI, false);
				ctx.fillStyle = '#3b82f6';
				ctx.fill();
				ctx.lineWidth = 2;
				ctx.strokeStyle = '#ffffff';
				ctx.stroke();
				ctx.restore();
			},
			positionHandler: function(dim, finalMatrix, fabricObject) {
				const line = fabricObject as fabric.Line;
				return fabric.util.transformPoint(
					new fabric.Point(line.x1 || 0, line.y1 || 0),
					finalMatrix
				);
			}
		}),
		p2: new fabric.Control({
			x: 0.5,
			y: 0.5,
			actionHandler: function(eventData, transform, x, y) {
				const line = transform.target as fabric.Line;
				const canvas = line.canvas;
				if (!canvas) return false;
				
				const pointer = canvas.getPointer(eventData);
				const matrix = line.calcTransformMatrix();
				const p1Abs = fabric.util.transformPoint(
					new fabric.Point(line.x1 || 0, line.y1 || 0),
					matrix
				);
				
				let p2AbsX = pointer.x;
				let p2AbsY = pointer.y;
				
				// Snap near vertical (same X as p1)
				if (Math.abs(p2AbsX - p1Abs.x) < 15) {
					p2AbsX = p1Abs.x;
				}
				// Snap near horizontal (same Y as p1)
				if (Math.abs(p2AbsY - p1Abs.y) < 15) {
					p2AbsY = p1Abs.y;
				}
				
				const minX = Math.min(p1Abs.x, p2AbsX);
				const minY = Math.min(p1Abs.y, p2AbsY);
				const maxX = Math.max(p1Abs.x, p2AbsX);
				const maxY = Math.max(p1Abs.y, p2AbsY);
				const w = maxX - minX || 1;
				const h = maxY - minY || 1;
				
				const centerX = minX + w / 2;
				const centerY = minY + h / 2;
				
				line.set({
					left: centerX,
					top: centerY,
					width: w,
					height: h,
					scaleX: 1,
					scaleY: 1,
					angle: 0
				});
				line.x1 = p1Abs.x - centerX;
				line.y1 = p1Abs.y - centerY;
				line.x2 = p2AbsX - centerX;
				line.y2 = p2AbsY - centerY;
				
				line.setCoords();
				updateZPL();
				canvas.requestRenderAll();
				return true;
			},
			cursorStyle: 'pointer',
			render: function(ctx, left, top, styleOverride, fabricObject) {
				ctx.save();
				ctx.beginPath();
				ctx.arc(left, top, 6, 0, 2 * Math.PI, false);
				ctx.fillStyle = '#3b82f6';
				ctx.fill();
				ctx.lineWidth = 2;
				ctx.strokeStyle = '#ffffff';
				ctx.stroke();
				ctx.restore();
			},
			positionHandler: function(dim, finalMatrix, fabricObject) {
				const line = fabricObject as fabric.Line;
				return fabric.util.transformPoint(
					new fabric.Point(line.x2 || 0, line.y2 || 0),
					finalMatrix
				);
			}
		})
	};

	function centerLine(line: fabric.Line) {
		const matrix = line.calcTransformMatrix();
		const p1Abs = fabric.util.transformPoint(
			new fabric.Point(line.x1 || 0, line.y1 || 0),
			matrix
		);
		const p2Abs = fabric.util.transformPoint(
			new fabric.Point(line.x2 || 0, line.y2 || 0),
			matrix
		);
		
		const minX = Math.min(p1Abs.x, p2Abs.x);
		const minY = Math.min(p1Abs.y, p2Abs.y);
		const maxX = Math.max(p1Abs.x, p2Abs.x);
		const maxY = Math.max(p1Abs.y, p2Abs.y);
		const w = maxX - minX || 1;
		const h = maxY - minY || 1;
		
		const centerX = minX + w / 2;
		const centerY = minY + h / 2;
		
		line.set({
			left: centerX,
			top: centerY,
			originX: 'center',
			originY: 'center',
			width: w,
			height: h,
			scaleX: 1,
			scaleY: 1,
			angle: 0
		});
		line.x1 = p1Abs.x - centerX;
		line.y1 = p1Abs.y - centerY;
		line.x2 = p2Abs.x - centerX;
		line.y2 = p2Abs.y - centerY;
		
		line.setCoords();
	}

	function addLine(x = 50, y = 50, w = 150, h = 150) {
		if (!fabricCanvas) return;
		const lineObj = new fabric.Line([-w / 2, -h / 2, w / 2, h / 2], {
			left: x + w / 2,
			top: y + h / 2,
			originX: 'center',
			originY: 'center',
			stroke: '#000000',
			strokeWidth: 4,
			strokeUniform: true,
			hasRotatingPoint: false,
			lockRotation: true,
			hasBorders: false
		});
		(lineObj as any).zplType = 'line';
		lineObj.controls = lineControls;
		fabricCanvas.add(lineObj);
		fabricCanvas.setActiveObject(lineObj);
	}

	function updateLineSize(w: number, h: number) {
		if (!activeObject || (activeObject as any).zplType !== 'line') return;
		activeObject.set({
			width: w,
			height: h,
			scaleX: 1,
			scaleY: 1
		});
		(activeObject as fabric.Line).x1 = -w / 2;
		(activeObject as fabric.Line).y1 = -h / 2;
		(activeObject as fabric.Line).x2 = w / 2;
		(activeObject as fabric.Line).y2 = h / 2;
		activeObject.setCoords();
		fabricCanvas?.renderAll();
		updateZPL();
	}

	function updateRectangleProp(key: 'width' | 'height', val: number) {
		if (!activeObject || (activeObject as any).zplType !== 'rectangle') return;
		activeObject.set(key, val);
		if (key === 'width') {
			activeObject.set('scaleX', 1);
		} else {
			activeObject.set('scaleY', 1);
		}

		const roundingVal = (activeObject as any).zplRounding || 0;
		const w = (activeObject.width || 0) * (activeObject.scaleX || 1);
		const h = (activeObject.height || 0) * (activeObject.scaleY || 1);
		const rx = (roundingVal / 8) * (Math.min(w, h) / 2);

		activeObject.set({
			rx: rx / (activeObject.scaleX || 1),
			ry: rx / (activeObject.scaleY || 1)
		});

		activeObject.setCoords();
		fabricCanvas?.renderAll();
		updateZPL();
	}

	function updateRectangleRounding(rounding: number) {
		if (!activeObject || (activeObject as any).zplType !== 'rectangle') return;
		(activeObject as any).zplRounding = rounding;

		const w = (activeObject.width || 0) * (activeObject.scaleX || 1);
		const h = (activeObject.height || 0) * (activeObject.scaleY || 1);
		const rx = (rounding / 8) * (Math.min(w, h) / 2);

		activeObject.set({
			rx: rx / (activeObject.scaleX || 1),
			ry: rx / (activeObject.scaleY || 1)
		});

		fabricCanvas?.renderAll();
		updateZPL();
	}

	async function addBarcode(text = 'BARCODE', x = 50, y = 50, format: BarcodeFormat = 'QR') {
		if (!fabricCanvas) return;
		const dataUrl = await renderBarcodeDataUrl(text, format);

		fabric.Image.fromURL(dataUrl, (img) => {
			img.set({
				left: x,
				top: y,
				snapAngle: 90,
				lockUniScaling: true
			});
			img.setControlsVisibility({
				mt: false,
				mb: false,
				ml: false,
				mr: false
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

	function applyPreset(w: number, h: number, presetDpi: number) {
		width = w;
		height = h;
		dpi = presetDpi;
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

	function handleKeyDown(e: KeyboardEvent) {
		if (!fabricCanvas || !activeObject) return;

		// Guard: Ignore if user is typing in an input/textarea/select element on the page
		const activeEl = document.activeElement;
		if (activeEl) {
			const tagName = activeEl.tagName.toLowerCase();
			if (
				tagName === 'input' ||
				tagName === 'textarea' ||
				tagName === 'select' ||
				activeEl.hasAttribute('contenteditable') ||
				activeEl.getAttribute('contenteditable') === 'true'
			) {
				return;
			}
		}

		// Guard: Ignore if active fabric object is in text-editing mode
		if (activeObject.isEditing) {
			return;
		}

		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			deleteSelected();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

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

				<button class="tool-btn" onclick={() => addCircle()}>
					<span class="icon">○</span>
					<span>Circle</span>
				</button>

				<button class="tool-btn" onclick={() => addLine()}>
					<span class="icon">╱</span>
					<span>Line</span>
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

				{#if activeObject.zplType === 'rectangle'}
					<div class="prop-grid">
						<label>
							<span>Width (dots):</span>
							<input
								type="number"
								value={Math.round((activeObject.width || 0) * (activeObject.scaleX || 1))}
								oninput={(e) => updateRectangleProp('width', parseFloat(e.currentTarget.value))}
							/>
						</label>
						<label>
							<span>Height (dots):</span>
							<input
								type="number"
								value={Math.round((activeObject.height || 0) * (activeObject.scaleY || 1))}
								oninput={(e) => updateRectangleProp('height', parseFloat(e.currentTarget.value))}
							/>
						</label>
					</div>

					<div class="prop-field">
						<label>
							<span>Corner Rounding (0-8):</span>
							<div style="display: flex; align-items: center; gap: 0.5rem;">
								<input
									type="range"
									min="0"
									max="8"
									step="1"
									value={(activeObject as any).zplRounding || 0}
									oninput={(e) => updateRectangleRounding(parseInt(e.currentTarget.value))}
									style="flex: 1;"
								/>
								<span class="zoom-val" style="min-width: 1rem; text-align: right;"
									>{(activeObject as any).zplRounding || 0}</span
								>
							</div>
						</label>
					</div>
				{/if}

				{#if activeObject.zplType === 'circle'}
					<div class="prop-field">
						<label>
							<span>Diameter (dots):</span>
							<input
								type="number"
								value={Math.round((activeObject.radius || 0) * 2 * (activeObject.scaleX || 1))}
								oninput={(e) => {
									const d = parseFloat(e.currentTarget.value);
									activeObject.set({
										radius: d / 2,
										scaleX: 1,
										scaleY: 1
									});
									activeObject.setCoords();
									fabricCanvas?.renderAll();
									updateZPL();
								}}
							/>
						</label>
					</div>
				{/if}

				{#if activeObject.zplType === 'line'}
					<div class="prop-grid">
						<label>
							<span>Width (dots):</span>
							<input
								type="number"
								value={Math.round((activeObject.width || 0) * (activeObject.scaleX || 1))}
								oninput={(e) => {
									const w = parseFloat(e.currentTarget.value);
									updateLineSize(w, (activeObject.height || 0) * (activeObject.scaleY || 1));
								}}
							/>
						</label>
						<label>
							<span>Height (dots):</span>
							<input
								type="number"
								value={Math.round((activeObject.height || 0) * (activeObject.scaleY || 1))}
								oninput={(e) => {
									const h = parseFloat(e.currentTarget.value);
									updateLineSize((activeObject.width || 0) * (activeObject.scaleX || 1), h);
								}}
							/>
						</label>
					</div>
				{/if}

				{#if activeObject.zplType === 'rectangle' || activeObject.zplType === 'circle' || activeObject.zplType === 'line'}
					<div class="prop-field">
						<label>
							<span>Line Thickness (dots):</span>
							<input
								type="number"
								min="1"
								max="50"
								value={activeObject.strokeWidth || 4}
								oninput={(e) => updateActiveProp('strokeWidth', parseInt(e.currentTarget.value))}
							/>
						</label>
					</div>
				{/if}
			{:else}
				<div class="no-selection">
					<p>Select an item on the canvas to inspect and edit its properties.</p>

					<div class="presets-section">
						<h4>Presets</h4>
						<div class="presets-grid">
							<button
								class="preset-btn"
								class:active={width === 4 && height === 6}
								onclick={() => applyPreset(4.0, 6.0, 300)}
							>
								4" × 6" Shipping
							</button>
							<button
								class="preset-btn"
								class:active={width === 2 && height === 1}
								onclick={() => applyPreset(2.0, 1.0, 300)}
							>
								2" × 1" Product
							</button>
							<button
								class="preset-btn"
								class:active={width === 3 && height === 2}
								onclick={() => applyPreset(3.0, 2.0, 300)}
							>
								3" × 2" Inventory
							</button>
						</div>
					</div>

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
		font-family:
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
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

	input,
	select {
		background: #0f172a;
		border: 1px solid #334155;
		color: #f8fafc;
		padding: 0.35rem 0.6rem;
		border-radius: 0.375rem;
		font-size: 0.85rem;
	}

	input:focus,
	select:focus {
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
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.5),
			0 8px 10px -6px rgba(0, 0, 0, 0.5);
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

	.prop-grid label,
	.prop-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: #94a3b8;
	}

	.prop-field input,
	.prop-field select {
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

	.presets-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.presets-section h4 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #94a3b8;
		margin: 0;
	}

	.presets-grid {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.preset-btn {
		background: #0f172a;
		border: 1px solid #334155;
		color: #94a3b8;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.8rem;
		text-align: left;
		transition: all 0.15s ease;
		width: 100%;
	}

	.preset-btn:hover {
		color: #f8fafc;
		border-color: #3b82f6;
	}

	.preset-btn.active {
		background: #3b82f6;
		color: #ffffff;
		border-color: #3b82f6;
		font-weight: 600;
	}
</style>
