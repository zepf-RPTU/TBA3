// @vitest-browser
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nothing, render } from 'lit';
import { effect } from '@preact/signals-core';

import { TableModule } from '../../../src/common/tables/tableModule.js';
import { createProgressBarColumns } from '../../../src/common/tables/progressBarColumn.js';
import {
    applyProgressBarSorting,
    progressBarSortKey,
} from '../../../src/common/tables/progressBarSorting.js';
import { nextAnimationFrames } from '../../support/dom.js';
import { required } from '../../support/required.js';
import {
    FakeTabulator,
    resetFakeTabulator,
    stubCanvasTextMeasurement,
} from '../../support/tableHarness.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

// The helpers createTable() composes are tested on their own; these drive the real
// createTable against the FakeTabulator to pin its orchestration: filters captured
// before they are stripped, the programmatic-change build window, and the `finally`
// guard that keeps updateComplete from wedging a view behind its skeleton.

/** @typedef {import('../../../src/common/tables/tableModule.js').TableOptions} TableOptions */
/** @typedef {import('../../../src/common/tables/columnFactories.js').TableColumnDefinition} TableColumnDefinition */
/** @typedef {import('../../../src/common/tables/internal/tablePresetManager.js').TableRowFilter} TableRowFilter */
/** @typedef {import('../../../src/common/tables/preset.js').PresetSpec} Preset */
/** @typedef {Parameters<TableModule['createTable']>[0]} TableSpec */

class TestTableModule extends TableModule {
    /** @type {import('../../../src/common/tables/tableModule.js').DisplayedRows[]} */
    #reports = [];
    #throwOnReport = false;
    /** @type {Preset[]} */
    #presets = [];
    /** @type {() => void} */
    #onReset = () => {};

    /** @param {() => void} value - What `_onTableReset()` runs. */
    set onReset(value) {
        this.#onReset = value;
    }

    /** @returns {import('../../../src/common/tables/tableModule.js').DisplayedRows[]} What `_onDisplayedRowsChanged()` received, in order. */
    get reports() {
        return this.#reports;
    }

    /** @param {boolean} value - Whether `_onDisplayedRowsChanged()` throws. */
    set throwOnReport(value) {
        this.#throwOnReport = value;
    }

    /** @param {Preset[]} value - The presets `_getPresets()` offers. */
    set presets(value) {
        this.#presets = value;
    }

    /** @override */
    async _renderBody() {}

    /**
     * @override
     * @param {import('../../../src/common/tables/tableModule.js').DisplayedRows} shown
     */
    _onDisplayedRowsChanged(shown) {
        this.#reports.push(shown);
        if (this.#throwOnReport) {
            throw new Error('subclass _onDisplayedRowsChanged exploded');
        }
    }

    /** @override */
    _getPresets() {
        return this.#presets;
    }

    /** @override */
    _onTableReset() {
        this.#onReset();
    }

    // The protected hooks a table subclass calls, callable from the tests.

    /**
     * @param {string} field - The filter-menu field.
     * @param {import('../../../src/common/tables/internal/tableFilterMetadata.js').TableFilterValue} value
     */
    setTableFilterValue(field, value) {
        this._setTableFilterValue(field, value);
    }

    /**
     * @param {string} key
     * @param {TableRowFilter|null} filterFunction - Null removes it.
     */
    setPersistentFilter(key, filterFunction) {
        this._setPersistentFilter(key, filterFunction);
    }
}

customElements.define('test-create-table', TestTableModule);

/**
 * The options a test table takes.
 * @param {Partial<TableOptions>} [overrides]
 * @returns {TableOptions}
 */
function tableOptions(overrides = {}) {
    return { ...createTestModuleOptions(), ...overrides };
}

/** Enough animation frames for scheduleSettled's frame + follow-up frame. */
const REDRAW_FRAMES = 3;

