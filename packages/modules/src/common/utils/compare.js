/**
 * The comparators German lists sort with: text by German collation (digits by value),
 * numbers with a missing one lowest, and texts in a given order.
 */

/** One shared collator: `localeCompare` with options builds a new one on every call. */
const COLLATOR = new Intl.Collator('de', { numeric: true });

/**
 * German collation, digits by value (`2` before `10`).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareText(a, b) {
    return COLLATOR.compare(a, b);
}

/**
 * Numbers ascending, a missing one below every present one; two missing ones tie
 * (subtracting `-Infinity` from itself would give `NaN`, an unspecified order).
 * @param {number|null|undefined} a
 * @param {number|null|undefined} b
 * @returns {number}
 */
export function compareNumbers(a, b) {
    if (a == null || b == null) return (a == null ? 0 : 1) - (b == null ? 0 : 1);
    return a - b;
}

/**
 * @param {ReadonlyArray<string>} order - The texts, in the order they should appear.
 * @returns {(a: string, b: string) => number} A comparator ranking by position in `order`; texts it does not list follow, alphabetically.
 */
export function orderComparator(order) {
    const ranks = new Map(order.map((text, index) => [text, index]));
    const rank = (/** @type {string} */ text) => ranks.get(text) ?? order.length;
    return (a, b) => rank(a) - rank(b) || compareText(a, b);
}
