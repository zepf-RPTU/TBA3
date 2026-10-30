/**
 * What the CSV / JSON download sees of a table: the hidden export-only column
 * definitions.
 *
 * Tabulator builds download rows from raw field values (`row.getData("download")`,
 * then `column.getFieldValue(data)` per column) and never runs a cell formatter
 * for csv/json. A column whose cell is a bar, a box plot or a chip would export
 * empty (its `field` names no row property) or as a `JSON.stringify` dump (its
 * `field` holds an object). So the visual column opts out with `download: false`,
 * and one hidden, menu-excluded column per underlying number carries the value.
 */

/**
 * @typedef {object} DownloadColumnOptions
 * @property {string} [follows] - Field of the visual column this one belongs to. The export column is included only while that column is visible, so the CSV mirrors the table the user is looking at.
 * @property {(value: any, rowData: {[field: string]: any}) => any} [accessor] - `accessorDownload` for a value that must be derived from the row rather than read straight off the field.
 */

/**
 * A hidden, export-only column. A plain literal, not a `createColumnDef()` result: an
 * export column renders no cell, so it needs none of that factory's width, formatter
 * or glossary treatment.
 * @param {string} title - CSV header text (German; JSON keys stay the field name).
 * @param {string} field - Row property to export. May be synthetic when `accessor` supplies the value: Tabulator's accessor pass runs for absent fields too and creates the key on its row clone.
 * @param {DownloadColumnOptions} [options={}]
 * @returns {import('./columnFactories.js').TableColumnDefinition}
 */
export function createDownloadColumn(title, field, options = {}) {
    const { follows, accessor } = options;

    /** @type {import('./columnFactories.js').TableColumnDefinition} */
    const column = {
        title,
        field,
        visible: false,
        headerSort: false,
        // A function is called with the table as `this` and only wins when it
        // returns a strict boolean; a missing source column exports.
        download: follows
            ? /**
               * @this {import('tabulator-tables').Tabulator}
               * @returns {boolean} Whether the source column is shown.
               */
              function () {
                  const sourceColumn = this.getColumn(follows);
                  return sourceColumn ? sourceColumn.isVisible() : true;
              }
            : true,
        tableMeta: { excludeFromColumnVisibilityMenu: true, skipGlossaryAnnotation: true },
    };

    if (accessor) column.accessorDownload = accessor;
    return column;
}
