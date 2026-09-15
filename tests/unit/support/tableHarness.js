/**
 * Shared fixtures for suites that drive the REAL TableModule.createTable() (or
 * its header-width measurement) in the browser project.
 *
 * Two things every such suite otherwise re-declares:
 *
 * - Real canvas text measurement varies with the font the machine happens to have.
 *   `@tba3/module-base/utils/textMeasurement.js` grabs a 2d context once and caches it at
 *   module level, so a suite must install a measuring stub before the first
 *   header-width measurement or the cache captures the real one for the rest of the
 *   file. The stub is deterministic (7px per character) so floors computed from it
 *   are stable in assertions.
 *
 * - createTable() reaches Tabulator only through the `tabulatorBuild.js` import, so a
 *   constructor-shaped fake with an event emitter stands in for it. `destroy()`
 *   dispatches `tableDestroyed` because real Tabulator does, and TableModule
 *   relies on that for resize-unobserve, geometry untracking and settle-slot
 *   release — a fake that forgets it turns a leak into a green test.
 *
 * Suites that want a *different* table fake (a stateful filter simulator, a
 * vi.fn() spy record) keep theirs local — see tabulatorFakes.js.
 */

/**
 * Install a deterministic canvas 2d context on HTMLCanvasElement so text
 * measurement is machine-independent. Call at module top level, before any
 * measurement.
 */
export function stubCanvasTextMeasurement() {
    HTMLCanvasElement.prototype.getContext = /** @type {any} */ (
        () => ({
            font: '',
            measureText: (text) => ({ width: text.length * 7 }),
        })
    );
}

/** Minimal Tabulator stand-in: records construction, replays events on demand. */
export class FakeTabulator {
    /** @type {FakeTabulator[]} */
    static instances = [];

    constructor(element, config) {
        this.element = element;
        this.config = config;
        this.handlers = {};
        this.destroyed = false;
        FakeTabulator.instances.push(this);
    }

    on(event, callback) {
        (this.handlers[event] ??= []).push(callback);
    }

    off() {}

    emit(event, ...args) {
        (this.handlers[event] ?? []).forEach((callback) => callback(...args));
    }

    redraw() {}

    getColumns() {
        return [];
    }

    destroy() {
        this.destroyed = true;
        this.emit('tableDestroyed');
    }
}

/**
 * Reset the fake's instance log. A test file makes `new Tabulator(...)` resolve to the
 * fake with a hoisted `vi.mock('<…>/js/common/tables/tabulatorBuild.js', …)` returning
 * `{ Tabulator: FakeTabulator }` — the build module, not the package, because the build
 * module registers Tabulator's optional modules at import time.
 */
export function resetFakeTabulator() {
    FakeTabulator.instances = [];
}
