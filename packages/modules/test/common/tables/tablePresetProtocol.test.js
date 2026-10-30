// @vitest-browser

/**
 * TablePresetManager — the preset / limit protocol against the table.
 *
 * A click on a preset is an ordered exchange between the preset manager, the table,
 * the filter sync the owning TableModule hands in and the progress-bar sort. These pin
 * the calls between them: the
 * manager's filters reach the table only through the owner's `syncFilters` (so the
 * filter menu's and the module's persistent filters survive every preset action), its
 * own sort does not end the preset it applies, and the user's sort or filter ends a
 * preset, filters and all, unless it filters without a row limit.
 *
 * The fake table behaves like Tabulator where it matters: `setSort` dispatches
 * `dataSorted` synchronously, which the harness forwards to `onUserChange()` as
 * TableModule does, and a filter receives the row's own data object.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { effect } from '@preact/signals-core';
import { TablePresetManager } from '../../../src/common/tables/internal/tablePresetManager.js';
import { setupProgressBarSorting } from '../../../src/common/tables/progressBarSorting.js';
import { createProgressBarColumns } from '../../../src/common/tables/progressBarColumn.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';

/** @typedef {import('vitest').Mock} Mock */
/** @typedef {{[field: string]: any}} RowData */

/**
 * The recording fake: the Tabulator members the manager calls, spied, plus the call log.
 * @typedef {import('../../../src/common/tables/internal/tablePresetManager.js').PresetTable & {
 *   calls: Array<any[]>,
 *   on(event: string, callback: Function): void,
 *   emit: (event: string, ...args: unknown[]) => void,
 *   clearSort: Mock,
 *   setFilter: Mock,
 *   setSort: Mock,
 * }} RecordingTable
 */

/**
 * Recording Tabulator stand-in. `calls` is the ordered log of every mutating call;
 * `setSort` and `clearSort` dispatch `dataSorted` synchronously, as Tabulator does.
 * @param {{rows?: RowData[]}} [options] - The rows `getRows()` returns.
 * @returns {RecordingTable}
 */
function makeTable({ rows = [] } = {}) {
    /** @type {{[event: string]: Function[]}} */
    const handlers = {};
    /** @type {Array<any[]>} */
    const calls = [];
    const table = {
        calls,
        element: document.createElement('div'),
        initialized: true,
        destroyed: false,
        on: (/** @type {string} */ event, /** @type {Function} */ cb) => {
            (handlers[event] ??= []).push(cb);
        },
        emit: (/** @type {string} */ event, /** @type {unknown[]} */ ...args) => {
            (handlers[event] ?? []).forEach((cb) => cb(...args));
        },
        blockRedraw: vi.fn(),
        restoreRedraw: vi.fn(),
        clearSort: vi.fn(() => {
            calls.push(['clearSort']);
            table.emit('dataSorted');
        }),
        setFilter: vi.fn((/** @type {unknown} */ list) => calls.push(['setFilter', list])),
        setSort: vi.fn((...args) => {
            calls.push(['setSort', ...args]);
            table.emit('dataSorted');
        }),
        getRows: vi.fn(() => rows.map((data) => ({ getData: () => data }))),
        getColumn: () => undefined,
        redraw: vi.fn(),
    };
    return table;
}

/** @typedef {import('../../../src/common/tables/preset.js').Preset} Preset */

/** @type {TableRowFilter} */
const isFailing = (row) => row.score < 50;

/** @type {Preset} */ const byScore = { label: 'Beste', sort: { column: 'score', dir: 'desc' } };
/** @type {Preset} */ const failing = {
    label: 'Unter Schwelle',
    sort: { column: 'score', dir: 'asc' },
    filters: [isFailing],
};
/** @type {Preset} */ const topTwo = {
    label: 'Stärkste 2',
    sort: { column: 'score', dir: 'desc' },
    limit: 2,
};
/** @type {Preset} */ const failingTopTwo = {
    label: 'Schwächste 2 unter Schwelle',
    sort: { column: 'score', dir: 'asc' },
    filters: [isFailing],
    limit: 2,
};

