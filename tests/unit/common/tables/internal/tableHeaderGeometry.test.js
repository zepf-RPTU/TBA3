// @vitest-browser
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    TableHeaderGeometry,
    createHeaderFloorPass,
} from '@tba3/modules/common/tables/internal/tableHeaderGeometry.js';
import { headerChromeWidth } from '@tba3/modules/common/tables/columnWidthConstants.js';
import { stubCanvasTextMeasurement } from '../../../support/tableHarness.js';

// WHY this file exists: header-derived column floors are px numbers measured
// from rem inputs against a fluid root font size, so they are only right at the
// viewport they were measured at. The rules that keep them (and Tabulator's
// pinned header heights) correct across resizes and show() used to be reachable
// only through the whole TableModule with a real resize path — the e2e spec
// tests/e2e/table-header-stability.spec.js guards the visible outcome, these
// tests pin the individual invariants against a fake table and resize service.

stubCanvasTextMeasurement();

/** Drive the fluid root font size the floors are measured against. */
function setRootFontSize(px) {
    document.documentElement.style.fontSize = `${px}px`;
}

/** Fake Tabulator column component: `_getSelf()` reaches the internal Column. */
function makeColumn(field, minWidth = 0, { withSetter = true } = {}) {
    const column = {
        minWidth,
        setMinWidth: withSetter
            ? vi.fn((w) => {
                  column.minWidth = w;
              })
            : undefined,
    };
    return { getField: () => field, _getSelf: () => column, column };
}

/** Fake Tabulator instance: events, redraw spy, live columns by field. */
function makeTable(columns = []) {
    const handlers = {};
    return {
        initialized: true,
        destroyed: false,
        redraw: vi.fn(),
        on: (event, cb) => {
            (handlers[event] ??= []).push(cb);
        },
        emit: (event) => {
            (handlers[event] ?? []).forEach((cb) => cb());
        },
        getColumns: () => columns,
        columns,
    };
}

/** Fake resize service capturing each observation so a test can fire it. */
function makeResizeService() {
    const observations = new Map();
    return {
        observations,
        observe: vi.fn((element, callback, options) => {
            observations.set(element, { callback, options });
        }),
        unobserve: vi.fn((element) => {
            observations.delete(element);
        }),
        fire: (element) => observations.get(element)?.callback(),
    };
}

/** A container with settable layout size (jsdom has no layout). */
function makeContainer({ width = 800, height = 400 } = {}) {
    const el = document.createElement('div');
    Object.defineProperties(el, {
        offsetWidth: { get: () => width, configurable: true },
        offsetHeight: { get: () => height, configurable: true },
    });
    document.body.appendChild(el);
    return {
        el,
        resize: (w, h = height) => {
            width = w;
            height = h;
        },
    };
}

function makeGeometry() {
    const resizeService = makeResizeService();
    const geometry = new TableHeaderGeometry({ resizeService, scopeId: 'owner-1' });
    return { geometry, resizeService };
}

/** Build a table + record it the way createTable() does: pass → register → observe. */
function buildTable(geometry, defs, container) {
    const pass = createHeaderFloorPass();
    const processed = defs.map((def) => {
        const copy = { ...def };
        pass.apply(copy);
        return copy;
    });
    const table = makeTable(
        processed.filter((c) => c.field).map((c) => makeColumn(c.field, c.minWidth ?? 0)),
    );
    geometry.register(table, pass.headerSized);
    geometry.observe(table, container.el);
    return { table, processed, headerSized: pass.headerSized };
}

beforeEach(() => {
    setRootFontSize(16);
});

afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.fontSize = '';
    vi.restoreAllMocks();
});

describe('createHeaderFloorPass — deriving floors from header titles', () => {
    it('gives a sortable title more chrome than an unsortable one, so the sort arrow never squeezes the text', () => {
        const pass = createHeaderFloorPass();
        const sorted = { title: 'Name', field: 'a' };
        const plain = { title: 'Name', field: 'b', headerSort: false };
        pass.apply(sorted);
        pass.apply(plain);

        expect(sorted.minWidth - plain.minWidth).toBe(
            headerChromeWidth(true) - headerChromeWidth(false),
        );
        expect(pass.headerSized).toEqual([
            { field: 'a', title: 'Name', hasSorter: true },
            { field: 'b', title: 'Name', hasSorter: false },
        ]);
    });

    it('never touches a minWidth the caller supplied — their floor is their decision', () => {
        const pass = createHeaderFloorPass();
        const def = { title: 'A very long header title', field: 'x', minWidth: 30 };
        pass.apply(def);

        expect(def.minWidth).toBe(30);
        expect(pass.headerSized).toEqual([]);
    });

    it('bumps a fixed width that cannot fit its header text, and says so', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const pass = createHeaderFloorPass();
        const def = { title: 'Ergebnis insgesamt', field: 'x', width: 20 };
        pass.apply(def);

        expect(def.width).toBeGreaterThan(20);
        expect(def.minWidth).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
        // A fixed width is not a re-derivable floor.
        expect(pass.headerSized).toEqual([]);
    });

    it('records only fielded columns — a fieldless column cannot be found on the live table later', () => {
        const pass = createHeaderFloorPass();
        const fielded = { title: 'KS', field: 'ks' };
        const fieldless = { title: 'Gruppe' };
        pass.apply(fielded);
        pass.apply(fieldless);

        expect(fieldless.minWidth).toBeGreaterThan(0);
        expect(pass.headerSized.map((e) => e.field)).toEqual(['ks']);
    });

    it('leaves untitled columns alone', () => {
        const pass = createHeaderFloorPass();
        const def = { field: 'icon' };
        pass.apply(def);
        expect(def.minWidth).toBeUndefined();
        expect(pass.headerSized).toEqual([]);
    });
});

