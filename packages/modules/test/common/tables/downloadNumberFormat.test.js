import { describe, it, expect, afterEach } from 'vitest';
import {
    setDownloadFormat,
    formatDownloadNumber,
} from '../../../src/common/tables/downloadNumberFormat.js';

// The flag is module state shared by every accessor, so each test restores the default.
afterEach(() => setDownloadFormat('csv'));

describe('formatDownloadNumber', () => {
    it('writes a German decimal comma for CSV', () => {
        // The CSV is ';'-delimited with a BOM for German Excel, which reads
        // "62.1" as text.
        setDownloadFormat('csv');
        expect(formatDownloadNumber(62.06896551724138, 1)).toBe('62,1');
        expect(formatDownloadNumber(3, 2)).toBe('3');
    });

    it('keeps JSON values numerically typed', () => {
        // The same accessor serves both formats; localising unconditionally
        // would turn every JSON number into a string.
        setDownloadFormat('json');
        const value = formatDownloadNumber(62.06896551724138, 1);
        expect(typeof value).toBe('number');
        expect(value).toBe(62.1);
    });

    it('exports an empty cell rather than a zero when there is no value', () => {
        // A missing measure (a row that carries no Unterrichtsqualität) must
        // not read as a real 0 in the spreadsheet.
        for (const empty of [null, undefined, '', NaN, Infinity, 'abc']) {
            expect(formatDownloadNumber(empty, 1)).toBe('');
        }
    });

    it('exports no value as null in JSON, so a field keeps one type', () => {
        setDownloadFormat('json');
        for (const empty of [null, undefined, '', NaN]) {
            expect(formatDownloadNumber(empty, 1)).toBeNull();
        }
    });

    it('still exports a real zero', () => {
        setDownloadFormat('csv');
        expect(formatDownloadNumber(0, 1)).toBe('0');
    });
});
