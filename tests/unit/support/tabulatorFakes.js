/**
 * Stand-ins for the slice of Tabulator's cell/row API that column builders and
 * cell formatters call.
 *
 * These live here because they encode an *assumption about a third-party API*
 * (`cell.getValue()`, `cell.getRow().getData()`), not merely because the literal
 * was repeated. If that assumption is ever wrong it is wrong everywhere, and it
 * should be corrected in one place.
 *
 * Deliberately no fake *table* here. The global-constructor fake that suites
 * driving the real createTable() mocked in for `tabulatorBuild.js` lives in
 * tableHarness.js. The other two suites that need a table (tableFilterController,
 * tablePresetManager) want mutually incompatible things — a stateful filter
 * simulator and a vi.fn() spy record — so those stay local on purpose.
 */

/**
 * Build a fake Tabulator cell.
 *
 * @param {*} value Whatever `cell.getValue()` should return.
 * @param {object} [rowData] Whatever `cell.getRow().getData()` should return.
 * @returns {{ getValue: () => *, getRow: () => { getData: () => object } }}
 */
export function createFakeCell(value, rowData = {}) {
    return { getValue: () => value, getRow: () => ({ getData: () => rowData }) };
}

/**
 * Build a fake Tabulator row.
 *
 * @param {object} rowData Whatever `row.getData()` should return.
 * @returns {{ getData: () => object }}
 */
export function createFakeRow(rowData) {
    return { getData: () => rowData };
}
