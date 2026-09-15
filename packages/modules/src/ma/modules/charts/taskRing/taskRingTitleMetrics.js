/**
 * Everything about a task ring's title and font: the ring-size-driven font size, how a
 * title is measured and split over at most two lines, and the vertical space the title
 * lines reserve above the ring. Pure over a chart instance's measurement hooks, so the
 * grid layout can reserve the same space the ring will draw.
 */

import { measureHeaderWidth } from '@tba3/module-base/utils/textMeasurement.js';

export const RING_CHART_CONFIG = {
    POSITIONING: {
        TITLE_PADDING: 2, // gap between title baseline and reserved space top
        TITLE_HORIZONTAL_PADDING: 8,
        TITLE_LINE_HEIGHT_EM: 1.1,
        BOTTOM_BUFFER: 8, // small breathing room below the ring
    },
    FONT: {
        RING_SIZE_RATIO: 0.075, // font size as a fraction of the ring diameter
        MIN_PX: 11, // below this the niveau labels stop being readable at all
        MAX_PX: 16, // matches --fs-base: rings >= ~213px across keep the token size
    },
};

export const TASK_RING_TITLE_LAYOUT = Object.freeze({
    SINGLE_LINE: 'single-line',
    TWO_LINE: 'two-line',
});

/* Numeric because the canvas measurer cannot resolve a token: --fw-bold, the weight
   .task-ring-svg-title renders at (taskRingBase.css). Measuring lighter than the render
   underestimates a title and lets it break mid-word. */
const TASK_RING_TITLE_FONT_WEIGHT = '700';

/** Largest text a ring ever uses — the size every ring at or above the knee (~213px) renders at. */
export const TASK_RING_FONT_MAX_PX = RING_CHART_CONFIG.FONT.MAX_PX;

/**
 * Text size for a ring of the given diameter. The grid needs this before the ring elements
 * exist (to wrap titles), and the ring itself reads the same value back from its container's
 * computed font-size — so both must derive it from one place.
 *
 * The ring text does not scale with the ring on its own: it is sized from a CSS token, so a
 * shrinking ring would keep 16px labels and crush them. Above ~213px across, this returns the
 * token size unchanged, so today's layouts are unaffected.
 * @param {number} ringDiameter - Ring circle diameter in px (not the grid cell, which is larger)
 * @returns {number} Font size in px
 */
export function getTaskRingFontSizeForRing(ringDiameter) {
    const { RING_SIZE_RATIO, MIN_PX, MAX_PX } = RING_CHART_CONFIG.FONT;
    if (!Number.isFinite(ringDiameter) || ringDiameter <= 0) return MAX_PX;

    return Math.min(MAX_PX, Math.max(MIN_PX, ringDiameter * RING_SIZE_RATIO));
}

/**
 * The chart's own resolved font size, so ring labels and the title scale together.
 * @param {object} chartInstance - The renderer the ring belongs to.
 * @returns {number} Font size in px.
 */
export function getTaskRingFontSize(chartInstance) {
    return chartInstance.getChartFontSize();
}

/**
 * Resolve the text-measuring function the title layout uses. A caller-supplied
 * `measureText` wins, so tests can measure without a DOM.
 * @param {{measureText?: (text: string) => number, fontFamily?: string, fallbackFontSize?: number, fontSize?: number}} [options] - The measurer to use, or the font it should measure with.
 * @returns {(text: string) => number} Width of a string in px.
 */
function createTaskRingTitleMeasure(options = {}) {
    const {
        measureText,
        fontFamily = 'system-ui, -apple-system, sans-serif',
        fallbackFontSize = 16,
        fontSize,
    } = options;

    if (typeof measureText === 'function') {
        return measureText;
    }

    // fontSize is passed explicitly because measureHeaderWidth resolves --fs-base against the
    // document root: without it a scaled-down title would be measured at the token size and
    // wrapped onto a line it does not need.
    return (text) =>
        measureHeaderWidth(text, {
            padding: 0,
            fontSize,
            fontSizeVar: '--fs-base',
            fontWeight: TASK_RING_TITLE_FONT_WEIGHT,
            fontFamily,
            fallbackFontSize,
        });
}

/**
 * Coerce a title to a trimmed string, so a missing one measures as empty rather than
 * as the literal `null`.
 * @param {any} title - The title as the caller holds it.
 * @returns {string} The trimmed title, empty when there is none.
 */
function normalizeTaskRingTitle(title) {
    return String(title ?? '').trim();
}

/**
 * Title line height in px, derived from the font size so wrapped titles keep their
 * spacing when the ring scales.
 * @param {number} fontSize - The title's font size in px.
 * @returns {number} Line height in px.
 */
function getTaskRingTitleLineHeightPx(fontSize) {
    return fontSize * RING_CHART_CONFIG.POSITIONING.TITLE_LINE_HEIGHT_EM;
}

/**
 * Width a title may occupy before it wraps.
 * @param {number} chartWidth - The chart's full width in px.
 * @returns {number} The wrap width, never negative.
 */
export function getTaskRingTitleWrapWidth(chartWidth) {
    return Math.max(0, chartWidth - RING_CHART_CONFIG.POSITIONING.TITLE_HORIZONTAL_PADDING * 2);
}

/**
 * Whether a title still fits on one line at the given width.
 * @param {any} title - The title to measure.
 * @param {number} maxWidth - Width available in px; a non-positive width means "unconstrained".
 * @param {{measureText?: (text: string) => number, fontFamily?: string, fallbackFontSize?: number, fontSize?: number}} [options] - Measuring options, see `createTaskRingTitleMeasure`.
 * @returns {boolean} True when one line suffices — an empty title always does.
 */
