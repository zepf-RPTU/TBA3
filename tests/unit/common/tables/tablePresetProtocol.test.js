// @vitest-browser

/**
 * TablePresetManager — the Reset / preset / limit protocol against the table.
 *
 * WHY this file exists: what happens when the user clicks Reset or a preset is
 * an ordered conversation between the preset manager, the table, and callbacks
 * the owning TableModule hands in (persistent filters, filter-menu clearing,
 * onReset), plus the progress-bar shadow sort kept in a third file. Each party
 * was unit-tested alone; the calls *between* them — the order that keeps a
 * cleared filter menu from being restored by its own persistent filter, the
 * programmatic-update window that stops a preset from un-selecting itself while
 * it applies, the "Stärkste 5" limit that must drop the moment the user filters
 * or sorts — were guarded only by one e2e test. These pin them against a fake
 * table that behaves like Tabulator where it matters: `addFilter` /
 * `clearFilter` dispatch `dataFiltered` and `setSort` dispatches `dataSorted`
 * synchronously, which is exactly what the programmatic window has to suppress.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TablePresetManager } from '@tba3/modules/common/tables/internal/tablePresetManager.js';
import { Preset } from '@tba3/modules/common/tables/preset.js';
import { setupProgressBarSorting } from '@tba3/modules/common/tables/progressBarSorting.js';
import { initGlossaryForTests } from '../../support/glossaryFixture.js';

/**
 * Recording Tabulator stand-in. `calls` is the ordered log of every mutating
 * call; events fire synchronously from the same mutators real Tabulator fires
 * them from.
 */
function makeTable({ rows = [] } = {}) {
    const handlers = {};
    /** @type {Array<any[]>} */
    const calls = [];
    const table = {
        calls,
        on: (event, cb) => {
            (handlers[event] ??= []).push(cb);
        },
        off: vi.fn((event, cb) => {
            handlers[event] = (handlers[event] ?? []).filter((h) => h !== cb);
        }),
        emit: (event, ...args) => {
            (handlers[event] ?? []).forEach((cb) => cb(...args));
        },
        clearSort: vi.fn(() => {
            calls.push(['clearSort']);
        }),
        clearFilter: vi.fn(() => {
            calls.push(['clearFilter']);
            table.emit('dataFiltered');
        }),
        addFilter: vi.fn((...args) => {
            calls.push(['addFilter', ...args]);
            table.emit('dataFiltered');
        }),
        setSort: vi.fn((...args) => {
            calls.push(['setSort', ...args]);
            table.emit('dataSorted');
        }),
        deselectRow: vi.fn(() => {
            calls.push(['deselectRow']);
        }),
        getData: vi.fn(() => rows),
        getColumns: () => [],
    };
    return table;
}

const INITIAL_SORT = [{ column: 'lastName', dir: 'asc' }];
const persistentFilter = (row) => row.gender !== 'x';

const byScore = new Preset({ label: 'Beste', sort: [{ column: 'score', dir: 'desc' }] });
const failing = new Preset({
    label: 'Unter Schwelle',
    sort: [{ column: 'score', dir: 'asc' }],
    filters: [{ field: 'score', type: '<', value: 50 }],
});
const topTwo = new Preset({
    label: 'Stärkste 2',
    sort: [{ column: 'score', dir: 'desc' }],
    limit: 2,
});

function setup(
    presets,
    { rows, initialSort = INITIAL_SORT, persistent = [persistentFilter] } = {},
) {
    const manager = new TablePresetManager();
    const table = makeTable({ rows });
    const container = manager.createContainer(presets);
    document.body.appendChild(container);
    const onReset = vi.fn(() => table.calls.push(['onReset']));
    const clearMenu = vi.fn(() => table.calls.push(['clearMenuValues']));
    manager.initStateTracking(
        't1',
        presets,
        table,
        initialSort,
        onReset,
        () => persistent,
        clearMenu,
    );
    manager.attachListeners(presets, table);
    const button = (label) =>
        [...container.querySelectorAll('[data-table-preset-button="true"]')].find(
            (b) => b.textContent === label,
        );
    return { manager, table, container, onReset, clearMenu, button };
}

