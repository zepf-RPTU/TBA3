/**
 * The item-ring grid's layout: the metrics read off the container, the title lines each
 * ring reserves, and where a partial last row sits. The ring definitions come from
 * `maItemRings.js`; how many rings fit at what size is solved in `itemRingFlexLayout.js`.
 */

import { getItemRingTitleWrapWidth, titleFitsOneLine } from './itemRingTitleMetrics.js';
import { splitLabelLines } from '../../../../common/charts/chartLabelFit.js';
import { probeCssLengthPx } from '@tba3/module-base';
import { fontFamilyToken } from '../../../../common/utils/fontTokens.js';
import { calculateFlexLayout } from './itemRingFlexLayout.js';

/** @typedef {import('../../../utils/maItemRings.js').ItemRingChartDefinition} ItemRingChartDefinition */

/** @typedef {import('./itemRingFlexLayout.js').ItemRingGridLayout} ItemRingGridLayout */

/**
 * How the grid's titles are laid out at the solved ring size.
 * @typedef {object} ItemRingTitleLayout
 * @property {1|2} titleLineCount - How many title lines every cell reserves.
 * @property {Array<ItemRingChartDefinition & {titleLines: string[]}>} charts - Each ring definition with its title already broken into lines.
 */

const GRID_CONFIG = {
    GRID_GAP_FALLBACK_PX: 8, // --layout-gap
    DEFAULT_CELL_PADDING_PX: 12, // --chart-container-padding
};

/**
 * Everything the layout needs from the live container, in a single computed-style read — this
 * runs on every debounced resize, and each getComputedStyle call can force a style recalc.
 * Every style and box value is read before the padding probe, whose DOM write would
 * otherwise force a second recalc.
 *
 * The box is measured with clientWidth/clientHeight (the padding box), not
 * getBoundingClientRect (the border box): the grid scrolls in wrap mode, and the border box
 * includes the scrollbar. Gaps and the ring padding are read from CSS, so the arithmetic here
 * and the space the rings get cannot drift apart.
 * @param {HTMLElement} element - The grid container.
 * @returns {{ width: number, height: number, columnGap: number, rowGap: number, cellPadding: number, fontFamily: string }} `width`/`height`: the content box the rings may use.
 */
function readGridMetrics(element) {
    const { GRID_GAP_FALLBACK_PX, DEFAULT_CELL_PADDING_PX } = GRID_CONFIG;
    const computedStyle = getComputedStyle(element);
    const px = (/** @type {string} */ value) => parseFloat(value) || 0;
    const baseGap = parseFloat(computedStyle.gap) || GRID_GAP_FALLBACK_PX;
    // Clamped at 0: a collapsed box solves to no ring at all.
    const metrics = {
        width: Math.max(
            0,
            element.clientWidth - px(computedStyle.paddingLeft) - px(computedStyle.paddingRight),
        ),
        height: Math.max(
            0,
            element.clientHeight - px(computedStyle.paddingTop) - px(computedStyle.paddingBottom),
        ),
        columnGap: parseFloat(computedStyle.columnGap) || baseGap,
        rowGap: parseFloat(computedStyle.rowGap) || baseGap,
        fontFamily: computedStyle.fontFamily || fontFamilyToken(),
    };
    const cellPadding = probeCssLengthPx(
        element,
        `var(--chart-container-padding, ${DEFAULT_CELL_PADDING_PX}px)`,
    );
    return {
        ...metrics,
        cellPadding: Number.isFinite(cellPadding) ? cellPadding : DEFAULT_CELL_PADDING_PX,
    };
}

/**
 * Where a partial last row goes (5 rings in 3 columns, 7 in 4, ...), so it sits centred
 * under the full rows instead of left-aligned with a hole on the right.
 *
 * Integer grid tracks cannot express the half-cell offset an odd shortfall needs, so the
 * row is then also nudged half a cell pitch right with a transform. That is safe here:
 * hit-testing follows CSS transforms, and the selection outline and the "Gesamt"
 * tint are painted in the transformed coordinate system, so they travel with the cell.
 * @param {number} count
 * @param {number} cols
 * @returns {{firstIndex: number, columnStart: number, halfCellShift: boolean}|null} The last row's first ring (0-based), the column it starts in, and whether the row moves half a cell right; `null` when the last row is full.
 */
export function lastRowPlacement(count, cols) {
    if (count <= 0 || cols <= 0) return null;
    const rows = Math.ceil(count / cols);
    const deficit = cols * rows - count;
    if (deficit === 0) return null;

    return {
        firstIndex: cols * (rows - 1),
        columnStart: Math.floor(deficit / 2) + 1,
        halfCellShift: deficit % 2 === 1,
    };
}

/**
 * Decide how many lines the grid's titles need, at the size the rings will actually draw
 * them: one when every title fits, else two, with each title that does not fit broken
 * where its longer line is shortest (`splitLabelLines`).
 * @param {ItemRingChartDefinition[]} chartDefs
 * @param {number} ringDiameter - The title is drawn inside the ring's SVG, which is the ring
 *   diameter wide — not the cell, which is wider by the container padding.
 * @param {number} fontSize - The rings render their titles at the ring-derived size, not the
 *   container's token size, so the grid must wrap them at that size too.
 * @param {string} fontFamily - The container's resolved font stack, so measuring matches rendering.
 * @returns {ItemRingTitleLayout}
 */
function resolveItemRingGridTitleLayout(chartDefs, ringDiameter, fontSize, fontFamily) {
    const fits = titleFitsOneLine(getItemRingTitleWrapWidth(ringDiameter), {
        fontFamily,
        fontSize,
    });
    const fitting = chartDefs.map((chartDef) => fits(chartDef.title));
    return {
        titleLineCount: fitting.every(Boolean) ? 1 : 2,
        charts: chartDefs.map((chartDef, i) => ({
            ...chartDef,
            titleLines: fitting[i] ? [chartDef.title] : splitLabelLines(chartDef.title),
        })),
    };
}

/**
 * Solve the grid and the title band together.
 *
 * The two are coupled: the cells reserve height for the title, but how many lines a title needs
 * depends on how wide the ring turned out. So solve for two lines first, and re-solve when
 * every title fits on one: short ring titles get that line of height back as ring.
 * @param {ItemRingChartDefinition[]} chartDefs
 * @param {HTMLElement} container - The grid element, measured for its box, gaps and font.
 * @returns {{layout: ItemRingGridLayout, titleLayout: ItemRingTitleLayout}} The cell geometry and the title layout it was solved against.
 */
export function resolveItemRingGrid(chartDefs, container) {
    const { width, height, columnGap, rowGap, cellPadding, fontFamily } =
        readGridMetrics(container);

    const solve = (/** @type {1|2} */ titleLineCount) =>
        calculateFlexLayout(width, height, columnGap, rowGap, chartDefs.length, {
            cellPadding,
            titleLineCount,
        });
    const titlesFor = (/** @type {ItemRingGridLayout} */ layout) =>
        resolveItemRingGridTitleLayout(chartDefs, layout.ringDiameter, layout.fontSize, fontFamily);

    let layout = solve(2);
    let titleLayout = titlesFor(layout);

    if (titleLayout.titleLineCount === 1) {
        layout = solve(1);
        titleLayout = titlesFor(layout);
    }

    return { layout, titleLayout };
}
