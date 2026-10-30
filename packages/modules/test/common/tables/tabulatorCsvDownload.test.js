// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';
import { buildRealTabulator, destroyRealTabulators } from '../../support/realTabulator.js';

// A table's CSV is opened in a spreadsheet, which runs a cell starting with `=`, `+`,
// `-` or `@` as a formula: a student name from the data must not run one there.

afterEach(() => destroyRealTabulators());

/**
 * The table's CSV, as the export takes it (Tabulator's intercept callback).
 * @param {import('tabulator-tables').Tabulator} table
 * @returns {string}
 */
function csvOf(table) {
    let text = '';
    // Tabulator 6.5 takes the intercept callback as a fifth argument, which
    // `@types/tabulator-tables` (6.3) does not declare yet.
    const download =
        /** @type {(type: 'csv', filename: null, options: object, range: 'active', intercept: (text: unknown) => void) => void} */ (
            /** @type {unknown} */ (table.download)
        );
    download.call(table, 'csv', null, { delimiter: ';' }, 'active', (contents) => {
        text = String(contents);
    });
    return text;
}

describe("Tabulator's CSV download", () => {
    it('writes a cell a spreadsheet would run as a formula as plain text, and numbers as they are', async () => {
        const table = await buildRealTabulator(
            {
                columns: [
                    { title: 'Name', field: 'name' },
                    { title: 'Wert', field: 'value' },
                    { title: 'Anteil', field: 'share', accessorDownload: () => '-0,5' },
                ],
                data: [{ name: '=HYPERLINK("http://x")', value: -3, share: null }],
            },
            600,
        );

        expect(csvOf(table).split('\n')).toEqual([
            '"Name";"Wert";"Anteil"',
            `"'=HYPERLINK(""http://x"")";"-3";"-0,5"`,
        ]);
    });
});
