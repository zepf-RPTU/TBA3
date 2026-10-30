// @vitest-browser

/**
 * The multi-field header sort of the progress-bar and Pilotierung columns.
 *
 * The cycle is state kept outside Tabulator, in a per-table registry the column
 * sorters read back. Only the click order tells the table which field it sorts by, so
 * an off-by-one in the cycle, a missed cross-column reset or a stale header highlight
 * is invisible to Tabulator.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    createItemResultColumns,
    createProgressBarColumns,
} from '../../../src/common/tables/progressBarColumn.js';
import {
    applyProgressBarSorting,
    getProgressBarSortField,
    progressBarSortKey,
    resetProgressBarSorting,
    setupProgressBarSorting,
} from '../../../src/common/tables/progressBarSorting.js';
import { RESULT } from '../../../src/common/domain/apiValueMaps.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';

/** @typedef {import('../../../src/common/tables/columnFactories.js').TableColumnDefinition} TableColumnDefinition */
/** @typedef {import('vitest').Mock} Mock */

/**
 * The fake table: the Tabulator members the sorting reads, spied, plus test helpers.
 * @typedef {import('../../../src/common/tables/progressBarSorting.js').SortTable & {
 *   setSort: Mock,
 *   clearSort: Mock,
 *   redraw: Mock,
 *   clickHeader: (field: string) => void,
 *   tabulatorSort: Mock,
 *   titleHtml: (field: string) => string,
 * }} FakeSortTable
 */

const context = createTestContext();

const BAR_TITLE = 'Verteilung';
const PILOT_TITLE = 'Pilotierung (Δ)';

/**
 * The markup the header highlight wraps the active label in.
 * @param {string} label
 * @returns {string}
 */
const highlighted = (label) => `<span class="progress-bar-sort-active">${label}</span>`;

/**
 * The bar header while a step is in force: the title, then the step's label after it.
 * @param {string} label
 * @returns {string}
 */
const barTitleWith = (label) => `${BAR_TITLE}: ${highlighted(label)}`;

/**
 * A progress-bar column definition as the factories declare it.
 * @param {string} field
 * @param {string} [prefix] - The Domäne's field prefix.
 * @returns {TableColumnDefinition}
 */
const barColumn = (field, prefix = '') => ({
    field,
    title: BAR_TITLE,
    tableMeta: {
        progressBarSortSteps: required(
            createProgressBarColumns(context, { fieldPrefix: prefix })[0].tableMeta,
        ).progressBarSortSteps,
    },
});

/**
 * Tabulator stand-in carrying real header elements, so the highlight writes into a DOM.
 * @param {TableColumnDefinition[]} columnDefs
 * @returns {FakeSortTable}
 */
function makeTable(columnDefs) {
    const root = document.createElement('div');
    // Tabulator's own header sort: a click listener on each header element.
    const tabulatorSort = vi.fn();
    const columns = columnDefs.map(({ field, title, titleFormatter }) => {
        const element = root.appendChild(document.createElement('div'));
        element.className = 'tabulator-col';
        element.setAttribute('tabulator-field', required(field));
        element.addEventListener('click', () => tabulatorSort(field));
        const titleElement = document.createElement('div');
        titleElement.className = 'tabulator-col-title';
        titleElement.textContent = title ?? null;
        element.appendChild(titleElement);
        return {
            getField: () => required(field),
            getElement: () => element,
            // A built-in formatter name never reaches a progress-bar header.
            getDefinition: () => ({
                title: title ?? '',
                titleFormatter: typeof titleFormatter === 'function' ? titleFormatter : undefined,
            }),
            titleElement,
        };
    });

    /** @type {FakeSortTable} */
    const table = {
        element: root,
        initialized: true,
        redraw: vi.fn(),
        tabulatorSort,
        getColumn: (/** @type {string} */ field) => columns.find((col) => col.getField() === field),
        setSort: vi.fn(),
        clearSort: vi.fn(),
        /**
         * Click the title of the column with this field, as the pointer does.
         * @param {string} field
         */
        clickHeader(field) {
            required(columns.find((col) => col.getField() === field)).titleElement.click();
        },
        /**
         * The header markup of one column.
         * @param {string} field
         * @returns {string}
         */
        titleHtml(field) {
            return required(columns.find((col) => col.getField() === field)).titleElement.innerHTML;
        },
    };
    return table;
}

/**
 * A table set up the way TableModule does it: register the columns, paint the headers.
 * @param {TableColumnDefinition[]} columns
 * @returns {FakeSortTable}
 */