/** @type {TableColumnDefinition[]} */
const COLUMNS = [
    { title: 'Name', field: 'name' },
    {
        title: 'KS',
        field: 'competenceLevelName',
        headerFilter: 'list',
        headerFilterParams: { values: ['1', '2'] },
    },
];
const DATA = [{ name: 'A', competenceLevelName: '1' }];

/** @type {HTMLDivElement} */
let host;
/** @type {HTMLDivElement} */
let body;
/** @type {TestTableModule[]} */
let modules;
/** @type {Array<() => void>} The toolbar effects of the preset tests. */
const disposers = [];

/** @returns {TestTableModule} A module in the document, building into the test host. */
function makeModule() {
    const module = TestTableModule.create('test-table', tableOptions());
    body.append(module);
    modules.push(module);
    return module;
}

/**
 * @param {Partial<TableSpec>} [overrides] - Spec keys to replace.
 * @returns {TableSpec}
 */
function buildSpec(overrides = {}) {
    return { container: host, columns: COLUMNS, data: DATA, ...overrides };
}

/**
 * Build a table on the module and return it (createTable publishes it as `table`).
 * @param {TestTableModule} module
 * @param {Partial<TableSpec>} [overrides] - Spec keys to replace.
 * @returns {FakeTabulator}
 */
function build(module, overrides = {}) {
    module.createTable(buildSpec(overrides));
    // The module's table is the FakeTabulator mocked in for tabulatorBuild.js.
    return /** @type {FakeTabulator} */ (/** @type {unknown} */ (required(module.table)));
}

stubCanvasTextMeasurement();

beforeEach(() => {
    resetFakeTabulator();
    modules = [];
    body = document.createElement('div');
    body.className = 'content-module-body';
    host = document.createElement('div');
    host.id = 'table-host';
    body.appendChild(host);
    document.body.appendChild(body);
});

afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose());
    modules.forEach((module) => module.remove());
    body.remove();
});

describe('createTable — config assembly', () => {
    it('includes initialSort only when non-empty, and hands Tabulator a copy', () => {
        makeModule().createTable(buildSpec());
        expect(required(FakeTabulator.instances[0]).config.initialSort).toBeUndefined();

        // Tabulator writes its Column into the sort items; a shared frozen
        // constant would carry the first table's column into every later one.
        const initialSort = Object.freeze([Object.freeze({ column: 'name', dir: 'asc' })]);
        makeModule().createTable(buildSpec({ initialSort }));
        const handed = FakeTabulator.instances[1]?.config.initialSort;
        expect(handed).toEqual([{ column: 'name', dir: 'asc' }]);
        expect(required(handed)[0]).not.toBe(initialSort[0]);
    });
});

describe('createTable — filter capture ordering', () => {
    it('captures headerFilter descriptors before stripping them from what Tabulator sees', () => {
        // The filter menu is built from descriptors captured off the declared
        // columns; if the strip ran first, every table would lose its filters.
        const module = makeModule();
        module.createTable(buildSpec());
        const table = required(FakeTabulator.instances[0]);

        // A value for the captured column puts the one menu filter on the table.
        module.setTableFilterValue('competenceLevelName', ['1']);
        expect(table.filters).toHaveLength(1);
        const menuFilter = /** @type {TableRowFilter} */ (required(table.filters[0]).field);
        expect(menuFilter({ competenceLevelName: '1' })).toBe(true);
        expect(menuFilter({ competenceLevelName: '2' })).toBe(false);

        const competenceLevelColumn = required(
            table.config.columns?.find((col) => col.field === 'competenceLevelName'),
        );
        expect(competenceLevelColumn.headerFilter).toBeUndefined();
        expect(competenceLevelColumn.headerFilterParams).toBeUndefined();
    });
});

