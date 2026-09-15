/**
 * Locale-aware number formatting for the table download accessors.
 *
 * Tabulator runs one accessor (`accessorDownload`) for both CSV and JSON — the
 * accessor's `type` argument is `"download"` in either case, so it cannot tell
 * the two apart on its own. The two want different things: the CSV is
 * `;`-delimited with a BOM for German Excel, which reads `62.1` as text and
 * `62,1` as a number, while the JSON must stay numerically typed.
 *
 * Hence the module-scoped format flag below. It is safe because Tabulator's
 * `table.download()` is fully synchronous: it builds the export list, invokes
 * the downloader, and calls the intercept callback within the same call, with
 * no promise or timer in between. exportTableData() therefore sets the flag
 * immediately before the download and no other export can interleave.
 */

/** @type {'csv'|'json'} */
let currentFormat = 'csv';

/**
 * Declare which serialisation the next `table.download()` produces.
 *
 * Call immediately before the download — see the module comment for why this
 * module-scoped state is sound.
 * @param {'csv'|'json'} format - The format the download accessors should format for.
 */
export function setDownloadFormat(format) {
    currentFormat = format === 'json' ? 'json' : 'csv';
}

/**
 * Round a number for export, in the notation the current download format wants.
 * @param {any} value - The raw cell value; anything non-finite exports as an empty cell.
 * @param {number} [digits=1] - Decimal places to round to.
 * @returns {string|number} A comma-decimal string for CSV, a Number for JSON, `''` when there is no value.
 */
export function formatDownloadNumber(value, digits = 1) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (value == null || value === '' || !Number.isFinite(numeric)) return '';

    const rounded = Number(numeric.toFixed(digits));
    return currentFormat === 'csv' ? String(rounded).replace('.', ',') : rounded;
}