const activeLabels = (container) =>
    [...container.querySelectorAll('[data-table-preset-button="true"]')]
        .filter((b) => b.classList.contains('is-active'))
        .map((b) => b.textContent);

const callNames = (table) => table.calls.map((c) => c[0]);
const indexOfCall = (table, name, pred = () => true) =>
    table.calls.findIndex((c) => c[0] === name && pred(c));

// The Reset button reads its label from `general.buttons.element_texts.table-reset`,
// so `button('Reset')` only finds it once the annotator is up.
beforeEach(() => {
    document.body.innerHTML = '';
    initGlossaryForTests();
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('Reset — the full protocol, in order', () => {
    it('drops the filter-menu values BEFORE re-attaching persistent filters, so the menu filter cannot restore what Reset just cleared', () => {
        const { table, button, clearMenu } = setup([byScore]);
        table.calls.length = 0;

        button('Reset').click();

        const clearMenuAt = indexOfCall(table, 'clearMenuValues');
        const persistentAt = indexOfCall(table, 'addFilter', (c) => c[1] === persistentFilter);
        expect(clearMenu).toHaveBeenCalledTimes(1);
        expect(clearMenuAt).toBeGreaterThan(-1);
        expect(persistentAt).toBeGreaterThan(clearMenuAt);
        // Sort is cleared before filters (Tabulator's Sort module errors on a
        // stale custom sort state during clearFilter), and both come first.
        expect(callNames(table).slice(0, 2)).toEqual(['clearSort', 'clearFilter']);
    });

    it('restores the default sort, deselects rows, and notifies the owner LAST — after every table mutation', () => {
        const { table, button, onReset } = setup([byScore]);
        table.calls.length = 0;

        button('Reset').click();

        expect(table.deselectRow).toHaveBeenCalledTimes(1);
        expect(table.setSort).toHaveBeenCalledWith(INITIAL_SORT);
        expect(onReset).toHaveBeenCalledTimes(1);
        // The owner resets external state (e.g. a scatterplot selection) on the
        // strength of "the table is now clean" — so it must be told last.
        expect(callNames(table).at(-1)).toBe('onReset');
    });

    it('does not restore a default sort the table was built without', () => {
        const { table, button } = setup([byScore], { initialSort: [] });
        button('Reset').click();
        expect(table.setSort).not.toHaveBeenCalled();
    });

    it('un-selects the active preset', () => {
        const { container, button } = setup([byScore]);
        button('Beste').click();
        expect(activeLabels(container)).toEqual(['Beste']);
        button('Reset').click();
        expect(activeLabels(container)).toEqual([]);
    });
});

describe('Preset switch — a partial reset that keeps what the user set up', () => {
    it('clears sort + programmatic filters and re-attaches persistent ones, but keeps the filter-menu values, the selection, and does not notify the owner', () => {
        const { table, button, clearMenu, onReset } = setup([byScore, failing]);
        table.calls.length = 0;

        button('Unter Schwelle').click();

        expect(callNames(table).slice(0, 2)).toEqual(['clearSort', 'clearFilter']);
        expect(table.addFilter).toHaveBeenCalledWith(persistentFilter);
        expect(clearMenu).not.toHaveBeenCalled();
        expect(table.deselectRow).not.toHaveBeenCalled();
        expect(onReset).not.toHaveBeenCalled();
    });

    it("applies the preset's filters after the persistent ones and its sort last", () => {
        const { table, button } = setup([failing]);
        table.calls.length = 0;

        button('Unter Schwelle').click();

        const persistentAt = indexOfCall(table, 'addFilter', (c) => c[1] === persistentFilter);
        const presetFilterAt = indexOfCall(table, 'addFilter', (c) => c[1] === 'score');
        expect(table.addFilter).toHaveBeenCalledWith('score', '<', 50);
        expect(presetFilterAt).toBeGreaterThan(persistentAt);
        expect(table.setSort).toHaveBeenCalledWith([{ column: 'score', dir: 'asc' }]);
        expect(indexOfCall(table, 'setSort')).toBeGreaterThan(presetFilterAt);
    });

    it('ignores a click on the preset that is already active', () => {
        const { table, button } = setup([byScore]);
        button('Beste').click();
        table.calls.length = 0;
        button('Beste').click();
        expect(table.calls).toEqual([]);
    });
});

describe('The programmatic-update window', () => {
    it('keeps a preset selected while its own application fires dataFiltered/dataSorted, and drops it on the next USER filter or sort', () => {
        const { container, button, table } = setup([byScore]);

        button('Beste').click();
        // The fake dispatched dataFiltered (persistent re-attach) and dataSorted
        // (preset sort) synchronously during the click — the preset survived.
        expect(activeLabels(container)).toEqual(['Beste']);

        table.emit('dataSorted'); // user clicked a column header
        expect(activeLabels(container)).toEqual([]);

        button('Beste').click();
        table.emit('dataFiltered'); // user changed a filter
        expect(activeLabels(container)).toEqual([]);
    });

    it('begin/endProgrammaticUpdate lets the owner swap data (which refilters + resorts) without losing the active preset', () => {
        const { manager, container, button, table } = setup([byScore]);
        button('Beste').click();

        manager.beginProgrammaticUpdate();
        table.emit('dataFiltered');
        table.emit('dataSorted');
        manager.endProgrammaticUpdate();
        expect(activeLabels(container)).toEqual(['Beste']);

        table.emit('dataFiltered');
        expect(activeLabels(container)).toEqual([]);
    });
});

describe('Row-limit presets ("Stärkste N")', () => {
    const rows = [
        { studentId: 's1', score: 9 },
        { studentId: 's2', score: 8 },
        { studentId: 's3', score: 7 },
    ];

    it('pins the first N rows of the SORTED active data by their id field', () => {
        const { button, table } = setup([topTwo], { rows });
        button('Stärkste 2').click();

        const limitCall = table.calls
            .filter(
                (c) =>
                    c[0] === 'addFilter' && typeof c[1] === 'function' && c[1] !== persistentFilter,
            )
            .at(-1);
        expect(limitCall).toBeDefined();
        const keep = limitCall[1];
        expect(rows.map(keep)).toEqual([true, true, false]);
        // The limit is read after the sort was applied, so it pins the top of
        // the preset's order, not the table's previous order.
        expect(indexOfCall(table, 'setSort')).toBeLessThan(table.calls.indexOf(limitCall));
    });

    it('does not pin anything on an empty table', () => {
        const { button, table } = setup([topTwo], { rows: [] });
        button('Stärkste 2').click();
        expect(
            table.calls.filter((c) => c[0] === 'addFilter' && c[1] !== persistentFilter),
        ).toEqual([]);
    });

    it('drops the limit when the user filters: the pinned id set is stale, so ALL filters are cleared and only the persistent ones come back', () => {
        const { button, table, container } = setup([topTwo], { rows });
        button('Stärkste 2').click();
        table.calls.length = 0;

        table.emit('dataFiltered'); // user changed a filter

        expect(activeLabels(container)).toEqual([]);
        expect(callNames(table)).toEqual(['clearFilter', 'addFilter']);
        expect(table.addFilter).toHaveBeenLastCalledWith(persistentFilter);
        // clearFilter dispatched dataFiltered again synchronously — the guard
        // kept that from re-entering (exactly one clearFilter above).
    });

    it('drops the limit when the user sorts, and its guard keeps the synchronous re-filter from re-entering', () => {
        const { button, table, container } = setup([topTwo], { rows });
        button('Stärkste 2').click();
        table.calls.length = 0;

        table.emit('dataSorted'); // user clicked a header

        expect(activeLabels(container)).toEqual([]);
        expect(callNames(table)).toEqual(['clearFilter', 'addFilter']);
    });

    it('Reset with a limit active runs inside the programmatic window: filters are cleared once and the persistent ones re-attached once', () => {
        // Reset's own clearFilter echoes back as dataFiltered. Outside the
        // window, that echo used to trip the limit-drop branch mid-Reset — a
        // second clearFilter and a second addFilter(persistent), the latter
        // even before the menu values were dropped.
        const { button, table } = setup([topTwo], { rows });
        button('Stärkste 2').click();
        table.calls.length = 0;

        button('Reset').click();

        expect(callNames(table).filter((name) => name === 'clearFilter')).toHaveLength(1);
        expect(
            table.calls.filter((c) => c[0] === 'addFilter' && c[1] === persistentFilter),
        ).toHaveLength(1);
        expect(indexOfCall(table, 'clearMenuValues')).toBeLessThan(
            indexOfCall(table, 'addFilter', (c) => c[1] === persistentFilter),
        );
        // The limit is gone with the filters, so the flag must go too — otherwise
        // the next user filter would run the limit-drop branch for nothing.
        table.calls.length = 0;
        table.emit('dataFiltered');
        expect(table.calls).toEqual([]);
    });

    it('resetActivePreset() forgets the limit without touching the table (the caller owns the filters)', () => {
        const { manager, button, table, container } = setup([topTwo], { rows });
        button('Stärkste 2').click();
        table.calls.length = 0;
        manager.resetActivePreset();
        expect(activeLabels(container)).toEqual([]);
        expect(table.calls).toEqual([]);
    });
});

describe('The progress-bar shadow sort', () => {
    /** Table whose 'percentageCombined' column carries the three-field sort cycle. */
    function setupWithProgressBar() {
        const pbPreset = new Preset({
            label: 'Richtig',
            sort: [{ column: 'percentageCorrect', dir: 'desc' }],
        });
        const ctx = setup([pbPreset]);
        setupProgressBarSorting(ctx.table, 'percentageCombined');
        const headerClick = () =>
            ctx.table.emit(
                'headerClick',
                { stopPropagation() {} },
                { getField: () => 'percentageCombined' },
            );
        return { ...ctx, headerClick };
    }

    it('a preset sorting on a virtual progress-bar field sorts the real column and primes the shadow state', () => {
        const { table, button, headerClick } = setupWithProgressBar();
        button('Richtig').click();
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'desc');

        // The next header click continues the cycle from where the preset left it.
        table.setSort.mockClear();
        headerClick();
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'asc');
    });

    it('Reset clears the shadow sort so the header-click cycle restarts from the beginning', () => {
        const { table, button, headerClick } = setupWithProgressBar();
        headerClick();
        headerClick();
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'desc');

        button('Reset').click();
        table.setSort.mockClear();
        headerClick();
        // Without the reset, this click would advance to the third step
        // (notAttempted asc) while the header still highlighted a sort the
        // table no longer had.
        expect(table.setSort).toHaveBeenLastCalledWith('percentageCombined', 'asc');
    });
});

describe('Re-binding to a new table (re-render)', () => {
    it('detaches its listeners from the previous table so a stale table cannot clear the new preset state', () => {
        const presets = [byScore];
        const { manager, table: oldTable, button, container } = setup(presets);
        const newTable = makeTable();
        manager.initStateTracking('t1', presets, newTable, INITIAL_SORT, null, () => [], null);
        manager.attachListeners(presets, newTable);

        expect(oldTable.off).toHaveBeenCalledWith('dataFiltered', expect.any(Function));
        expect(oldTable.off).toHaveBeenCalledWith('dataSorted', expect.any(Function));

        button('Beste').click();
        expect(activeLabels(container)).toEqual(['Beste']);
        oldTable.emit('dataFiltered');
        expect(activeLabels(container)).toEqual(['Beste']);
        newTable.emit('dataFiltered');
        expect(activeLabels(container)).toEqual([]);
    });
});