describe('createTable — build lifecycle', () => {
    it('holds the build window and updateComplete until tableBuilt and the settle redraw, then reports the rows once', async () => {
        const module = makeModule();
        const table = build(module);

        // Inside the build window the table's own events are the module's doing.
        table.emit('dataFiltered');
        let settled = false;
        module.updateComplete.then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(module.reports).toEqual([]);

        table.emit('tableBuilt');
        await nextAnimationFrames(REDRAW_FRAMES);

        expect(module.reports).toEqual([{ rows: DATA, selected: [] }]);
        await expect(module.updateComplete).resolves.toBe(true);
        expect(settled).toBe(true);
    });

    it("reports the user's sort, selection and filter of one call once, and the module's own changes never", async () => {
        // One Tabulator refresh fires dataFiltered, rowSelectionChanged and
        // dataSorted; a chart following each would redraw three times, and one
        // following the module's own changes (a mode switch) would redraw twice.
        const module = makeModule();
        const table = build(module);
        table.emit('tableBuilt');
        await nextAnimationFrames(REDRAW_FRAMES);
        module.reports.length = 0;

        table.emit('dataFiltered');
        table.emit('rowSelectionChanged', [], [], [], []);
        table.emit('dataSorted', [{ field: 'name', dir: 'asc' }]);
        expect(module.reports).toEqual([]);
        await Promise.resolve();
        expect(module.reports).toEqual([{ rows: DATA, selected: [] }]);
    });

    it('shows the column and filter menus once built, and drops them with the table', async () => {
        // Menus left after clear() act on a table that no longer exists.
        const module = makeModule();
        const table = build(module);
        /** @returns {unknown} The menus slot of the toolbar, after the presets. */
        const menus = () => /** @type {unknown[]} */ (module.tableHeaderActions())[1];
        expect(menus()).toBe(nothing);

        table.emit('tableBuilt');
        await nextAnimationFrames(REDRAW_FRAMES);
        expect(menus()).not.toBe(nothing);

        module.clear();
        expect(menus()).toBe(nothing);
    });

    it('resolves updateComplete even when _onDisplayedRowsChanged throws', async () => {
        // Without the `finally` guard a throwing subclass hook leaves the view
        // behind its skeleton until the reveal fail-safe. The throw escapes to the
        // frame scheduler, so it is swallowed at the window to keep the run green.
        const swallow = (/** @type {ErrorEvent} */ event) => event.preventDefault();
        window.addEventListener('error', swallow);
        try {
            const module = makeModule();
            module.throwOnReport = true;
            const table = build(module);

            table.emit('tableBuilt');
            await nextAnimationFrames(REDRAW_FRAMES);

            await expect(module.updateComplete).resolves.toBe(true);
            expect(module.reports).toHaveLength(1);
        } finally {
            window.removeEventListener('error', swallow);
        }
    });

    it('destroys the table a rebuild replaces, and settles with the new build alone', async () => {
        // One table per module. The replaced one must not keep its observers,
        // listeners and settle slot alive, and updateComplete must wait for the new
        // build only.
        const module = makeModule();
        const first = build(module);
        const second = build(module);
        expect(first.destroyed).toBe(true);

        let settled = false;
        module.updateComplete.then(() => {
            settled = true;
        });
        await nextAnimationFrames(REDRAW_FRAMES);
        expect(settled).toBe(false);

        second.emit('tableBuilt');
        await nextAnimationFrames(REDRAW_FRAMES);
        expect(settled).toBe(true);
    });

    it("releases a superseded build's slot on its own tableBuilt, so a rebuild settles", async () => {
        // A rebuild can start before the previous table built, so that table
        // is superseded when its tableBuilt fires and the redraw scheduler declines
        // it. tableBuilt is that slot's last signal; unreleased, it wedges
        // updateComplete until the reveal fail-safe.
        const module = makeModule();
        const first = build(module);
        const second = build(module);

        first.emit('tableBuilt');
        second.emit('tableBuilt');
        await nextAnimationFrames(REDRAW_FRAMES);

        await expect(module.updateComplete).resolves.toBe(true);
        // The superseded build is released without its ready-work: only the
        // current table's settle pass reports its rows.
        expect(module.reports).toHaveLength(1);
    });

    it("releases a build's slot when its table is destroyed before ever building", async () => {
        // Clear() on a re-render destroys a mid-build table whose tableBuilt then
        // never fires, and module destroy() only releases slots still pending at
        // module teardown — the table's own tableDestroyed has to release its slot.
        const module = makeModule();
        module.createTable(buildSpec());

        let settled = false;
        module.updateComplete.then(() => {
            settled = true;
        });
        module.clear();
        await nextAnimationFrames(REDRAW_FRAMES);
        expect(settled).toBe(true);
    });
});

