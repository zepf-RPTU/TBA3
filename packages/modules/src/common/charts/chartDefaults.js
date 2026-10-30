/** The numeric defaults the charts share. */

/** Axis gaps and tick spacing. */
export const AXIS_DEFAULTS = Object.freeze({
    /** Gap between the plot edge and the tick labels; measured and drawn alike. */
    tickPaddingPx: 8,
    /** Gap between the tick labels and the axis title. */
    titleGapPx: 6,
    /** Room beyond half an edge label, so the outermost tick is not clipped. */
    edgeTickBufferPx: 4,
    /**
     * The least distance between two ticks before a percent axis steps up from 10 to
     * 20 (then 50) percent: a label's height on a vertical axis, a `100 %` label's width
     * plus a gap on a horizontal one.
     */
    minTickSpacingPx: Object.freeze({ vertical: 32, horizontal: 56 }),
    /**
     * Outer padding of a point scale (years on a line or box chart), a share of a step:
     * each category sits in the middle of its band, as Highcharts places categories, so
     * the first label clears the value axis's labels and the last one needs no edge
     * reserve.
     */
    pointPaddingRatio: 0.5,
});

/* ── Marks ─────────────────────────────────────────────────────────────── */
export const MARK_DEFAULTS = Object.freeze({
    /** Surface-coloured outline that parts a filled head or point from what it overlaps. */
    outlineWidthPx: 2,
    /** A data line: a series over years, a lollipop's stem. */
    lineWidthPx: 2,
    /** The narrowest a pointer target may be: a thin mark gets a transparent hit area this wide (WCAG 2.5.8). */
    minHitSizePx: 24,
    /** Pointer travel past which a press is a drag, not a click. */
    dragThresholdPx: 5,
    /** Growth factors of a hovered lollipop: the head's radius and the stem's width. */
    hoverScale: Object.freeze({ head: 1.3, stem: 1.5 }),
});

/**
 * The thickest a bar is drawn, however wide its slot: past it a bar reads as a block
 * rather than a length, and a label-carrying stack still holds `III · 24 %`. A layout
 * that caps its bars centres them in their slot.
 */
export const BAR_MAX_THICKNESS_PX = 72;

/**
 * A bar in its band: as thick as the band, capped at `BAR_MAX_THICKNESS_PX`, and centred.
 * @param {import('d3').ScaleBand<string>} scale
 * @returns {{size: number, offset: number}} The bar's thickness and its offset from the band's start, in px.
 */
export function bandBar(scale) {
    const size = Math.min(scale.bandwidth(), BAR_MAX_THICKNESS_PX);
    return { size, offset: (scale.bandwidth() - size) / 2 };
}

/**
 * A comparison-average marker. `sizePx` is the half-extent of a diamond, and every shape
 * of that size covers the same area (see `markerPath`), so a Landesschnitt square
 * does not outweigh the Schulschnitt diamond beside it.
 */
export const AVERAGE_MARKER = Object.freeze({
    sizePx: 6,
    /** A filled marker's outline parts it from its neighbours; a hollow one's is its colour. */
    strokeWidthPx: Object.freeze({ filled: 1, hollow: 2 }),
});

/** The canvas size when the chart container measures none. */
export const DEFAULT_DIMENSIONS = Object.freeze({
    widthPx: 600,
    heightPx: 400,
});
