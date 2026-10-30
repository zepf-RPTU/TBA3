// @vitest-browser
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    TableHeaderGeometry,
    createHeaderFloorPass,
} from '../../../../src/common/tables/internal/tableHeaderGeometry.js';
import { buildRealTabulator, destroyRealTabulators } from '../../../support/realTabulator.js';
import { stubCanvasTextMeasurement } from '../../../support/tableHarness.js';
import { required } from '../../../support/required.js';

/** @typedef {import('../../../../src/common/tables/columnFactories.js').TableColumnDefinition} TableColumnDefinition */
/** @typedef {import('vitest').Mock} Mock */
/** @typedef {ReturnType<typeof makeColumn>} FakeColumn */

/**
 * The fake table: the Tabulator members the geometry reads, plus its live columns and an
 * event trigger.
 * @typedef {import('../../../../src/common/tables/internal/tableHeaderGeometry.js').GeometryTable & {
 *   redraw: Mock,
 *   emit: (event: string) => void,
 *   columns: FakeColumn[],
 * }} FakeGeometryTable
 */

/**
 * The fake resize service: the real one's `observe`, plus the released elements and a trigger.
 * @typedef {import('@tba3/module-base').ResizeObserving & {
 *   released: Element[],
 *   fire: (element: Element) => unknown,
 * }} FakeResizeService
 */

/**
 * A column definition, typed as the floor pass takes it.
 * @param {TableColumnDefinition} fields
 * @returns {TableColumnDefinition} The same object.
 */
const columnDef = (fields) => fields;

/**
 * The floor a pass gave a definition, asserted set.
 * @param {TableColumnDefinition} definition
 * @returns {number} Its `minWidth`.
 */
const floorOf = (definition) => required(definition.minWidth, 'minWidth');

// Header-derived column floors are px numbers measured from rem inputs, so they are
// right only at the root font size they were measured at.
// These pin the rules that keep them (and Tabulator's pinned header heights) correct
// across resizes and show(), against a fake table and resize service.

stubCanvasTextMeasurement();

/**
 * Drive the root font size the floors are measured against.
 * @param {number} px
 */
function setRootFontSize(px) {
    document.documentElement.style.fontSize = `${px}px`;
}

/**
 * Fake Tabulator column component: `_getSelf()` reaches the internal Column. Flexible
 * (no fixed width): a fitContent column is tested on the real Tabulator.
 * @param {string} field
 * @param {number} [minWidth] - Its live floor.
 */
function makeColumn(field, minWidth = 0) {
    const column = {
        minWidth,
        setMinWidth: vi.fn((/** @type {number} */ w) => {
            column.minWidth = w;
        }),
        setWidth: vi.fn(),
    };
    /** @type {import('tabulator-tables').ColumnDefinition} */
    const definition = { title: field, field };
    return {
        getField: () => field,
        getDefinition: () => definition,
        _getSelf: () => column,
        column,
    };
}

/**
 * Fake Tabulator instance: events, redraw spy, live columns by field.
 * @param {FakeColumn[]} [columns]
 * @returns {FakeGeometryTable}
 */
function makeTable(columns = []) {
    /** @type {{[event: string]: Array<() => void>}} */
    const handlers = {};
    /** @type {FakeGeometryTable} */
    const table = {
        initialized: true,
        destroyed: false,
        redraw: vi.fn(),
        on: (/** @type {string} */ event, /** @type {() => void} */ cb) => {
            (handlers[event] ??= []).push(cb);
        },
        emit: (/** @type {string} */ event) => {
            (handlers[event] ?? []).forEach((cb) => cb());
        },
        getColumns: () => columns,
        columns,
    };
    return table;
}

/**
 * Fake resize service capturing each observation so a test can fire it.
 * @returns {FakeResizeService}
 */
