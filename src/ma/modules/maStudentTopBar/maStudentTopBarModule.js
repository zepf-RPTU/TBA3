/**
 * MaStudentTopBarModule — a full-width bar: the student selector beside the
 * content-width student info table, centred as one group, wrapping below it when the
 * row is too narrow.
 */

import { MaStudentInfoTableModule } from '@tba3/modules/tables/ma-student-info';
import { StudentSelectCardModule } from '../../../common/modules/studentSelectCard/studentSelectCardModule.js';
import { MA_DATASETS } from '@tba3/modules/ma-domain';
import './maStudentTopBarModule.css';

/** @typedef {import('../../../common/modules/studentSelectCard/studentSelectCardModule.js').StudentSelectCardOptions} MaStudentTopBarOptions */

/** @augments {StudentSelectCardModule<MaStudentTopBarOptions>} */
export class MaStudentTopBarModule extends StudentSelectCardModule {
    /**
     * @override
     * @type {import('@tba3/modules/documents').DocumentList}
     */
    static documents = [MA_DATASETS.STUDENT_RECORDS];

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /** @override */
    async _renderBody() {
        const content = this.contentContainer;
        content.classList.add('student-top-bar-content', 'layout-row', 'layout-row--wrap');

        const selector = this._createStudentSelector(
            this.options.context.documents.getDataset(MA_DATASETS.STUDENT_RECORDS),
            'ma-student-selector',
        );
        const info = MaStudentInfoTableModule.create(`${this.id}-info-module`, {
            ...this._childOptions(),
            studentId: this.state.studentId,
            glossaryKey: 'ma.student.student-row',
            // The bar is the card; the table sits in it flat.
            showModuleCard: false,
        });
        info.classList.add('student-top-bar-info');
        // The bar's updateComplete waits for the info table's.
        content.replaceChildren(selector, info);
    }
}

customElements.define('tba-ma-student-top-bar', MaStudentTopBarModule);
