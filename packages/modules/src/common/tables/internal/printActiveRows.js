/**
 * The print table's call past Tabulator's public API (the other is the column floor in
 * `tableHeaderGeometry.js`), kept apart from the Tabulator build so the tests that swap
 * that build for a fake still reach it.
 */

/**
 * Open or fold the row groups with these keys, as one refresh. Tabulator builds new
 * groups on every refresh, so the components are read anew on each call.
 * @param {import('tabulator-tables').Tabulator} table - A built table.
 * @param {unknown[]} keys - The groups' keys; none changes nothing.
 * @param {boolean} open
 */
function setRowGroupsOpen(table, keys, open) {
    if (keys.length === 0) return;
    table.blockRedraw();
    try {
        for (const group of table.getGroups()) {
            if (!keys.includes(group.getKey())) continue;
            if (open) group.show();
            else group.hide();
        }
    } finally {
        table.restoreRedraw();
    }
}

/**
 * The table of the active rows (filtered and sorted as on screen) as the element
 * `getHtml()` would serialize, before it is serialized: Tabulator copies the live table's
 * look onto it through CSSOM, which the CSP allows, while the same look as `style`
 * attributes in an HTML string is blocked. This calls the private
 * `ExportModule.generateTable`, as Tabulator's own Print module does, so it is a call to
 * check on a Tabulator upgrade; the e2e export tests are what catch a change.
 *
 * Its `'active'` range is Tabulator's display list, which holds only the header of a
 * collapsed row group: the collapsed groups open for the print and fold again after it,
 * in the same task, so the printed table carries their rows and the screen never shows
 * them.
 * @param {import('tabulator-tables').Tabulator} table - A built table.
 * @returns {HTMLTableElement}
 */
export function printActiveRows(table) {
    const folded = table
        .getGroups()
        .filter((group) => !group.isVisible())
        .map((group) => group.getKey());
    setRowGroupsOpen(table, folded, true);
    try {
        return table.modules.export.generateTable(
            table.options.htmlOutputConfig,
            true,
            'active',
            'htmlOutput',
        );
    } finally {
        setRowGroupsOpen(table, folded, false);
    }
}