function makeResizeService() {
    /** @type {Map<Element, {measure: () => boolean, draw: () => unknown}>} */
    const observations = new Map();
    /** @type {FakeResizeService} */
    const service = {
        released: [],
        observe: (element, handler) => {
            // The geometry observes with a measure/draw pair, never a plain callback.
            observations.set(
                element,
                /** @type {{measure: () => boolean, draw: () => unknown}} */ (handler),
            );
            return () => {
                service.released.push(element);
                observations.delete(element);
            };
        },
        fire: (/** @type {Element} */ element) => {
            const observation = observations.get(element);
            if (observation?.measure()) observation.draw();
        },
    };
    return service;
}

/**
 * A container with settable layout size.
 * @param {{width?: number, height?: number}} [size] - The initial layout size.
 */
function makeContainer({ width = 800, height = 400 } = {}) {
    const el = document.createElement('div');
    Object.defineProperties(el, {
        offsetWidth: { get: () => width, configurable: true },
        offsetHeight: { get: () => height, configurable: true },
    });
    document.body.appendChild(el);
    return {
        el,
        resize: (/** @type {number} */ w, h = height) => {
            width = w;
            height = h;
        },
    };
}

function makeGeometry() {
    const resizeService = makeResizeService();
    const geometry = new TableHeaderGeometry(resizeService);
    return { geometry, resizeService };
}

/**
 * Build a table + attach it the way createTable() does: pass → attach.
 * @param {TableHeaderGeometry} geometry
 * @param {TableColumnDefinition[]} defs
 * @param {ReturnType<typeof makeContainer>} container
 */
function buildTable(geometry, defs, container) {
    const pass = createHeaderFloorPass();
    const processed = defs.map((definition) => {
        const copy = { ...definition };
        pass.apply(copy, copy.headerSort !== false);
        return copy;
    });
    const table = makeTable(
        processed.flatMap((c) => (c.field ? [makeColumn(c.field, c.minWidth ?? 0)] : [])),
    );
    geometry.attach(table, container.el, pass.headerSized);
    return { table, processed, headerSized: pass.headerSized };
}

beforeEach(() => {
    setRootFontSize(16);
});

afterEach(() => {
    document.documentElement.style.fontSize = '';
});