const FAILING_FILTER = { field: isFailing };

const ROWS = [
    { studentId: 's1', score: 9 },
    { studentId: 's2', score: 8 },
    { studentId: 's3', score: 7 },
];

/**
 * @param {Preset[]} presets
 * @param {{rows?: RowData[]}} [options]
 */
function setup(presets, { rows } = {}) {
    let table = makeTable({ rows });
    // The owner's side: TableModule puts the manager's filters on its current table.
    const manager = new TablePresetManager(() => table.setFilter(manager.filters));
    const container = document.createElement('div');
    document.body.appendChild(container);
    // The owner's toolbar, rendered again whenever the buttons' state changes.
    effect(() => {
        render(manager.template(), container);
    });
    const bind = (/** @type {RecordingTable} */ next) => {
        table = next;
        // TableModule reports every sort change as the user's.
        table.on('dataSorted', () => manager.onUserChange());
        manager.bind(table, presets);
    };
    bind(table);
    const button = (/** @type {string} */ label) =>
        required(
            [
                ...container.querySelectorAll(
                    /** @type {'button'} */ ('.table-preset-container > button'),
                ),
            ].find((b) => b.textContent?.trim() === label),
            label,
        );
    return { manager, table, container, button, bind };
}

/**
 * @param {HTMLElement} container - The preset button row.
 * @returns {string[]} The labels of the active buttons.
 */
const activeLabels = (container) =>
    [...container.querySelectorAll('.table-preset-container > button')]
        .filter((b) => b.classList.contains('is-active'))
        .map((b) => b.textContent?.trim());

/**
 * @param {RecordingTable} table
 * @returns {string[]} The logged call names, in order.
 */
const callNames = (table) => table.calls.map((c) => c[0]);
/**
 * The filter lists of every `setFilter` call, in order.
 * @param {RecordingTable} table
 * @returns {TableFilterEntry[][]}
 */
const filterLists = (table) => table.calls.filter((c) => c[0] === 'setFilter').map((c) => c[1]);
/**
 * The row-limit filter of the last `setFilter` list, if it carries one.
 * @param {RecordingTable} table
 * @returns {TableFilterEntry['field'] | undefined}
 */
const lastLimitFilter = (table) =>
    filterLists(table)
        .at(-1)
        ?.find((entry) => typeof entry.field === 'function')?.field;

/** @typedef {import('../../../src/common/tables/internal/tablePresetManager.js').TableFilterEntry} TableFilterEntry */
/** @typedef {import('../../../src/common/tables/internal/tablePresetManager.js').TableRowFilter} TableRowFilter */

/** @type {import('../../../src/common/context/index.js').ModuleContext} */
let context;

beforeEach(() => {
    context = createTestContext();
});

describe('Preset switch — replaces the previous preset, and only it', () => {
    it("replaces the previous preset's filters with the new ones and sorts last", () => {
        const { table, button } = setup([failing, byScore]);
        button('Unter Schwelle').click();
        expect(filterLists(table)).toEqual([[FAILING_FILTER]]);
        table.calls.length = 0;

        button('Beste').click();

        expect(callNames(table)).toEqual(['setFilter', 'setSort']);
        expect(filterLists(table)).toEqual([[]]);
        expect(table.setSort).toHaveBeenCalledWith([{ column: 'score', dir: 'desc' }]);
    });

    it('applies the active preset again on its click, bringing back its sort', () => {
        const { manager, table, button, container } = setup([failing]);
        button('Unter Schwelle').click();
        manager.onUserChange();
        table.calls.length = 0;

        button('Unter Schwelle').click();

        expect(callNames(table)).toEqual(['setFilter', 'setSort']);
        expect(table.setSort).toHaveBeenLastCalledWith([{ column: 'score', dir: 'asc' }]);
        expect(activeLabels(container)).toEqual(['Unter Schwelle']);
    });

    it('ignores clicks until the table is built', () => {
        // A preset that sorts before the column DOM exists throws.
        const { table, button } = setup([byScore]);
        table.initialized = false;
        button('Beste').click();
        expect(table.calls).toEqual([]);
    });
});

