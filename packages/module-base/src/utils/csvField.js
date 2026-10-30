/**
 * CSV fields as a spreadsheet opens them safely: quoted per RFC 4180, and a text that a
 * spreadsheet would run as a formula turned into plain text.
 */

/** A number as a CSV writes it: plain digits, signed, with a comma or a point decimal. */
const NUMBER_TEXT = /^[+-]?\d+(?:[.,]\d+)?$/;
/** What makes Excel, LibreOffice and Sheets read a cell as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * A field value that no spreadsheet runs as a formula: a text starting with `=`, `+`,
 * `-`, `@`, a tab or a carriage return gets a leading `'`. A number stays a number,
 * also one already written as text (`-0,5`, `formatDownloadNumber`).
 * @template T
 * @param {T} value - The field's value, of any type.
 * @returns {T|string} The value, or the text with its `'`.
 */
export function csvSafeValue(value) {
    if (typeof value !== 'string' || NUMBER_TEXT.test(value)) return value;
    return FORMULA_START.test(value) ? `'${value}` : value;
}

/**
 * One CSV field, formula-safe (`csvSafeValue`), quoted where it holds the delimiter, a
 * quote or a line break, its quotes doubled (RFC 4180). Written here, not with d3's
 * `dsvFormat`: module-base carries no d3, and the chart host that writes its data tables
 * with it may not either (`chart-host-boundary`).
 * @param {string|number|null} value - The field; a CSV never gets `null` (`formatDownloadNumber`).
 * @returns {string}
 */
export function csvField(value) {
    const text = String(csvSafeValue(value));
    return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
