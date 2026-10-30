// @vitest-browser

/**
 * Pins ChartRenderer.previewLayout's slot arithmetic, including the 4px minimum padding
 * per side and the aspect range. Dimensions are injected via `this.dimensions`, so no DOM measurement runs.
 */
import { describe, expect, it } from 'vitest';
import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';

class LayoutProbeChart extends ChartRenderer {
    /** @override */
    validateData() {
        return true;
    }
    /** @override */
    renderChart() {}
}

/**
 * A probe chart over an 800 × 600 box.
 * @param {import('../../../../src/common/charts/chartAxisUtils.js').ChartLayout} [layout]
 */
function makeChart(layout = {}) {
    const container = makeVisibleChartContainer('layout-probe');
    const chart = new LayoutProbeChart(container, {
        context: createTestContext(),
        autoResize: false,
        layout,
    });
    chart.dimensions = {
        containerWidth: 800,
        containerHeight: 600,
        geometryScale: 600 / 40,
        keyHeight: 0,
    };
    return chart;
}

describe('ChartRenderer.previewLayout', () => {
    it('subtracts padding and axis space from the container, clamping padding to 4px per side', () => {
        const chart = makeChart({ padding: { top: 0, right: 0, bottom: 20, left: 10 } });

        const layout = chart.previewLayout({ top: 5, right: 15, bottom: 30, left: 40 });

        // top/right padding of 0 are clamped to 4; explicit larger values survive.
        expect(layout.chart).toEqual({
            x: 10 + 40,
            y: 4 + 5,
            width: 800 - 10 - 4 - 40 - 15,
            height: 600 - 4 - 20 - 5 - 30,
        });
        expect(layout.axes).toEqual({ top: 5, right: 15, bottom: 30, left: 40 });
    });

    it('gives a side without an axis override no axis space', () => {
        const chart = makeChart();

        const layout = chart.previewLayout({ left: 10 });

        expect(layout.axes).toEqual({ top: 0, right: 0, bottom: 0, left: 10 });
    });

    it('centers the chart inside the slot when its aspect range caps the width', () => {
        const chart = makeChart({ aspectRange: { min: 1, max: 1 } });

        const layout = chart.previewLayout();

        // Slot: 792x592 → 592x592 centered horizontally.
        expect(layout.chart.height).toBe(592);
        expect(layout.chart.width).toBe(592);
        expect(layout.chart.x).toBe(4 + (792 - 592) / 2);
        expect(layout.chart.y).toBe(4);
    });

    it('centers vertically when the slot is taller than the range allows', () => {
        const chart = makeChart({ aspectRange: { min: 4, max: 5 } });

        const layout = chart.previewLayout();

        // Slot: 792x592 → 792x198 centered vertically.
        expect(layout.chart.width).toBe(792);
        expect(layout.chart.height).toBe(198);
        expect(layout.chart.y).toBe(4 + (592 - 198) / 2);
    });

    it('fills the slot when its ratio lies inside the range', () => {
        const chart = makeChart({ aspectRange: { min: 1, max: 1.5 } });

        expect(chart.previewLayout().chart).toEqual({ x: 4, y: 4, width: 792, height: 592 });
    });
});
