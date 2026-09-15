// @vitest-browser

/**
 * Characterization suite for ChartRenderer.computeLayout — pins the slot
 * allocation arithmetic behind every historical "layout jump" fix BEFORE the
 * solver moves into a pure module, and keeps guarding the adapter afterwards.
 *
 * The quirks pinned here are load-bearing, not accidents:
 *  - legend rects deliberately reach back into axis space (right legends add
 *    axes.right, left subtract axes.left, top subtract axes.top, bottom add
 *    axes.bottom) so legends sit beside the axis labels, not beside the plot
 *  - the bottom branch records its rect BEFORE shrinking availH; the other
 *    three shrink first
 *  - stacked legend measurement receives the RUNNING available size, so
 *    measurement cannot be precomputed before the loop
 *  - padding is clamped to a 4px minimum per side
 *
 * Dimensions are injected via `this.dimensions`; the legend collaborator is
 * replaced with a scripted measurer, so no DOM measurement runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartRenderer } from '@tba3/modules/common/charts/renderers/chartRenderer.js';
import { FakeResizeService, makeVisibleChartContainer } from '../../../support/chartHarness.js';

class LayoutProbeChart extends ChartRenderer {
    validateData() {
        return true;
    }
    async renderChart() {}
}

function makeChart(layout = {}, { legendSize = { width: 120, height: 40 } } = {}) {
    makeVisibleChartContainer('layout-probe');
    const chart = new LayoutProbeChart('layout-probe', {
        resizeService: new FakeResizeService(),
        autoResize: false,
        layout,
    });
    chart.dimensions = { containerWidth: 800, containerHeight: 600 };
    chart.legend = {
        measureLegendSize: vi.fn(() => ({ ...legendSize })),
        resolveStackedLegendLayout: vi.fn((stacked, options) => ({
            size: { width: 100, height: 30 },
            options,
        })),
    };
    return chart;
}

describe('ChartRenderer.computeLayout', () => {
    beforeEach(() => {});

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('subtracts padding and axis space from the container, clamping padding to 4px per side', () => {
        const chart = makeChart({
            padding: { top: 0, right: 0, bottom: 20, left: 10 },
            axis: { top: 5, right: 15, bottom: 30, left: 40 },
        });

        const layout = chart.computeLayout();

        // top/right padding of 0 are clamped to 4; explicit larger values survive.
        expect(layout.chart).toEqual({
            x: 10 + 40,
            y: 4 + 5,
            width: 800 - 10 - 4 - 40 - 15,
            height: 600 - 4 - 20 - 5 - 30,
        });
        expect(layout.axes).toEqual({ top: 5, right: 15, bottom: 30, left: 40 });
        expect(layout.container).toEqual({ width: 800, height: 600 });
        expect(chart._chartTooSmall).toBe(false);
    });

    it('adds axisExtra on top of axis values and lets axisOverrides replace axis (but not axisExtra)', () => {
        const chart = makeChart({
            axis: { left: 40, bottom: 30 },
            axisExtra: { left: 7, bottom: 3 },
        });

        const layout = chart.computeLayout({ left: 10 });

        expect(layout.axes.left).toBe(10 + 7); // override replaces axis, extra still added
        expect(layout.axes.bottom).toBe(30 + 3); // no override → config value + extra
    });

    it('places a right legend into axis space and shrinks only the remaining width', () => {
        const chart = makeChart({ axis: { right: 20 }, legends: [{ position: 'right', gap: 10 }] });

        const layout = chart.computeLayout({}, [{ direction: 'vertical' }]);

        // availX=4+0, availW=800-8-20=772 before the legend.
        const legend = layout.legends[0];
        expect(legend).toEqual({
            x: 4 + 772 - 120 + 20, // reaches into axes.right so it sits beside axis labels
            y: 4,
            width: 120,
            height: 600 - 8, // full remaining height
            position: 'right',
        });
        expect(layout.chart.width).toBe(772 - 120 - 10);
        expect(layout.chart.x).toBe(4);
    });

    it('places a left legend at the axis edge and shifts the chart right', () => {
        const chart = makeChart({ axis: { left: 40 }, legends: [{ position: 'left', gap: 10 }] });

        const layout = chart.computeLayout({}, [{ direction: 'vertical' }]);

        const legend = layout.legends[0];
        expect(legend.x).toBe(4 + 40 - 40); // availX minus axes.left → at the padding edge
        expect(legend.y).toBe(4);
        expect(layout.chart.x).toBe(4 + 40 + 120 + 10);
        expect(layout.chart.width).toBe(800 - 8 - 40 - 120 - 10);
    });

    it('places a top legend above the axis band and shifts the chart down', () => {
        const chart = makeChart({ axis: { top: 12 }, legends: [{ position: 'top', gap: 10 }] });

        const layout = chart.computeLayout({}, [{ direction: 'horizontal' }]);

        const legend = layout.legends[0];
        expect(legend.y).toBe(4 + 12 - 12); // availY minus axes.top
        expect(legend.height).toBe(40);
        expect(legend.width).toBe(800 - 8);
        expect(layout.chart.y).toBe(4 + 12 + 40 + 10);
    });

    it('records the bottom legend rect BEFORE shrinking the available height', () => {
        const chart = makeChart({
            axis: { bottom: 30 },
            legends: [{ position: 'bottom', gap: 10 }],
        });

        const layout = chart.computeLayout({}, [{ direction: 'horizontal' }]);

        const availHBeforeLegend = 600 - 8 - 30;
        const legend = layout.legends[0];
        // y is computed from the un-shrunk availH and reaches into axes.bottom.
        expect(legend.y).toBe(4 + availHBeforeLegend - 40 + 30);
        expect(legend.width).toBe(800 - 8);
        expect(layout.chart.height).toBe(availHBeforeLegend - 40 - 10);
    });

    it('falls back to an 8px legend gap when the entry has none and the CSS variable is unset', () => {
        const chart = makeChart({ legends: [{ position: 'bottom' }] });

        const layout = chart.computeLayout({}, [{ direction: 'horizontal' }]);

        expect(layout.chart.height).toBe(600 - 8 - 40 - 8);
    });

    it('uses entry width/height hints when no legend config is passed for the slot', () => {
        const chart = makeChart({ legends: [{ position: 'right', width: 90, gap: 10 }] });

        const layout = chart.computeLayout();

        expect(chart.legend.measureLegendSize).not.toHaveBeenCalled();
        expect(layout.legends[0].width).toBe(90);
        expect(layout.chart.width).toBe(800 - 8 - 90 - 10);
    });

    it('passes the RUNNING available size into stacked legend measurement', () => {
        const chart = makeChart({
            legends: [
                { position: 'right', gap: 10 },
                { position: 'bottom', gap: 10 },
            ],
        });

        const layout = chart.computeLayout({}, [
            { stacked: [{ id: 'a' }], stackOptions: {} },
            { stacked: [{ id: 'b' }], stackOptions: {} },
        ]);

        const calls = chart.legend.resolveStackedLegendLayout.mock.calls;
        // Right legend: constrained by the full available height.
        expect(calls[0][1].maxHeight).toBe(600 - 8);
        expect(calls[0][1].maxWidth).toBeUndefined();
        // Bottom legend: constrained by the width REMAINING after the right
        // legend consumed its slot — not the initial width.
        expect(calls[1][1].maxWidth).toBe(800 - 8 - 100 - 10);
        expect(calls[1][1].maxHeight).toBeUndefined();
        expect(layout.legendStackLayouts[0]).not.toBeNull();
        expect(layout.legendStackLayouts[1]).not.toBeNull();
    });

    it('honours explicit stackOptions.maxWidth/maxHeight over the running size', () => {
        const chart = makeChart({ legends: [{ position: 'bottom', gap: 10 }] });

        chart.computeLayout({}, [{ stacked: [{ id: 'a' }], stackOptions: { maxWidth: 333 } }]);

        expect(chart.legend.resolveStackedLegendLayout.mock.calls[0][1].maxWidth).toBe(333);
    });

    it('centers the chart inside the slot when an aspect ratio pins it', () => {
        const chart = makeChart({ aspectRatio: 1 });

        const layout = chart.computeLayout();

        // Slot: 792x592 → square 592x592 centered horizontally.
        expect(layout.chart.height).toBe(592);
        expect(layout.chart.width).toBe(592);
        expect(layout.chart.x).toBe(4 + (792 - 592) / 2);
        expect(layout.chart.y).toBe(4);
    });

    it('flags the chart as too small below 50px and warns when axes eat over 60% of the container', () => {
        const chart = makeChart({ axis: { left: 400, right: 360, top: 0, bottom: 0 } });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const layout = chart.computeLayout();

        expect(chart._chartTooSmall).toBe(true);
        expect(layout.chart.width).toBeLessThan(50);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('layout-probe'));
        warnSpy.mockRestore();
    });

    it('returns the same object it assigns to this.layout', () => {
        const chart = makeChart();

        const layout = chart.computeLayout();

        expect(chart.layout).toBe(layout);
        expect(layout.dimensions).toBe(chart.dimensions);
    });
});
