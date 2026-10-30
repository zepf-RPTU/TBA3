/**
 * The category axis of the SL Kompetenzstufen charts, whose hand-drawn
 * Fach/Domäne/group labels hang from a baseline at the plot's foot, placed where a d3
 * bottom axis would put its ticks (`categoryLabelBaseline`).
 */

import {
    appendAxisBaseline,
    appendAxisGroup,
} from '../../../../../common/charts/chartAxisUtils.js';
import { AXIS_DEFAULTS } from '../../../../../common/charts/chartDefaults.js';

/**
 * The category axis group at the plot's foot with its baseline, drawn there last pass or
 * new; the hand-drawn labels go into it.
 * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g - The plot group.
 * @param {number} width - Plot width in px, the baseline's length.
 * @param {number} height - Plot height in px, where the axis sits.
 * @returns {import('d3').Selection<SVGGElement, unknown, any, any>} The axis group.
 */
export function appendCategoryAxis(g, width, height) {
    const group = appendAxisGroup(g, 'x-axis-custom', { baseline: true }).attr(
        'transform',
        `translate(0, ${height})`,
    );
    appendAxisBaseline(group, { x1: 0, x2: width });
    return group;
}

/**
 * Space below the plot for hand-drawn category labels: the tick padding, the labels'
 * block and the edge buffer that keeps them clear of the card's edge.
 * @param {number} blockHeight - Height of the label block in px (`measureLabelBlockHeight`).
 * @returns {number} Reserved height in px; `0` when there is nothing to label.
 */
export function categoryAxisReserve(blockHeight) {
    if (blockHeight <= 0) return 0;
    return Math.ceil(AXIS_DEFAULTS.tickPaddingPx + blockHeight + AXIS_DEFAULTS.edgeTickBufferPx);
}
