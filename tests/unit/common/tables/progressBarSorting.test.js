// @vitest-browser

/**
 * The multi-field header sort of the progress-bar and Pilotierung columns.
 *
 * WHY this file exists: the cycle is state kept *outside* Tabulator — a per-table
 * registry the column sorters read back. Nothing but the click order tells the
 * table which of the three fields it is sorting by, so an off-by-one in the
 * sequence, a missed cross-column reset or a header title that keeps highlighting
 * a sort the table no longer has all look correct from inside Tabulator. These pin
 * the cycle, the registered state the sorters read, and the header highlight
 * against a fake table.
 */

import { describe, it, expect, vi } from 'vitest';
import { LABELS } from '@tba3/modules/common/tables/tableLabels.js';
import {
    applyProgressBarSorting,
    getRegisteredProgressBarSortState,
    isProgressBarColumnField,
    resetProgressBarSorting,
    setupPilotierungColumnSorting,
    setupProgressBarSorting,
    updateProgressBarHeaderHighlight,
} from '@tba3/modules/common/tables/progressBarSorting.js';

const BAR_TITLE = `${LABELS.VERTEILUNG}: ${LABELS.RICHTIG} | ${LABELS.UNBEARBEITET} | ${LABELS.FALSCH}`;
const PILOTIERUNG_TITLE = 'Pilotierung (Δ)';

/** The markup updateProgressBarHeaderHighlight() wraps the active label in. */
const highlighted = (label) =>
    `<span style="color: var(--primary-color, #007bff);">${label}</span>`;

/**
 * Tabulator stand-in carrying real header elements, so the highlight writes into a DOM.
 * @param {Array<{field: string, title: string}>} columnDefs - The columns to expose.
 * @returns {object} The fake table plus test helpers.
 */
function makeTable(columnDefs) {
    const handlers = {};
    const columns = columnDefs.map(({ field, title }) => {
        const element = document.createElement('div');
        const titleElement = document.createElement('div');
        titleElement.className = 'tabulator-col-title';
        titleElement.textContent = title;
        element.appendChild(titleElement);
        return {
            getField: () => field,
            getElement: () => element,
            getDefinition: () => ({ title }),
            titleElement,
        };
    });

    const table = {
        on: (event, cb) => {
            (handlers[event] ??= []).push(cb);
        },
        getColumns: () => columns,
        setSort: vi.fn(),
        clearSort: vi.fn(),
        /** Fire a header click the way Tabulator does, on the column with this field. */
        clickHeader(field) {
            const event = { stopPropagation: vi.fn() };
            const column = columns.find((col) => col.getField() === field);
            (handlers.headerClick ?? []).forEach((cb) => cb(event, column));
            return event;
        },
        /** The header markup of one column. */
        titleHtml(field) {
            return columns.find((col) => col.getField() === field).titleElement.innerHTML;
        },
    };
    return table;
}

/** A table whose single progress-bar column is registered for the three-field cycle. */
function setupBarTable() {
    const table = makeTable([{ field: 'percentageCombined', title: BAR_TITLE }]);
    setupProgressBarSorting(table, 'percentageCombined');
    return table;
}

/** The sort field and direction the column sorters would read for one column. */
const activeSort = (table, field) => {
    const state = getRegisteredProgressBarSortState(table, field);
    return state && { field: state.field, dir: state.dir };
};

