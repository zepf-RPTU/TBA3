// @vitest-browser
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TableModule } from '../../../src/common/tables/tableModule.js';
import { nextAnimationFrames } from '../../support/dom.js';
import { required } from '../../support/required.js';
import { resetFakeTabulator, stubCanvasTextMeasurement } from '../../support/tableHarness.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';

/** @typedef {import('../../support/tableHarness.js').FakeTabulator} FakeTabulator */

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

// When a table redraws: Tabulator's forced redraw re-runs every formatter and resets the
// scroll, so each one costs, and a missing one leaves stale column widths or row heights.

class RedrawTableModule extends TableModule {
    #reports = 0;

    /** @returns {number} How often `_onDisplayedRowsChanged()` ran: once per settled build. */
    get reports() {
        return this.#reports;
    }

    /** @override */
    async _renderBody() {}

    /** @override */
    _onDisplayedRowsChanged() {
        this.#reports += 1;
    }
}

customElements.define('test-redraw-table', RedrawTableModule);

/** Enough animation frames for the settle frame and its follow-up. */
const SETTLE_FRAMES = 3;

/** @type {HTMLDivElement} */
let host;
/** @type {RedrawTableModule} */
let module;

/**
 * Build a table, wait for nothing yet, and spy on its redraws.
 * @returns {{table: FakeTabulator, redraw: import('vitest').MockInstance<(force?: boolean) => void>}}
 */
function build() {
    module.createTable({ container: host, columns: [{ title: 'Name', field: 'name' }], data: [] });
    const table = /** @type {FakeTabulator} */ (/** @type {unknown} */ (required(module.table)));
    // The box Tabulator's rows would give it: an empty element reads as hidden.
    table.element.style.height = '100px';
    return { table, redraw: vi.spyOn(table, 'redraw') };
}

/** @param {'loaded'|'loading'} status - What `document.fonts.status` reads. */
function fonts(status) {
    vi.spyOn(FontFaceSet.prototype, 'status', 'get').mockReturnValue(status);
}

stubCanvasTextMeasurement();

beforeEach(() => {
    resetFakeTabulator();
    host = document.createElement('div');
    host.style.width = '400px';
    host.style.height = '200px';
    document.body.append(host);
    module = RedrawTableModule.create('redraw-table', createTestModuleOptions());
    // A box of its own: a show reads the module's width.
    module.style.display = 'block';
    document.body.append(module);
});

afterEach(() => {
    module.remove();
    host.remove();
});

describe('TableModule.redraw', () => {
    it("forces Tabulator's full redraw and puts the scroll position back", async () => {
        // A theme switch redraws every table; it must not jump one the reader scrolled.
        fonts('loaded');
        const { table, redraw } = build();
        const holder = table.element.appendChild(document.createElement('div'));
        holder.className = 'tabulator-tableholder';
        holder.style.cssText = 'height: 50px; overflow: auto';
        holder.appendChild(document.createElement('div')).style.height = '500px';
        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);
        holder.scrollTop = 120;
        redraw.mockImplementation(() => {
            holder.scrollTop = 0;
        });

        module.redraw();

        expect(redraw).toHaveBeenCalledExactlyOnceWith(true);
        expect(holder.scrollTop).toBe(120);
    });

    it('does nothing before the table built, or while it is hidden', async () => {
        // A hidden (0×0) container measures wrong widths.
        fonts('loaded');
        const { table, redraw } = build();
        module.redraw();
        expect(redraw).not.toHaveBeenCalled();

        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);
        host.style.display = 'none';
        module.redraw();
        expect(redraw).not.toHaveBeenCalled();
    });
});

