/**
 * Shared chart constants — single source of truth for recurring numeric defaults.
 *
 * Import individual constants where you would otherwise hard-code the same
 * value across multiple chart modules.
 */

/* ── Axis tick padding (px) ────────────────────────────────────────────── */
export const TICK_PADDING = 8;

/* ── Axis defaults (px/counts) ─────────────────────────────────────────── */
export const AXIS_DEFAULTS = Object.freeze({
    titleGap: 6,
    edgeTickBuffer: 4,
});

export const AXIS_TICK_COUNTS = Object.freeze({
    compact: 5,
    standard: 5,
    dense: 10,
});

export const PERCENT_TICK_VALUES = Object.freeze({
    step10: Object.freeze([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]),
    step20: Object.freeze([0, 20, 40, 60, 80, 100]),
});

export const RATING_TICK_VALUES = Object.freeze({
    oneToFive: Object.freeze([1, 2, 3, 4, 5]),
});

/* ── Common layout presets ─────────────────────────────────────────────── */
export const CHART_LAYOUT_PRESETS = Object.freeze({
    noLegend: Object.freeze({
        legends: Object.freeze([]),
        axis: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
        padding: Object.freeze({ top: 10, right: 0, bottom: 0, left: 0 }),
    }),
    paddedNoLegend: Object.freeze({
        legends: Object.freeze([]),
        axis: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
        padding: Object.freeze({ top: 10, right: 10, bottom: 10, left: 10 }),
    }),
    compactNoAxis: Object.freeze({
        legends: Object.freeze([]),
        axis: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
        padding: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
    }),
    bottomLegend: Object.freeze({
        legends: Object.freeze([Object.freeze({ position: 'bottom', gap: 8 })]),
        axis: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
        padding: Object.freeze({ top: 10, right: 0, bottom: 0, left: 0 }),
    }),
    rightLegend: Object.freeze({
        legends: Object.freeze([Object.freeze({ position: 'right', gap: 8 })]),
        axis: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
        padding: Object.freeze({ top: 10, right: 0, bottom: 0, left: 0 }),
    }),
    squareBottomLegend: Object.freeze({
        legends: Object.freeze([Object.freeze({ position: 'bottom', gap: 8 })]),
        axis: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
        axisExtra: Object.freeze({ top: 0, right: 0, bottom: 25, left: 0 }),
        aspectRatio: 1,
    }),
});

/* ── Fallback canvas dimensions (px) ───────────────────────────────────── */
export const DEFAULT_DIMENSIONS = Object.freeze({
    width: 600,
    height: 400,
});
