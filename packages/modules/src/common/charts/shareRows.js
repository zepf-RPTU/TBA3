/**
 * The tooltip rows every "category of a whole" mark shows (a Kompetenzstufe of a group,
 * an answer of a rating, a group of a pyramid): which category, its share, and how many
 * of how many.
 */

import { TERM_CONSTANTS } from '../domain/terms.js';
import { formatCountOf, formatPercent } from '../utils/numberFormat.js';

/**
 * The category / share / headcount rows of one segment.
 * @param {object} segment - What the mark stands for.
 * @param {string} segment.label - What the category is, e.g. `TERM_CONSTANTS.COMP_LEVEL`.
 * @param {string} segment.value - Which category, e.g. `II`.
 * @param {number|null} segment.share - Its share of the whole, in percent.
 * @param {number|null} [segment.count] - Students in it; no count row without one.
 * @param {number|null} [segment.total] - Students in the whole; no count row when it is not positive.
 * @returns {Array<import('../services/cursorTooltip.js').TooltipRow|false>} A left-out count row as `false`.
 */
export function shareRows({ label, value, share, count = null, total = null }) {
    return [
        { label, value },
        { label: TERM_CONSTANTS.SHARE, value: formatPercent(share) },
        count != null &&
            total != null &&
            total > 0 && {
                label: TERM_CONSTANTS.STUDENT_COUNT,
                value: formatCountOf(count, total),
            },
    ];
}
