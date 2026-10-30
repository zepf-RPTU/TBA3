/**
 * MaStudentDataTableModule — one student's result on every item, with the item's
 * Aufgabenniveau, Leitidee and competences; a student switch swaps the rows in place.
 * The competence columns follow the `showCompetences` option.
 */

import { BaseStudentDataTableModule } from '../../../common/tables/baseStudentDataTableModule.js';
import { createResultColumn } from '../../../common/tables/columnFactories.js';
import {
    competenceColumnsController,
    createMaClassificationColumns,
    createMaItemColumns,
} from './maTableColumns.js';
import { MA_DATASETS } from '../../maDatasets.js';

/** The student's items in item-number order, the table's own sort. */
const STUDENT_ITEM_SORT = Object.freeze([{ column: 'name', dir: /** @type {const} */ ('asc') }]);

/**
 * @typedef {import('../../../common/tables/baseStudentDataTableModule.js').StudentTableOptions &
 *   import('./maTableColumns.js').CompetenceColumnsOptions} MaStudentDataTableOptions
 */

/** @augments {BaseStudentDataTableModule<MaStudentDataTableOptions>} */
export class MaStudentDataTableModule extends BaseStudentDataTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [
        MA_DATASETS.STUDENT_ITEM_ROWS,
        MA_DATASETS.STUDENT_RECORDS,
        MA_DATASETS.COMPETENCE_GROUPINGS,
    ];

    /** @type {import('../../../common/tables/tableModeController.js').TableModeController<boolean>} */
    #showCompetences;

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    _setup() {
        super._setup();
        this.#showCompetences = competenceColumnsController(
            this,
            () => this.#groupings(),
            (getShouldShow) => this._applyColumnVisibility(getShouldShow),
        );
    }

    /**
     * @override
     * @param {string} studentId
     * @returns {import('../../../common/tables/baseStudentDataTableModule.js').StudentRows}
     */
    _readStudent(studentId) {
        const documents = this.options.context.documents;
        const span =
            documents.getDataset(MA_DATASETS.STUDENT_RECORDS).find((s) => s.studentId === studentId)
                ?.competenceLevelItemSpan ?? null;
        return {
            rows: documents.getDataset(MA_DATASETS.STUDENT_ITEM_ROWS).get(studentId) ?? [],
            // One Kompetenzstufe for every item.
            reachedSpanOf: () => span,
        };
    }

    /**
     * @override
     * @returns {import('../../../common/tables/tableModule.js').RowsSpec}
     */
    _tableSpec() {
        const { context } = this.options;
        return {
            columns: [
                ...createMaItemColumns(context),
                createResultColumn(),
                ...createMaClassificationColumns(this.#groupings(), this.#showCompetences.value),
            ],
            initialSort: STUDENT_ITEM_SORT,
        };
    }

    /** @returns {import('../../utils/maCompetenceGroupings.js').MaCompetenceGrouping[]} */
    #groupings() {
        return this.options.context.documents.getDataset(MA_DATASETS.COMPETENCE_GROUPINGS);
    }
}

customElements.define('tba-ma-student-data-table', MaStudentDataTableModule);
