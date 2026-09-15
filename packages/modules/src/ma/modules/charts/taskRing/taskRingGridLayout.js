/**
 * The task-ring grid's layout maths: how many rings fit a container at what size, the
 * title lines each ring reserves, and the chart definitions the Leitideen produce. Pure
 * over the metrics read off the container, so the packing search can be exercised
 * without a mounted host.
 */

import {
    TASK_RING_FONT_MAX_PX,
    TASK_RING_TITLE_LAYOUT,
    getTaskRingFontSizeForRing,
    getTaskRingTitleWrapWidth,
    getTaskRingVerticalOverhead,
    resolveTaskRingTitleLines,
    taskRingTitleFitsSingleLine,
} from './taskRingTitleMetrics.js';
import { resolveCssLengthToPx } from '@tba3/module-base/utils/textMeasurement.js';

const GRID_CONFIG = {
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,
    GRID_GAP_FALLBACK: 8, // --layout-gap
    DEFAULT_CELL_PADDING: 12, // --chart-container-padding
    DEFAULT_FONT_FAMILY: 'system-ui, -apple-system, sans-serif',
    CONTAINER_MARGIN: 5,
};

/**
 * Bounds on the **ring circle**, not on the grid cell — the cell is derived from the ring it
 * carries. The visible arc is 85% of this; the rest of the circle holds the tick marks and the
 * class-average marker.
 *
 * MIN is the diameter below which the niveau labels no longer fit the inner band even after the
 * text has scaled down. The grid wraps and lets the module body scroll rather than shrink past
 * it. MAX only bites when few Leitideen sit in a wide container.
 */
export const RING_SIZE_MIN = 200;
export const RING_SIZE_MAX = 380;

/**
 * Everything the layout needs from the live container, in a single computed-style read — this
 * runs on every debounced resize, and each getComputedStyle call can force a style recalc.
 *
 * The box is measured with clientWidth/clientHeight (the padding box) rather than
 * getBoundingClientRect (the border box): the grid scrolls in wrap mode, and the border box
 * includes the scrollbar, which would hand the layout width the scrollbar already owns. Gaps and
 * the ring padding are read from CSS rather than assumed, so the arithmetic here and the space
 * the rings are actually given cannot drift apart.
 * @param {HTMLElement} element - The grid container; anything else falls back to the configured defaults.
 * @returns {{ width: number, height: number, columnGap: number, rowGap: number, cellPadding: number, fontFamily: string }} The content box the rings may use, the gaps between them, the padding each cell adds, and the font titles are measured in.
 */
function readGridMetrics(element) {
    const {
        DEFAULT_WIDTH,
        DEFAULT_HEIGHT,
        GRID_GAP_FALLBACK,
        DEFAULT_CELL_PADDING,
        DEFAULT_FONT_FAMILY,
    } = GRID_CONFIG;
    if (!(element instanceof HTMLElement)) {
        return {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            columnGap: GRID_GAP_FALLBACK,
            rowGap: GRID_GAP_FALLBACK,
            cellPadding: DEFAULT_CELL_PADDING,
            fontFamily: DEFAULT_FONT_FAMILY,
        };
    }

    const computedStyle = getComputedStyle(element);
    const px = (value) => parseFloat(value) || 0;
    const baseGap = parseFloat(computedStyle.gap) || GRID_GAP_FALLBACK;
    const paddingToken = computedStyle.getPropertyValue('--chart-container-padding')?.trim();

    const fullWidth = element.clientWidth || DEFAULT_WIDTH;
    const fullHeight = element.clientHeight || DEFAULT_HEIGHT;

    return {
        width: Math.max(
            0,
            fullWidth - px(computedStyle.paddingLeft) - px(computedStyle.paddingRight),
        ),
        height: Math.max(
            0,
            fullHeight - px(computedStyle.paddingTop) - px(computedStyle.paddingBottom),
        ),
        columnGap: parseFloat(computedStyle.columnGap) || baseGap,
        rowGap: parseFloat(computedStyle.rowGap) || baseGap,
        cellPadding: paddingToken
            ? resolveCssLengthToPx(paddingToken, DEFAULT_CELL_PADDING)
            : DEFAULT_CELL_PADDING,
        fontFamily: computedStyle.fontFamily || DEFAULT_FONT_FAMILY,
    };
}

