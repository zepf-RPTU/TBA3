import { describe, it, expect } from 'vitest';
import {
    buildLegendStackConfig,
    legendLayoutFitsSlot,
    resolveLegendPlan,
} from '@tba3/modules/en/modules/charts/itemLollipop/itemLollipopLegendPlanner.js';

const NIVEAU = [{ label: 'A1', color: '#111', symbol: 'circle' }];
const AVERAGE = [{ label: 'Schulschnitt', color: '#222', symbol: 'diamond' }];

/** A measurer whose returned sizes are scripted by call order (right first, then bottom). */
function scriptedMeasurer(...sizes) {
    let i = 0;
    const calls = [];
    const fn = (stacked, stackOptions) => {
        calls.push({ stacked, stackOptions });
        return { size: sizes[i++] };
    };
    fn.calls = calls;
    return fn;
}

describe('legendLayoutFitsSlot', () => {
    it('is false when the layout or slot is missing', () => {
        expect(legendLayoutFitsSlot(null, { width: 10, height: 10 })).toBe(false);
        expect(legendLayoutFitsSlot({ size: { width: 1, height: 1 } }, null)).toBe(false);
        expect(legendLayoutFitsSlot({}, { width: 10, height: 10 })).toBe(false);
    });

    it('fits when both dimensions are within the slot', () => {
        expect(
            legendLayoutFitsSlot({ size: { width: 100, height: 50 } }, { width: 120, height: 60 }),
        ).toBe(true);
    });

    it('does not fit when either dimension exceeds the slot', () => {
        expect(
            legendLayoutFitsSlot({ size: { width: 200, height: 50 } }, { width: 120, height: 60 }),
        ).toBe(false);
        expect(
            legendLayoutFitsSlot({ size: { width: 100, height: 90 } }, { width: 120, height: 60 }),
        ).toBe(false);
    });

    it('allows a 0.5px tolerance at the boundary', () => {
        // WHY: measured sub-pixel sizes shouldn't spuriously reject a layout that
        // is effectively exact — but anything clearly over must still be rejected.
        expect(
            legendLayoutFitsSlot(
                { size: { width: 100.5, height: 60.5 } },
                { width: 100, height: 60 },
            ),
        ).toBe(true);
        expect(
            legendLayoutFitsSlot(
                { size: { width: 100.51, height: 60 } },
                { width: 100, height: 60 },
            ),
        ).toBe(false);
    });

    it('treats a non-finite slot dimension as unbounded', () => {
        // WHY: a bottom legend has an unbounded height slot (Infinity) — only its
        // width constrains the fit, so a very tall layout must still be allowed.
        expect(
            legendLayoutFitsSlot(
                { size: { width: 50, height: 9999 } },
                { width: 100, height: Infinity },
            ),
        ).toBe(true);
    });
});

describe('buildLegendStackConfig', () => {
    it('builds a right (vertical) legend by default with a single/double-column niveau fallback', () => {
        const cfg = buildLegendStackConfig(NIVEAU, AVERAGE, { maxHeight: 300 });
        expect(cfg.stacked[0].config.items).toBe(NIVEAU);
        expect(cfg.stacked[1].config.items).toBe(AVERAGE);
        expect(cfg.stacked[0].config.layout).toEqual({ direction: 'vertical' });
        expect(cfg.stacked[0].candidates).toEqual([
            { layout: { direction: 'vertical', columns: 1 } },
            { layout: { direction: 'vertical', columns: 2 } },
        ]);
        expect(cfg.stacked[1].candidates).toBeUndefined();
        expect(cfg.stackOptions).toEqual({ gap: 20, maxHeight: 300, maxWidth: undefined });
    });

    it('builds a bottom legend with 4→1 column niveau candidates and a horizontal average row', () => {
        const cfg = buildLegendStackConfig(NIVEAU, AVERAGE, { position: 'bottom', maxWidth: 400 });
        expect(cfg.stacked[0].config.layout).toEqual({
            direction: 'vertical',
            columns: 4,
            columnGap: 12,
        });
        expect(cfg.stacked[0].candidates.map((c) => c.layout.columns)).toEqual([4, 3, 2, 1]);
        expect(cfg.stacked[1].config.layout).toEqual({ direction: 'horizontal', itemGap: 18 });
        expect(cfg.stackOptions).toEqual({ gap: 12, maxHeight: undefined, maxWidth: 400 });
    });
});

