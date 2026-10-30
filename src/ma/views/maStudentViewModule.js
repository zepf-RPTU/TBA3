/**
 * MaStudentViewModule — the MA Schüler:in view: selector and info table side by
 * side in a full-width top bar, the data table left, the item-ring charts right.
 */

import { MaLayoutViewBase } from './maLayoutViewBase.js';
import { MaStudentDataTableModule } from '@tba3/modules/tables/ma-student-data';
import { MaStudentTopBarModule } from '../modules/maStudentTopBar/maStudentTopBarModule.js';

export class MaStudentViewModule extends MaLayoutViewBase {
    /**
     * The top bar, shown in every layout mode, and the data table left; the top bar, the
     * table and the three ring hosts follow the selected student themselves.
     * @override
     * @returns {import('./maLayoutViewBase.js').SplitViewSpec}
     * @protected
     */
    _splitView() {
        const student = this.options.appState.currentStudentId;
        /** @type {import('../modules/maStudentTopBar/maStudentTopBarModule.js').MaStudentTopBarOptions} */
        const options = {
            ...this._childOptions(),
            studentId: student,
            onStudentSelected: (id) => this._selectStudent(id),
        };
        const topBar = MaStudentTopBarModule.create('student-top-bar', options);
        topBar.className = 'student-top-bar-container';

        const table = MaStudentDataTableModule.create('student-view-module', {
            ...this._childOptions(),
            studentId: student,
            showModuleTitle: true,
            glossaryKey: 'ma.student.student-item-table',
            showCompetences: this._showCompetences(),
        });

        return {
            prefix: 'student',
            top: topBar,
            left: [table],
            gridGlossaryKey: 'ma.student.item-ring-grid',
            student,
        };
    }
}

customElements.define('tba-ma-student-view', MaStudentViewModule);
