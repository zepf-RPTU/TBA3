// @vitest-browser
/**
 * The printed table an export captures, against the real Tabulator: what it prints for a
 * grouped table depends on Tabulator's display list, which no fake models.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { printActiveRows } from '../../../../src/common/tables/internal/printActiveRows.js';
import { buildRealTabulator, destroyRealTabulators } from '../../../support/realTabulator.js';

const ROWS = [
    { id: 1, section: 'Schule', subject: 'Deutsch' },
    { id: 2, section: 'Schule', subject: 'Englisch' },
    { id: 3, section: 'Lerngruppe 8a', subject: 'Mathematik' },
    { id: 4, section: 'Lerngruppe 8b', subject: 'Französisch' },
];

/**
 * A built table grouped by section, every group collapsed.
 * @returns {Promise<import('tabulator-tables').Tabulator>}
 */
function buildGroupedTable() {
    return buildRealTabulator(
        {
            data: ROWS,
            columns: [{ title: 'Fach', field: 'subject' }],
            groupBy: 'section',
            groupStartOpen: false,
            height: 'auto',
        },
        600,
    );
}

/**
 * @param {import('tabulator-tables').Tabulator} built
 * @returns {{[key: string]: boolean}} Whether each row group is open, by key.
 */
const openGroups = (built) =>
    Object.fromEntries(built.getGroups().map((group) => [group.getKey(), group.isVisible()]));

afterEach(destroyRealTabulators);

describe('printActiveRows', () => {
    it('prints the rows of collapsed row groups, and leaves the groups as the reader had them', async () => {
        // Tabulator prints its display list, which holds only the header of a
        // collapsed group; every SL group starts collapsed, so an untouched table
        // would print as headlines with nothing under them.
        const built = await buildGroupedTable();
        const [, opened] = built.getGroups();
        opened.show();

        const printed = printActiveRows(built).textContent;

        for (const { section, subject } of ROWS) {
            expect(printed).toContain(section);
            expect(printed).toContain(subject);
        }
        expect(openGroups(built)).toEqual({
            Schule: false,
            'Lerngruppe 8a': true,
            'Lerngruppe 8b': false,
        });
    });
});