function setupTable(columns) {
    const table = makeTable(columns);
    setupProgressBarSorting(table, columns);
    resetProgressBarSorting(table);
    return table;
}

/** A table whose single progress-bar column carries the three-field cycle. */
const setupBarTable = () => setupTable([barColumn('percentageCombined')]);

/**
 * The sort field the column's sorter reads, and the direction Tabulator was last given.
 * @param {FakeSortTable} table
 * @param {string} field
 * @returns {{field: string|null, dir: unknown}}
 */
const activeSort = (table, field) => ({
    field: getProgressBarSortField(table, field),
    dir: table.setSort.mock.calls.at(-1)?.[1],
});

describe('the three-field header cycle', () => {
    it('walks correct → not attempted → incorrect, each ascending then descending', () => {
        const table = setupBarTable();
        /** @type {Array<{field: string|null, dir: unknown}>} */
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
        // Tabulator always sorts by the column's own field; the step in force is
        // what the column's sorter compares by.
        expect(table.setSort.mock.calls.every(([field]) => field === 'percentageCombined')).toBe(
            true,
        );
        expect(table.clearSort).not.toHaveBeenCalled();
    });

    it('shows the share in force after the header title', () => {
        const table = setupBarTable();

        table.clickHeader('percentageCombined');
        expect(table.titleHtml('percentageCombined')).toBe(barTitleWith(RESULT.CORRECT));

        table.clickHeader('percentageCombined');
        table.clickHeader('percentageCombined');
        expect(table.titleHtml('percentageCombined')).toBe(barTitleWith(RESULT.NOT_ATTEMPTED));
    });

    it('formats the title as the column header was built, so its glossary key survives', () => {
        const table = setupTable([
            {
                ...barColumn('percentageCombined'),
                titleFormatter: (/** @type {import('tabulator-tables').CellComponent} */ cell) =>
                    `<span data-key="verteilung">${cell.getValue()}</span>`,
            },
        ]);

        expect(table.titleHtml('percentageCombined')).toBe(
            `<span data-key="verteilung">${BAR_TITLE}</span>`,
        );
        table.clickHeader('percentageCombined');
        expect(table.titleHtml('percentageCombined')).toBe(
            `<span data-key="verteilung">${BAR_TITLE}</span>: ${highlighted(RESULT.CORRECT)}`,
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
        expect(progressBarSortKey(table)).toBe('');

        table.clickHeader('percentageCombined');
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'asc');
    });

    it('takes the header click before Tabulator sorts, so its own sort does not run on top', () => {
        // Tabulator listens on the header element itself; a click it also handled
        // would sort the table twice and report the sort twice.
        const table = setupBarTable();
        table.clickHeader('percentageCombined');
        expect(table.tabulatorSort).not.toHaveBeenCalled();
        expect(table.setSort).toHaveBeenCalledOnce();
    });

    it('leaves a header click on a column without a cycle to Tabulator', () => {
        const table = setupTable([
            barColumn('percentageCombined'),
            { field: 'lastName', title: 'Name' },
        ]);

        table.clickHeader('lastName');

        expect(table.tabulatorSort).toHaveBeenCalledExactlyOnceWith('lastName');
        expect(table.setSort).not.toHaveBeenCalled();
    });

    it('names each step in the sort key, so two steps with one sorter tell apart', () => {
        // Tabulator's sorters only name the column; TableModule compares this key
        // to tell a real sort change from the dataSorted every refilter dispatches.
        const table = setupBarTable();
        table.clickHeader('percentageCombined');
        const first = progressBarSortKey(table);
        table.clickHeader('percentageCombined');
        table.clickHeader('percentageCombined');
        expect(progressBarSortKey(table)).not.toBe(first);
    });
});

describe('several progress-bar columns on one table', () => {
    /** EN's group table: one bar column per domain, each with its own field prefix. */
    const setupTwoDomainTable = () =>
        setupTable([barColumn('d0Percentages', 'd0'), barColumn('d1Percentages', 'd1')]);

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

        // The other column no longer orders the rows.
        expect(table.titleHtml('d0Percentages')).toBe(BAR_TITLE);
        expect(getProgressBarSortField(table, 'd0Percentages')).toBe('d0PercentageCorrect');
        // The new column starts at the first step rather than inheriting the click count.
        expect(table.setSort).toHaveBeenLastCalledWith('d1Percentages', 'asc');
    });

    it('starts unsorted again when a new column set is registered', () => {
        const table = setupTwoDomainTable();
        table.clickHeader('d0Percentages');

        setupProgressBarSorting(table, [barColumn('d0Percentages', 'd0')]);

        expect(progressBarSortKey(table)).toBe('');
        expect(getProgressBarSortField(table, 'd1Percentages')).toBeNull();
    });
});

