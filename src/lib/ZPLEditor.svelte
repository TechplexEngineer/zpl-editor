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
	let forceRender = $state(0);
	let copiedNotification = $state(false);
	let historyStack = $state<EditorSnapshot[]>([]);
	let historyIndex = $state(-1);
	let isRestoringHistory = $state(false);
	let hasInitializedHistory = false;
	let suppressHistory = false;
	let nextHistoryId = 0;
	let lastLabelConfig = `${width}:${height}:${dpi}`;

	type EditorSnapshot = {
		width: number;
		height: number;
		dpi: number;
		activeObjectId: string | null;
		canvas: ReturnType<fabric.Canvas['toJSON']>;
	};

	const HISTORY_LIMIT = 100;
	const SERIALIZATION_PROPS = [
		'zplType',
		'zplRounding',
		'zplData',
		'barcodeFormat',
		'zplGFData',
		'historyId'
	];

	// Calculated label dot dimensions
	let pwDots = $derived(inchesToDots(width, dpi));
	let llDots = $derived(inchesToDots(height, dpi));

	// Synchronize Fabric canvas size when props change
	$effect(() => {
		const w = pwDots;
		const h = llDots;
		if (fabricCanvas) {
			const nextLabelConfig = `${width}:${height}:${dpi}`;
			if (nextLabelConfig === lastLabelConfig) {
				return;
			}
			lastLabelConfig = nextLabelConfig;
			syncCanvasDimensions(w, h);
			updateZPL();
			if (hasInitializedHistory && !suppressHistory) {
				pushHistorySnapshot();
			}
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
		fabric.Object.prototype.snapThreshold = 45;

		// Attach events
		fabricCanvas.on('selection:created', handleSelection);
		fabricCanvas.on('selection:updated', handleSelection);
		fabricCanvas.on('selection:cleared', () => {
			activeObject = null;
		});

		fabricCanvas.on('object:rotating', (e) => {
			if (e.target && e.target.angle !== undefined) {
				e.target.angle = Math.round(e.target.angle / 90) * 90;
			}
		});
		fabricCanvas.on('object:moving', (e) => {
			const obj = e.target;
			if (obj) {
				obj.set({
					left: Math.round(obj.left || 0),
					top: Math.round(obj.top || 0)
				});
			}
		});

		fabricCanvas.on('object:modified', (e) => {
			const obj = e.target;
			if (obj && (obj as any).zplType === 'line') {
				centerLine(obj as fabric.Line);
			}
			updateZPL();
			pushHistorySnapshot();
		});
		fabricCanvas.on('object:added', (e) => {
			if (e.target) {
				ensureHistoryId(e.target);
			}
			updateZPL();
			pushHistorySnapshot();
		});
		fabricCanvas.on('object:removed', updateZPL);
		fabricCanvas.on('text:changed', () => {
			updateZPL();
			pushHistorySnapshot();
		});
		fabricCanvas.on('object:scaling', (e) => {
			const obj = e.target;
			if (!obj) return;

			if ((obj as any).zplType === 'barcode') {
				const scale = Math.max(1, Math.round(Math.max(obj.scaleX || 1, obj.scaleY || 1)));
				obj.set({
					scaleX: scale,
					scaleY: scale
				});
			} else {
				// Snap the visual width and height to integer pixels
				if (obj.width && obj.scaleX) {
					const targetWidth = Math.round(obj.width * obj.scaleX);
					obj.set('scaleX', targetWidth / obj.width);
				}
				if (obj.height && obj.scaleY) {
					const targetHeight = Math.round(obj.height * obj.scaleY);
					obj.set('scaleY', targetHeight / obj.height);
				}
			}

			if ((obj as any).zplType === 'rectangle') {
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
		});

		// Add default sample elements
		void initializeHistoryState();

		return () => {
			fabricCanvas?.dispose();
			fabricCanvas = null;
		};
	});

	function handleSelection(e: any) {
		activeObject = fabricCanvas?.getActiveObject() || null;
	}

	function syncCanvasDimensions(w = pwDots, h = llDots) {
		if (!fabricCanvas) return;
		fabricCanvas.setDimensions({ width: w, height: h });
		fabricCanvas.calcOffset();
		fabricCanvas.renderAll();
	}

	function applyLabelSettings(nextWidth = width, nextHeight = height, nextDpi = dpi) {
		if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || !Number.isFinite(nextDpi)) {
			return;
		}
		width = nextWidth;
		height = nextHeight;
		dpi = nextDpi;
		lastLabelConfig = `${width}:${height}:${dpi}`;
		syncCanvasDimensions(inchesToDots(width, dpi), inchesToDots(height, dpi));
		updateZPL();
		if (hasInitializedHistory && !suppressHistory) {
			pushHistorySnapshot();
		}
	}

	function ensureHistoryId(obj: fabric.Object) {
		if (!(obj as any).historyId) {
			(obj as any).historyId = `obj-${nextHistoryId++}`;
		}
	}

	function buildSnapshot(): EditorSnapshot | null {
		if (!fabricCanvas) return null;

		const currentActiveObject = fabricCanvas.getActiveObject();
		if (currentActiveObject) {
			ensureHistoryId(currentActiveObject);
		}

		return {
			width,
			height,
			dpi,
			activeObjectId: ((currentActiveObject as any)?.historyId as string | undefined) ?? null,
			canvas: fabricCanvas.toJSON(SERIALIZATION_PROPS)
		};
	}

	function pushHistorySnapshot({ reset = false }: { reset?: boolean } = {}) {
		if (!fabricCanvas || suppressHistory) return;

		const snapshot = buildSnapshot();
		if (!snapshot) return;

		const serializedSnapshot = JSON.stringify(snapshot);
		const currentSnapshot = historyStack[historyIndex];
		if (!reset && currentSnapshot && JSON.stringify(currentSnapshot) === serializedSnapshot) {
			return;
		}

		if (reset) {
			historyStack = [snapshot];
			historyIndex = 0;
			hasInitializedHistory = true;
			return;
		}

		const nextHistory = [...historyStack.slice(0, historyIndex + 1), snapshot];
		if (nextHistory.length > HISTORY_LIMIT) {
			nextHistory.splice(0, nextHistory.length - HISTORY_LIMIT);
		}

		historyStack = nextHistory;
		historyIndex = historyStack.length - 1;
	}

	function rehydrateCanvasObjects() {
		if (!fabricCanvas) return;

		for (const obj of fabricCanvas.getObjects()) {
			ensureHistoryId(obj);

			if ((obj as any).zplType === 'line') {
				const line = obj as fabric.Line;
				line.controls = lineControls;
				line.set({
					lockRotation: true,
					hasRotatingPoint: false,
					hasBorders: false,
					strokeUniform: true
				});
			}

			if ((obj as any).zplType === 'barcode') {
				const image = obj as fabric.Image;
				image.set({ lockUniScaling: true });
				image.setControlsVisibility({
					mt: false,
					mb: false,
					ml: false,
					mr: false
				});
			}
		}
	}

	function restoreActiveObject(activeObjectId: string | null) {
		if (!fabricCanvas || !activeObjectId) {
			fabricCanvas?.discardActiveObject();
			activeObject = null;
			return;
		}

		const restoredObject = fabricCanvas
			.getObjects()
			.find((obj) => (obj as any).historyId === activeObjectId);

		if (restoredObject) {
			fabricCanvas.setActiveObject(restoredObject);
			activeObject = restoredObject;
			return;
		}

		fabricCanvas.discardActiveObject();
		activeObject = null;
	}

	async function restoreHistorySnapshot(targetIndex: number) {
		if (!fabricCanvas || targetIndex < 0 || targetIndex >= historyStack.length || isRestoringHistory) {
			return;
		}

		const snapshot = historyStack[targetIndex];
		const canvas = fabricCanvas;
		historyIndex = targetIndex;
		isRestoringHistory = true;
		suppressHistory = true;

		width = snapshot.width;
		height = snapshot.height;
		dpi = snapshot.dpi;
		lastLabelConfig = `${snapshot.width}:${snapshot.height}:${snapshot.dpi}`;

		try {
			syncCanvasDimensions(
				inchesToDots(snapshot.width, snapshot.dpi),
				inchesToDots(snapshot.height, snapshot.dpi)
			);

			await new Promise<void>((resolve) => {
				canvas.loadFromJSON(snapshot.canvas, () => {
					rehydrateCanvasObjects();
					restoreActiveObject(snapshot.activeObjectId);
					canvas.calcOffset();
					canvas.requestRenderAll();
					updateZPL();
					resolve();
				});
			});
		} finally {
			suppressHistory = false;
			isRestoringHistory = false;
		}
	}

	async function undo() {
		if (historyIndex <= 0) return;
		await restoreHistorySnapshot(historyIndex - 1);
	}

	async function redo() {
		if (historyIndex >= historyStack.length - 1) return;
		await restoreHistorySnapshot(historyIndex + 1);
	}

	async function initializeHistoryState() {
		suppressHistory = true;
		addText('Sample Label', 100, 100, 48, 280);
		await addBarcode('https://example.com', 100, 200, 'QR');
		suppressHistory = false;
		pushHistorySnapshot({ reset: true });
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
		forceRender++;
	}

	function commitCanvasChanges() {
		fabricCanvas?.renderAll();
		updateZPL();
		pushHistorySnapshot();
	}

	function addText(content = 'Text', x = 50, y = 50, size = 36, width = 200) {
		if (!fabricCanvas) return;
		const textObj = new fabric.Textbox(content, {
			left: x,
			top: y,
			fontSize: size,
			fontFamily: 'CG Triumvirate, Helvetica, Arial, sans-serif',
			fill: '#000000',
			snapAngle: 90,
			width: width,
		});
		(textObj as any).zplType = 'text';
		ensureHistoryId(textObj);
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
			noScaleCache: false,
			snapAngle: 90
		});
		(rectObj as any).zplType = 'rectangle';
		(rectObj as any).zplRounding = 0;
		ensureHistoryId(rectObj);
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
			noScaleCache: false,
			snapAngle: 90
		});
		(circleObj as any).zplType = 'circle';
		ensureHistoryId(circleObj);
		fabricCanvas.add(circleObj);
		fabricCanvas.setActiveObject(circleObj);
	}

	const lineControls = {
		p1: new fabric.Control({
			x: -0.5,
			y: -0.5,
			actionHandler: function (eventData, transform, x, y) {
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
				
				const dx = p2Abs.x - p1AbsX;
				const dy = p2Abs.y - p1AbsY;
				const w = Math.sqrt(dx * dx + dy * dy) || 1;
				const angle = Math.atan2(dy, dx) * 180 / Math.PI;
				
				const centerX = (p1AbsX + p2Abs.x) / 2;
				const centerY = (p1AbsY + p2Abs.y) / 2;
				
				line.set({
					x1: -w / 2,
					y1: 0,
					x2: w / 2,
					y2: 0,
					width: w,
					height: 1, // Minimal height to avoid bounding box issues
					left: centerX,
					top: centerY,
					angle: angle,
					scaleX: 1,
					scaleY: 1
				} as any);
				line.dirty = true;
				
				line.setCoords();
				updateZPL();
				canvas.requestRenderAll();
				return true;
			},
			cursorStyle: 'pointer',
			render: function (ctx, left, top, styleOverride, fabricObject) {
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
			positionHandler: function (dim, finalMatrix, fabricObject) {
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
			actionHandler: function (eventData, transform, x, y) {
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
				
				const dx = p2AbsX - p1Abs.x;
				const dy = p2AbsY - p1Abs.y;
				const w = Math.sqrt(dx * dx + dy * dy) || 1;
				const angle = Math.atan2(dy, dx) * 180 / Math.PI;
				
				const centerX = (p1Abs.x + p2AbsX) / 2;
				const centerY = (p1Abs.y + p2AbsY) / 2;
				
				line.set({
					x1: -w / 2,
					y1: 0,
					x2: w / 2,
					y2: 0,
					width: w,
					height: 1,
					left: centerX,
					top: centerY,
					angle: angle,
					scaleX: 1,
					scaleY: 1
				} as any);
				line.dirty = true;
				
				line.setCoords();
				updateZPL();
				canvas.requestRenderAll();
				return true;
			},
			cursorStyle: 'pointer',
			render: function (ctx, left, top, styleOverride, fabricObject) {
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
			positionHandler: function (dim, finalMatrix, fabricObject) {
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
		
		const dx = p2Abs.x - p1Abs.x;
		const dy = p2Abs.y - p1Abs.y;
		const w = Math.sqrt(dx * dx + dy * dy) || 1;
		const angle = Math.atan2(dy, dx) * 180 / Math.PI;
		
		const centerX = (p1Abs.x + p2Abs.x) / 2;
		const centerY = (p1Abs.y + p2Abs.y) / 2;
		
		line.set({
			x1: -w / 2,
			y1: 0,
			x2: w / 2,
			y2: 0,
			left: centerX,
			top: centerY,
			originX: 'center',
			originY: 'center',
			width: w,
			height: 1,
			scaleX: 1,
			scaleY: 1,
			angle: angle
		} as any);
		line.dirty = true;
		
		line.setCoords();
	}

	function addLine(x = 50, y = 50, w = 150, h = 150) {
		if (!fabricCanvas) return;
		const dx = w;
		const dy = h;
		const length = Math.sqrt(dx * dx + dy * dy);
		const angle = Math.atan2(dy, dx) * 180 / Math.PI;

		const lineObj = new fabric.Line([-length / 2, 0, length / 2, 0], {
			left: x + w / 2,
			top: y + h / 2,
			originX: 'center',
			originY: 'center',
			stroke: '#000000',
			strokeWidth: 4,
			strokeUniform: true,
			hasRotatingPoint: false,
			lockRotation: true,
			hasBorders: false,
			angle: angle,
			width: length,
			height: 1
		});
		(lineObj as any).zplType = 'line';
		ensureHistoryId(lineObj);
		lineObj.controls = lineControls;
		fabricCanvas.add(lineObj);
		fabricCanvas.setActiveObject(lineObj);
	}

	function updateLineSize(w: number, h: number) {
		if (!activeObject || (activeObject as any).zplType !== 'line') return;
		
		const length = Math.sqrt(w * w + h * h) || 1;
		const angle = Math.atan2(h, w) * 180 / Math.PI;

		activeObject.set({
			x1: -length / 2,
			y1: 0,
			x2: length / 2,
			y2: 0,
			width: length,
			height: 1,
			angle: angle,
			scaleX: 1,
			scaleY: 1
		} as any);
		
		activeObject.dirty = true;
		activeObject.setCoords();
		commitCanvasChanges();
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
		commitCanvasChanges();
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

		commitCanvasChanges();
	}

	async function addBarcode(text = 'BARCODE', x = 50, y = 50, format: BarcodeFormat = 'QR') {
		if (!fabricCanvas) return;
		const dataUrl = await renderBarcodeDataUrl(text, format);

		await new Promise<void>((resolve) => {
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
				ensureHistoryId(img);

				fabricCanvas?.add(img);
				fabricCanvas?.setActiveObject(img);
				updateZPL();
				resolve();
			});
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
				const MAX_DIM = 800;
				let w = imgObj.width;
				let h = imgObj.height;
				if (w > MAX_DIM || h > MAX_DIM) {
					const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
					w = Math.round(w * ratio);
					h = Math.round(h * ratio);
				}

				const tempCanvas = document.createElement('canvas');
				tempCanvas.width = w;
				tempCanvas.height = h;
				const ctx = tempCanvas.getContext('2d')!;
				ctx.drawImage(imgObj, 0, 0, w, h);

				const originalImgData = ctx.getImageData(0, 0, w, h);
				const defaultThreshold = 128;
				const gfHex = rgbaToZplGF(originalImgData.data, w, h, defaultThreshold);

				const binarizedImgData = new ImageData(new Uint8ClampedArray(originalImgData.data), w, h);
				for (let i = 0; i < binarizedImgData.data.length; i += 4) {
					const r = binarizedImgData.data[i];
					const g = binarizedImgData.data[i + 1];
					const b = binarizedImgData.data[i + 2];
					const a = binarizedImgData.data[i + 3];
					const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
					const isBlack = a > 128 && luminance < defaultThreshold;
					const val = isBlack ? 0 : 255;
					binarizedImgData.data[i] = val;
					binarizedImgData.data[i + 1] = val;
					binarizedImgData.data[i + 2] = val;
					binarizedImgData.data[i + 3] = a > 128 ? 255 : 0;
				}
				ctx.putImageData(binarizedImgData, 0, 0);

				fabric.Image.fromURL(tempCanvas.toDataURL(), (fImg) => {
					fImg.set({
						left: 50,
						top: 50,
						snapAngle: 90
					});
					(fImg as any).zplType = 'image';
					(fImg as any).zplGFData = gfHex;
					ensureHistoryId(fImg);
					(fImg as any).zplOriginalImgData = originalImgData;
					(fImg as any).zplThreshold = defaultThreshold;

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
		suppressHistory = true;
		fabricCanvas.remove(activeObject);
		fabricCanvas.discardActiveObject();
		activeObject = null;
		suppressHistory = false;
		updateZPL();
		pushHistorySnapshot();
	}

	function copyZPL() {
		navigator.clipboard.writeText(zpl);
		copiedNotification = true;
		setTimeout(() => {
			copiedNotification = false;
		}, 2000);
	}

	function downloadZPL() {
		const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
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

	function applyPreset(w: number, h: number, presetDpi: number) {
		applyLabelSettings(w, h, presetDpi);
	}

	// Active Object Property Handlers
	function updateActiveProp(key: string, value: any) {
		if (!activeObject || !fabricCanvas) return;
		activeObject.set(key, value);
		// Force Svelte 5 reactivity proxy to register the update
		activeObject[key] = value;
		activeObject.setCoords();
		commitCanvasChanges();
	}

	async function updateBarcodeFormat(newFormat: BarcodeFormat) {
		if (!activeObject || (activeObject as any).zplType !== 'barcode') return;
		(activeObject as any).barcodeFormat = newFormat;
		const text = (activeObject as any).zplData || 'BARCODE';
		const newDataUrl = await renderBarcodeDataUrl(text, newFormat);
		activeObject.setSrc(newDataUrl, () => {
			commitCanvasChanges();
		});
	}

	async function updateBarcodeText(newText: string) {
		if (!activeObject || (activeObject as any).zplType !== 'barcode') return;
		(activeObject as any).zplData = newText;
		const format = (activeObject as any).barcodeFormat || 'QR';
		const newDataUrl = await renderBarcodeDataUrl(newText, format);
		activeObject.setSrc(newDataUrl, () => {
			commitCanvasChanges();
		});
	}

	function updateImageThreshold(newThreshold: number) {
		if (!activeObject || (activeObject as any).zplType !== 'image') return;
		
		const originalImgData = (activeObject as any).zplOriginalImgData;
		if (!originalImgData) return;

		(activeObject as any).zplThreshold = newThreshold;
		
		const w = originalImgData.width;
		const h = originalImgData.height;
		
		const gfHex = rgbaToZplGF(originalImgData.data, w, h, newThreshold);
		(activeObject as any).zplGFData = gfHex;

		const binarizedImgData = new ImageData(new Uint8ClampedArray(originalImgData.data), w, h);
		for (let i = 0; i < binarizedImgData.data.length; i += 4) {
			const r = binarizedImgData.data[i];
			const g = binarizedImgData.data[i + 1];
			const b = binarizedImgData.data[i + 2];
			const a = binarizedImgData.data[i + 3];
			const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
			const isBlack = a > 128 && luminance < newThreshold;
			const val = isBlack ? 0 : 255;
			binarizedImgData.data[i] = val;
			binarizedImgData.data[i + 1] = val;
			binarizedImgData.data[i + 2] = val;
			binarizedImgData.data[i + 3] = a > 128 ? 255 : 0;
		}

		const tempCanvas = document.createElement('canvas');
		tempCanvas.width = w;
		tempCanvas.height = h;
		const ctx = tempCanvas.getContext('2d')!;
		ctx.putImageData(binarizedImgData, 0, 0);

		activeObject.setSrc(tempCanvas.toDataURL(), () => {
			fabricCanvas?.renderAll();
			updateZPL();
		});
	}

	function handleKeyDown(e: KeyboardEvent) {
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

		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) {
				void redo();
			} else {
				void undo();
			}
			return;
		}

		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			void redo();
			return;
		}

		if (!fabricCanvas || !activeObject) return;

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
				<input
					type="number"
					step="0.25"
					min="0.5"
					max="12"
					value={width}
					onchange={(e) => applyLabelSettings(parseFloat(e.currentTarget.value), height, dpi)}
				/>
			</label>

			<label class="control-group">
				<span>Height (in):</span>
				<input
					type="number"
					step="0.25"
					min="0.5"
					max="12"
					value={height}
					onchange={(e) => applyLabelSettings(width, parseFloat(e.currentTarget.value), dpi)}
				/>
			</label>

			<label class="control-group">
				<span>DPI:</span>
				<select value={dpi} onchange={(e) => applyLabelSettings(width, height, parseInt(e.currentTarget.value))}>
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
			<button
				class="btn btn-secondary"
				onclick={() => void undo()}
				disabled={historyIndex <= 0 || isRestoringHistory}
				title="Undo (Ctrl/Cmd+Z)"
			>
				Undo
			</button>
			<button
				class="btn btn-secondary"
				onclick={() => void redo()}
				disabled={historyIndex >= historyStack.length - 1 || isRestoringHistory}
				title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
			>
				Redo
			</button>
			<button class="btn btn-secondary" onclick={downloadZPL}>
				Download ZPL
			</button>
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

				{#if activeObject.zplType === 'text' || activeObject.type === 'i-text' || activeObject.type === 'textbox'}
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

					<div class="prop-grid">
						<label>
							<span>Font Size (pt):</span>
							<input
								type="number"
								value={activeObject.fontSize || 36}
								oninput={(e) => updateActiveProp('fontSize', parseInt(e.currentTarget.value))}
							/>
						</label>
						<label>
							<span>Block Width:</span>
							<input
								type="number"
								value={Math.round((activeObject.width || 0) * (activeObject.scaleX || 1))}
								oninput={(e) => {
									const w = parseFloat(e.currentTarget.value);
									activeObject.set('width', w / (activeObject.scaleX || 1));
									activeObject.setCoords();
									commitCanvasChanges();
								}}
							/>
						</label>
					</div>

					<fieldset class="prop-field align-fieldset">
						<legend>Alignment (ZPL FB Block):</legend>
						<div class="align-group">
							<button class="align-btn" class:active={forceRender > -1 && (!activeObject.textAlign || activeObject.textAlign === 'left')} onclick={() => updateActiveProp('textAlign', 'left')} title="Left">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2V3zm0 4h8v2H2V7zm0 4h12v2H2v-2z"/></svg>
							</button>
							<button class="align-btn" class:active={forceRender > -1 && activeObject.textAlign === 'center'} onclick={() => updateActiveProp('textAlign', 'center')} title="Center">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2V3zm2 4h8v2H4V7zm-2 4h12v2H2v-2z"/></svg>
							</button>
							<button class="align-btn" class:active={forceRender > -1 && activeObject.textAlign === 'right'} onclick={() => updateActiveProp('textAlign', 'right')} title="Right">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2V3zm4 4h8v2H6V7zm-4 4h12v2H2v-2z"/></svg>
							</button>
							<button class="align-btn" class:active={forceRender > -1 && activeObject.textAlign === 'justify'} onclick={() => updateActiveProp('textAlign', 'justify')} title="Justify">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h12v2H2v-2z"/></svg>
							</button>
						</div>
					</fieldset>
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
									commitCanvasChanges();
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

				{#if activeObject.zplType === 'image'}
					<div class="prop-field">
						<label>
							<span>Threshold (0-255):</span>
							<div style="display: flex; align-items: center; gap: 0.5rem;">
								<input
									type="range"
									min="1"
									max="255"
									step="1"
									value={(activeObject as any).zplThreshold || 128}
									oninput={(e) => updateImageThreshold(parseInt(e.currentTarget.value))}
									style="flex: 1;"
								/>
								<span class="zoom-val" style="min-width: 2rem; text-align: right;"
									>{(activeObject as any).zplThreshold || 128}</span
								>
							</div>
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
	@font-face {
		font-family: 'CG Triumvirate';
		src: url('/triumvirate-cg-comp/triumviratecgcomp.otf') format('opentype');
		font-weight: normal;
		font-style: normal;
		font-display: swap;
	}

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

	.align-fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-inline-size: 0;
	}

	.align-fieldset legend {
		padding: 0;
		margin-bottom: 0.3rem;
		color: inherit;
		font-size: inherit;
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

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.toolbar-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-secondary {
		background: #475569;
		color: #ffffff;
	}

	.btn-secondary:hover {
		background: #334155;
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

	.align-group {
		display: flex;
		gap: 0.25rem;
		background: #0f172a;
		padding: 0.25rem;
		border-radius: 0.375rem;
		border: 1px solid #334155;
	}

	.align-btn {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0.4rem;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.align-btn:hover {
		color: #f8fafc;
		background: #1e293b;
	}

	.align-btn.active {
		background: #334155;
		color: #38bdf8;
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
