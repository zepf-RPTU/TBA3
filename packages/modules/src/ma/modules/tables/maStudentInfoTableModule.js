/**
 * MaStudentInfoTableModule — the selected student's one-row summary: gender, traits,
 * solved items and Kompetenzstufe.
 */

import { BaseStudentInfoTableModule } from '../../../common/tables/baseStudentInfoTableModule.js';
import {
    createCompetenceLevelColumn,
    createRichtigColumn,
} from '../../../common/tables/columnFactories.js';
import { MA_DATASETS } from '../../maDatasets.js';

/** @augments BaseStudentInfoTableModule */
export class MaStudentInfoTableModule extends BaseStudentInfoTableModule {
    /**
     * A handful of short values beside the selector in the top bar: each column takes
     * its content's width, so they sit together instead of spreading over the bar.
     * @override
     */
    static layout = /** @type {const} */ ('fitDataFill');

    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [MA_DATASETS.STUDENT_RECORDS, MA_DATASETS.TRAIT_LABELS];

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    _readStudentRecords() {
        return this.options.context.documents.getDataset(MA_DATASETS.STUDENT_RECORDS);
    }

    /** @override */
    _getColumns() {
        return [
            ...this._createIdentityColumns(
                this.options.context.documents.getDataset(MA_DATASETS.TRAIT_LABELS),
            ),
            createRichtigColumn(),
            createCompetenceLevelColumn(this.options.context.palette),
        ];
    }
}

customElements.define('tba-ma-student-info-table', MaStudentInfoTableModule);
