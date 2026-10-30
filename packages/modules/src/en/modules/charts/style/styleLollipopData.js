/**
 * The style lollipop's rows: one per style and drawn domain, each with the values its
 * marks draw — group value, student value and one value per comparison group. Pure
 * functions over plain inputs; the renderer turns rows into pixels.
 */

import { finiteOrNull } from '../../../../common/utils/numberFormat.js';
import { styleCategoryKey } from '../../../utils/enStyleOrder.js';

/** @typedef {import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup} StyleComparisonGroup */

/** @typedef {import('./styleDomainStyles.js').DomainStyle} DomainStyle */

/**
 * One drawn lollipop: a (style × domain) bar.
 * @typedef {object} StyleLollipopRow
 * @property {string} key - Join key and value key: `${domain}_${style}`.
 * @property {string} styleLabel - The style's label, the outer band the row sits in.
 * @property {string} domainKey - The domain id, the inner band.
 * @property {string} domainLabel - The domain's display name.
 * @property {string} color - Stem and pill colour.
 * @property {number|null} value - The group value; `null` draws no stem.
 * @property {number|null} studentValue - The selected student's value; `null` draws no pill.
 * @property {{[groupId: string]: number|null}} comparisons - Value per comparison group; `null` draws no marker.
 */

/**
 * The drawn rows: one per style and domain, each with the values its marks draw.
 * @param {object} input
 * @param {Array<{value: string, label: string}>} input.styleCategories
 * @param {string[]} input.domainIds - The domains drawn, in display order.
 * @param {{[domainId: string]: DomainStyle}} input.domainStyles
 * @param {{[key: string]: number|null}} input.groupAverages - Keyed by `${domain}_${style}`.
 * @param {{[key: string]: number|null}|null} input.studentValues - `null` without a selected student.
 * @param {StyleComparisonGroup[]} input.comparisonGroups
 * @returns {StyleLollipopRow[]} In draw order.
 */
export function buildRows({
    styleCategories,
    domainIds,
    domainStyles,
    groupAverages,
    studentValues,
    comparisonGroups,
}) {
    return styleCategories.flatMap((category) =>
        domainIds.map((domainKey) => {
            const key = styleCategoryKey(domainKey, category.value);
            return {
                key,
                styleLabel: category.label,
                domainKey,
                domainLabel: domainStyles[domainKey].label,
                color: domainStyles[domainKey].color,
                value: finiteOrNull(groupAverages[key]),
                studentValue: finiteOrNull(studentValues?.[key]),
                comparisons: Object.fromEntries(
                    comparisonGroups.map((group) => [group.id, finiteOrNull(group.averages[key])]),
                ),
            };
        }),
    );
}