describe('the build-settle redraw', () => {
    it('is skipped when the table kept its build width and the fonts had loaded', async () => {
        // Nothing the redraw would correct has moved since Tabulator measured the rows.
        fonts('loaded');
        const { table, redraw } = build();
        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(redraw).not.toHaveBeenCalled();
        expect(module.reports).toBe(1);
    });

    it('runs while a web font still loads: the rows were measured in the fallback', async () => {
        fonts('loading');
        const { table, redraw } = build();
        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(redraw).toHaveBeenCalledExactlyOnceWith(true);
        expect(module.reports).toBe(1);
    });

    it('runs when the width moved since the build', async () => {
        fonts('loaded');
        const { table, redraw } = build();
        table.emit('tableBuilt');
        host.style.width = '300px';
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(redraw).toHaveBeenCalledOnce();
    });

    it('runs a second time when the first redraw changed the width', async () => {
        // The redraw can itself move the width: a scrollbar appears, a sibling reflows.
        fonts('loading');
        const { table, redraw } = build();
        // The reflow lands after the redraw returned.
        redraw.mockImplementationOnce(() => {
            queueMicrotask(() => {
                host.style.width = '350px';
            });
        });
        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(redraw).toHaveBeenCalledTimes(2);
        expect(module.reports).toBe(1);
    });

    it('runs for a table still off-screen: a view awaits the settle while hidden', async () => {
        fonts('loading');
        host.style.display = 'none';
        const { table, redraw } = build();
        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(redraw).toHaveBeenCalledOnce();
        expect(module.reports).toBe(1);
    });

    it('neither redraws nor reports for a table destroyed before its frame', async () => {
        fonts('loading');
        const { table, redraw } = build();
        table.emit('tableBuilt');
        module.clear();
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(redraw).not.toHaveBeenCalled();
        expect(module.reports).toBe(0);
    });

    it('leaves a table that replaced the one it was due for to settle on its own', async () => {
        // A rebuild replaces the table before the old settle frame runs; that frame voids
        // itself, and the new table's settle still runs.
        fonts('loading');
        const first = build();
        first.table.emit('tableBuilt');
        const second = build();
        second.table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(first.redraw).not.toHaveBeenCalled();
        expect(second.redraw).toHaveBeenCalledOnce();
        expect(module.reports).toBe(1);
    });

    it('takes no redraw from a first show during its window; a show after it redraws', async () => {
        // A show before the settle frame would stack a second redraw on the settle's.
        fonts('loading');
        const { table, redraw } = build();
        table.emit('tableBuilt');
        module.refreshVisibility();
        expect(redraw).not.toHaveBeenCalled();

        await nextAnimationFrames(SETTLE_FRAMES);
        expect(redraw).toHaveBeenCalledOnce();

        module.hide();
        module.show();
        expect(redraw).toHaveBeenCalledTimes(2);
    });

    it('redraws on the next show a table rebuilt while hidden', async () => {
        // Its settle ran off-screen: the new table has never been laid out on screen.
        fonts('loaded');
        const first = build();
        first.table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);
        module.refreshVisibility();

        module.hide();
        host.style.display = 'none';
        const second = build();
        second.table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);
        host.style.display = '';
        module.show();

        expect(second.redraw).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('redraws on every show after a hide, at an unchanged width too', async () => {
        // Hidden, the table keeps no layout: Tabulator's own resize observer lays its
        // columns out at the display:none container's 0×0 box. A show that skipped the
        // redraw would paint those columns for a frame.
        fonts('loaded');
        const { table, redraw } = build();
        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);
        module.refreshVisibility();
        redraw.mockClear();

        module.hide();
        module.show();
        expect(redraw).toHaveBeenCalledExactlyOnceWith(true);

        module.hide();
        module.show();
        expect(redraw).toHaveBeenCalledTimes(2);
    });

    it('redraws a second time on show when the first redraw moved the room for the columns', async () => {
        // The first pass sizes the columns before the body regains its height: the
        // body's scrollbar then appears, or a content-sized table changes width.
        fonts('loaded');
        const { table, redraw } = build();
        const body = document.createElement('div');
        body.className = 'tabulator-tableholder';
        table.element.append(body);
        table.emit('tableBuilt');
        await nextAnimationFrames(SETTLE_FRAMES);
        module.refreshVisibility();
        module.hide();
        redraw.mockClear();
        redraw.mockImplementationOnce(() => {
            body.style.width = '290px';
        });

        module.show();
        expect(redraw).toHaveBeenCalledTimes(2);

        // A redraw that leaves the room as it was takes no second pass.
        module.hide();
        redraw.mockClear();
        module.show();
        expect(redraw).toHaveBeenCalledOnce();
    });

    it('lets a show after a hide in its window redraw at once', async () => {
        // The view switched away and back before the settle frame: the table must not
        // be seen at the widths it was laid out with for the old box.
        fonts('loaded');
        const { table, redraw } = build();
        table.emit('tableBuilt');
        module.refreshVisibility();
        module.hide();
        module.show();

        expect(redraw).toHaveBeenCalledOnce();
    });
});
