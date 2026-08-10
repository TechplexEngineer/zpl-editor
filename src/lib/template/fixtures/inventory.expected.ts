import type { GeneratedLabel } from '../types.js';

export const expectedInventoryLabels: GeneratedLabel[] = [
	{
		rowNumber: 2,
		filename: 'label-row-000002.zpl',
		zpl:
			'^XA\n' +
			'^FO20,20^A0N,30,30^FH\\^FDBlue widget^FS\n' +
			'^FO20,70^B3N,N,60,Y,N^FH\\^FDABC-123^FS\n' +
			'^XZ\n'
	},
	{
		rowNumber: 3,
		filename: 'label-row-000003.zpl',
		zpl:
			'^XA\n' +
			'^FO20,20^A0N,30,30^FH\\^FD^FS\n' +
			'^FO20,70^B3N,N,60,Y,N^FH\\^FDEMPTY-2^FS\n' +
			'^XZ\n'
	}
];