/**
 * Best column count for a given per-cell overhead: the one whose cells hold the largest ring.
 * @param {number} availableWidth - Width the grid may fill, gaps included.
 * @param {number} availableHeight - Height the grid may fill, gaps included.
 * @param {number} columnGap - Horizontal gap between cells in px.
 * @param {number} rowGap - Vertical gap between cells in px.
 * @param {number} count - Number of rings to place.
 * @param {number} overheadX - Per-cell width a ring does not get (padding).
 * @param {number} overheadY - Per-cell height a ring does not get (title band plus padding).
 * @returns {{ diameter: number, cols: number, rows: number }} The winning arrangement and the ring diameter it affords.
 */
function searchRingColumns(
    availableWidth,
    availableHeight,
    columnGap,
    rowGap,
    count,
    overheadX,
    overheadY,
) {
    let best = { diameter: -1, cols: count, rows: 1 };

    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const cellWidth = (availableWidth - (cols - 1) * columnGap) / cols;
        const cellHeight = (availableHeight - (rows - 1) * rowGap) / rows;
        const diameter = Math.max(
            0,
            Math.floor(Math.min(cellWidth - overheadX, cellHeight - overheadY)),
        );

        // Arrangements sharing a row count share a cell height, so they all tie once height
        // binds; `>` keeps the first of them — the fewest columns, and with it the fullest
        // last row. `rows < best.rows` decides only the rarer cross-row tie, where a
        // width-bound arrangement meets a height-bound one: there the shorter grid wins,
        // because height is the dimension the module body scrolls.
        if (diameter > best.diameter || (diameter === best.diameter && rows < best.rows)) {
            best = { diameter, cols, rows };
        }
    }

    return best;
}

/**
 * Calculates the grid layout that renders the ring circles as large as possible within
 * [RING_SIZE_MIN, RING_SIZE_MAX].
 *
 * The bounds and the search apply to the **ring diameter**, not to the grid cell. A cell has to
 * hold the ring *plus* its title, so it is inherently taller than it is wide; sizing cells as
 * squares would steal the title's height from the ring and then leave the spare width unused.
 * Instead each cell is sized from the ring it carries — `diameter + overhead` — which is the
 * exact inverse of `TaskRingChart.calculateRadius`, so the ring fills the cell it was given.
 *
 * The Leitidee count is not fixed, so column/row counts are searched rather than hard-coded.
 * When even the best fit falls below RING_SIZE_MIN the rings would stop being readable, so the
 * grid switches to wrap mode: it pins them at the minimum, fits as many columns as the width
 * allows, and lets the (already scrollable) module body scroll.
 * @param {number} containerWidth - Grid content-box width in px.
 * @param {number} containerHeight - Grid content-box height in px.
 * @param {number} columnGap - Horizontal gap between cells in px.
 * @param {number} rowGap - Vertical gap between cells in px.
 * @param {number} chartCount - Number of rings to place; at least one column is always assumed.
 * @param {object} [options] - Per-cell overhead the ring does not get to use.
 * @param {number} [options.cellPadding=12] - Padding .chart-container puts around each ring
 * @param {number} [options.titleLineCount=2] - Title lines every cell reserves
 * @returns {{ ringWidth: number, ringHeight: number, ringDiameter: number, cellPadding: number, estimatedCols: number, estimatedRows: number, wrapMode: boolean, fontSize: number, margin: number, columnGap: number, rowGap: number }} The cell geometry to render with, plus `wrapMode` when the rings had to be pinned at their minimum and the grid left to scroll.
 */
