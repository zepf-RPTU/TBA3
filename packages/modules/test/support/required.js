/**
 * Assert-and-narrow for tests: a node, record or row a test just made or queried is
 * there, or the test fails here, naming what was missing, instead of on the next
 * property access.
 */

/**
 * The value, asserted present.
 * @template T
 * @param {T} value
 * @param {string} [what] - What it is, for the failure message.
 * @returns {NonNullable<T>}
 * @throws {Error} when the value is null or undefined
 */
export function required(value, what = 'value') {
    if (value === null || value === undefined) throw new Error(`Expected ${what} to be present`);
    return value;
}
