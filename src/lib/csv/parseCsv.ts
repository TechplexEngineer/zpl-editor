import type { CsvDocument } from '../template/types.js';

export class CsvParseError extends Error {
	constructor(
		public readonly rowNumber: number,
		message: string
	) {
		super(message);
		this.name = 'CsvParseError';
	}
}

interface ParsedRecord {
	rowNumber: number;
	fields: string[];
}

export function parseCsv(source: string): CsvDocument {
	const records: ParsedRecord[] = [];
	let field = '';
	let record: string[] = [];
	let inQuotes = false;
	let physicalLine = 1;
	let recordRowNumber = 1;

	const finishRecord = () => {
		record.push(field);
		records.push({ rowNumber: recordRowNumber, fields: record });
		field = '';
		record = [];
		recordRowNumber = physicalLine + 1;
	};

	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];

		if (inQuotes) {
			if (character === '"') {
				if (source[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					inQuotes = false;
				}
			} else if (character === '\r' && source[index + 1] === '\n') {
				field += '\r\n';
				index += 1;
				physicalLine += 1;
			} else {
				field += character;
				if (character === '\n') physicalLine += 1;
			}
			continue;
		}

		if (character === '"' && field.length === 0) {
			inQuotes = true;
		} else if (character === ',') {
			record.push(field);
			field = '';
		} else if (character === '\r' && source[index + 1] === '\n') {
			finishRecord();
			index += 1;
			physicalLine += 1;
		} else if (character === '\n') {
			finishRecord();
			physicalLine += 1;
		} else {
			field += character;
		}
	}

	if (inQuotes) throw new CsvParseError(physicalLine, 'Unterminated quoted field');
	if (field.length > 0 || record.length > 0 || source.length > 0) finishRecord();

	while (records.at(-1)?.fields.every((value) => value === '')) records.pop();
	if (records.length === 0) throw new CsvParseError(1, 'CSV must include a header row');

	const headerRecord = records[0];
	const headers = headerRecord.fields.map((header, index) =>
		index === 0 && header.startsWith('\uFEFF') ? header.slice(1) : header
	);
	const seenHeaders = new Set<string>();

	for (const header of headers) {
		if (header.length === 0)
			throw new CsvParseError(headerRecord.rowNumber, 'Header cannot be empty');
		if (seenHeaders.has(header)) {
			throw new CsvParseError(headerRecord.rowNumber, `Duplicate header "${header}"`);
		}
		seenHeaders.add(header);
	}

	const rows = records.slice(1).map(({ rowNumber, fields }) => {
		if (fields.length !== headers.length) {
			throw new CsvParseError(
				rowNumber,
				`Expected ${headers.length} columns but found ${fields.length}`
			);
		}

		return {
			rowNumber,
			values: Object.fromEntries(headers.map((header, index) => [header, fields[index]]))
		};
	});

	return { headers, rows };
}