describe('resolveLegendPlan', () => {
    const measurements = {
        containerWidth: 800,
        containerHeight: 500,
        axisLeftSpace: 50,
        axisBottomSpace: 40,
    };
    const base = { niveauItems: NIVEAU, averageItems: AVERAGE, measurements, layoutPadding: {} };

    it('keeps the legend on the right when the right layout leaves enough chart width', () => {
        // rightChartWidth = 800 - 8(padding) - 50 - 100(legend) - 15(gap) = 627 ≥ 280
        const plan = resolveLegendPlan({
            ...base,
            measureStackLayout: scriptedMeasurer(
                { width: 100, height: 200 },
                { width: 300, height: 60 },
            ),
        });
        expect(plan.position).toBe('right');
        expect(plan.stackAlign).toBe('start');
        expect(plan.legendStackConfig.stackOptions.gap).toBe(20); // the right config
    });

    it('flips to the bottom when the right legend squeezes the chart AND the bottom fits', () => {
        // WHY: this is the whole point of the planner — a wide right legend that
        // would narrow the plot below its minimum should relocate below the chart,
        // but only when there is vertical room for it.
        // rightChartWidth = 800 - 8 - 50 - 500 - 15 = 227 < 280 (squeezed)
        // bottomChartHeight = 500 - 8 - 40 - 60 - 15 = 377 ≥ 120 (room below)
        const plan = resolveLegendPlan({
            ...base,
            measureStackLayout: scriptedMeasurer(
                { width: 500, height: 200 },
                { width: 700, height: 60 },
            ),
        });
        expect(plan.position).toBe('bottom');
        expect(plan.stackAlign).toBe('center');
        expect(plan.legendStackConfig.stackOptions.gap).toBe(12); // the bottom config
    });

    it('stays on the right when the right is squeezed but the bottom would not fit either', () => {
        // rightChartWidth = 227 < 280 (squeezed), but
        // bottomChartHeight = 500 - 8 - 40 - 400 - 15 = 37 < 120 (no room) → stay right
        const plan = resolveLegendPlan({
            ...base,
            measureStackLayout: scriptedMeasurer(
                { width: 500, height: 200 },
                { width: 700, height: 400 },
            ),
        });
        expect(plan.position).toBe('right');
    });

    it('respects the MIN_RIGHT_LEGEND_CHART_WIDTH boundary exactly', () => {
        // width chosen so rightChartWidth == 280 exactly → `< 280` is false → stay right.
        // 800 - 8 - 50 - w - 15 = 280 → w = 447
        const atBoundary = resolveLegendPlan({
            ...base,
            measureStackLayout: scriptedMeasurer(
                { width: 447, height: 200 },
                { width: 700, height: 60 },
            ),
        });
        expect(atBoundary.position).toBe('right');
        // one pixel wider → rightChartWidth 279 < 280 → flips (bottom fits)
        const overBoundary = resolveLegendPlan({
            ...base,
            measureStackLayout: scriptedMeasurer(
                { width: 448, height: 200 },
                { width: 700, height: 60 },
            ),
        });
        expect(overBoundary.position).toBe('bottom');
    });

    it('honors a forced position regardless of the measured fit', () => {
        // WHY: once a slot position is locked at first render, domain switches must
        // not move the legend even if the numbers would now prefer the other side.
        const squeezed = scriptedMeasurer({ width: 500, height: 200 }, { width: 700, height: 60 });
        expect(
            resolveLegendPlan({ ...base, forcedPosition: 'right', measureStackLayout: squeezed })
                .position,
        ).toBe('right');
        const roomy = scriptedMeasurer({ width: 100, height: 200 }, { width: 300, height: 60 });
        expect(
            resolveLegendPlan({ ...base, forcedPosition: 'bottom', measureStackLayout: roomy })
                .position,
        ).toBe('bottom');
    });

    it('measures the right layout first, then the bottom layout', () => {
        const m = scriptedMeasurer({ width: 100, height: 200 }, { width: 300, height: 60 });
        resolveLegendPlan({ ...base, measureStackLayout: m });
        expect(m.calls).toHaveLength(2);
        expect(m.calls[0].stackOptions.gap).toBe(20); // right config measured first
        expect(m.calls[1].stackOptions.gap).toBe(12); // bottom config measured second
    });
});
