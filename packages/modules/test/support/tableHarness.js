/**
 * Shared fixtures for suites that drive the real TableModule.createTable() (or
 * its header-width measurement) in the browser project.
 *
 * - Canvas text measurement varies with the machine's fonts, and module-base's
 *   `textMeasurement.js` caches its 2d context at module level, so a suite installs
 *   the stub (`STUB_CHAR_WIDTH_PX` per character) before the first header-width measurement.
 *
 * - createTable() reaches Tabulator only through the `tabulatorBuild.js` import, so a
 *   constructor-shaped fake with an event emitter stands in for it. `destroy()`
 *   dispatches `tableDestroyed` as Tabulator does: TableModule relies on it for
 *   resize-unobserve, geometry untracking and settle-slot release.
 *
 * A suite that needs a different table fake (a stateful filter simulator, a vi.fn()
 * spy record) keeps its own.
 */

import { expect, vi } from 'vitest';

import { nextAnimationFrames } from './dom.js';

/** The width the stubbed canvas measures for every character, whatever the font. */
const STUB_CHAR_WIDTH_PX = 7;

/**
 * Install a deterministic canvas 2d context on HTMLCanvasElement so text
 * measurement is machine-independent. Call at module top level, before any
 * measurement.
 */
export function stubCanvasTextMeasurement() {
    HTMLCanvasElement.prototype.getContext = /** @type {any} */ (
        () => ({
            font: '',
            measureText: (/** @type {string} */ text) => ({
                width: text.length * STUB_CHAR_WIDTH_PX,
            }),
        })
    );
}

/** @typedef {import('../../src/common/tables/internal/tablePresetManager.js').TableFilterEntry} TableFilterEntry */

/**
 * A table event listener, as TableModule registers it: each event passes its own arguments.
 * @typedef {(...args: any[]) => unknown} FakeTabulatorHandler
 */

/** Minimal Tabulator stand-in: records construction, replays events on demand. */
export class FakeTabulator {
    /** @type {FakeTabulator[]} */
    static instances = [];

    /**
     * @param {HTMLElement} element
     * @param {import('tabulator-tables').Options} config - The options TableModule built.
     */
    constructor(element, config) {
        this.element = element;
        this.config = config;
        /** @type {{[event: string]: FakeTabulatorHandler[]}} */
        this.handlers = {};
        this.destroyed = false;
        this.initialized = false;
        /** @type {TableFilterEntry[]} The last `setFilter` list. */
        this.filters = config.initialFilter ?? [];
        FakeTabulator.instances.push(this);
    }

    /**
     * @param {string} event
     * @param {FakeTabulatorHandler} callback - Run by `emit(event)`.
     */
    on(event, callback) {
        (this.handlers[event] ??= []).push(callback);
    }

    off() {}

    /**
     * Dispatch an event to its listeners.
     * @param {string} event
     * @param {...unknown} args
     */
    emit(event, ...args) {
        // Tabulator marks itself initialized right before dispatching tableBuilt.
        if (event === 'tableBuilt') this.initialized = true;
        (this.handlers[event] ?? []).forEach((callback) => callback(...args));
    }

    redraw() {}

    getColumns() {
        return [];
    }

    /** @returns {false} No column components: Tabulator answers `false` for a field it has none for. */
    getColumn() {
        return false;
    }

    /** @returns {never[]} The fake groups none. */
    getGroups() {
        return [];
    }

    /** @returns {Array<{[field: string]: any}>} The rows it was built with; the fake does not filter. */
    getData() {
        return this.config.data ?? [];
    }

    /**
     * Swap the column set in place, as a live table does when `setRows` brings other fields.
     * @param {import('tabulator-tables').ColumnDefinition[]} columns
     */
    setColumns(columns) {
        this.config = { ...this.config, columns };
    }

    /**
     * Swap the rows in place, as a live table does on `setRows`.
     * @param {Array<{[field: string]: any}>} data
     * @returns {Promise<void>}
     */
    async replaceData(data) {
        this.config = { ...this.config, data };
    }

    /** @returns {number} The fake does not filter, so all rows are active. */
    getDataCount() {
        return this.getData().length;
    }

    /** @returns {Array<{[field: string]: any}>} The fake selects none. */
    getSelectedData() {
        return [];
    }

    /** @param {TableFilterEntry[]} list */
    setFilter(list) {
        this.filters = list;
    }

    /** @type {Array<{column: string, dir: string}>} The last `setSort` list. */
    sorters = [];

    /** @param {Array<{column: string, dir: string}>} sorters */
    setSort(sorters) {
        this.sorters = sorters;
    }

    /** @returns {Array<{field: string, dir: string}>} The sort in force, as Tabulator reports it. */
    getSorters() {
        return this.sorters.map(({ column, dir }) => ({ field: column, dir }));
    }

    deselectRow() {}

    blockRedraw() {}

    restoreRedraw() {}

    destroy() {
        this.destroyed = true;
        this.emit('tableDestroyed');
    }
}

/**
 * Let a connected table module finish its first build: wait for its FakeTabulator, report
 * it built, and let the settle frames (scheduleSettled's frame + follow-up frame) pass.
 * @param {import('../../src/common/tables/tableModule.js').TableModule<any>} module - Already in the document.
 * @param {number} [index] - Which FakeTabulator is the module's: the count before it was connected.
 * @returns {Promise<void>}
 */
export async function settleBuiltTable(module, index = 0) {
    await vi.waitFor(() => expect(FakeTabulator.instances).toHaveLength(index + 1));
    FakeTabulator.instances[index].emit('tableBuilt');
    await nextAnimationFrames(3);
    await module.updateComplete;
}

/**
 * Place a table module and let it build over the fake: what a test drives it through
 * (its data, its mode signals, its toolbar, its callbacks) and asserts on (the fake's
 * config and filters, the DOM).
 * @param {import('../../src/common/tables/tableModule.js').TableModule<any>} module - Created, not yet connected.
 * @param {ParentNode} [parent]
 * @returns {Promise<FakeTabulator>} The module's table.
 */
export async function mountTable(module, parent = document.body) {
    const index = FakeTabulator.instances.length;
    parent.append(module);
    await settleBuiltTable(module, index);
    return FakeTabulator.instances[index];
}

/**
 * Reset the fake's instance log. A test file makes `new Tabulator(...)` resolve to the
 * fake with a hoisted `vi.mock(…)` of the package's `src/common/tables/tabulatorBuild.js`
 * (the path relative to the test file, as vi.mock resolves it) returning
 * `{ Tabulator: FakeTabulator }` — the build module, not the package, because the build
 * module registers Tabulator's optional modules at import time.
 */
export function resetFakeTabulator() {
    FakeTabulator.instances = [];
}
