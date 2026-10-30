/**
 * How many item rings fit the grid's box, at what size: the column search, the ring-size
 * bounds and the cell geometry the grid renders with. Pure over the box's numbers, so
 * the packing can be exercised without a container; measuring one is
 * `itemRingGridLayout.js`'s. Every length is in px.
 */

import {
    FONT_MAX_PX,
    getItemRingFontSizeForRing,
    getItemRingVerticalOverhead,
} from './itemRingTitleMetrics.js';
import { RING_REACH, RING_SIZE_MIN_PX } from './itemRingGeometry.js';

/**
 * The solved cell geometry the grid renders with; lengths in px.
 * @typedef {object} ItemRingGridLayout
 * @property {number} cellWidthPx
 * @property {number} cellHeightPx
 * @property {number} ringDiameter
 * @property {number} estimatedCols
 * @property {number} estimatedRows
 * @property {boolean} wrapMode - The rings were pinned at their minimum size and the grid scrolls.
 * @property {number} fontSize - Ring text size.
 * @property {number} columnGap
 */

/** Space kept clear inside the grid's box on every side. */
const CONTAINER_MARGIN_PX = 5;

/**
 * Upper bound on the ring circle, not on the grid cell — the cell is derived from the
 * ring it carries. Only bites when few rings sit in a wide container; the lower bound is
 * the figure's own `RING_SIZE_MIN_PX`.
 */
const RING_SIZE_MAX_PX = 380;

/**
 * Best column count for a given per-cell overhead: the one whose cells hold the largest ring.
 * @param {number} availableWidth - Width the grid may fill, gaps included.
 * @param {number} availableHeight - Height the grid may fill, gaps included.
 * @param {number} columnGap
 * @param {number} rowGap
 * @param {number} count
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

    for (let maxCols = 1; maxCols <= count; maxCols++) {
        const { cols, rows } = balancedGrid(count, maxCols);
        const cellWidth = (availableWidth - (cols - 1) * columnGap) / cols;
        const cellHeight = (availableHeight - (rows - 1) * rowGap) / rows;
        const diameter = Math.max(
            0,
            Math.floor(Math.min(cellWidth - overheadX, cellHeight - overheadY) / RING_REACH),
        );

        // A tie between row counts goes to the shorter grid: height is what the body scrolls.
        if (diameter > best.diameter || (diameter === best.diameter && rows < best.rows)) {
            best = { diameter, cols, rows };
        }
    }

    return best;
}

/**
 * Calculates the grid layout that renders the ring circles as large as possible within
 * [RING_SIZE_MIN_PX, RING_SIZE_MAX_PX].
 *
 * The bounds and the search apply to the ring diameter, not to the grid cell. A cell holds
 * the ring plus its title, so it is taller than wide; square cells would take the title's
 * height from the ring and leave the spare width unused. Each cell is sized from the ring it
 * carries — `diameter · RING_REACH + overhead` — whose exact inverse, `ringFrame`, places
 * the ring, so the ring fills the cell it was given.
 *
 * The ring count is not fixed, so column and row counts are searched. When even the best
 * fit falls below RING_SIZE_MIN_PX the grid switches to wrap mode: it pins the rings at the
 * minimum, takes the row count the width's column capacity forces, and lets the module body
 * scroll. Either way the rings are spread evenly over their rows (`balancedGrid`).
 * @param {number} containerWidth - Grid content-box width.
 * @param {number} containerHeight - Grid content-box height.
 * @param {number} columnGap
 * @param {number} rowGap
 * @param {number} chartCount - At least one column is always assumed.
 * @param {object} options - Per-cell overhead the ring does not get to use.
 * @param {number} options.cellPadding - Padding .chart-container puts around each ring
 * @param {number} options.titleLineCount - Title lines every cell reserves
 * @returns {ItemRingGridLayout}
 */
