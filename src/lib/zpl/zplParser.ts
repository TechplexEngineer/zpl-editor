import type { BarcodeFormat } from './types.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ParsedText {
	type: 'text';
	x: number;
	y: number;
	text: string;
	fontHeight: number;
	fontWidth: number;
	angle: number;
	textAlign: string;
	blockWidth: number | null;
}

export interface ParsedRectangle {
	type: 'rectangle';
	x: number;
	y: number;
	width: number;
	height: number;
	thickness: number;
	rounding: number;
}

export interface ParsedCircle {
	type: 'circle';
	x: number;
	y: number;
	diameter: number;
	thickness: number;
}

export interface ParsedEllipse {
	type: 'ellipse';
	x: number;
	y: number;
	width: number;
	height: number;
	thickness: number;
}

export interface ParsedLine {
	type: 'line';
	x: number;
	y: number;
	width: number;
	height: number;
	thickness: number;
	orientation: 'L' | 'R';
}

export interface ParsedBarcode {
	type: 'barcode';
	x: number;
	y: number;
	data: string;
	format: BarcodeFormat;
	width: number;
	height: number;
	angle: number;
}

export type ParsedElement =
	| ParsedText
	| ParsedRectangle
	| ParsedCircle
	| ParsedEllipse
	| ParsedLine
	| ParsedBarcode;

