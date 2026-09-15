// @vitest-browser
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TableModule } from '@tba3/modules/common/tables/tableModule.js';
import {
    FakeTabulator,
    resetFakeTabulator,
    stubCanvasTextMeasurement,
} from '../../support/tableHarness.js';

vi.mock('@tba3/modules/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

// WHY this file exists: the pure helpers composed by createTable() are well
// tested, but the ~190-line orchestration itself was not — and the bugs live
// in the calls: the capture-filters-before-stripping ordering, the
// isInitialBuild suppression window, and the `finally` guard that keeps
// whenSettled() from wedging a view behind its skeleton. These tests drive the
// REAL createTable in jsdom against a FakeTabulator mocked in for tabulatorBuild.js.

class TestTableModule extends TableModule {
    readyCalls = 0;
    throwOnReady = false;

    _onTableReady() {
        this.readyCalls += 1;
        if (this.throwOnReady) {
            throw new Error('subclass _onTableReady exploded');
        }
    }
}

/** Await enough animation frames for scheduleSettled's frame + follow-up frame. */
function flushRedrawFrames() {
    return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
}

const COLUMNS = [
    { title: 'Name', field: 'name' },
    { title: 'KS', field: 'ks', headerFilter: 'list', headerFilterParams: { values: ['1', '2'] } },
];
const DATA = [{ name: 'A', ks: '1' }];

let host;
let body;
let modules;

function makeModule() {
    const module = new TestTableModule('test-table', host);
    modules.push(module);
    return module;
}

function buildSpec(overrides = {}) {
    return { containerId: 'table-host', columns: COLUMNS, data: DATA, ...overrides };
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
    modules.forEach((module) => module.destroy?.());
    body.remove();
    vi.restoreAllMocks();
});

describe('createTable — validation stays loud but non-throwing', () => {
    it.each([
        ['missing containerId', { containerId: '' }],
        ['empty columns', { columns: [] }],
        ['non-array data', { data: /** @type {any} */ ({}) }],
        ['unknown container element', { containerId: 'no-such-element' }],
    ])('returns null and logs on %s', (_label, override) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const table = makeModule().createTable(buildSpec(override));

        expect(table).toBeNull();
        expect(error).toHaveBeenCalled();
        expect(FakeTabulator.instances).toHaveLength(0);
    });
});

describe('createTable — config assembly', () => {
    it('applies the shared defaults and lets caller options win', () => {
        makeModule().createTable(buildSpec({ options: { selectableRows: false, height: '50%' } }));

        const { config } = FakeTabulator.instances[0];
        expect(config.layout).toBe('fitColumns');
        expect(config.columnCalcs).toBe('both');
        expect(config.movableColumns).toBe(true);
        // Caller overrides beat defaults
        expect(config.selectableRows).toBe(false);
        expect(config.height).toBe('50%');
    });

    it('includes initialSort only when non-empty', () => {
        makeModule().createTable(buildSpec());
        expect(FakeTabulator.instances[0].config.initialSort).toBeUndefined();

        makeModule().createTable(buildSpec({ initialSort: [{ column: 'name', dir: 'asc' }] }));
        expect(FakeTabulator.instances[1].config.initialSort).toEqual([
            { column: 'name', dir: 'asc' },
        ]);
    });
});

describe('createTable — filter capture ordering', () => {
    it('captures headerFilter descriptors before stripping them from what Tabulator sees', () => {
        // WHY: the filter dropdown is built from descriptors captured off the
        // declared columns; if the strip ran first, every table would silently
        // lose its filters while still rendering normally.
        const module = makeModule();
        module.createTable(buildSpec());
        const table = FakeTabulator.instances[0];
        table.addFilter = vi.fn();

        // A value for the captured column attaches the one programmatic filter.
        module._setTableFilterValue('ks', '1');
        expect(table.addFilter).toHaveBeenCalledTimes(1);

        const ksColumn = table.config.columns.find((col) => col.field === 'ks');
        expect(ksColumn.headerFilter).toBeUndefined();
        expect(ksColumn.headerFilterParams).toBeUndefined();
    });
});

