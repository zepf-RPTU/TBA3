/**
 * What the material pages print beyond the shared number formats: a toned
 * percentage-point delta, min–max ranges and the headcount/female-share summary, with a
 * missing value as the dashboard's dash.
 */

import {
    MISSING_VALUE,
    formatCount,
    formatPercentPoints,
    formatShare,
    isFiniteNumber,
} from '../../../common/utils/numberFormat.js';
import { toPercent } from '../../../common/domain/itemResultCounts.js';

export const EPSILON = 1e-9;

/**
 * Format a difference between two shares as percentage points, signed and tone-coded.
 * @param {unknown} value - The difference, as a fraction.
 * @returns {string} The formatted delta in a toned span, or the dash when there is no figure.
 */
export function formatPercentPointDelta(value) {
    if (!isFiniteNumber(value)) {
        return MISSING_VALUE;
    }

    const formatted = formatPercentPoints(toPercent(value), 1);
    // The tone follows the printed sign, so a delta that rounds to 0,0 stays neutral.
    const tone = formatted.startsWith('+')
        ? ' material-delta--positive'
        : formatted.startsWith('-')
          ? ' material-delta--negative'
          : '';

    return `<span class="material-delta${tone}">${formatted}</span>`;
}

/**
 * Headcount, with the female share appended when the payload carries one.
 * @param {number} count
 * @param {number|null} femaleShare - Female share as a fraction, if known.
 * @returns {string}
 */
export function formatStudentSummary(count, femaleShare) {
    return isFiniteNumber(femaleShare)
        ? `${formatCount(count)} (${formatShare(femaleShare)} weibl.)`
        : formatCount(count);
}

/**
 * Format a min–max range with the figure's own format.
 * @param {{min: number, max: number}|null} range
 * @param {(value: number) => string} format - How one end prints.
 * @returns {string} `min–max`, or the dash without a range.
 */
export function formatRange(range, format) {
    return range ? `${format(range.min)}–${format(range.max)}` : MISSING_VALUE;
}