describe('the Pilotierung two-field cycle', () => {
    const pilotColumn = required(
        createItemResultColumns(context).find(
            (column) => column.field === 'pilotSolutionFrequency',
        ),
    );
    const setupPilotTable = () =>
        setupTable([
            {
                field: 'pilotSolutionFrequency',
                title: PILOT_TITLE,
                tableMeta: pilotColumn.tableMeta,
            },
        ]);

    it('cycles value ↑↓ then Δ ↑↓ and wraps after four clicks', () => {
        const table = setupPilotTable();
        /** @type {Array<{field: string|null, dir: unknown}>} */
        const seen = [];

        for (let click = 0; click < 4; click++) {
            table.clickHeader('pilotSolutionFrequency');
            seen.push(activeSort(table, 'pilotSolutionFrequency'));
        }

        expect(seen).toEqual([
            { field: 'pilotSolutionFrequency', dir: 'asc' },
            { field: 'pilotSolutionFrequency', dir: 'desc' },
            { field: 'pilotSolutionFrequencyDiff', dir: 'asc' },
            { field: 'pilotSolutionFrequencyDiff', dir: 'desc' },
        ]);

        // The three-field cycle would take two more clicks to get here.
        table.clickHeader('pilotSolutionFrequency');
        expect(table.clearSort).toHaveBeenCalledTimes(1);
    });

    it('highlights the Δ label its step declares in place, since the title contains it', () => {
        const table = setupPilotTable();
        table.clickHeader('pilotSolutionFrequency');
        table.clickHeader('pilotSolutionFrequency');
        table.clickHeader('pilotSolutionFrequency');

        expect(table.titleHtml('pilotSolutionFrequency')).toBe(
            PILOT_TITLE.replace('Δ', highlighted('Δ')),
        );
    });
});

describe('resetProgressBarSorting', () => {
    it('returns the column and the header to the start of the cycle', () => {
        const table = setupBarTable();
        table.clickHeader('percentageCombined');
        table.clickHeader('percentageCombined');
        table.clickHeader('percentageCombined');

        resetProgressBarSorting(table);

        expect(getProgressBarSortField(table, 'percentageCombined')).toBe('percentageCorrect');
        expect(table.titleHtml('percentageCombined')).toBe(BAR_TITLE);

        table.setSort.mockClear();
        table.clickHeader('percentageCombined');
        expect(table.setSort).toHaveBeenCalledWith('percentageCombined', 'asc');
    });
});

describe('header heights', () => {
    // Tabulator pins each header's height at layout; a label painted in later would
    // be cut off unless the heights are pinned again, by a redraw that keeps the scroll.
    it('re-pins them after every step and after the reset that ends the cycle', () => {
        const table = setupBarTable();
        expect(table.redraw).not.toHaveBeenCalled();

        for (let click = 1; click <= 7; click++) {
            table.clickHeader('percentageCombined');
            expect(table.redraw).toHaveBeenCalledTimes(click);
        }
        expect(table.redraw.mock.calls.every(([force]) => force === false)).toBe(true);
    });

    it('re-pins them after a programmatic sort', () => {
        const table = setupBarTable();
        applyProgressBarSorting(table, 'percentageIncorrect', 'desc');
        expect(table.redraw).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('leaves them alone when resetting a table that shows no highlight', () => {
        const table = setupBarTable();
        resetProgressBarSorting(table);
        expect(table.redraw).not.toHaveBeenCalled();
    });

    it('leaves a table that is still building to lay its headers out itself', () => {
        const table = setupBarTable();
        table.initialized = false;
        table.clickHeader('percentageCombined');
        expect(table.redraw).not.toHaveBeenCalled();
    });
});

describe('applyProgressBarSorting', () => {
    it('sorts by a step field and primes the step the header cycle continues from', () => {
        const table = setupBarTable();

        expect(applyProgressBarSorting(table, 'percentageNotAttempted', 'desc')).toBe(true);

        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'desc');
        expect(getProgressBarSortField(table, 'percentageCombined')).toBe('percentageNotAttempted');
        expect(table.titleHtml('percentageCombined')).toBe(barTitleWith(RESULT.NOT_ATTEMPTED));

        // Step 4 of the cycle, so the next header click is step 5.
        table.clickHeader('percentageCombined');
        expect(activeSort(table, 'percentageCombined')).toEqual({
            field: 'percentageIncorrect',
            dir: 'asc',
        });
    });

    it('accepts the column field itself and sorts by its first field', () => {
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