describe('TableHeaderGeometry — refreshing floors when the root font size moves', () => {
    it('is a no-op while the root font size holds still: nothing it measures from can have changed', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());

        expect(geometry.refreshAll()).toBe(false);
        expect(table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });

    it('re-derives and pushes the floors once the root font size moves, reporting the change', () => {
        const { geometry } = makeGeometry();
        const { table, processed } = buildTable(
            geometry,
            [{ title: 'Name', field: 'name' }],
            makeContainer(),
        );
        const buildFloor = processed[0].minWidth;

        setRootFontSize(20);
        expect(geometry.refreshAll()).toBe(true);
        expect(table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
        expect(table.columns[0].column.minWidth).toBeGreaterThan(buildFloor);
    });

    it('pushes only floors that actually changed, and reports false when none did', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());

        // Simulate a font-size move that lands on the same measured width: give
        // the live column exactly the width the new measurement will produce.
        setRootFontSize(20);
        const probe = createHeaderFloorPass();
        const expected = { title: 'Name', field: 'name' };
        probe.apply(expected);
        table.columns[0].column.minWidth = expected.minWidth;

        expect(geometry.refreshAll()).toBe(false);
        expect(table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });

    it('skips a recorded column that is no longer on the live table', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(
            geometry,
            [
                { title: 'Name', field: 'name' },
                { title: 'KS', field: 'ks' },
            ],
            makeContainer(),
        );
        table.columns.splice(1, 1); // 'ks' left the table (column swap)

        setRootFontSize(20);
        expect(() => geometry.refreshAll()).not.toThrow();
        expect(table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
    });

    it('does not touch caller-supplied floors on refresh either', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(
            geometry,
            [
                { title: 'Name', field: 'name' },
                { title: 'Balken', field: 'bar', minWidth: 104 },
            ],
            makeContainer(),
        );

        setRootFontSize(20);
        geometry.refreshAll();
        expect(table.columns[1].column.setMinWidth).not.toHaveBeenCalled();
        expect(table.columns[1].column.minWidth).toBe(104);
    });

    it('warns once when Tabulator stops exposing setMinWidth, and keeps the pass eligible to retry', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { geometry } = makeGeometry();
        const container = makeContainer();
        const pass = createHeaderFloorPass();
        const def = { title: 'Name', field: 'name' };
        pass.apply(def);
        const table = makeTable([makeColumn('name', def.minWidth, { withSetter: false })]);
        geometry.register(table, pass.headerSized);
        geometry.observe(table, container.el);

        setRootFontSize(20);
        expect(geometry.refreshAll()).toBe(false);
        expect(geometry.refreshAll()).toBe(false);
        // Latched: a resize burst must not repeat this on every frame.
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('TableHeaderGeometry[owner-1]');

        // The aborted pass did not advance the record's font size: once the API
        // is back, the same font size is reconciled instead of being skipped.
        const column = table.columns[0].column;
        column.setMinWidth = vi.fn((w) => {
            column.minWidth = w;
        });
        expect(geometry.refreshAll()).toBe(true);
        expect(column.setMinWidth).toHaveBeenCalledTimes(1);
    });

    it('a re-registration (column swap) replaces the record — old fields are forgotten', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());

        const swap = createHeaderFloorPass();
        const ksDef = { title: 'KS', field: 'ks' };
        swap.apply(ksDef);
        table.columns.splice(0, 1, makeColumn('ks', ksDef.minWidth));
        geometry.register(table, swap.headerSized);

        setRootFontSize(20);
        expect(geometry.refreshAll()).toBe(true);
        expect(table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
    });
});

