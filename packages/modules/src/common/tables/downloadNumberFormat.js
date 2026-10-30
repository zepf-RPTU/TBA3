/**
 * Locale-aware number formatting for CSV and JSON downloads.
 */

/**
 * The format the download accessors write for. Tabulator runs one accessor
 * (`accessorDownload`) for CSV and JSON alike, its `type` argument `"download"` in
 * either case, and the two want different numbers: the `;`-delimited CSV with a BOM is
 * for German Excel, which reads `62.1` as text and `62,1` as a number, while the JSON
 * must stay numerically typed. Module-scoped is safe because `table.download()` is
 * synchronous (export list, downloader and intercept callback within the same call), so
 * no other export can interleave between `setDownloadFormat` and the accessors.
 * @type {'csv'|'json'}
 */
let currentFormat = 'csv';

/**
 * Declare which serialisation the next `table.download()` produces; call immediately
 * before the download.
 * @param {'csv'|'json'} format
 */
export function setDownloadFormat(format) {
    currentFormat = format === 'json' ? 'json' : 'csv';
}

/**
 * Round a number for export, in the notation the format wants: the table downloads read
 * it from the flag, a chart's data table names it.
 * @param {unknown} value - The raw cell value; anything non-finite is no value.
 * @param {number} [digits=1]
 * @param {'csv'|'json'} [format]
 * @returns {string|number|null} A comma-decimal string for CSV, a Number for JSON. No value is
 *     an empty CSV cell and a JSON `null`, so a JSON field holds one type.
 */
export function formatDownloadNumber(value, digits = 1, format = currentFormat) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (value == null || value === '' || !Number.isFinite(numeric)) {
        return format === 'json' ? null : '';
    }

    const rounded = Number(numeric.toFixed(digits));
    return format === 'csv' ? String(rounded).replace('.', ',') : rounded;
}
