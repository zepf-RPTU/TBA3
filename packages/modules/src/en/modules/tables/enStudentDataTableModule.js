/**
 * One student's item-by-item results. Follows the Domäne mode of its `domainMode` option
 * (DomainModeController) as a persistent row filter; a row click hands the item's id to
 * `onItemSelected`.
 */

import { BaseStudentDataTableModule } from '../../../common/tables/baseStudentDataTableModule.js';
import { DomainModeController } from './domainModeController.js';
import { createEnItemColumns } from './enTableColumns.js';
import { createStylesColumn } from './enStyleTableUtils.js';
import { createResultColumn } from '../../../common/tables/columnFactories.js';
import { getRecordsByIds } from '../../../common/data/datasetIndex.js';
import { EN_DATASETS } from '../../enDatasets.js';
import { buildStudentItemRows } from '../../utils/enItemDataAdapter.js';

/**
 * @typedef {import('../../../common/tables/baseStudentDataTableModule.js').StudentTableOptions &
 *   import('./domainModeController.js').DomainModeOptions & {
 *     onItemSelected?: (selection: import('../enItemDetail/enItemDetailModule.js').ItemSelection) => void,
 * }} EnStudentDataTableOptions
 */

/** @augments {BaseStudentDataTableModule<EnStudentDataTableOptions>} */
export class EnStudentDataTableModule extends BaseStudentDataTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [
        EN_DATASETS.ITEM_RECORDS,
        EN_DATASETS.STUDENT_RECORDS_BY_ID,
        EN_DATASETS.CONFIG,
    ];

    /** @override */
    static selectableRows = 1;

    /** @type {DomainModeController} */
    #domain;

    /** @override */
    _setup() {
        super._setup();
        this.#domain = DomainModeController.filteringRows(this, (filter, redraw) => {
            this._setPersistentFilter('domain', filter);
            if (redraw) this.redraw();
        });
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * Every domain's rows: the Domäne mode filters them on the table.
     * @override
     * @param {string} studentId
     * @returns {import('../../../common/tables/baseStudentDataTableModule.js').StudentRows|null}
     */
    _readStudent(studentId) {
        const { documents } = this.options.context;
        const [student] = getRecordsByIds(documents, EN_DATASETS.STUDENT_RECORDS_BY_ID, [
            studentId,
        ]);
        if (!student) return null;
        return {
            rows: buildStudentItemRows(
                documents.getDataset(EN_DATASETS.ITEM_RECORDS),
                student.itemResults,
            ),
            // Each row against the level reached in its own Domäne, so the level presets
            // stay right across 'all' and single-domain modes.
            reachedSpanOf: (row) => student.domains[row.domain]?.competenceLevelItemSpan,
        };
    }

    /**
     * The item table; a row click reports its item (`onItemSelected`).
     * @override
     * @returns {import('../../../common/tables/tableModule.js').RowsSpec}
     */
    _tableSpec() {
        return {
            columns: [
                ...createEnItemColumns(this.options.context, this.#domain),
                createResultColumn(),
                ...createStylesColumn(this.#domain.enConfig.styleCategories),
            ],
            options: { responsiveLayout: 'collapse' },
            onRowClick: (/** @type {{[field: string]: any}} */ row) =>
                this.options.onItemSelected?.({ itemIds: [row.iqbId] }),
        };
    }
}

customElements.define('tba-en-student-data-table', EnStudentDataTableModule);
