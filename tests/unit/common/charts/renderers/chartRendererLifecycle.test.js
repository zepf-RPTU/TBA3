// @vitest-browser

/**
 * ChartRenderer lifecycle contract — pins the interleavings of render, resize
 * and destroy that historically surfaced as "unreproducable" bugs (vanishing
 * averages, leaked observers, layout thrash). Each test encodes a promise the
 * host/renderer seam relies on:
 *
 *  - a renderer must not draw before its owner calls create()
 *  - a destroy during an in-flight render must drop the queued follow-up pass
 *  - a resize callback arriving after destroy must be a no-op
 *  - a replaced container node (same id) must be rebound on the next create()
 *  - the dimension-tolerance skip must swallow observer noise but never a
 *    real resize
 *
 * Recipe per chartAverageRefresh.test.js: probe subclass + visible-container
 * shim + minimal d3 stub (see tests/unit/support/chartHarness.js).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChartRenderer } from '@tba3/modules/common/charts/renderers/chartRenderer.js';
import {
    FakeResizeService,
    makeVisibleChartContainer,
    nextAnimationFrames,
} from '../../../support/chartHarness.js';

class LifecycleProbeChart extends ChartRenderer {
    renderCalls = 0;
    /** Containers observed by renderChart, in call order. */
    containersSeen = [];
    /** Scripted calculateDimensions() results; the last entry repeats. */
    dimensionScript = [{ containerWidth: 600, containerHeight: 400 }];
    /** When set, renderChart awaits this before returning. */
    gate = null;

    validateData() {
        return true;
    }

    calculateDimensions() {
        const next =
            this.dimensionScript.length > 1
                ? this.dimensionScript.shift()
                : this.dimensionScript[0];
        return { ...next };
    }

    async renderChart() {
        this.renderCalls += 1;
        this.containersSeen.push(this.container);
        if (this.gate) await this.gate;
    }
}

describe('ChartRenderer lifecycle contract', () => {
    let resizeService;

    beforeEach(() => {
        resizeService = new FakeResizeService();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function makeChart(id, options = {}) {
        makeVisibleChartContainer(id);
        return new LifecycleProbeChart(id, { resizeService, autoResize: false, ...options });
    }

    it('drops a queued refresh when the chart is destroyed during the in-flight render', async () => {
        const chart = makeChart('destroy-mid-render');
        let releaseGate;
        chart.gate = new Promise((resolve) => {
            releaseGate = resolve;
        });

        const inFlight = chart.create(); // create() -> refresh() -> _render, blocks on the gate
        const queued = chart.refresh(); // queues behind the active pass
        chart.destroy(); // destroy arrives mid-flight
        releaseGate();
        await inFlight;
        await queued;

        // The queued follow-up must not run against a destroyed chart — this is
        // the exact interleaving behind the historical vanishing-average bug.
        expect(chart.renderCalls).toBe(1);

        // Any later render attempt stays a no-op.
        await chart._render();
        expect(chart.renderCalls).toBe(1);
    });

    it('unhooks the resize scope on destroy and survives a stray late resize callback', async () => {
        const chart = makeChart('resize-after-destroy', { autoResize: true });
        await chart.create();
        await nextAnimationFrames(2);

        // create() registered the observer behind its double rAF.
        expect(resizeService.observations).toHaveLength(1);
        expect(chart.renderCalls).toBe(1);

        chart.destroy();
        expect(resizeService.removedScopes).toContain('resize-after-destroy');

        // A debounced callback that already left the service before destroy
        // must hit the destroyed guard, not re-render into torn-down DOM.
        resizeService.trigger();
        await Promise.resolve();
        expect(chart.renderCalls).toBe(1);
    });

    it('rebinds to a replacement container node with the same id on the next create()', async () => {
        const original = makeVisibleChartContainer('rebind-chart');
        const chart = new LifecycleProbeChart('rebind-chart', { resizeService, autoResize: false });
        chart.dimensionScript = [
            { containerWidth: 600, containerHeight: 400 },
            { containerWidth: 800, containerHeight: 500 },
        ];

        await chart.create();
        expect(chart.containersSeen[0]).toBe(original);
        expect(original._chartInstance).toBe(chart);

        // A view teardown/rebuild can replace the DOM node while keeping the id.
        original.remove();
        const replacement = makeVisibleChartContainer('rebind-chart');

        await chart.create();

        expect(chart.container).toBe(replacement);
        expect(chart.containersSeen[1]).toBe(replacement);
        expect(replacement._chartInstance).toBe(chart);
        // The stale node must not keep a back-reference that would retain the chart.
        expect(original._chartInstance).toBeUndefined();
    });

    it('skips a resize inside the default dimension tolerance but renders a real one', async () => {
        const chart = makeChart('tolerance-default');
        chart.dimensionScript = [
            { containerWidth: 600, containerHeight: 400 },
            { containerWidth: 600.4, containerHeight: 400 },
            { containerWidth: 610, containerHeight: 400 },
        ];

        await chart.create();
        expect(chart.renderCalls).toBe(1);

        // ResizeObserver noise (sub-pixel wobble) must not trigger a re-render…
        await chart._render();
        expect(chart.renderCalls).toBe(1);

        // …but an actual size change always must.
        await chart._render();
        expect(chart.renderCalls).toBe(2);
    });

    it('refresh() always re-renders even when dimensions are unchanged', async () => {
        const chart = makeChart('refresh-forces-render');

        await chart.create();
        await chart.refresh();

        // refresh() zeroes the last-rendered dimensions on purpose: explicit
        // refreshes (data change, theme change) must never be tolerance-skipped.
        expect(chart.renderCalls).toBe(2);
    });

    it('draws nothing until its owner calls create(), then paints what create() cleared', async () => {
        // A ChartHostModule installs its renderers before awaiting the layout
        // settle, so a sibling's sync verb can reach one through `host.chart` in
        // that window. Rendering there used to latch the last-rendered dimensions,
        // and the pending create() then cleared the container and skipped its own
        // render at the tolerance guard — a permanently blank card.
        const chart = makeChart('pre-create-render');
        const container = document.getElementById('pre-create-render');
        container.innerHTML = '<span id="pre-create-marker"></span>';

        chart.setState({ items: [1, 2] });
        await chart.refresh();
        await chart._render();

        expect(chart.renderCalls).toBe(0);
        // Nothing touched the container either: create() owns the clear.
        expect(document.getElementById('pre-create-marker')).not.toBeNull();

        await chart.create();

        expect(chart.renderCalls).toBe(1);
        expect(document.getElementById('pre-create-marker')).toBeNull();
    });

    it('repaints on a second create() at unchanged dimensions', async () => {
        // create() empties the container, so the render that follows must actually
        // run: the "dimensions unchanged" skip is a resize-dedup guard, and letting
        // it swallow a create() pass leaves the cleared container blank for good.
        const chart = makeChart('recreate-same-size');

        await chart.create();
        await chart.create();

        expect(chart.renderCalls).toBe(2);
    });

    it('clearContainer() releases the svg/g handles it just detached', async () => {
        // A handle left bound to a removed node passes a subclass's
        // `if (!this.svg || !this.g) return false` guard, and the D3 join then
        // lands outside the document: no error, no marks, no recovery.
        const chart = makeChart('clear-releases-handles');
        await chart.create();
        chart.svg = { detached: 'svg' };
        chart.g = { detached: 'g' };

        chart.clearContainer();

        expect(chart.svg).toBeNull();
        expect(chart.g).toBeNull();
    });
});