describe('createHeaderFloorPass — deriving floors from header titles', () => {
    it('reserves the indicator width of a sortable header, so the sort arrow never squeezes the text', () => {
        const pass = createHeaderFloorPass();
        const plain = columnDef({ title: 'Name', field: 'a', headerSort: false });
        const sorted = columnDef({ title: 'Name', field: 'b' });
        pass.apply(plain, false);
        pass.apply(sorted, true);

        // The title/sorter gap (0.25rem) plus a glyph as wide as the header text
        // (12px fallback): 16px at a 16px root.
        expect(floorOf(sorted) - floorOf(plain)).toBe(16);
        expect(pass.headerSized).toEqual([
            { field: 'a', text: 'Name', bold: false, sortable: false, minimum: 0 },
            { field: 'b', text: 'Name', bold: false, sortable: true, minimum: 0 },
        ]);
    });

    it('keeps a minWidth the caller supplied when the widest word fits it', () => {
        const pass = createHeaderFloorPass();
        const def = columnDef({
            title: 'Verteilung der Gesamtergebnisse',
            field: 'x',
            minWidth: 400,
        });
        pass.apply(def, true);

        expect(def.minWidth).toBe(400);
        expect(pass.headerSized).toEqual([
            { field: 'x', text: 'Gesamtergebnisse', bold: false, sortable: true, minimum: 400 },
        ]);
    });

    it('raises a caller minWidth to the widest word, so a title wraps between words but never inside one', () => {
        const pass = createHeaderFloorPass();
        const narrow = columnDef({ title: 'Geschlechtsverteilung', field: 'x', minWidth: 30 });
        const auto = columnDef({ title: 'Geschlechtsverteilung', field: 'y' });
        const twoWords = columnDef({
            title: 'Anzahl Geschlechtsverteilung',
            field: 'z',
            minWidth: 30,
        });
        pass.apply(narrow, true);
        pass.apply(auto, true);
        pass.apply(twoWords, true);

        // One word: the whole title on one line is the floor either way.
        expect(narrow.minWidth).toBe(auto.minWidth);
        // Two words may wrap: the floor is the wider word, not both on one line.
        expect(twoWords.minWidth).toBe(narrow.minWidth);
    });

    it('counts the sort-step labels painted after the title as words of the header, bold as the step in force is painted', () => {
        const pass = createHeaderFloorPass();
        const def = columnDef({ title: 'Verteilung', field: 'x', minWidth: 30 });
        pass.apply(def, true, { sortLabels: ['Richtig', 'Unbearbeitet', 'Falsch'] });

        expect(pass.headerSized).toEqual([
            { field: 'x', text: 'Unbearbeitet', bold: true, sortable: true, minimum: 30 },
        ]);
    });

    it('widens a title-sized floor to the widest cell word, so a cell never clips one', () => {
        const pass = createHeaderFloorPass();
        const wide = columnDef({ title: 'Domäne', field: 'd' });
        const short = columnDef({ title: 'Domäne', field: 'e' });
        pass.apply(wide, false, { cellWords: ['Leseverstehen', 'Rechtschreibung'] });
        pass.apply(short, false, { cellWords: ['Lesen'] });

        expect(pass.headerSized.map((entry) => entry.text)).toEqual(['Rechtschreibung', 'Domäne']);
        expect(wide.minWidth).toBeGreaterThan(floorOf(short));
    });

    it('fixes a fitContent column’s width at its floor, so it never grows; any other column stays flexible', () => {
        const pass = createHeaderFloorPass();
        const fit = columnDef({ title: 'Stile', field: 'style', tableMeta: { fitContent: true } });
        const grow = columnDef({ title: 'Stile', field: 'other' });
        pass.apply(fit, true, { cellWords: ['detailliert', 'selektiv'] });
        pass.apply(grow, true, { cellWords: ['detailliert', 'selektiv'] });

        expect(fit.width).toBe(fit.minWidth);
        expect(grow.width).toBeUndefined();
    });

    it('records only fielded columns — a fieldless column cannot be found on the live table later', () => {
        const pass = createHeaderFloorPass();
        const fielded = columnDef({ title: 'KS', field: 'competenceLevelName' });
        const fieldless = columnDef({ title: 'Gruppe' });
        pass.apply(fielded, true);
        pass.apply(fieldless, true);

        expect(fieldless.minWidth).toBeGreaterThan(0);
        expect(pass.headerSized.map((e) => e.field)).toEqual(['competenceLevelName']);
    });
});

describe('TableHeaderGeometry — refreshing floors when the root font size moves', () => {
    it('is a no-op while the root font size holds still: nothing it measures from can have changed', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());

        geometry.refresh();
        expect(table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });

    it('re-derives and pushes the floors once the root font size moves', () => {
        const { geometry } = makeGeometry();
        const { table, processed } = buildTable(
            geometry,
            [{ title: 'Name', field: 'name' }],
            makeContainer(),
        );
        const buildFloor = floorOf(required(processed[0]));

        setRootFontSize(20);
        geometry.refresh();
        expect(table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
        expect(table.columns[0].column.minWidth).toBeGreaterThan(buildFloor);
    });

    it('pushes only floors that actually changed', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());

        // A font-size move that lands on the same measured width: the live column
        // already has the width the new measurement produces.
        setRootFontSize(20);
        const probe = createHeaderFloorPass();
        const expected = columnDef({ title: 'Name', field: 'name' });
        probe.apply(expected, true);
        required(table.columns[0]).column.minWidth = floorOf(expected);

        geometry.refresh();
        expect(table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });

    it('skips a recorded column that is no longer on the live table', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(
            geometry,
            [
                { title: 'Name', field: 'name' },
                { title: 'KS', field: 'competenceLevelName' },
            ],
            makeContainer(),
        );
        // 'competenceLevelName' left the table (a column swap).
        table.columns.splice(1, 1);

        setRootFontSize(20);
        expect(() => geometry.refresh()).not.toThrow();
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
        geometry.refresh();
        expect(table.columns[1].column.setMinWidth).not.toHaveBeenCalled();
        expect(table.columns[1].column.minWidth).toBe(104);
    });

    it('a re-registration (column swap) replaces the record — old fields are forgotten', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());

        const swap = createHeaderFloorPass();
        const competenceLevelDef = columnDef({ title: 'KS', field: 'competenceLevelName' });
        swap.apply(competenceLevelDef, true);
        table.columns.splice(0, 1, makeColumn('competenceLevelName', competenceLevelDef.minWidth));
        geometry.register(table, swap.headerSized);

        setRootFontSize(20);
        geometry.refresh();
        expect(table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
    });
});

