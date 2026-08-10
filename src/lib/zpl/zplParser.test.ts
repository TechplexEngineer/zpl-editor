import { describe, it, expect } from 'vitest';
import { parseZPL } from './zplParser.js';
import type { ParsedText } from './zplParser.js';

describe('parseZPL – ^CF (Change Font)', () => {
	it('applies ^CF height to subsequent text fields', () => {
		const result = parseZPL('^XA^CF0,60^FO50,50^FDHello^FS^XZ');
		expect(result.elements).toHaveLength(1);
		const el = result.elements[0] as ParsedText;
		expect(el.type).toBe('text');
		expect(el.fontHeight).toBe(60);
		expect(el.fontWidth).toBe(null); // width is omitted
	});

	it('applies ^CF with explicit width', () => {
		const result = parseZPL('^XA^CF0,60,40^FO50,50^FDHello^FS^XZ');
		const el = result.elements[0] as ParsedText;
		expect(el.fontHeight).toBe(60);
		expect(el.fontWidth).toBe(40);
	});

	it('applies ^CF font A (^CFA)', () => {
		const result = parseZPL('^XA^CFA,30^FO50,50^FDHello^FS^XZ');
		const el = result.elements[0] as ParsedText;
		expect(el.fontHeight).toBe(30);
		expect(el.fontWidth).toBe(null);
	});

	it('^CF changes persist across multiple fields', () => {
		const result = parseZPL(
			'^XA^CF0,60^FO50,50^FDFirst^FS^FO50,100^FDSecond^FS^XZ'
		);
		expect(result.elements).toHaveLength(2);
		const [first, second] = result.elements as ParsedText[];
		expect(first.fontHeight).toBe(60);
		expect(second.fontHeight).toBe(60);
	});

	it('^CF can be updated mid-label', () => {
		const result = parseZPL(
			'^XA^CF0,60^FO50,50^FDLarge^FS^CF0,30^FO50,120^FDSmall^FS^XZ'
		);
		expect(result.elements).toHaveLength(2);
		const [large, small] = result.elements as ParsedText[];
		expect(large.fontHeight).toBe(60);
		expect(small.fontHeight).toBe(30);
	});

	it('^A0 overrides ^CF for a single field', () => {
		const result = parseZPL(
			'^XA^CF0,60^FO50,50^A0N,100,100^FDOverridden^FS^FO50,150^FDDefault^FS^XZ'
		);
		const [overridden, defaultField] = result.elements as ParsedText[];
		expect(overridden.fontHeight).toBe(100);
		expect(defaultField.fontHeight).toBe(60); // reverts to CF default
	});

	it('uses default font size 36 when no ^CF is present', () => {
		const result = parseZPL('^XA^FO50,50^FDHello^FS^XZ');
		const el = result.elements[0] as ParsedText;
		expect(el.fontHeight).toBe(36);
		expect(el.fontWidth).toBe(null);
	});

	it('parses the full sample label without mangling text', () => {
		const zpl = `^XA

^FX Top section with logo, name and address.
^CF0,60
^FO50,50^GB100,100,100^FS

^FO93,93^GB40,40,40^FS
^FO220,50^FDIntershipping, Inc.^FS
^CF0,30
^FO220,115^FD1000 Shipping Lane^FS
^FO220,155^FDShelbyville TN 38102^FS
^FO220,195^FDUnited States (USA)^FS
^FO50,250^GB700,3,3^FS

^FX Second section with recipient address and permit information.
^CFA,30
^FO50,300^FDJohn Doe^FS
^FO50,340^FD100 Main Street^FS
^FO50,380^FDSpringfield TN 39021^FS
^FO50,420^FDUnited States (USA)^FS
^CFA,15
^FO600,300^GB150,150,3^FS
^FO638,340^FDPermit^FS
^FO638,390^FD123456^FS
^FO50,500^GB700,3,3^FS

^FX Third section with bar code.
^BY5,2,270
^FO100,550^BC^FD12345678^FS

^FX Fourth section (the two boxes on the bottom).
^FO50,900^GB700,250,3^FS
^FO400,900^GB3,250,3^FS
^CF0,40
^FO100,960^FDCtr. X34B-1^FS
^FO100,1010^FDREF1 F00B47^FS
^FO100,1060^FDREF2 BL4H8^FS
^CF0,190
^FO470,955^FDCA^FS

^XZ`;

		const result = parseZPL(zpl);

		// No elements should be misidentified — text elements should have correct font sizes
		const texts = result.elements.filter((e) => e.type === 'text') as ParsedText[];

		// "Intershipping, Inc." — after ^CF0,60
		const intershipping = texts.find((t) => t.text === 'Intershipping, Inc.');
		expect(intershipping).toBeDefined();
		expect(intershipping!.fontHeight).toBe(60);

		// "1000 Shipping Lane" — after ^CF0,30
		const shippingLane = texts.find((t) => t.text === '1000 Shipping Lane');
		expect(shippingLane).toBeDefined();
		expect(shippingLane!.fontHeight).toBe(30);

		// "John Doe" — after ^CFA,30
		const johnDoe = texts.find((t) => t.text === 'John Doe');
		expect(johnDoe).toBeDefined();
		expect(johnDoe!.fontHeight).toBe(30);

		// "Permit" — after ^CFA,15
		const permit = texts.find((t) => t.text === 'Permit');
		expect(permit).toBeDefined();
		expect(permit!.fontHeight).toBe(15);

		// "CA" — after ^CF0,190
		const ca = texts.find((t) => t.text === 'CA');
		expect(ca).toBeDefined();
		expect(ca!.fontHeight).toBe(190);
	});
});
