/**
 * EnStudentTablesModule — EnStudentInfoTableModule and EnStudentDataTableModule under
 * one ContentModule title bar, with the student selector in the title's place.
 */

import { EnStudentDataTableModule } from '@tba3/modules/tables/en-student-data';
import { EnStudentInfoTableModule } from '@tba3/modules/tables/en-student-info';
import { StudentSelectCardModule } from '../../../common/modules/studentSelectCard/studentSelectCardModule.js';
import { EN_DATASETS } from '@tba3/modules/en-domain';
import { html, nothing } from 'lit';
import './enStudentTablesModule.css';

/**
 * @typedef {import('../../../common/modules/studentSelectCard/studentSelectCardModule.js').StudentSelectCardOptions & {
 *   domainMode?: string | import('@preact/signals-core').Signal<string>,
 *   infoGlossaryKey: string,
 *   dataGlossaryKey: string,
 *   onItemSelected?: (selection: import('@tba3/modules/en-item-detail').ItemSelection) => void,
 * }} EnStudentTablesOptions
 */

/** @augments {StudentSelectCardModule<EnStudentTablesOptions>} */
export class EnStudentTablesModule extends StudentSelectCardModule {
    /**
     * @override
     * @type {import('@tba3/modules/documents').DocumentList}
     */
    static documents = [EN_DATASETS.STUDENT_RECORDS];

    /** @type {EnStudentDataTableModule|null} */
    #dataTableModule = null;

    /**
     * The data table's toolbar, in front of the export control; its buttons wrap with
     * each other.
     * @override
     * @returns {unknown} The strip, or `nothing` before the table exists.
     */
    _headerActions() {
        const table = this.#dataTableModule;
        if (!table) return nothing;
        return html`<div class="layout-row layout-row--wrap">${table.tableHeaderActions()}</div>`;
    }

    /**
     * @override
     * @returns {'table'}
     */
    _getExportType() {
        return 'table';
    }

    /**
     * One instance serves every student — a new `studentId` re-renders the child
     * tables in place.
     * @override
     */
    getExportIdentity() {
        return this.state.studentId.value;
    }

    /** @override */
    async _renderBody() {
        // The selector takes the title's place; the title stays in the outline for
        // screen readers.
        const title = /** @type {HTMLElement} */ (this.titleElement);
        const selectorSlot = document.createElement('div');
        selectorSlot.className = 'layout-row';
        title.before(selectorSlot);
        title.classList.add('visually-hidden');

        selectorSlot.append(
            this._createStudentSelector(
                this.options.context.documents.getDataset(EN_DATASETS.STUDENT_RECORDS),
                'en-student-tables-selector',
            ),
        );

        const info = EnStudentInfoTableModule.create(`${this.id}-info`, {
            ...this._childOptions(),
            studentId: this.state.studentId,
            domainMode: this.options.domainMode,
            glossaryKey: this.options.infoGlossaryKey,
        });
        info.classList.add('en-student-info-table');

        const data = EnStudentDataTableModule.create(`${this.id}-data`, {
            ...this._childOptions(),
            studentId: this.state.studentId,
            glossaryKey: this.options.dataGlossaryKey,
            domainMode: this.options.domainMode,
            onItemSelected: this.options.onItemSelected,
        });
        this.#dataTableModule = data;
        this.requestUpdate();

        // The card's updateComplete waits for both tables'.
        this.contentContainer.replaceChildren(info, data);
    }
}

customElements.define('tba-en-student-tables', EnStudentTablesModule);