export function calculateFlexLayout(
    containerWidth,
    containerHeight,
    columnGap,
    rowGap,
    chartCount,
    options = {},
) {
    const { CONTAINER_MARGIN, DEFAULT_CELL_PADDING } = GRID_CONFIG;
    const { cellPadding = DEFAULT_CELL_PADDING, titleLineCount = 2 } = options;

    const availableWidth = Math.max(0, containerWidth - 2 * CONTAINER_MARGIN);
    const availableHeight = Math.max(0, containerHeight - 2 * CONTAINER_MARGIN);
    const count = Math.max(1, chartCount);
    const overheadX = 2 * cellPadding;

    // The title height depends on the font, the font depends on the ring, and the ring depends
    // on the title height. Two passes settle it: solve once assuming the largest font, then
    // re-solve with the font that ring actually gets. Shrinking the font only frees height, so
    // the diameter can only grow — this cannot oscillate.
    const solve = (size) =>
        searchRingColumns(
            availableWidth,
            availableHeight,
            columnGap,
            rowGap,
            count,
            overheadX,
            overheadX + getTaskRingVerticalOverhead(size, titleLineCount),
        );

    let fontSize = TASK_RING_FONT_MAX_PX;
    let best = solve(fontSize);

    const settledFontSize = getTaskRingFontSizeForRing(Math.min(best.diameter, RING_SIZE_MAX));
    if (settledFontSize !== fontSize) {
        fontSize = settledFontSize;
        best = solve(fontSize);
    }

    // Wrap mode: stop shrinking, fit what the width allows, and grow downwards into a scroll.
    // A container too narrow for even one minimum ring still gets a single column, sized to the
    // container, so the grid never overflows sideways into an unreachable region.
    const wrapMode = best.diameter < RING_SIZE_MIN;
    if (wrapMode) {
        const cols = clamp(
            Math.floor((availableWidth + columnGap) / (RING_SIZE_MIN + overheadX + columnGap)),
            1,
            count,
        );
        best = {
            diameter: Math.max(0, Math.min(RING_SIZE_MIN, availableWidth - overheadX)),
            cols,
            rows: Math.ceil(count / cols),
        };
        fontSize = getTaskRingFontSizeForRing(best.diameter);
    }

    const diameter = Math.min(best.diameter, RING_SIZE_MAX);
    const overheadY = overheadX + getTaskRingVerticalOverhead(fontSize, titleLineCount);

    // A collapsed container has no ring, so it gets no cell either — a cell of pure padding
    // would still paint a border and a title band around nothing.
    const ringWidth =
        diameter > 0 ? makeCellPitchEven(Math.round(diameter + overheadX), columnGap) : 0;
    const ringHeight = diameter > 0 ? Math.round(diameter + overheadY) : 0;

    return {
        ringWidth,
        ringHeight,
        ringDiameter: diameter,
        cellPadding,
        estimatedCols: best.cols,
        estimatedRows: best.rows,
        wrapMode,
        fontSize,
        margin: CONTAINER_MARGIN,
        columnGap,
        rowGap,
    };
}

/**
 * Constrain a value to a closed range.
 * @param {number} value - The value to constrain.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} The value, pulled to whichever bound it exceeded.
 */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Keeps the cell pitch (cell width + gap) even, so the half-pitch offset that centres a partial
 * last row lands on a whole pixel. A `.5px` translate would blur that row's rings and text — and
 * only that row. Costs at most 1px of ring.
 *
 * A fractional gap has no even pitch to reach, so it is left alone rather than shaved for
 * nothing; buildLastRowCenteringRules rounds the offset and absorbs the half pixel there.
 * @param {number} cellWidth - The cell width the search arrived at.
 * @param {number} columnGap - Horizontal gap between cells in px.
 * @returns {number} The cell width to use — shaved by at most 1px, or unchanged when the gap is fractional.
 */
function makeCellPitchEven(cellWidth, columnGap) {
    const pitch = cellWidth + columnGap;
    if (!Number.isInteger(pitch) || pitch % 2 === 0) return cellWidth;

    return Math.max(0, cellWidth - 1);
}

/**
 * Build one chart definition per ring: "Gesamt" plus every Leitidee the booklet
 * declares. A Leitidee without items keeps its ring (flagged `isEmpty`) so the grid
 * stays complete — the ring then renders as an empty placeholder.
 * @param {Array<{domain: string, domainLabel: string}>} domains - The Leitideen the booklet declares, in payload order.
 * @param {Array<{domain: string}>} itemArray - The items, used only to decide which rings are empty.
 * @returns {Array<{id: string, domain: string|null, title: string, isEmpty: boolean}>} One definition per ring, "Gesamt" first.
 */
