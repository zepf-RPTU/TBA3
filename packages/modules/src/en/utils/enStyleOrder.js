/**
 * The order of Hör-/Lesestile: the style categories as the dataset registers them, an
 * unregistered style after all of them. And the key one domain's style goes by.
 */

import { orderComparator } from '../../common/utils/compare.js';

/**
 * The key a domain's style value goes by, wherever the style charts' values are
 * produced (the aggregation adapter, the student and selection averages) and read
 * (the spider's spokes, the lollipop's rows).
 * @param {string} domainId
 * @param {string} style
 * @returns {string} The key, `${domainId}_${style}`.
 */
export function styleCategoryKey(domainId, style) {
    return `${domainId}_${style}`;
}

/**
 * @param {Array<{value: string}>} styleCategories - Style categories in priority order.
 * @returns {(a: string, b: string) => number} A comparator putting styles in that order; an unregistered style sorts after all of them.
 */
export function styleComparator(styleCategories) {
    return orderComparator(styleOrder(styleCategories));
}

/**
 * @param {Array<{value: string}>} styleCategories - Style categories in priority order.
 * @returns {string[]} Their style values, in that order.
 */
export function styleOrder(styleCategories) {
    return styleCategories.map((category) => category.value);
}
