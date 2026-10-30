/**
 * Numbers and lists as the German UI writes them.
 *
 * Memoised `Intl.NumberFormat` instances (constructing one costs far more than
 * formatting with it) and the shapes built on them: a count, a percentage and a
 * difference between two percentages. Each prints `MISSING_VALUE` for a value the data
 * does not carry.
 */

/** What every formatter prints for a value the data does not carry. */
export const MISSING_VALUE = '–';

/**
 * @param {unknown} value - A value that may hold a number.
 * @returns {number|null} The value when it is a finite number, else `null`.
 */
export function finiteOrNull(value) {
    return isFiniteNumber(value) ? value : null;
}

/**
 * Whether a value is a finite number: `null`, `undefined` and `NaN` are not.
 * @param {unknown} value
 * @returns {value is number}
 */
export function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/** @type {Map<string, Intl.NumberFormat>} */
const formatters = new Map();

/**
 * The formatter for a locale and option set, created on first use and shared after.
 * @param {Intl.NumberFormatOptions} [options]
 * @param {string} [locale] - BCP 47 locale; the UI is German.
 * @returns {Intl.NumberFormat}
 */
export function getNumberFormat(options = {}, locale = 'de-DE') {
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = formatters.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, options);
        formatters.set(key, formatter);
    }
    return formatter;
}

/** @type {Map<string, Intl.ListFormat>} */
const listFormatters = new Map();

/**
 * The conjunction list formatter for a locale ("A, B und C"), created on first use.
 * @param {string} [locale] - BCP 47 locale; the UI is German.
 * @returns {Intl.ListFormat}
 */
export function getListFormat(locale = 'de-DE') {
    let formatter = listFormatters.get(locale);
    if (!formatter) {
        formatter = new Intl.ListFormat(locale, { type: 'conjunction' });
        listFormatters.set(locale, formatter);
    }
    return formatter;
}

/**
 * A plain number with a fixed count of fraction digits, German comma decimal.
 * @param {number|null|undefined} value - The number; a missing one prints `MISSING_VALUE`.
 * @param {number} [digits] - Fraction digits, fixed so a column of figures aligns.
 * @returns {string} The number, e.g. `3,45`.
 */
export function formatDecimal(value, digits = 2) {
    if (!isFiniteNumber(value)) return MISSING_VALUE;
    return getNumberFormat({
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

/**
 * A count: a whole number with German digit grouping (`1.234`).
 * @param {number|null|undefined} value - The count; a missing one prints `MISSING_VALUE`.
 * @returns {string}
 */
export function formatCount(value) {
    if (!isFiniteNumber(value)) return MISSING_VALUE;
    return getNumberFormat({ maximumFractionDigits: 0 }).format(value);
}

/**
 * A count out of a total, `12 von 20`.
 * @param {number|null|undefined} count
 * @param {number|null|undefined} total
 * @returns {string}
 */
export function formatCountOf(count, total) {
    return `${formatCount(count)} von ${formatCount(total)}`;
}

/**
 * A percentage, German: comma decimal, and the no-break space before the sign that
 * `Intl` puts there.
 *
 * Takes the number as shown (`62.1` becomes `62,1 %`); a share between 0 and 1 goes
 * through `formatShare`. Returns plain text, not markup: the same string has to work in
 * an SVG text node, an `aria-label` and a CSV.
 * @param {number|null|undefined} value - The percentage, 0–100; a missing one (`null` is a share of nobody, see `percentOf`) prints `MISSING_VALUE`.
 * @param {number} [digits] - Fraction digits, fixed so a column of figures aligns.
 * @returns {string} The percentage, e.g. `62,1 %`.
 */
export function formatPercent(value, digits = 1) {
    if (!isFiniteNumber(value)) return MISSING_VALUE;
    return getNumberFormat({
        style: 'percent',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value / 100);
}

/**
 * A percentage from a share between 0 and 1.
 * @param {number|null|undefined} share - The share, 0–1; a missing one prints `MISSING_VALUE`.
 * @param {number} [digits]
 * @returns {string} The percentage, e.g. `62,1 %`.
 */
export function formatShare(share, digits = 1) {
    return formatPercent(isFiniteNumber(share) ? share * 100 : null, digits);
}

/**
 * A difference between two percentages: percentage points, never `%` (`+3 %` reads as
 * "three percent more than before", a different number). Always signed.
 * @param {number|null|undefined} deltaPP - The difference in percentage points; a missing one prints `MISSING_VALUE`.
 * @param {number} [digits]
 * @returns {string} The signed difference, e.g. `+3,7 PP`.
 */
export function formatPercentPoints(deltaPP, digits = 1) {
    if (!isFiniteNumber(deltaPP)) return MISSING_VALUE;
    const formatted = getNumberFormat({
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        signDisplay: 'exceptZero',
    }).format(deltaPP);
    return `${formatted}\u00a0PP`;
}
