/**
 * A chart's numbers as a table: shown in place of the plot ("Als Tabelle") and written
 * as CSV or JSON. A cell is shown one way and exported another, as a Tabulator column
 * has a formatter and a download accessor: a share shows as `15,4 % (4)` and exports
 * as its percentage and its count, each a number of its own.
 */

import { csvField } from '@tba3/module-base';
import { html, nothing } from 'lit';
import { formatDownloadNumber } from '../../tables/downloadNumberFormat.js';
import './chartDataTable.css';

/**
 * @typedef {object} ChartDataColumn
 * @property {string} label - The header.
 * @property {string[]} [fields] - The export headers, one per value of its cells; `[label]`
 *   by default.
 * @property {number} [digits] - Decimal places its values export with; 1 by default.
 */

/**
 * One cell: as shown, and its values for the export, one per field of its column; by
 * default the shown text. A number exports in the notation of the format; `null` as
 * an empty field.
 * @typedef {{text: string, values?: Array<number|null>}} ChartDataCell
 */

/**
 * What a chart draws, as rows of cells; the first cell of a row heads it, the others
 * are figures. A chart that draws two kinds of figures gives one
 * table per kind, each with a `title`.
 * @typedef {{title?: string, columns: ChartDataColumn[], rows: ChartDataCell[][]}} ChartDataTable
 */

/**
 * What a chart's `dataTable()` returns: one table, several (a falsy entry is a table not
 * drawn now, so `[bars, quality && qualityTable]` reads as it is meant), or none.
 * @typedef {ChartDataTable | Array<ChartDataTable | false | null> | null} ChartDataTables
 */

/**
 * The tables as an array, empty for none.
 * @param {ChartDataTables | undefined} tables - What a `dataTable()` returned.
 * @returns {ChartDataTable[]}
 */
export function toDataTableList(tables) {
    return [tables ?? []].flat().filter((table) => !!table);
}

/**
 * The tables shown in place of the plot. A caption names each for a screen reader; the
 * card title above them does for the eye. Several tables each get a heading too. A
 * column whose cells export no numbers (an Aufgabe, a GER level) is text, aligned as
 * text; the figures are centred, as in the Tabulator tables.
 * @param {ChartDataTable[]} tables
 * @param {string} caption - The card title.
 * @returns {unknown}
 */
export function dataTableTemplate(tables, caption) {
    const titled = tables.length > 1;
    return tables.map((table) => {
        const textColumns = table.columns.map(
            (_, i) => i > 0 && !table.rows.some((row) => row[i]?.values),
        );
        const textClass = (/** @type {number} */ i) =>
            textColumns[i] ? 'chart-data-table-text' : nothing;
        return html`${
                titled && table.title
                    ? html`<h3 class="chart-data-table-title">${table.title}</h3>`
                    : nothing
            }
            <table class="chart-data-table">
                <caption class="visually-hidden">
                    ${table.title ? `${caption} – ${table.title}` : caption}
                </caption>
                <thead>
                    <tr>
                        ${table.columns.map(
                            (column, i) =>
                                html`<th scope="col" class=${textClass(i)}>${column.label}</th>`,
                        )}
                    </tr>
                </thead>
                <tbody>
                    ${table.rows.map(
                        ([head, ...cells]) =>
                            html`<tr>
                                <th scope="row">${head.text}</th>
                                ${cells.map(
                                    (cell, i) =>
                                        html`<td class=${textClass(i + 1)}>${cell.text}</td>`,
                                )}
                            </tr>`,
                    )}
                </tbody>
            </table>`;
    });
}

/**
 * The table as CSV (`;`-delimited, comma decimals, for German Excel, as the table
 * downloads write it) or as JSON (one object per row, keyed by the field headers,
 * numbers typed, a missing one `null`).
 * @param {ChartDataTable} table
 * @param {'csv'|'json'} format
 * @returns {string}
 */
export function dataTableText(table, format) {
    const fields = table.columns.flatMap((column) => column.fields ?? [column.label]);
    const records = table.rows.map((row) =>
        row.flatMap(
            (cell, i) =>
                cell.values?.map((value) =>
                    formatDownloadNumber(value, table.columns[i]?.digits ?? 1, format),
                ) ?? [cell.text],
        ),
    );
    if (format === 'csv') {
        return [fields, ...records].map((record) => record.map(csvField).join(';')).join('\n');
    }
    return JSON.stringify(
        records.map((record) => Object.fromEntries(fields.map((field, i) => [field, record[i]]))),
        null,
        '\t',
    );
}