export function getTaskRingChartDefinitions(domains, itemArray) {
    const items = itemArray ?? [];

    return [
        { id: 'overall', domain: null, title: 'Gesamt', isEmpty: items.length === 0 },
        ...(domains ?? []).map(({ domain, domainLabel }) => ({
            id: domain,
            domain,
            // A Leitidee the payload leaves unnamed is titled by its id — data, not copy.
            title: domainLabel || domain,
            isEmpty: !items.some((item) => item.domain === domain),
        })),
    ];
}

/**
 * Pick the Leitidee the grid selects by default. Empty Leitideen are never selected —
 * they would open the focus chart and the item table on zero tasks.
 * @param {Array<{domain: string|null, isEmpty: boolean}>} chartDefs - The ring definitions to choose from.
 * @param {string|null} currentSelected - The selection to keep if it is still selectable.
 * @returns {string|null} Domain id, or null when no Leitidee carries items.
 */
export function resolveDefaultDomain(chartDefs, currentSelected) {
    const selectable = chartDefs.filter(
        (chartDef) => chartDef.domain !== null && !chartDef.isEmpty,
    );

    return selectable.some((chartDef) => chartDef.domain === currentSelected)
        ? currentSelected
        : (selectable[0]?.domain ?? null);
}

/**
 * Decide how many lines the grid's titles need, at the size the rings will actually draw them.
 * @param {Array} chartDefs - The ring definitions whose titles are measured.
 * @param {number} ringDiameter - The title is drawn inside the ring's SVG, which is the ring
 *   diameter wide — not the cell, which is wider by the container padding.
 * @param {number} fontSize - The rings render their titles at the ring-derived size, not the
 *   container's token size, so the grid must wrap them at that size too.
 * @param {string} fontFamily - The container's resolved font stack, so measuring matches rendering.
 * @returns {{titleLayoutMode: string, titleWrapWidth: number, charts: Array<object>}} How many lines every cell reserves, the width titles wrap at, and each ring definition with its title already broken into lines.
 */
function resolveTaskRingGridTitleLayout(chartDefs, ringDiameter, fontSize, fontFamily) {
    const titleWrapWidth = getTaskRingTitleWrapWidth(ringDiameter);
    const measureOptions = { fontFamily, fontSize };
    const titleLayoutMode = chartDefs.some(
        (chartDef) => !taskRingTitleFitsSingleLine(chartDef.title, titleWrapWidth, measureOptions),
    )
        ? TASK_RING_TITLE_LAYOUT.TWO_LINE
        : TASK_RING_TITLE_LAYOUT.SINGLE_LINE;
    const maxLines = titleLayoutMode === TASK_RING_TITLE_LAYOUT.TWO_LINE ? 2 : 1;

    return {
        titleLayoutMode,
        titleWrapWidth,
        charts: chartDefs.map((chartDef) => ({
            ...chartDef,
            titleLines: resolveTaskRingTitleLines(chartDef.title, titleWrapWidth, {
                ...measureOptions,
                maxLines,
            }),
        })),
    };
}

/**
 * Solve the grid and the title band together.
 *
 * The two are coupled: the cells reserve height for the title, but how many lines a title needs
 * depends on how wide the ring turned out. Solving for the worst case (two lines) first and
 * re-solving only when every title in fact fits on one keeps it honest — a booklet with short
 * Leitidee names gets that line of height back as ring.
 * @param {Array} chartDefs - The rings to place.
 * @param {HTMLElement} container - The grid element, measured for its box, gaps and font.
 * @returns {{layout: object, titleLayout: object}} The cell geometry and the title layout it was solved against.
 */
export function resolveTaskRingGrid(chartDefs, container) {
    const { width, height, columnGap, rowGap, cellPadding, fontFamily } =
        readGridMetrics(container);

    const solve = (titleLineCount) =>
        calculateFlexLayout(width, height, columnGap, rowGap, chartDefs.length, {
            cellPadding,
            titleLineCount,
        });
    const titlesFor = (layout) =>
        resolveTaskRingGridTitleLayout(chartDefs, layout.ringDiameter, layout.fontSize, fontFamily);

    let layout = solve(2);
    let titleLayout = titlesFor(layout);

    if (titleLayout.titleLayoutMode === TASK_RING_TITLE_LAYOUT.SINGLE_LINE) {
        layout = solve(1);
        titleLayout = titlesFor(layout);
    }

    return { layout, titleLayout };
}