describe('the three-field header cycle', () => {
    it('walks correct → not attempted → incorrect, each ascending then descending', () => {
        const table = setupBarTable();
        const seen = [];

        for (let click = 0; click < 6; click++) {
            table.clickHeader('percentageCombined');
            seen.push(activeSort(table, 'percentageCombined'));
        }

        expect(seen).toEqual([
            { field: 'percentageCorrect', dir: 'asc' },
            { field: 'percentageCorrect', dir: 'desc' },
            { field: 'percentageNotAttempted', dir: 'asc' },
            { field: 'percentageNotAttempted', dir: 'desc' },
            { field: 'percentageIncorrect', dir: 'asc' },
            { field: 'percentageIncorrect', dir: 'desc' },
        ]);
        // Tabulator always sorts by the column's own field; the shadow state above
        // is what the column's sorter compares by.
        expect(table.setSort.mock.calls).toEqual([
            ['percentageCombined', 'asc'],
            ['percentageCombined', 'desc'],
            ['percentageCombined', 'asc'],
            ['percentageCombined', 'desc'],
            ['percentageCombined', 'asc'],
            ['percentageCombined', 'desc'],
        ]);
        expect(table.clearSort).not.toHaveBeenCalled();
    });

    it('highlights the field in force in the header title', () => {
        const table = setupBarTable();

        table.clickHeader('percentageCombined');
        expect(table.titleHtml('percentageCombined')).toBe(
            BAR_TITLE.replace(LABELS.RICHTIG, highlighted(LABELS.RICHTIG)),
        );

        table.clickHeader('percentageCombined');
        table.clickHeader('percentageCombined');
        expect(table.titleHtml('percentageCombined')).toBe(
            BAR_TITLE.replace(LABELS.UNBEARBEITET, highlighted(LABELS.UNBEARBEITET)),
        );
    });

    it('clears the sort and the highlight on the click after the last step, then starts over', () => {
        const table = setupBarTable();
        for (let click = 0; click < 6; click++) table.clickHeader('percentageCombined');

        table.setSort.mockClear();
        table.clickHeader('percentageCombined');

        expect(table.clearSort).toHaveBeenCalledTimes(1);
        expect(table.setSort).not.toHaveBeenCalled();
        expect(table.titleHtml('percentageCombined')).toBe(BAR_TITLE);
        expect(activeSort(table, 'percentageCombined')).toEqual({
            field: 'percentageCorrect',
            dir: 'asc',
        });

        table.clickHeader('percentageCombined');
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'asc');
    });

    it('swallows the header click so Tabulator does not apply its own sort on top', () => {
        const table = setupBarTable();
        expect(table.clickHeader('percentageCombined').stopPropagation).toHaveBeenCalled();
    });

    it('leaves a header click on an unregistered column to Tabulator', () => {
        const table = makeTable([
            { field: 'percentageCombined', title: BAR_TITLE },
            { field: 'lastName', title: 'Name' },
        ]);
        setupProgressBarSorting(table, 'percentageCombined');

        const event = table.clickHeader('lastName');

        expect(event.stopPropagation).not.toHaveBeenCalled();
        expect(table.setSort).not.toHaveBeenCalled();
    });
});

describe('several progress-bar columns on one table', () => {
    /** EN's class table: one bar column per domain, each with its own field prefix. */
    function setupTwoDomainTable() {
        const table = makeTable([
            { field: 'd0Percentages', title: `Hören: ${LABELS.RICHTIG} | ${LABELS.FALSCH}` },
            { field: 'd1Percentages', title: `Lesen: ${LABELS.RICHTIG} | ${LABELS.FALSCH}` },
        ]);
        setupProgressBarSorting(table, 'd0Percentages', { fieldPrefix: 'd0' });
        setupProgressBarSorting(table, 'd1Percentages', { fieldPrefix: 'd1' });
        return table;
    }

    it('sorts each column by its own prefixed fields', () => {
        const table = setupTwoDomainTable();

        table.clickHeader('d1Percentages');

        expect(activeSort(table, 'd1Percentages')).toEqual({
            field: 'd1PercentageCorrect',
            dir: 'asc',
        });
        expect(table.setSort).toHaveBeenLastCalledWith('d1Percentages', 'asc');
    });

    it('restarts the clicked column and drops the other column’s highlight', () => {
        const table = setupTwoDomainTable();
        table.clickHeader('d0Percentages');
        table.clickHeader('d0Percentages');
        table.clickHeader('d0Percentages');

        table.clickHeader('d1Percentages');

        // The other column keeps no visible sort: it is no longer the one the rows are ordered by.
        expect(table.titleHtml('d0Percentages')).toBe(
            `Hören: ${LABELS.RICHTIG} | ${LABELS.FALSCH}`,
        );
        expect(activeSort(table, 'd0Percentages')).toEqual({
            field: 'd0PercentageCorrect',
            dir: 'asc',
        });
        // …and the new column starts at the first step rather than inheriting the click count.
        expect(table.setSort).toHaveBeenLastCalledWith('d1Percentages', 'asc');
    });
});

describe('the Pilotierung two-field cycle', () => {
    function setupPilotierungTable() {
        const table = makeTable([{ field: 'pilotierungswert', title: PILOTIERUNG_TITLE }]);
        setupPilotierungColumnSorting(table);
        return table;
    }

    it('cycles value ↑↓ then Δ ↑↓ and wraps after four clicks', () => {
        const table = setupPilotierungTable();
        const seen = [];

        for (let click = 0; click < 4; click++) {
            table.clickHeader('pilotierungswert');
            seen.push(activeSort(table, 'pilotierungswert'));
        }

        expect(seen).toEqual([
            { field: 'pilotierungswert', dir: 'asc' },
            { field: 'pilotierungswert', dir: 'desc' },
            { field: 'pilotierungsDiff', dir: 'asc' },
            { field: 'pilotierungsDiff', dir: 'desc' },
        ]);

        // The three-field sequence would take two more clicks to get here.
        table.clickHeader('pilotierungswert');
        expect(table.clearSort).toHaveBeenCalledTimes(1);
    });

    it('highlights the Δ label, which no field-name rule can derive', () => {
        const table = setupPilotierungTable();
        table.clickHeader('pilotierungswert');
        table.clickHeader('pilotierungswert');
        table.clickHeader('pilotierungswert');

        expect(table.titleHtml('pilotierungswert')).toBe(
            PILOTIERUNG_TITLE.replace('Δ', highlighted('Δ')),
        );
    });
});