export interface ParseResult {
	/** Label width in dots (from ^PW), or null if not present. */
	widthDots: number | null;
	/** Label height in dots (from ^LL), or null if not present. */
	heightDots: number | null;
	elements: ParsedElement[];
	/**
	 * Human-readable descriptions of ZPL commands that were encountered but
	 * are not supported by the editor (shown as warnings to the user).
	 */
	unsupportedCommands: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function orientToAngle(orient: string): number {
	switch (orient.toUpperCase()) {
		case 'R':
			return 90;
		case 'I':
			return 180;
		case 'B':
			return 270;
		default:
			return 0;
	}
}

function justToAlign(just: string): string {
	switch (just.toUpperCase()) {
		case 'C':
			return 'center';
		case 'R':
			return 'right';
		case 'J':
			return 'justify';
		default:
			return 'left';
	}
}

/** Extract the 2-character (or 1-character) ZPL command name from a token. */
function cmdOf(token: string): string {
	const m = token.match(/^([A-Z][A-Z0-9])/);
	if (m) return m[1];
	// Fallback: single letter
	const s = token.match(/^([A-Z])/);
	return s ? s[1] : '';
}

// ---------------------------------------------------------------------------
// Commands that are silently skipped — they are printer/media settings that
// carry no canvas geometry and don't need a user warning.
// ---------------------------------------------------------------------------
const SILENT_SKIP = new Set([
	'XA', // label start
	'XZ', // label end
	'PR', // print rate
	'MD', // media darkness
	'PQ', // print quantity
	'PO', // print orientation (^PON / ^POI)
	'FS', // field separator (consumed implicitly)
]);

// Commands that produce canvas elements (used to filter out unknown commands).
const CANVAS_COMMANDS = new Set([
	'PW', 'LL',             // label dimensions
	'FO', 'FT',             // field origin / field typeset
	'CF',                   // change font (default font for subsequent fields)
	'A0',                   // scalable font
	'FB',                   // field block (text alignment)
	'BY',                   // bar width modifier
	'FD',                   // field data
	'GB',                   // graphic box
	'GC',                   // graphic circle
	'GE',                   // graphic ellipse
	'GD',                   // graphic diagonal line
	'BQ',                   // QR code
	'BX',                   // DataMatrix
	'BC',                   // Code 128
	'B3',                   // Code 39
]);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a ZPL string and return structured canvas elements plus a list of
 * unsupported command names (for showing to the user as warnings).
 */
export function parseZPL(zpl: string): ParseResult {
	const result: ParseResult = {
		widthDots: null,
		heightDots: null,
		elements: [],
		unsupportedCommands: [],
	};

	// Normalise line endings, then split on '^' to get individual command tokens.
	const tokens = zpl.replace(/\r/g, '').replace(/\n/g, '').split('^').filter((s) => s.length > 0);

	const warnedCmds = new Set<string>();

	// Per-field state (reset on each ^FO / ^FT)
	let curX = 0;
	let curY = 0;
	// Global default font state (set by ^CF, persists across fields)
	let cfHeight = 36;
	let cfWidth = 0; // 0 means "same as height" per ZPL spec
	let fontHeight = cfHeight;
	let fontWidth = cfHeight;
	let fontOrient = 'N';
	let hasFB = false;
	let blockWidth: number | null = null;
	let blockJust = 'L';
	let barcodeFormat: BarcodeFormat | null = null;
	let barcodeHeight = 100;
	let barcodeWidth = 100;
	let barcodeOrient = 'N';
	let byWidth = 2; // bar width from ^BY, used to estimate rendered width

	function resetFieldState() {
		fontHeight = cfHeight;
		fontWidth = cfWidth || cfHeight;
		fontOrient = 'N';
		hasFB = false;
		blockWidth = null;
		blockJust = 'L';
		barcodeFormat = null;
		barcodeHeight = 100;
		barcodeWidth = 100;
		barcodeOrient = 'N';
	}

	for (const token of tokens) {
		const cmd = cmdOf(token);

		// --- silently skip printer/media commands ---
		if (SILENT_SKIP.has(cmd)) continue;

		// --- label dimensions ---
		if (cmd === 'PW') {
			const m = token.match(/^PW(\d+)/);
			if (m) result.widthDots = parseInt(m[1]);
			continue;
		}
		if (cmd === 'LL') {
			const m = token.match(/^LL(\d+)/);
			if (m) result.heightDots = parseInt(m[1]);
			continue;
		}

		// --- field origin / field typeset ---
		if (cmd === 'FO' || cmd === 'FT') {
			const m = token.match(/^F[OT](\d+),(\d+)/);
			if (m) {
				curX = parseInt(m[1]);
				curY = parseInt(m[2]);
			}
			resetFieldState();
			continue;
		}

		// --- change font (default font for subsequent fields) ---
		if (cmd === 'CF') {
			// ^CF<font>,<h>,<w>  — font is 0–9 or A–Z
			const m = token.match(/^CF[0-9A-Z],(\d+),?(\d*)/);
			if (m) {
				cfHeight = parseInt(m[1]);
				cfWidth = m[2] ? parseInt(m[2]) : 0;
				// Also update current field font so a ^CF before ^FO still applies
				fontHeight = cfHeight;
				fontWidth = cfWidth || cfHeight;
			}
			continue;
		}

		// --- scalable font ---
		if (cmd === 'A0') {
			// ^A0<orient>,<h>,<w>
			const m = token.match(/^A0([NRIB]?),?(\d+),?(\d+)/);
			if (m) {
				fontOrient = m[1] || 'N';
				fontHeight = parseInt(m[2]);
				fontWidth = parseInt(m[3]);
			}
			continue;
		}

		// --- field block (text alignment / wrapping) ---
		if (cmd === 'FB') {
			// ^FB<bw>,<lines>,<spacing>,<just>,<hanging>
			const m = token.match(/^FB(\d+),\d+,[^,]*,([LCJR]?)/);
			if (m) {
				blockWidth = parseInt(m[1]);
				blockJust = m[2] || 'L';
				hasFB = true;
			}
			continue;
		}

		// --- bar width modifier ---
		if (cmd === 'BY') {
			const m = token.match(/^BY(\d+)/);
			if (m) byWidth = parseInt(m[1]);
			continue;
		}

		// --- barcode commands (set state, FD will emit element) ---
		if (cmd === 'BC') {
			// ^BC<orient>,<height>,<print_interp>,<above>,<below>
			const m = token.match(/^BC([NRIB]?),?(\d+)/);
			if (m) {
				barcodeOrient = m[1] || 'N';
				barcodeHeight = parseInt(m[2]);
			}
			barcodeFormat = 'CODE128';
			barcodeWidth = byWidth * 10;
			continue;
		}
		if (cmd === 'B3') {
			// ^B3<orient>,<check>,<height>,<print_interp>,<above>
			const m = token.match(/^B3([NRIB]?),?[YN]?,?(\d+)?/);
			if (m) {
				barcodeOrient = m[1] || 'N';
				barcodeHeight = m[2] ? parseInt(m[2]) : 100;
			}
			barcodeFormat = 'CODE39';
			barcodeWidth = byWidth * 10;
			continue;
		}
		if (cmd === 'BQ') {
			// ^BQ<orient>,<model>,<mag>
			const m = token.match(/^BQ([NRIB]?),?\d+,?(\d+)/);
			if (m) {
				barcodeOrient = m[1] || 'N';
				const mag = parseInt(m[2]);
				barcodeWidth = mag * 40;
				barcodeHeight = mag * 40;
			}
			barcodeFormat = 'QR';
			continue;
		}
		if (cmd === 'BX') {
			// ^BX<orient>,<height>,<quality>
			const m = token.match(/^BX([NRIB]?),?(\d+)/);
			if (m) {
				barcodeOrient = m[1] || 'N';
				const h = parseInt(m[2]) * 20;
				barcodeHeight = h;
				barcodeWidth = h;
			}
			barcodeFormat = 'DATAMATRIX';
			continue;
		}

		// --- field data (emits an element) ---
		if (cmd === 'FD') {
			const data = token.slice(2); // everything after 'FD'

			if (barcodeFormat !== null) {
				// Strip QR wrapper prefix (e.g. "QA,", "QM,", "QB,")
				let barcodeData = data;
				if (barcodeFormat === 'QR' && /^Q[A-Z],/.test(barcodeData)) {
					barcodeData = barcodeData.slice(3);
				}
				result.elements.push({
					type: 'barcode',
					x: curX,
					y: curY,
					data: barcodeData,
					format: barcodeFormat,
					width: barcodeWidth,
					height: barcodeHeight,
					angle: orientToAngle(barcodeOrient),
				});
			} else {
				result.elements.push({
					type: 'text',
					x: curX,
					y: curY,
					text: data,
					fontHeight,
					fontWidth,
					angle: orientToAngle(fontOrient),
					textAlign: hasFB ? justToAlign(blockJust) : 'left',
					blockWidth: hasFB ? blockWidth : null,
				});
			}
			barcodeFormat = null; // consume
			continue;
		}

		// --- graphic box (rectangle) ---
		if (cmd === 'GB') {
			// ^GB<w>,<h>,<t>,<color>,<r>
			const m = token.match(/^GB(\d+),(\d+),(\d+),?[BWA]?,?(\d*)/);
			if (m) {
				result.elements.push({
					type: 'rectangle',
					x: curX,
					y: curY,
					width: parseInt(m[1]),
					height: parseInt(m[2]),
					thickness: parseInt(m[3]),
					rounding: m[4] ? parseInt(m[4]) : 0,
				});
			}
			continue;
		}

		// --- graphic circle ---
		if (cmd === 'GC') {
			// ^GC<d>,<t>,<color>
			const m = token.match(/^GC(\d+),(\d+)/);
			if (m) {
				result.elements.push({
					type: 'circle',
					x: curX,
					y: curY,
					diameter: parseInt(m[1]),
					thickness: parseInt(m[2]),
				});
			}
			continue;
		}

		// --- graphic ellipse ---
		if (cmd === 'GE') {
			// ^GE<w>,<h>,<t>,<color>
			const m = token.match(/^GE(\d+),(\d+),(\d+)/);
			if (m) {
				result.elements.push({
					type: 'ellipse',
					x: curX,
					y: curY,
					width: parseInt(m[1]),
					height: parseInt(m[2]),
					thickness: parseInt(m[3]),
				});
			}
			continue;
		}

		// --- graphic diagonal line ---
		if (cmd === 'GD') {
			// ^GD<w>,<h>,<t>,<color>,<orient>
			const m = token.match(/^GD(\d+),(\d+),(\d+),?[BWA]?,?([LR]?)/);
			if (m) {
				result.elements.push({
					type: 'line',
					x: curX,
					y: curY,
					width: parseInt(m[1]),
					height: parseInt(m[2]),
					thickness: parseInt(m[3]),
					orientation: (m[4] as 'L' | 'R') || 'L',
				});
			}
			continue;
		}

		// --- graphic field (embedded binary image data — not supported) ---
		if (cmd === 'GF') {
			if (!warnedCmds.has('GF')) {
				warnedCmds.add('GF');
				result.unsupportedCommands.push(
					'^GF – Graphic Field (embedded binary/hex image data)'
				);
			}
			continue;
		}

		// --- everything else: warn once per unique command ---
		if (cmd.length >= 2 && !CANVAS_COMMANDS.has(cmd) && !SILENT_SKIP.has(cmd)) {
			if (!warnedCmds.has(cmd)) {
				warnedCmds.add(cmd);
				result.unsupportedCommands.push(`^${cmd}`);
			}
		}
	}

	return result;
}
