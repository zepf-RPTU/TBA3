/**
 * What the CSV / JSON download sees of a table: the hidden export-only column
 * definitions, and the row fragments the EN and MA exports assemble their rows from.
 *
 * Export-only columns.
 *
 * Tabulator builds download rows from raw field values — `row.getData("download")`
 * then `column.getFieldValue(data)` per column — and never runs a cell formatter
 * for csv/json. A column whose cell is a bar, a box plot or a chip therefore
 * exports empty (its `field` names no row property) or as a `JSON.stringify`
 * dump (its `field` holds an object).
 *
 * The remedy here: the visual column opts out with `download: false`, and one
 * hidden, menu-excluded column per underlying number carries the value instead.
 * A distribution shown as one bar thus exports as separate numeric columns.
 */

import { formatDownloadNumber } from './downloadNumberFormat.js';
import { LABELS } from './tableLabels.js';

/**
 * @typedef {object} DownloadColumnOptions
 * @property {string} [follows] - Field of the visual column this one belongs to. The export column is included only while that column is visible, so the CSV mirrors the table the user is looking at.
 * @property {Function} [accessor] - `accessorDownload` for a value that must be derived from the row rather than read straight off the field.
 */

/**
 * Builds a hidden, export-only column.
 *
 * Returned as a plain literal rather than through createColumnDef(): an export
 * column renders no cell, so it needs none of the width, formatter or glossary
 * treatment that factory applies.
 * @param {string} title - CSV header text (German; JSON keys stay the field name).
 * @param {string} field - Row property to export. May be synthetic when `accessor` supplies the value — Tabulator's accessor pass runs for absent fields too and creates the key on its row clone.
 * @param {DownloadColumnOptions} [options={}] - Visibility coupling and value derivation.
 * @returns {object} Tabulator column definition, hidden on screen and present in the download.
 */
export function createDownloadColumn(title, field, options = {}) {
    const { follows, accessor } = options;

    const column = {
        title,
        field,
        visible: false,
        headerSort: false,
        // A function is called with the table as `this` and only wins when it
        // returns a strict boolean, so a missing source column falls back to
        // exporting rather than silently dropping the value.
        download: follows
            ? function () {
                  const sourceColumn = this.getColumn(follows);
                  return sourceColumn ? sourceColumn.isVisible() : true;
              }
            : true,
        tableMeta: { excludeFromColumnVisibilityMenu: true, skipGlossaryAnnotation: true },
    };

    if (accessor) column.accessorDownload = accessor;
    return column;
}

/**
 * The six export columns behind one progress-bar column: the three counts and
 * the three percentages the bar is drawn from.
 *
 * Field names follow the same prefix convention createProgressBarColumn() uses
 * to derive its formatter fields, so both read the same row properties.
 * @param {object} options - Configuration.
 * @param {string} options.follows - Field of the progress-bar column these belong to.
 * @param {string} [options.fieldPrefix=''] - Domain prefix, e.g. `'d0'` → `d0CorrectCount`.
 * @param {string} [options.titlePrefix=''] - Prepended to every header, e.g. `'Hören – '`.
 * @returns {Array<object>} The six column definitions, counts first.
 */
export function createDistributionDownloadColumns({ follows, fieldPrefix = '', titlePrefix = '' }) {
    // [label, unprefixed field, prefixed field suffix] — the prefixed forms are
    // exactly the ones createProgressBarColumn() derives for the same prefix.
    const counts = [
        [LABELS.RICHTIG, 'correctCount', 'CorrectCount'],
        [LABELS.FALSCH, 'incorrectCount', 'IncorrectCount'],
        [LABELS.UNBEARBEITET, 'notAttemptedCount', 'NotAttemptedCount'],
    ];
    const percentages = [
        [LABELS.RICHTIG, 'percentageCorrect', 'PercentageCorrect'],
        [LABELS.FALSCH, 'percentageIncorrect', 'PercentageIncorrect'],
        [LABELS.UNBEARBEITET, 'percentageNotAttempted', 'PercentageNotAttempted'],
    ];

    const field = (plain, suffix) => (fieldPrefix ? `${fieldPrefix}${suffix}` : plain);

    return [
        ...counts.map(([label, plain, suffix]) =>
            createDownloadColumn(`${titlePrefix}${label} (Anzahl)`, field(plain, suffix), {
                follows,
            }),
        ),
        ...percentages.map(([label, plain, suffix]) =>
            createDownloadColumn(`${titlePrefix}${label} (%)`, field(plain, suffix), {
                follows,
                // The row stores the full float (e.g. 62.06896551724138).
                accessor: (value) => formatDownloadNumber(value, 1),
            }),
        ),
    ];
}
