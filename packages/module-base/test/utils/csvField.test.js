import { describe, expect, it } from 'vitest';

import { csvField } from '../../src/utils/csvField.js';

// A CSV is opened in a spreadsheet, which runs a cell starting with `=`, `+`, `-` or `@`
// as a formula (OWASP CSV injection): a label from the data could run one there.

describe('csvField', () => {
    it('writes a text a spreadsheet would run as a formula as plain text', () => {
        expect(csvField('=1+1')).toBe("'=1+1");
        expect(csvField('+49 30')).toBe("'+49 30");
        expect(csvField('-Ausreißer')).toBe("'-Ausreißer");
        expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
        expect(csvField('\tTab')).toBe("'\tTab");
        expect(csvField('\r=1')).toBe(`"'\r=1"`);
        // Quoted after the prefix, so the quote still opens the field.
        expect(csvField('-a;b')).toBe(`"'-a;b"`);
    });

    it('keeps a number a number, also one written as text', () => {
        expect(csvField(-5)).toBe('-5');
        expect(csvField('-0,5')).toBe('-0,5');
        expect(csvField('+3')).toBe('+3');
        expect(csvField('-0.25')).toBe('-0.25');
    });

    it('leaves any other text as it is', () => {
        expect(csvField('Lerngruppe 8a')).toBe('Lerngruppe 8a');
        expect(csvField('a=b')).toBe('a=b');
        expect(csvField('–')).toBe('–');
    });
});
