/**
 * SlBaseTableModule — shared base for the SL table modules: one Tabulator per module,
 * the vizMode its formatters read (a `TableModeController`), the row-type formatting
 * and the table options both tables share.
 */

import { TableModule } from '../../../common/tables/tableModule.js';
import { TableModeController } from '../../../common/tables/tableModeController.js';
import { VIZ_MODES } from '../../slVizModes.js';
import { SL_DATASETS } from '../../slDatasets.js';
import './slBaseTableModule.css';

/**
 * The datasets every SL table reads: the level definitions and the survey rows.
 * @type {import('../../../common/data/documentStore.js').DocumentList}
 */
export const SL_TABLE_DOCUMENTS = [
    SL_DATASETS.LEVEL_DEFINITIONS,
    SL_DATASETS.TEACHING_QUALITY,
    SL_DATASETS.SELF_EFFICACY_BY_GROUP,
    SL_DATASETS.SELF_EFFICACY_SCHOOL,
    SL_DATASETS.TEACHING_QUALITY_INDEX,
    SL_DATASETS.SELF_EFFICACY_INDEX,
    SL_DATASETS.SURVEY_ROWS,
];

/**
 * @typedef {import('../../../common/tables/tableModule.js').TableOptions & {
 *     vizMode?: string | import('@preact/signals-core').Signal<string>,
 * }} SlTableOptions
 */

/**
 * Subclasses build the columns and rows.
 * @augments {TableModule<SlTableOptions>}
 */
export class SlBaseTableModule extends TableModule {
    /**
     * The formatters read the mode on every render, so a redraw applies a change.
     * @type {TableModeController<string>}
     */
    #vizMode;

    /** @override */
    _setup() {
        super._setup();
        this.#vizMode = new TableModeController(this, {
            mode: this.options.vizMode ?? VIZ_MODES.STACKED_BAR,
            key: 'vizMode',
            apply: () => this.redraw(),
        });
    }

    /**
     * The viz mode the formatters draw (`stacked_bar` | `boxplot`).
     * @returns {string}
     */
    get vizMode() {
        return this.#vizMode.value;
    }

    /**
     * Mount the grouped table both SL tables are.
     * @protected
     * @param {object} spec
     * @param {string} spec.className - Class of the element the table mounts into.
     * @param {string} spec.groupBy - The row field the groups are made of.
     * @param {{[rowType: string]: string}} spec.rowClasses - `rowData.type` → CSS class, e.g. `{ school: 'school-row' }`.
     * @param {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} spec.columns
     * @param {import('../../../common/tables/columnFactories.js').RowData[]} spec.data
     */
    _createGroupedTable({ className, groupBy, rowClasses, columns, data }) {
        const tableDiv = document.createElement('div');
        tableDiv.className = className;
        this.contentContainer.appendChild(tableDiv);

        const allClasses = Object.values(rowClasses);
        this.createTable({
            container: tableDiv,
            columns,
            data,
            options: {
                columnDefaults: { headerSort: false },
                height: 'auto',
                groupBy,
                groupStartOpen: false,
                rowFormatter: (row) => {
                    const element = row.getElement();
                    element.classList.remove(...allClasses);
                    const cssClass = rowClasses[row.getData().type];
                    if (cssClass) element.classList.add(cssClass);
                },
            },
        });
    }
}
