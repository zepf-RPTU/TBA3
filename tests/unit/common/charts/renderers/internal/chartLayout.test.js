/**
 * Pure layout solver — edge cases beyond the adapter-level characterization
 * suite (chartLayoutCharacterization.test.js pins the ChartRenderer wiring).
 * Runs in the node environment: all inputs are injected, no DOM.
 */
import { describe, expect, it, vi } from 'vitest';
import { computeChartLayout } from '@tba3/modules/common/charts/renderers/internal/chartLayout.js';

const BASE_CONFIG = {
    legends: [],
    axis: { top: 0, right: 0, bottom: 0, left: 0 },
    axisExtra: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 4, right: 4, bottom: 4, left: 4 },
    aspectRatio: null,
};

function solve(
    overrides = {},
    measureLegend = () => ({ width: 100, height: 30, stackLayout: null }),
) {
    return computeChartLayout(
        {
            container: { width: 800, height: 600 },
            layoutConfig: { ...BASE_CONFIG, ...overrides },
            axisOverrides: overrides.axisOverrides ?? {},
            legendConfigs: overrides.legendConfigs ?? [],
            legendGap: 8,
        },
        measureLegend,
    );
}

describe('computeChartLayout', () => {
    it('defaults a slot without a position to bottom', () => {
        const layout = solve({ legends: [{}], legendConfigs: [{ direction: 'horizontal' }] });

        expect(layout.legends[0].position).toBe('bottom');
        expect(layout.chart.height).toBe(600 - 8 - 30 - 8);
    });

    it('shrinks sequentially: a second right legend sees the width the first left over', () => {
        const measure = vi.fn(() => ({ width: 100, height: 30, stackLayout: null }));
        const layout = solve(
            {
                legends: [
                    { position: 'right', gap: 10 },
                    { position: 'right', gap: 10 },
                ],
                legendConfigs: [{ direction: 'vertical' }, { direction: 'vertical' }],
            },
            measure,
        );

        expect(measure.mock.calls[0][1].availWidth).toBe(792);
        expect(measure.mock.calls[1][1].availWidth).toBe(792 - 100 - 10);
        expect(layout.chart.width).toBe(792 - 2 * (100 + 10));
    });

    it('never calls the measurer for a hint-only slot and treats missing hints as zero', () => {
        const measure = vi.fn();
        const layout = solve({ legends: [{ position: 'right' }] }, measure);

        expect(measure).not.toHaveBeenCalled();
        expect(layout.legends[0].width).toBe(0);
        // A zero-size slot still consumes its gap — that is the current contract.
        expect(layout.chart.width).toBe(792 - 8);
    });

    it('clamps oversized legends to non-negative rects and flags the chart as too small', () => {
        const layout = solve(
            {
                legends: [{ position: 'right', gap: 0 }],
                legendConfigs: [{ direction: 'vertical' }],
            },
            () => ({ width: 900, height: 30, stackLayout: null }),
        );

        expect(layout.legends[0].width).toBe(900);
        expect(layout.chart.width).toBe(0);
        expect(layout.chartTooSmall).toBe(true);
    });

    it('centers vertically when the slot is too tall for the aspect ratio', () => {
        const layout = solve({ aspectRatio: 4 }); // slot 792x592 → 792/198

        expect(layout.chart.width).toBe(792);
        expect(layout.chart.height).toBe(198);
        expect(layout.chart.y).toBe(4 + (592 - 198) / 2);
    });

    it('treats exactly 50px as large enough', () => {
        const layout = solve({
            padding: { top: 4, right: 4, bottom: 4, left: 4 },
            axis: { top: 0, right: 0, bottom: 542, left: 742 },
            axisExtra: { top: 0, right: 0, bottom: 0, left: 0 },
        });

        expect(layout.chart.width).toBe(50);
        expect(layout.chart.height).toBe(50);
        expect(layout.chartTooSmall).toBe(false);
    });

    it('keeps legendStackLayouts index-aligned, null for non-stacked slots', () => {
        const stackLayout = { size: { width: 60, height: 20 } };
        const layout = solve(
            {
                legends: [{ position: 'bottom' }, { position: 'right' }],
                legendConfigs: [{ plain: true }, { stacked: true }],
            },
            (config) =>
                config.stacked
                    ? { width: 60, height: 20, stackLayout }
                    : { width: 100, height: 30, stackLayout: null },
        );

        expect(layout.legendStackLayouts).toEqual([null, stackLayout]);
    });
});
