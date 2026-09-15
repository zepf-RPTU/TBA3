/**
 * `@tba3/modules/tables` — the Tabulator layer: the module that owns a table's lifecycle,
 * the four VERA table bases, and the column factories and formatters they are built from.
 *
 * Import `Tabulator` from here rather than from `tabulator-tables`: this build is the one
 * with the optional modules registered, and a table created against the bare class
 * silently loses sorting, filtering and download.
 *
 * **Needs tabulator-tables** — an optional peer dependency, and the CSS stack in
 * `@tba3/modules/styles/` (`table-base`, `table-header-layout`, `table-host`) on top of
 * Tabulator's own sheet.
 */

export { TableModule } from './tableModule.js';
export { setDownloadFormat } from './downloadNumberFormat.js';
export { Tabulator } from './tabulatorBuild.js';
export { withTableModeState } from './withTableModeState.js';

export { BaseClassTableModule, CLASS_TABLE_DEFAULT_SORT } from './baseClassTableModule.js';
export { BaseItemTableModule, createItemTablePresets } from './baseItemTableModule.js';
export { BaseStudentDataTableModule } from './baseStudentDataTableModule.js';
export { BaseStudentInfoTableModule } from './baseStudentInfoTableModule.js';

export {
    createColumnDef,
    createItemNumberColumn,
    createKsColumn,
    createRichtigColumn,
    createStudentIdLinkColumn,
    createTraitsColumn,
    extractColumnAppMeta,
} from './columnFactories.js';

export {
    createBoxPlotFormatter,
    createCountPercentageFormatter,
    createResultFormatter,
    createStackedCellFormatter,
    RESULT_ICON_CLASSES,
} from './cellFormatters.js';

export { createDistributionDownloadColumns, createDownloadColumn } from './tableExport.js';
export { getTraitsAsText, getTraitsText } from './traitUtils.js';