describe('createTable — the instance published for the e2e specs', () => {
    it('publishes the table on its container and drops it again on destroy', () => {
        const table = build(makeModule());
        const inner = host.querySelector('.table-container');

        expect(/** @type {any} */ (inner).tabulator).toBe(table);

        table.destroy();

        // A spec querying one turn late must read nothing, not a destroyed instance
        // that still answers getRows().
        expect(/** @type {any} */ (inner).tabulator).toBeNull();
    });

    it('leaves a newer table on the same container alone when the old one dies late', () => {
        const module = makeModule();
        const first = build(module);
        const second = build(module);
        const inner = host.querySelector('.table-container');

        expect(/** @type {any} */ (inner).tabulator).toBe(second);

        first.destroy();

        expect(/** @type {any} */ (inner).tabulator).toBe(second);
    });
});

describe('createTable — preset paths', () => {
    /**
     * A built module with one preset, its table fake recording what the module and
     * the preset manager ask of it. `setSort` dispatches `dataSorted` synchronously
     * with the sorters it was given, as Tabulator does.
     * @param {Preset} preset
     * @param {import('tabulator-tables').Sorter[]} [initialSort]
     * @param {TableColumnDefinition[]} [columns] - The table's columns (default: `COLUMNS`).
     */
    async function buildPresetTable(preset, initialSort = [], columns = COLUMNS) {
        const actions = document.createElement('div');
        body.appendChild(actions);
        const module = TestTableModule.create('preset-table', tableOptions());
        module.presets = [preset];
        body.append(module);
        modules.push(module);
        // A parent card that hosts the table's toolbar, rendering it again on every change.
        disposers.push(
            effect(() => {
                render(module.tableHeaderActions(), actions);
            }),
        );

        module.createTable(buildSpec({ initialSort, columns }));
        const fake = required(FakeTabulator.instances.at(-1));
        /**
         * @param {string | Array<{column: string, dir: string}>} sort
         * @param {string} [dir] - Only with a single column.
         * @returns {Array<{field: string, dir: string|undefined}>} The sorters `dataSorted` reports.
         */
        const toSorters = (sort, dir) =>
            Array.isArray(sort)
                ? sort.map((s) => ({ field: s.column, dir: s.dir }))
                : [{ field: sort, dir }];
        const table = Object.assign(fake, {
            blockRedraw: vi.fn(),
            restoreRedraw: vi.fn(),
            setFilter: vi.fn((/** @type {FakeTabulator['filters']} */ list) => {
                fake.filters = list;
            }),
            clearSort: vi.fn(() => fake.emit('dataSorted', [], [])),
            getColumn: () => undefined,
            setSort: vi.fn(
                (
                    /** @type {string | Array<{column: string, dir: string}>} */ sort,
                    /** @type {string} [dir] */ dir,
                ) => fake.emit('dataSorted', toSorters(sort, dir), []),
            ),
            deselectRow: vi.fn(),
            replaceData: vi.fn(async () => {}),
            getRows: vi.fn(() =>
                [
                    { id: 'a', score: 9 },
                    { id: 'b', score: 8 },
                ].map((data) => ({ getData: () => data })),
            ),
        });
        table.emit('tableBuilt');
        await nextAnimationFrames(REDRAW_FRAMES);

        const presetButton = () =>
            required(actions.querySelector(/** @type {'button'} */ ('[data-preset-index="0"]')));
        const isActive = () => presetButton().classList.contains('is-active');
        const resetButton = () =>
            required(
                actions.querySelector(
                    /** @type {'button'} */ ('[data-header-action-button="table-reset"]'),
                ),
            );
        return { module, table, presetButton, isActive, actions, resetButton };
    }

    /** @type {Preset} */ const topTwo = {
        key: 'top-two',
        sort: { column: 'score', dir: 'desc' },
        limit: 2,
    };

    it("drops an active preset on the user's sort, and keeps it through a refilter's unchanged one", async () => {
        // Tabulator dispatches dataSorted on every refilter (a tree row expanding
        // refilters), so only a changed sort may end the preset.
        const { table, presetButton, isActive } = await buildPresetTable(topTwo);
        presetButton().click();
        expect(isActive()).toBe(true);

        table.emit('dataSorted', [{ field: 'score', dir: 'desc' }], []);
        expect(isActive()).toBe(true);

        table.emit('dataSorted', [{ field: 'score', dir: 'asc' }], []);
        expect(isActive()).toBe(false);
    });

    it("drops an active preset on the user's filter-menu change", async () => {
        const { module, presetButton, isActive } = await buildPresetTable(topTwo);
        presetButton().click();

        module.setTableFilterValue('competenceLevelName', ['1']);

        expect(isActive()).toBe(false);
    });

    /** @type {TableRowFilter} */
    const aboveEight = (row) => row.score > 8;
    /** @type {Preset} */ const overEight = {
        key: 'over-eight',
        sort: { column: 'score', dir: 'desc' },
        filters: [aboveEight],
    };

    it("keeps a filtering preset, its filter on the table, through the user's sort and filter", async () => {
        // A filter nothing on screen shows would hide rows: the pressed button is it.
        const { module, table, presetButton, isActive } = await buildPresetTable(overEight);
        presetButton().click();

        table.emit('dataSorted', [{ field: 'name', dir: 'asc' }], []);
        module.setTableFilterValue('competenceLevelName', ['1']);

        expect(isActive()).toBe(true);
        expect(table.filters.map((filter) => filter.field)).toContain(aboveEight);
    });

    it("clears the active preset's filters along with the menu values, and keeps sort and selection", async () => {
        const { module, table, presetButton, isActive, actions } =
            await buildPresetTable(overEight);
        presetButton().click();
        module.setTableFilterValue('competenceLevelName', ['1']);
        table.setSort.mockClear();

        required(
            actions.querySelector(
                /** @type {'button'} */ ('[data-header-action-button="table-filters"]'),
            ),
        ).click();
        required(
            actions.querySelector(/** @type {'button'} */ ('button.table-filter-clear')),
        ).click();

        expect(table.filters).toEqual([]);
        expect(isActive()).toBe(false);
        expect(table.setSort).not.toHaveBeenCalled();
        expect(table.deselectRow).not.toHaveBeenCalled();
    });

    it('swaps a persistent filter, re-applies an active preset over the new rows, and builds new tables with it', async () => {
        const { module, table, presetButton, isActive } = await buildPresetTable(topTwo);
        presetButton().click();
        /** @type {TableRowFilter} */
        const domainFilter = (row) => row.score > 5;
        const firstLimit = table.filters.at(-1)?.field;
        table.setFilter.mockClear();

        module.setPersistentFilter('domain', domainFilter);

        // The preset is re-applied: once without its row limit, then with the limit
        // picked again over the rows the new filter leaves.
        expect(table.setFilter).toHaveBeenCalledTimes(2);
        expect(table.filters[0]).toEqual({ field: domainFilter });
        expect(table.filters).toHaveLength(2);
        expect(table.filters[1]?.field).not.toBe(firstLimit);
        expect(isActive()).toBe(true);

        module.createTable(buildSpec());
        expect(FakeTabulator.instances.at(-1)?.config.initialFilter).toEqual([
            { field: domainFilter },
        ]);

        module.setPersistentFilter('domain', null);
        module.createTable(buildSpec());
        expect(FakeTabulator.instances.at(-1)?.config.initialFilter).toBeUndefined();
    });

    it('carries an active preset across a data swap, and keeps the user sort without one', async () => {
        /** @type {import('tabulator-tables').Sorter[]} */
        const initialSort = [{ column: 'name', dir: 'asc' }];
        const { module, table, presetButton, isActive } = await buildPresetTable(
            topTwo,
            initialSort,
        );
        presetButton().click();
        table.setSort.mockClear();

        await module.setRows([], { columns: COLUMNS });
        expect(table.setSort).toHaveBeenCalledWith([{ column: 'score', dir: 'desc' }]);
        expect(table.setSort).not.toHaveBeenCalledWith(initialSort);

        // The user's sort ends the preset; the next swap leaves that sort standing
        // (Tabulator's replaceData keeps its sorters).
        table.emit('dataSorted', [{ field: 'name', dir: 'desc' }], []);
        expect(isActive()).toBe(false);
        table.setSort.mockClear();
        await module.setRows([], { columns: COLUMNS });
        expect(table.setSort).not.toHaveBeenCalled();
    });

    /**
     * Record the order of the swap's block, load, filter and restore on a preset table.
     * @param {Awaited<ReturnType<typeof buildPresetTable>>['table']} table
     * @returns {string[]} The calls, filled in as they happen.
     */
    function recordSwapCalls(table) {
        /** @type {string[]} */
        const calls = [];
        table.blockRedraw.mockImplementation(() => calls.push('block'));
        table.restoreRedraw.mockImplementation(() => calls.push('restore'));
        table.replaceData.mockImplementation(async () => {
            calls.push('replace');
        });
        table.setFilter.mockImplementation((list) => {
            table.filters = list;
            calls.push('filter');
        });
        return calls;
    }

    it('swaps rows under a filtering preset in one blocked pass, its filter set before the restore', async () => {
        const { module, table, presetButton } = await buildPresetTable(overEight);
        presetButton().click();
        const calls = recordSwapCalls(table);

        await module.setRows([], { columns: COLUMNS });

        // One block, one restore: blocking again would drop the refresh the load queued.
        expect(calls).toEqual(['block', 'replace', 'filter', 'restore']);
    });

    it('swaps rows without a preset in one blocked pass', async () => {
        const { module, table } = await buildPresetTable(overEight);
        const calls = recordSwapCalls(table);

        await module.setRows([], { columns: COLUMNS });

        expect(calls).toEqual(['block', 'replace', 'restore']);
    });

    it('refilters once when a filter-menu value ends a preset that held filters', async () => {
        const { module, table, presetButton, isActive } = await buildPresetTable(topTwo);
        presetButton().click();
        table.setFilter.mockClear();

        module.setTableFilterValue('competenceLevelName', ['1']);

        expect(isActive()).toBe(false);
        expect(table.setFilter).toHaveBeenCalledOnce();
    });

    it('builds the table from the spec when there is none, and swaps rows when there is', async () => {
        // Recreating a live table on a selection switch loses its filters.
        const module = makeModule();
        const onRowClick = vi.fn();

        await module.setRows(DATA, { columns: COLUMNS, onRowClick });
        const table = /** @type {FakeTabulator} */ (
            /** @type {unknown} */ (required(module.table))
        );
        table.emit('rowClick', new MouseEvent('click'), { getData: () => DATA[0] });
        expect(onRowClick).toHaveBeenCalledExactlyOnceWith(DATA[0]);
        table.replaceData = vi.fn(async () => {});
        const setColumns = vi.spyOn(table, 'setColumns');

        await module.setRows([{ name: 'B', competenceLevelName: '2' }], { columns: COLUMNS });
        expect(module.table).toBe(table);
        expect(setColumns).not.toHaveBeenCalled();
        expect(table.replaceData).toHaveBeenCalledWith([{ name: 'B', competenceLevelName: '2' }]);
    });

    it('swaps the columns in before the rows when their fields changed, as one reported change', async () => {
        // The MA group table drops its Kompetenzstufe column for a single Leitidee.
        const module = makeModule();
        await module.setRows(DATA, { columns: COLUMNS });
        const table = /** @type {FakeTabulator} */ (
            /** @type {unknown} */ (required(module.table))
        );
        table.emit('tableBuilt');
        await nextAnimationFrames(REDRAW_FRAMES);
        // A filter value on the column that goes: the swap drops it and refilters.
        module.setTableFilterValue('competenceLevelName', ['1']);
        /** @type {string[]} */
        const calls = [];
        vi.spyOn(table, 'setColumns').mockImplementation(() => {
            calls.push('columns');
        });
        table.setFilter = vi.fn(() => table.emit('dataFiltered'));
        table.replaceData = vi.fn(async () => {
            calls.push('rows');
            table.emit('dataFiltered');
        });
        await Promise.resolve();
        module.reports.length = 0;

        await module.setRows([{ name: 'B' }], { columns: [COLUMNS[0]] });
        await Promise.resolve();

        expect(calls).toEqual(['columns', 'rows']);
        expect(module.reports).toHaveLength(1);
    });

    it('reports a data swap under an active row-limit preset once, after the preset is re-applied', async () => {
        // In between, the limit still keeps the old rows by identity and lets none of
        // the new ones through: a chart following that report would draw no student.
        const { module, table, presetButton } = await buildPresetTable(topTwo);
        presetButton().click();
        // Tabulator refilters inside the call that swaps or filters the rows.
        table.setFilter.mockImplementation((list) => {
            table.filters = list;
            table.emit('dataFiltered');
        });
        table.replaceData.mockImplementation(async () => table.emit('dataFiltered'));
        await Promise.resolve();
        module.reports.length = 0;

        await module.setRows([{ name: 'B', competenceLevelName: '2' }], { columns: COLUMNS });
        await Promise.resolve();

        expect(module.reports).toHaveLength(1);
    });

    it.each([
        ['finished', () => Promise.resolve()],
        ['failed', () => Promise.reject(new Error('swap failed'))],
    ])(
        'does nothing more for a table cleared while its swap was in flight (%s)',
        async (_outcome, settle) => {
            // A newer pass cleared the table on purpose: neither the old table nor a
            // new one built from the stale rows may follow.
            const module = makeModule();
            const table = build(module, { initialSort: [{ column: 'name', dir: 'asc' }] });
            table.emit('tableBuilt');
            await nextAnimationFrames(REDRAW_FRAMES);
            /** @type {() => void} */
            let land = () => {};
            const swapped = new Promise((resolve) => {
                land = () => resolve(undefined);
            });
            const swapping = Object.assign(table, {
                replaceData: vi.fn(() => swapped.then(settle)),
                setSort: vi.fn(),
            });
            const pending = module.setRows([{ name: 'B' }], { columns: COLUMNS });
            module.clear();
            land();
            await pending;

            expect(swapping.setSort).not.toHaveBeenCalled();
            expect(module.table).toBeNull();
        },
    );

    describe('Reset', () => {
        /** @type {import('tabulator-tables').Sorter[]} */
        const initialSort = [{ column: 'name', dir: 'asc' }];

        /**
         * Log the calls a reset makes on the table, and the owner's hook, in order.
         * @param {Awaited<ReturnType<typeof buildPresetTable>>} built
         * @returns {string[]} The calls, filled in as they happen.
         */
        function recordResetCalls({ module, table }) {
            /** @type {string[]} */
            const calls = [];
            table.setFilter.mockImplementation((list) => {
                table.filters = list;
                calls.push('setFilter');
            });
            table.deselectRow.mockImplementation(() => calls.push('deselectRow'));
            table.setSort.mockImplementation(() => calls.push('setSort'));
            table.clearSort.mockImplementation(() => calls.push('clearSort'));
            module.onReset = () => calls.push('onReset');
            return calls;
        }

        it('drops the preset and the menu values in one refilter, then the selection, restores the default sort and tells the owner last', async () => {
            const built = await buildPresetTable(overEight, initialSort);
            built.presetButton().click();
            built.module.setTableFilterValue('competenceLevelName', ['1']);
            const calls = recordResetCalls(built);

            built.resetButton().click();

            expect(calls).toEqual(['setFilter', 'deselectRow', 'setSort', 'onReset']);
            expect(built.table.filters).toEqual([]);
            expect(built.table.setSort).toHaveBeenCalledWith(initialSort);
            // A copy: Tabulator writes its Column into the items it is given.
            expect(built.table.setSort.mock.calls[0][0][0]).not.toBe(initialSort[0]);
            expect(built.isActive()).toBe(false);
        });

        it('clears the sort of a table built without a default one', async () => {
            const built = await buildPresetTable(topTwo);
            const calls = recordResetCalls(built);

            built.resetButton().click();

            expect(calls).toEqual(['deselectRow', 'clearSort', 'onReset']);
        });

        it('un-selects the active preset before the owner hears of the reset', async () => {
            // The owner drops its own filters in _onTableReset (EN's scatterplot filter),
            // and a persistent-filter swap re-applies an *active* preset.
            const built = await buildPresetTable(topTwo);
            built.presetButton().click();
            /** @type {boolean[]} */
            const activeAtReset = [];
            built.module.onReset = () => activeAtReset.push(built.isActive());

            built.resetButton().click();

            expect(activeAtReset).toEqual([false]);
        });

        it('restarts the progress-bar sort cycle', async () => {
            const columns = [
                ...COLUMNS,
                createProgressBarColumns(createTestModuleOptions().context)[0],
            ];
            const built = await buildPresetTable(topTwo, [], columns);
            applyProgressBarSorting(built.table, 'percentageCombined', 'desc');
            expect(progressBarSortKey(built.table)).not.toBe('');

            built.resetButton().click();

            expect(progressBarSortKey(built.table)).toBe('');
        });

        it('is offered only by a table whose rows the reader can narrow', async () => {
            const module = makeModule();
            const actions = document.createElement('div');
            body.appendChild(actions);
            disposers.push(
                effect(() => {
                    render(module.tableHeaderActions(), actions);
                }),
            );
            const table = build(module, { columns: [{ title: 'Name', field: 'name' }] });
            table.emit('tableBuilt');
            await nextAnimationFrames(REDRAW_FRAMES);

            expect(actions.querySelector('[data-header-action-button="table-reset"]')).toBeNull();

            const filtered = build(module);
            filtered.emit('tableBuilt');
            await nextAnimationFrames(REDRAW_FRAMES);

            expect(
                actions.querySelector('[data-header-action-button="table-reset"]'),
            ).not.toBeNull();
        });
    });
});

describe('createTable — filters set while Tabulator builds', () => {
    it('puts a filter set before tableBuilt on the table, over the initial filters Tabulator re-applies', () => {
        const module = makeModule();
        const table = build(module);
        /** @type {TableRowFilter} */
        const domainFilter = (row) => row.name === 'A';

        module.setPersistentFilter('domain', domainFilter);
        // As Tabulator's filter module does when the table is built.
        table.filters = table.config.initialFilter ?? [];
        table.emit('tableBuilt');

        expect(table.filters).toEqual([{ field: domainFilter }]);
    });
});