describe('TableHeaderGeometry — realigning headers after a container resize', () => {
    it("observes with the owner scope and the realign debounce, so removeByScope releases it and it lands after Tabulator's own resize redraw", () => {
        const { geometry, resizeService } = makeGeometry();
        const container = makeContainer();
        buildTable(geometry, [{ title: 'Name', field: 'name' }], container);

        expect(resizeService.observe).toHaveBeenCalledWith(
            container.el,
            expect.any(Function),
            // Must be longer than Tabulator's own autoResize redraw, which is
            // the pass that leaves the stale header heights behind.
            { scopeId: 'owner-1', debounceMs: 150 },
        );
    });

    it('treats the initial observer delivery as "nothing moved" — no redraw per build', () => {
        const { geometry, resizeService } = makeGeometry();
        const container = makeContainer();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], container);

        resizeService.fire(container.el);
        expect(table.redraw).not.toHaveBeenCalled();
    });

    it('a width change gets exactly one NON-forced redraw: forced would reset the body scroll', () => {
        const { geometry, resizeService } = makeGeometry();
        const container = makeContainer();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], container);

        container.resize(700);
        resizeService.fire(container.el);
        expect(table.redraw).toHaveBeenCalledTimes(1);
        expect(table.redraw).toHaveBeenCalledWith(false);
        expect(table.redraw).not.toHaveBeenCalledWith(true);
    });

    it('a resize that also moves the floors redraws twice, so the pinned heights see the redistributed widths', () => {
        const { geometry, resizeService } = makeGeometry();
        const container = makeContainer();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], container);

        container.resize(700);
        setRootFontSize(20);
        resizeService.fire(container.el);
        expect(table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
        expect(table.redraw).toHaveBeenCalledTimes(2);
        expect(table.redraw.mock.calls).toEqual([[false], [false]]);
    });

    it('a height-only resize does nothing: it cannot invalidate heights or floors, and redrawing would re-enter the observer', () => {
        const { geometry, resizeService } = makeGeometry();
        const container = makeContainer();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], container);

        container.resize(800, 900);
        resizeService.fire(container.el);
        expect(table.redraw).not.toHaveBeenCalled();
    });

    it('the same geometry delivered twice realigns once', () => {
        const { geometry, resizeService } = makeGeometry();
        const container = makeContainer();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], container);

        container.resize(700);
        resizeService.fire(container.el);
        resizeService.fire(container.el);
        expect(table.redraw).toHaveBeenCalledTimes(1);
    });

    it('skips a hidden (zero-size) table, a table still building, and a destroyed table', () => {
        const { geometry, resizeService } = makeGeometry();

        const hidden = makeContainer();
        const { table: hiddenTable } = buildTable(
            geometry,
            [{ title: 'Name', field: 'name' }],
            hidden,
        );
        hidden.resize(0, 0);
        resizeService.fire(hidden.el);
        expect(hiddenTable.redraw).not.toHaveBeenCalled();

        const building = makeContainer();
        const { table: buildingTable } = buildTable(
            geometry,
            [{ title: 'Name', field: 'name' }],
            building,
        );
        buildingTable.initialized = false;
        building.resize(700);
        resizeService.fire(building.el);
        expect(buildingTable.redraw).not.toHaveBeenCalled();

        const dead = makeContainer();
        const { table: deadTable } = buildTable(geometry, [{ title: 'Name', field: 'name' }], dead);
        deadTable.destroyed = true;
        dead.resize(700);
        resizeService.fire(dead.el);
        expect(deadTable.redraw).not.toHaveBeenCalled();
    });
});

describe('TableHeaderGeometry — tracking live tables', () => {
    it('releases the observation when the table is destroyed, so a torn-down table cannot linger in the resize service', () => {
        const { geometry, resizeService } = makeGeometry();
        const container = makeContainer();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], container);

        table.emit('tableDestroyed');
        expect(resizeService.unobserve).toHaveBeenCalledWith(container.el);

        // Forgotten: a later font-size move no longer touches it.
        setRootFontSize(20);
        expect(geometry.refreshAll()).toBe(false);
        expect(table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });

    it('a rebuild sweeps the observation of a container that has left the DOM', () => {
        const { geometry, resizeService } = makeGeometry();
        const first = makeContainer();
        buildTable(geometry, [{ title: 'Name', field: 'name' }], first);
        first.el.remove(); // the module re-rendered without destroying the old table

        const second = makeContainer();
        buildTable(geometry, [{ title: 'Name', field: 'name' }], second);
        expect(resizeService.unobserve).toHaveBeenCalledWith(first.el);
        expect(resizeService.observations.has(second.el)).toBe(true);
    });

    it('refreshAll covers every live table of a multi-table module, skipping ones still building or destroyed', () => {
        const { geometry } = makeGeometry();
        const a = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());
        const b = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());
        const building = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());
        const dead = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());
        building.table.initialized = false;
        dead.table.destroyed = true;

        setRootFontSize(20);
        expect(geometry.refreshAll()).toBe(true);
        expect(a.table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
        expect(b.table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
        expect(building.table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
        expect(dead.table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });

    it('ignores register/observe without a table or container', () => {
        const { geometry, resizeService } = makeGeometry();
        expect(() => geometry.register(null, [])).not.toThrow();
        expect(() => geometry.observe(null, makeContainer().el)).not.toThrow();
        expect(() => geometry.observe(makeTable(), null)).not.toThrow();
        expect(resizeService.observe).not.toHaveBeenCalled();
        expect(geometry.refreshAll()).toBe(false);
    });
});
