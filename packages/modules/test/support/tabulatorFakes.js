/**
 * Stand-ins for the slice of Tabulator's cell/row API that column builders and
 * cell formatters call (`cell.getValue()`, `cell.getRow().getData()`). The fake table
 * is `FakeTabulator` in tableHarness.js.
 */

/** @typedef {import('../../src/common/tables/columnFactories.js').TableColumnDefinition} TableColumnDefinition */

/**
 * Build a fake Tabulator cell.
 * @param {unknown} value Whatever `cell.getValue()` should return.
 * @param {object} [rowData] Whatever `cell.getRow().getData()` should return.
 * @returns {import('tabulator-tables').CellComponent}
 */
export function createFakeCell(value, rowData = {}) {
    const cell = { getValue: () => value, getRow: () => createFakeRow(rowData) };
    // Formatters and builders read only these two members of a cell.
    return /** @type {import('tabulator-tables').CellComponent} */ (/** @type {unknown} */ (cell));
}

/**
 * Build a fake Tabulator row.
 * @param {object} rowData Whatever `row.getData()` should return.
 * @returns {import('tabulator-tables').RowComponent}
 */
export function createFakeRow(rowData) {
    // Builders read only a row's data.
    return /** @type {import('tabulator-tables').RowComponent} */ (
        /** @type {unknown} */ ({ getData: () => rowData })
    );
}

/**
 * A column option a builder sets as a function, asserted to be one: the column types
 * also allow the string names of Tabulator's built-ins, which a suite calling the
 * option cannot call.
 * @template {TableColumnDefinition | import('tabulator-tables').ColumnDefinition} C
 * @template {'formatter' | 'titleFormatter' | 'sorter' | 'accessorDownload' | 'cellClick'} K
 * @param {C | undefined} column - The column definition, as built or as processed for Tabulator.
 * @param {K} key
 * @returns {Extract<NonNullable<C[K]>, Function>}
 * @throws {Error} when the column is missing or the option is not a function
 */
export function columnFunction(column, key) {
    const option = column?.[key];
    if (typeof option !== 'function') throw new Error(`Expected the column's ${key} function`);
    // The `typeof` check narrows, but TypeScript cannot carry it through the indexed type.
    return /** @type {Extract<NonNullable<C[K]>, Function>} */ (option);
}