describe('TableHeaderGeometry — realigning headers after a container resize', () => {
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
        expect(resizeService.released).toEqual([container.el]);

        // Forgotten: a later font-size move no longer touches it.
        setRootFontSize(20);
        geometry.refresh();
        expect(table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });

    it('attaching the next table releases the previous one', () => {
        const { geometry, resizeService } = makeGeometry();
        const first = makeContainer();
        const a = buildTable(geometry, [{ title: 'Name', field: 'name' }], first);
        const b = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());
        expect(resizeService.released).toEqual([first.el]);

        setRootFontSize(20);
        geometry.refresh();
        expect(a.table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
        expect(b.table.columns[0].column.setMinWidth).toHaveBeenCalledTimes(1);
    });

    it('refresh skips a table still building', () => {
        const { geometry } = makeGeometry();
        const { table } = buildTable(geometry, [{ title: 'Name', field: 'name' }], makeContainer());
        table.initialized = false;

        setRootFontSize(20);
        geometry.refresh();
        expect(table.columns[0].column.setMinWidth).not.toHaveBeenCalled();
    });
});

describe('fitContent on a real Tabulator', () => {
    afterEach(() => destroyRealTabulators());

    it('fixes the column at its floor, the others share every remaining pixel, and the width follows the floor', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const pass = createHeaderFloorPass();
        const columns = [
            columnDef({ title: 'Aufgabe', field: 'exercise', widthGrow: 2 }),
            columnDef({ title: 'Domäne', field: 'domain', widthGrow: 3 }),
            // Last: fitColumns hands its rounding remainder to the last flex column.
            columnDef({ title: 'Stile', field: 'style', tableMeta: { fitContent: true } }),
        ].map((definition) => {
            pass.apply(definition, true);
            // What Tabulator sees: the processor strips the metadata.
            const { title, field, widthGrow, minWidth, width } = definition;
            return { title: required(title, 'title'), field, widthGrow, minWidth, width };
        });
        const buildFloor = floorOf(required(columns[2]));
        // Flex width not divisible by the 5 grow units: a remainder to place.
        const tableWidth = buildFloor + 5 * 120 + 3;
        const table = await buildRealTabulator(
            { layout: 'fitColumns', columns, data: [{ style: 'global', exercise: 'Bears' }] },
            tableWidth,
        );
        const style = table.getColumn('style');
        const widths = () => table.getColumns().map((column) => column.getWidth());
        expect(style.getWidth()).toBe(buildFloor);
        expect(widths().reduce((sum, width) => sum + width, 0)).toBe(tableWidth);

        const { geometry } = makeGeometry();
        geometry.attach(table, table.element, pass.headerSized);

        setRootFontSize(20);
        geometry.refresh();
        table.redraw();
        const grown = style._getSelf().minWidth;
        expect(grown).toBeGreaterThan(buildFloor);
        expect(style.getWidth()).toBe(grown);

        setRootFontSize(16);
        geometry.refresh();
        table.redraw();
        expect(style._getSelf().minWidth).toBe(buildFloor);
        expect(style.getWidth()).toBe(buildFloor);
        expect(warn).not.toHaveBeenCalled();
    });
});
