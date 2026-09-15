/**
 * Memoised `Intl.NumberFormat` instances for the German UI. Constructing one is far more
 * expensive than formatting with it, and several formatters used to be built per call.
 */

/** @type {Map<string, Intl.NumberFormat>} */
const formatters = new Map();

/**
 * The formatter for a locale and option set, created on first use and shared after.
 * @param {Intl.NumberFormatOptions} [options] - `Intl.NumberFormat` options.
 * @param {string} [locale] - BCP 47 locale; the UI is German.
 * @returns {Intl.NumberFormat} The shared formatter.
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
