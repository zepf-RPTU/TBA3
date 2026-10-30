/**
 * How chart text finds its size: the CSS tokens chart text is sized by, and the probes
 * that turn them into pixels, once per token and root font size for the page.
 */

import { probeRootLengthPx, rootFontSizePx } from '@tba3/module-base';

const CHART_TEXT_SIZE_TOKENS = Object.freeze({
    sm: '--fs-sm',
    base: '--fs-base',
});

/**
 * The CSS value chart text of a size token is styled with.
 * @param {'sm'|'base'} [size='base']
 * @returns {string} A `var(--…)` reference.
 */
export function chartTextSizeCssValue(size = 'base') {
    return `var(${CHART_TEXT_SIZE_TOKENS[size]})`;
}

/**
 * A chart text token in px.
 * @param {'sm'|'base'} size
 * @param {number} [rootSizePx] - The root font size in force, when the caller holds it.
 * @returns {number}
 */
export function resolveChartTextSizePx(size, rootSizePx = rootFontSizePx()) {
    return probeRootLengthPx(chartTextSizeCssValue(size), rootSizePx);
}

/**
 * Size visible SVG text by a chart text token.
 * @template {import('d3').Selection<any, any, any, any>} S
 * @param {S} selection
 * @param {'sm'|'base'} [size='base']
 * @returns {S} The same selection, for chaining.
 */
export function applyChartTextSize(selection, size = 'base') {
    return selection.style('font-size', chartTextSizeCssValue(size));
}