describe('resetProgressBarSorting', () => {
    it('returns the state and the header to the start of the cycle', () => {
        const table = setupBarTable();
        table.clickHeader('percentageCombined');
        table.clickHeader('percentageCombined');
        table.clickHeader('percentageCombined');

        resetProgressBarSorting(table);

        expect(activeSort(table, 'percentageCombined')).toEqual({
            field: 'percentageCorrect',
            dir: 'asc',
        });
        expect(table.titleHtml('percentageCombined')).toBe(BAR_TITLE);

        table.setSort.mockClear();
        table.clickHeader('percentageCombined');
        expect(table.setSort).toHaveBeenCalledWith('percentageCombined', 'asc');
    });

    it('does nothing to a table that has no progress-bar column', () => {
        const table = makeTable([{ field: 'lastName', title: 'Name' }]);
        expect(() => resetProgressBarSorting(table)).not.toThrow();
    });
});

describe('applyProgressBarSorting', () => {
    it('sorts by an underlying field and primes the state the header cycle continues from', () => {
        const table = setupBarTable();

        expect(applyProgressBarSorting(table, 'percentageNotAttempted', 'desc')).toBe(true);

        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'desc');
        expect(activeSort(table, 'percentageCombined')).toEqual({
            field: 'percentageNotAttempted',
            dir: 'desc',
        });
        expect(table.titleHtml('percentageCombined')).toBe(
            BAR_TITLE.replace(LABELS.UNBEARBEITET, highlighted(LABELS.UNBEARBEITET)),
        );

        // Step 4 of the sequence, so the next header click is step 5.
        table.clickHeader('percentageCombined');
        expect(activeSort(table, 'percentageCombined')).toEqual({
            field: 'percentageIncorrect',
            dir: 'asc',
        });
    });

    it('accepts the column field itself and sorts by the correct share', () => {
        const table = setupBarTable();

        expect(applyProgressBarSorting(table, 'percentageCombined', 'desc')).toBe(true);
        expect(activeSort(table, 'percentageCombined')).toEqual({
            field: 'percentageCorrect',
            dir: 'desc',
        });
    });

    it('reports a key that belongs to no progress-bar column, leaving the table alone', () => {
        const table = setupBarTable();

        expect(applyProgressBarSorting(table, 'lastName', 'asc')).toBe(false);
        expect(table.setSort).not.toHaveBeenCalled();
    });
});

describe('isProgressBarColumnField', () => {
    it('recognises the shared column and the domain-prefixed ones', () => {
        expect(isProgressBarColumnField('percentageCombined')).toBe(true);
        expect(isProgressBarColumnField('d0Percentages')).toBe(true);
    });

    it('rejects the underlying sort fields and a missing field', () => {
        // These name a share, not the bar column: highlighting them as a column
        // header would clear the wrong title.
        expect(isProgressBarColumnField('percentageCorrect')).toBe(false);
        expect(isProgressBarColumnField('lastName')).toBe(false);
        expect(isProgressBarColumnField(undefined)).toBeFalsy();
    });
});

describe('updateProgressBarHeaderHighlight', () => {
    it('derives the label from the field suffix, prefix and all', () => {
        const title = `Lesen: ${LABELS.RICHTIG} | ${LABELS.UNBEARBEITET} | ${LABELS.FALSCH}`;
        const table = makeTable([{ field: 'd1Percentages', title }]);

        updateProgressBarHeaderHighlight(table, 'd1Percentages', 'd1PercentageIncorrect');

        expect(table.titleHtml('d1Percentages')).toBe(
            title.replace(LABELS.FALSCH, highlighted(LABELS.FALSCH)),
        );
    });

    it('restores the plain title for a null sort field', () => {
        const table = makeTable([{ field: 'percentageCombined', title: BAR_TITLE }]);
        updateProgressBarHeaderHighlight(table, 'percentageCombined', 'percentageCorrect');

        updateProgressBarHeaderHighlight(table, 'percentageCombined', null);

        expect(table.titleHtml('percentageCombined')).toBe(BAR_TITLE);
    });

    it('leaves the title alone for a sort field it cannot label', () => {
        const table = makeTable([{ field: 'percentageCombined', title: BAR_TITLE }]);

        updateProgressBarHeaderHighlight(table, 'percentageCombined', 'someOtherField');

        expect(table.titleHtml('percentageCombined')).toBe(BAR_TITLE);
    });

    it('ignores a column the table does not have', () => {
        const table = makeTable([{ field: 'percentageCombined', title: BAR_TITLE }]);

        expect(() =>
            updateProgressBarHeaderHighlight(table, 'd9Percentages', 'd9PercentageCorrect'),
        ).not.toThrow();
        expect(table.titleHtml('percentageCombined')).toBe(BAR_TITLE);
    });
});