export function calculateFlexLayout(
    containerWidth,
    containerHeight,
    columnGap,
    rowGap,
    chartCount,
    options,
) {
    const { cellPadding, titleLineCount } = options;

    const availableWidth = Math.max(0, containerWidth - 2 * CONTAINER_MARGIN_PX);
    const availableHeight = Math.max(0, containerHeight - 2 * CONTAINER_MARGIN_PX);
    const count = Math.max(1, chartCount);
    const overheadX = 2 * cellPadding;

    // Title height depends on the font, the font on the ring, the ring on the title height.
    // Two passes settle it: solve with the largest font, then with the font that ring gets.
    // A smaller font only frees height, so the diameter can only grow: no oscillation.
    const solve = (/** @type {number} */ size) =>
        searchRingColumns(
            availableWidth,
            availableHeight,
            columnGap,
            rowGap,
            count,
            overheadX,
            overheadX + getItemRingVerticalOverhead(size, titleLineCount),
        );

    let fontSize = FONT_MAX_PX;
    let best = solve(fontSize);

    const settledFontSize = getItemRingFontSizeForRing(Math.min(best.diameter, RING_SIZE_MAX_PX));
    if (settledFontSize !== fontSize) {
        fontSize = settledFontSize;
        best = solve(fontSize);
    }

    // Wrap mode: stop shrinking, fit what the width allows, and grow downwards into a scroll.
    // A container too narrow for even one minimum ring still gets a single column, sized to the
    // container, so the grid never overflows sideways into an unreachable region.
    const wrapMode = best.diameter < RING_SIZE_MIN_PX;
    if (wrapMode) {
        const maxCols = clamp(
            Math.floor(
                (availableWidth + columnGap) /
                    (RING_SIZE_MIN_PX * RING_REACH + overheadX + columnGap),
            ),
            1,
            count,
        );
        best = {
            diameter: Math.max(
                0,
                Math.min(RING_SIZE_MIN_PX, Math.floor((availableWidth - overheadX) / RING_REACH)),
            ),
            ...balancedGrid(count, maxCols),
        };
        fontSize = getItemRingFontSizeForRing(best.diameter);
    }

    const diameter = Math.min(best.diameter, RING_SIZE_MAX_PX);
    const overheadY = overheadX + getItemRingVerticalOverhead(fontSize, titleLineCount);

    // A collapsed container has no ring, so it gets no cell either — a cell of pure padding
    // would still paint a border and a title band around nothing.
    const footprint = diameter * RING_REACH;
    const cellWidthPx =
        diameter > 0 ? makeCellPitchEven(Math.round(footprint + overheadX), columnGap) : 0;
    const cellHeightPx = diameter > 0 ? Math.round(footprint + overheadY) : 0;

    return {
        cellWidthPx,
        cellHeightPx,
        ringDiameter: diameter,
        estimatedCols: best.cols,
        estimatedRows: best.rows,
        wrapMode,
        fontSize,
        columnGap,
    };
}

/**
 * The fewest columns that keep the row count `maxCols` forces, so the rows fill evenly:
 * 6 rings with room for 4 columns stand 3 + 3, not 4 + 2.
 * @param {number} count
 * @param {number} maxCols - The most columns that fit; at least 1.
 * @returns {{ cols: number, rows: number }}
 */
function balancedGrid(count, maxCols) {
    const rows = Math.ceil(count / maxCols);
    return { cols: Math.ceil(count / rows), rows };
}

/**
 * Constrain a value to a closed range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Keeps the cell pitch (cell width + gap) even, so the half-pitch offset that centres a partial
 * last row lands on a whole pixel: a `.5px` translate would blur that row's rings and text.
 * Costs at most 1px of ring.
 *
 * A fractional gap has no even pitch to reach and is left alone; the grid build rounds the
 * offset instead.
 * @param {number} cellWidth
 * @param {number} columnGap
 * @returns {number}
 */
function makeCellPitchEven(cellWidth, columnGap) {
    const pitch = cellWidth + columnGap;
    if (!Number.isInteger(pitch) || pitch % 2 === 0) return cellWidth;

    return Math.max(0, cellWidth - 1);
}