describe('createTable — build lifecycle', () => {
    it('holds isInitialBuild and whenSettled until tableBuilt plus the settle redraw', async () => {
        const module = makeModule();
        const table = module.createTable(buildSpec());

        expect(module.isInitialBuild).toBe(true);
        let settled = false;
        module.whenSettled().then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(module.readyCalls).toBe(0);

        table.emit('tableBuilt');
        await flushRedrawFrames();

        expect(module.isInitialBuild).toBe(false);
        expect(module.readyCalls).toBe(1);
        await expect(module.whenSettled()).resolves.toBeUndefined();
        expect(settled).toBe(true);
    });

    it('resolves whenSettled even when _onTableReady throws', async () => {
        // WHY: the `finally` guard — without it a throwing subclass hook leaves
        // the view stuck behind its skeleton until the 3s fail-safe.
        // The throw itself escapes to the frame scheduler (production behavior);
        // swallow it at the window boundary so it doesn't fail the test run.
        const swallow = (event) => event.preventDefault();
        window.addEventListener('error', swallow);
        try {
            const module = makeModule();
            module.throwOnReady = true;
            const table = module.createTable(buildSpec());

            table.emit('tableBuilt');
            await flushRedrawFrames();

            await expect(module.whenSettled()).resolves.toBeUndefined();
            expect(module.readyCalls).toBe(1);
        } finally {
            window.removeEventListener('error', swallow);
        }
    });

    it('gives each build its own settle slot — a later build cannot release an earlier one', async () => {
        const module = makeModule();
        module.createTable(buildSpec());
        const second = module.createTable(buildSpec());

        let settled = false;
        module.whenSettled().then(() => {
            settled = true;
        });

        // Only the second (current) build settles; the first build's slot must
        // keep whenSettled() pending rather than being resolved by proxy.
        second.emit('tableBuilt');
        await flushRedrawFrames();
        await Promise.resolve();

        expect(settled).toBe(false);
    });

    it("releases a superseded build's slot on its own tableBuilt, so multi-table renders settle", async () => {
        // WHY: a multi-table module (SlBaseTableModule) creates all its
        // tables in one pass, so every earlier table is already superseded when
        // its tableBuilt fires and the redraw scheduler declines it. "Built" is
        // that slot's final signal — without releasing there, whenSettled()
        // wedges the view behind its skeleton until the reveal fail-safe.
        const module = makeModule();
        const first = module.createTable(buildSpec());
        const second = module.createTable(buildSpec());

        first.emit('tableBuilt');
        second.emit('tableBuilt');
        await flushRedrawFrames();

        await expect(module.whenSettled()).resolves.toBeUndefined();
        // The superseded build is released without its ready-work: only the
        // current table's settle pass runs _onTableReady.
        expect(module.readyCalls).toBe(1);
    });

    it('tracks built state per table, so a superseded table can be asked on its own', () => {
        // WHY: SlBaseTableModule#_applyVizModeChange redraws every table it
        // manages but must skip the ones still initialising — a redraw against
        // half-built managers is exactly what Tabulator's initGuard warns about.
        // A single module-level flag can only describe the current table; the
        // answer has to be right for each table, in whichever order they build.
        const module = makeModule();
        const first = module.createTable(buildSpec());
        const second = module.createTable(buildSpec());

        expect(module._isTableBuilt(first)).toBe(false);
        expect(module._isTableBuilt(second)).toBe(false);

        second.emit('tableBuilt');
        expect(module._isTableBuilt(second)).toBe(true);
        expect(module._isTableBuilt(first)).toBe(false);

        first.emit('tableBuilt');
        expect(module._isTableBuilt(first)).toBe(true);
        expect(module._isTableBuilt(null)).toBe(false);
    });

    it("releases a build's slot when its table is destroyed before ever building", async () => {
        // WHY: a re-render destroys mid-build tables (clear() /
        // _destroyActiveTables()) whose tableBuilt then never fires, and module
        // destroy() only releases slots still pending at module teardown — the
        // table's own tableDestroyed has to release its slot.
        const module = makeModule();
        const first = module.createTable(buildSpec());
        const second = module.createTable(buildSpec());

        let settled = false;
        module.whenSettled().then(() => {
            settled = true;
        });

        second.emit('tableBuilt');
        await flushRedrawFrames();
        expect(settled).toBe(false);

        first.destroy();
        await flushRedrawFrames();
        expect(settled).toBe(true);
    });
});

describe('createTable — DOM contract', () => {
    it('mounts an inner .table-container and marks the content body as a table host', () => {
        makeModule().createTable(buildSpec());

        const inner = host.querySelector('.table-container');
        expect(inner).not.toBeNull();
        expect(FakeTabulator.instances[0].element).toBe(inner);
        expect(body.classList.contains('has-table')).toBe(true);
    });
});

describe('createTable — the instance published for the e2e specs', () => {
    it('publishes the table on its container and drops it again on destroy', () => {
        const table = makeModule().createTable(buildSpec());
        const inner = host.querySelector('.table-container');

        expect(/** @type {any} */ (inner).tabulator).toBe(table);

        table.destroy();

        // A spec querying one turn late must read nothing, not a destroyed instance
        // that still answers getRows().
        expect(/** @type {any} */ (inner).tabulator).toBeNull();
    });

    it('leaves a newer table on the same container alone when the old one dies late', () => {
        const module = makeModule();
        const first = module.createTable(buildSpec());
        const second = module.createTable(buildSpec());
        const inner = host.querySelector('.table-container');

        expect(/** @type {any} */ (inner).tabulator).toBe(second);

        first.destroy();

        expect(/** @type {any} */ (inner).tabulator).toBe(second);
    });
});

describe('createTable — preset paths', () => {
    it('warns and skips preset rendering when no headerActionsContainer exists', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        makeModule().createTable(buildSpec({ presets: [{ id: 'p1', label: 'Preset' }] }));

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('no headerActionsContainer'));
    });

    it('does not warn when presets are disabled outright', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        makeModule().createTable(
            buildSpec({
                presets: [{ id: 'p1', label: 'Preset' }],
                options: { disablePresets: true },
            }),
        );

        expect(warn).not.toHaveBeenCalled();
    });
});
