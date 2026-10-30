// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';
import { keepTableFocus } from '../../../../src/common/tables/internal/tableFocusKeeper.js';
import { buildRealTabulator, destroyRealTabulators } from '../../../support/realTabulator.js';

// The basic renderer takes every row out of the body and puts it back on an in-place
// render: the focused element leaves the page for a moment, as in the app. The keeper
// hands the focus back on the next frame; the test runs that frame itself, since a
// browser under load can hold frames back past any wait.

/** @type {(() => void)[]} */
let frames = [];

/** Run the frame callbacks the keeper scheduled. */
function runFrame() {
    const due = frames;
    frames = [];
    for (const callback of due) callback();
}

afterEach(() => {
    frames = [];
    destroyRealTabulators();
});

/** @returns {Promise<import('tabulator-tables').Tabulator>} A two-row table with a glossary term per row, in focus keeping. */
async function makeTable() {
    const table = await buildRealTabulator(
        {
            renderVertical: 'basic',
            data: [
                { id: 1, name: 'A' },
                { id: 2, name: 'B' },
            ],
            columns: [
                { title: 'Name', field: 'name' },
                {
                    title: 'Term',
                    field: 'id',
                    formatter: () => {
                        const term = document.createElement('span');
                        term.className = 'glossary-term';
                        term.textContent = 'Domäne';
                        // As a row's term is once the row keyboard reached it: no tab stop.
                        term.setAttribute('role', 'button');
                        term.tabIndex = -1;
                        return term;
                    },
                },
            ],
        },
        400,
    );
    keepTableFocus(table, { scheduleFrame: (callback) => frames.push(callback) });
    return table;
}

describe('keepTableFocus', () => {
    it('gives the focus back to a focused row after an in-place render', async () => {
        const table = await makeTable();
        const row = /** @type {HTMLElement} */ (table.getRows()[1].getElement());
        row.tabIndex = -1;
        row.focus();

        table.redraw(false);
        runFrame();

        expect(document.activeElement).toBe(row);
    });

    it('gives the focus back to a row control that is no tab stop', async () => {
        const table = await makeTable();
        const term = /** @type {HTMLElement} */ (
            table.getRows()[1].getElement().querySelector('.glossary-term')
        );
        term.focus();

        // A forced redraw rebuilds the cells: the control is a new element.
        table.redraw(true);
        runFrame();

        const focused = /** @type {HTMLElement} */ (document.activeElement);
        expect(focused).not.toBe(term);
        expect(focused.matches('.glossary-term')).toBe(true);
        expect(focused.closest('.tabulator-row')).toBe(table.getRows()[1].getElement());
    });
});