export function taskRingTitleFitsSingleLine(title, maxWidth, options = {}) {
    const normalizedTitle = normalizeTaskRingTitle(title);
    if (!normalizedTitle) return true;
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return true;

    return createTaskRingTitleMeasure(options)(normalizedTitle) <= maxWidth;
}

/**
 * Break a title into the lines it will actually be drawn as.
 * @param {any} title - The title to lay out.
 * @param {number} maxWidth - Width available in px; a non-positive width forces a single line.
 * @param {{maxLines?: number, measureText?: (text: string) => number, fontFamily?: string, fallbackFontSize?: number, fontSize?: number}} [options] - The line budget plus the measuring options.
 * @returns {string[]} One entry per rendered line; empty for a title with no text.
 */
export function resolveTaskRingTitleLines(title, maxWidth, options = {}) {
    const normalizedTitle = normalizeTaskRingTitle(title);
    const maxLines = Math.max(1, options.maxLines ?? 1);

    if (!normalizedTitle) return [];
    if (maxLines === 1 || !Number.isFinite(maxWidth) || maxWidth <= 0) {
        return [normalizedTitle];
    }

    const measureText = createTaskRingTitleMeasure(options);
    if (measureText(normalizedTitle) <= maxWidth) {
        return [normalizedTitle];
    }

    const words = normalizedTitle.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
        return [normalizedTitle];
    }

    let bestSplit = null;

    for (let splitIndex = 1; splitIndex < words.length; splitIndex++) {
        const lineOne = words.slice(0, splitIndex).join(' ');
        const lineTwo = words.slice(splitIndex).join(' ');
        const lineOneWidth = measureText(lineOne);
        const lineTwoWidth = measureText(lineTwo);
        const overflow =
            Math.max(0, lineOneWidth - maxWidth) + Math.max(0, lineTwoWidth - maxWidth);
        const widestLine = Math.max(lineOneWidth, lineTwoWidth);
        const balance = Math.abs(lineOneWidth - lineTwoWidth);

        if (
            !bestSplit ||
            overflow < bestSplit.overflow ||
            (overflow === bestSplit.overflow && widestLine < bestSplit.widestLine) ||
            (overflow === bestSplit.overflow &&
                widestLine === bestSplit.widestLine &&
                balance < bestSplit.balance)
        ) {
            bestSplit = {
                lines: [lineOne, lineTwo],
                overflow,
                widestLine,
                balance,
            };
        }
    }

    return bestSplit?.lines ?? [normalizedTitle];
}

/**
 * Title lines the layout reserves, whether or not the title ends up using them — the
 * grid must reserve the same height for every cell or the rings stop aligning.
 * @param {object} chartInstance - The renderer the ring belongs to.
 * @returns {number} 0, 1 or 2 lines.
 */
function getTaskRingReservedTitleLines(chartInstance) {
    if (!chartInstance.chartTitle) return 0;
    return chartInstance.titleLayoutMode === TASK_RING_TITLE_LAYOUT.TWO_LINE ? 2 : 1;
}

/**
 * The lines the title is actually drawn as, measured against this chart's own font
 * rather than the document root's.
 * @param {object} chartInstance - The renderer the ring belongs to.
 * @returns {string[]} One entry per drawn line; empty when the ring has no title.
 */
export function getTaskRingRenderedTitleLines(chartInstance) {
    if (!chartInstance.chartTitle) return [];
    if (Array.isArray(chartInstance.titleLines) && chartInstance.titleLines.length > 0) {
        return chartInstance.titleLines;
    }

    const fontSize = getTaskRingFontSize(chartInstance);
    const fontFamily = chartInstance.getChartFont();

    return resolveTaskRingTitleLines(chartInstance.chartTitle, chartInstance.titleWrapWidth, {
        maxLines: getTaskRingReservedTitleLines(chartInstance),
        fontFamily,
        fallbackFontSize: fontSize,
        measureText: (text) =>
            chartInstance.measureTexts([text], {
                fontSize,
                fontFamily,
                fontWeight: TASK_RING_TITLE_FONT_WEIGHT,
            }).maxWidth,
    });
}

/**
 * Height the title band reserves above the ring.
 * @param {number} fontSize - Title font size in px.
 * @param {number} lineCount - Title lines to reserve; `0` reserves no band at all.
 * @returns {number} Band height in px, padding included.
 */
function getTaskRingTitleSpaceFor(fontSize, lineCount) {
    if (!lineCount) return 0;

    return (
        fontSize +
        (lineCount - 1) * getTaskRingTitleLineHeightPx(fontSize) +
        RING_CHART_CONFIG.POSITIONING.TITLE_PADDING * 2
    );
}

/**
 * Everything a ring cell must hold besides the ring circle itself: the title band and the
 * breathing room under the ring. The grid sizes its cells with this so the ring ends up
 * exactly `diameter` across — it is the inverse of `calculateRadius`, and the two must agree
 * or the ring will not fill its cell.
 * @param {number} fontSize - Title font size in px.
 * @param {number} lineCount - Title lines the cell reserves (0, 1 or 2)
 * @returns {number} Vertical overhead in px
 */
export function getTaskRingVerticalOverhead(fontSize, lineCount) {
    return (
        getTaskRingTitleSpaceFor(fontSize, lineCount) + RING_CHART_CONFIG.POSITIONING.BOTTOM_BUFFER
    );
}

/**
 * Title-band height for one chart, from its own font size and reserved line count.
 * @param {object} chartInstance - The renderer the ring belongs to.
 * @returns {number} Band height in px.
 */
export function getTaskRingTitleSpace(chartInstance) {
    return getTaskRingTitleSpaceFor(
        getTaskRingFontSize(chartInstance),
        getTaskRingReservedTitleLines(chartInstance),
    );
}