describe('The user ends a preset', () => {
    it('keeps a preset selected through the sort its own application dispatches', () => {
        // Switching from another preset: the sort reaches onUserChange() while the
        // previous preset is still the active one.
        const { container, button, table } = setup([failing, byScore]);
        button('Unter Schwelle').click();
        table.calls.length = 0;

        button('Beste').click();

        expect(activeLabels(container)).toEqual(['Beste']);
        expect(filterLists(table)).toHaveLength(1);
    });

    it('keeps a preset that filters without a row limit: its filters still apply', () => {
        const { manager, container, button, table } = setup([failing]);
        button('Unter Schwelle').click();
        table.calls.length = 0;

        manager.onUserChange();

        expect(activeLabels(container)).toEqual(['Unter Schwelle']);
        expect(table.calls).toEqual([]);
        expect(manager.filters).toEqual([FAILING_FILTER]);
    });

    it('ends a row-limit preset with its filters, whose pinned rows are out of date', () => {
        const { manager, container, button, table } = setup([failingTopTwo], { rows: ROWS });
        button('Schwächste 2 unter Schwelle').click();
        table.calls.length = 0;

        manager.onUserChange();

        expect(activeLabels(container)).toEqual([]);
        expect(filterLists(table)).toEqual([[]]);
        // Nothing is left: the next user change touches no table.
        table.calls.length = 0;
        manager.onUserChange();
        expect(table.calls).toEqual([]);
    });

    it('ends a preset that only sorts, whose sort is gone', () => {
        const { manager, container, button, table } = setup([byScore]);
        button('Beste').click();
        table.calls.length = 0;

        manager.onUserChange();

        expect(activeLabels(container)).toEqual([]);
        expect(table.calls).toEqual([]);
    });
});

describe('Row-limit presets ("Stärkste N")', () => {
    it('pins the first N rows of the SORTED active rows, by row identity', () => {
        const { button, table } = setup([topTwo], { rows: ROWS });
        button('Stärkste 2').click();

        const keep = /** @type {TableRowFilter} */ (lastLimitFilter(table));
        expect(ROWS.map(keep)).toEqual([true, true, false]);
        // A copy of a pinned row is a different row.
        expect(keep({ ...ROWS[0] })).toBe(false);
        // The limit is read after the sort, so it pins the top of the preset's order.
        expect(callNames(table)).toEqual(['setFilter', 'setSort', 'setFilter']);
    });

    it('does not pin anything on an empty table', () => {
        const { button, table } = setup([topTwo], { rows: [] });
        button('Stärkste 2').click();
        expect(filterLists(table)).toEqual([[]]);
    });

    it('re-picks the rows when the owner re-applies it over changed rows', () => {
        const { manager, button, table } = setup([topTwo], { rows: ROWS });
        button('Stärkste 2').click();
        const firstLimit = lastLimitFilter(table);
        table.calls.length = 0;

        manager.reapplyActivePreset();

        expect(lastLimitFilter(table)).toBeTypeOf('function');
        expect(lastLimitFilter(table)).not.toBe(firstLimit);
    });
});

describe('updatePresets — a new preset set', () => {
    it('re-applies the active preset with its new configuration', () => {
        const { manager, button, table, container } = setup([byScore]);
        button('Beste').click();
        /** @type {Preset} */ const retargeted = {
            label: 'Beste',
            sort: { column: 'avg', dir: 'desc' },
        };
        table.calls.length = 0;

        manager.updatePresets([retargeted]);

        expect(table.setSort).toHaveBeenCalledWith([{ column: 'avg', dir: 'desc' }]);
        expect(activeLabels(container)).toEqual(['Beste']);
    });

    it('drops a preset the new set no longer offers, and its filters with it', () => {
        const { manager, button, table, container } = setup([byScore, failing]);
        button('Unter Schwelle').click();
        table.calls.length = 0;

        manager.updatePresets([byScore]);

        expect(filterLists(table)).toEqual([[]]);
        expect(activeLabels(container)).toEqual([]);
    });

    it("puts a filtering preset's new filters on the table and keeps the user's sort", () => {
        const { manager, button, table, container } = setup([failing]);
        button('Unter Schwelle').click();
        table.calls.length = 0;
        /** @type {TableRowFilter} */
        const isPassing = (row) => row.score >= 50;

        manager.updatePresets([{ ...failing, filters: [isPassing] }]);

        expect(table.calls).toEqual([['setFilter', [{ field: isPassing }]]]);
        expect(activeLabels(container)).toEqual(['Unter Schwelle']);
    });

    it('drops the row limit of the preset a filtering one replaces at the same index', () => {
        const { manager, button, table } = setup([failingTopTwo], { rows: ROWS });
        button('Schwächste 2 unter Schwelle').click();
        table.calls.length = 0;

        manager.updatePresets([failing]);

        expect(filterLists(table)).toEqual([[FAILING_FILTER]]);
        expect(manager.filters).toEqual([FAILING_FILTER]);
    });

    it('touches no filter while no preset is active', () => {
        const { manager, table } = setup([failing]);

        manager.updatePresets([failing]);

        expect(table.calls).toEqual([]);
    });
});

describe('resetActivePreset', () => {
    it("drops the preset's filters from a live table", () => {
        const { manager, button, table, container } = setup([failing]);
        button('Unter Schwelle').click();
        table.calls.length = 0;

        manager.resetActivePreset();

        expect(table.calls).toEqual([['setFilter', []]]);
        expect(activeLabels(container)).toEqual([]);
    });

    it('forgets them without touching a table that is already gone', () => {
        const { manager, button, table } = setup([failing]);
        button('Unter Schwelle').click();
        table.calls.length = 0;
        table.destroyed = true;

        manager.resetActivePreset();

        expect(table.calls).toEqual([]);
        expect(manager.filters).toEqual([]);
    });
});

describe('The progress-bar sort', () => {
    /**
     * Table whose 'percentageCombined' column carries the three-field sort cycle.
     * @returns {ReturnType<typeof setup> & {headerClick: () => void}}
     */
    function setupWithProgressBar() {
        /** @type {Preset} */ const pbPreset = {
            label: 'Richtig',
            sort: { column: 'percentageCorrect', dir: 'desc' },
        };
        const ctx = setup([pbPreset]);
        setupProgressBarSorting(ctx.table, [
            {
                field: 'percentageCombined',
                tableMeta: {
                    progressBarSortSteps: required(createProgressBarColumns(context)[0].tableMeta)
                        .progressBarSortSteps,
                },
            },
        ]);
        const header = ctx.table.element.appendChild(document.createElement('div'));
        header.className = 'tabulator-col';
        header.setAttribute('tabulator-field', 'percentageCombined');
        const headerClick = () => header.click();
        return { ...ctx, headerClick };
    }

    it('a preset sorting on a step field sorts the column and the header cycle continues from it', () => {
        const { table, button, headerClick } = setupWithProgressBar();
        button('Richtig').click();
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'desc');

        table.setSort.mockClear();
        headerClick();
        // Step 2 (not attempted, ascending) follows step 1 (correct, descending).
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'asc');
    });
});

describe('Re-binding to a new table (re-render)', () => {
    it("forgets the previous table's filters and applies presets to the new one", () => {
        const { manager, table: oldTable, button, container, bind } = setup([failing]);
        button('Unter Schwelle').click();
        oldTable.calls.length = 0;

        const newTable = makeTable();
        bind(newTable);
        expect(activeLabels(container)).toEqual([]);
        expect(manager.filters).toEqual([]);

        button('Unter Schwelle').click();
        expect(filterLists(newTable)).toEqual([[FAILING_FILTER]]);
        expect(oldTable.calls).toEqual([]);
    });
});
