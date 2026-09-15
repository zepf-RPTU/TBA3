/**
 * MaStudentTopBarModule - Full-width top bar for the MA Student View
 * Stacks the student selector above the student info table so the table keeps
 * the full module width across layout modes.
 */

import { ContentModule } from '@tba3/module-base';
import { MaStudentInfoTableModule } from '@tba3/modules/tables/ma-student-info';
import { StudentSelectorModule } from '../../../common/modules/header/studentSelectorModule.js';
import './maStudentTopBarModule.css';

export class MaStudentTopBarModule extends ContentModule {
    /** @type {StudentSelectorModule|null} */
    #selectorModule = null;
    /** @type {MaStudentInfoTableModule|null} */
    #infoTableModule = null;
    /** @type {any[]|null} */
    #studentArray = null;
    /** @type {any[]|null} */
    #rawStudentArray = null;
    /** @type {string|null} */
    #currentStudentId = null;
    #totalItems = 0;

    constructor(id, container, options = {}) {
        super(id, container, options);
        this.setDefaults({
            totalItems: 0,
            sortByName: true,
        });
        this.#totalItems = this.getOption('totalItems');
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /** @override */
    async _doRenderContent(data) {
        this.#studentArray = data.studentArray;
        this.#rawStudentArray = data.rawStudentArray;
        this.#currentStudentId = data.studentId;
        if (data.totalItems !== undefined) this.#totalItems = data.totalItems;

        this.setData({
            studentArray: data.studentArray,
            rawStudentArray: data.rawStudentArray,
        });

        this.#createChildContainers();
        this.#initializeChildren();

        if (this.#currentStudentId) {
            await this.#renderInfoTable(this.#currentStudentId);
        }
    }

    // ========================================================================
    // DOM & CHILD MODULES
    // ========================================================================

    #createChildContainers() {
        const content = this.contentContainer;
        content.classList.add('student-top-bar-content', 'layout-stack');

        const infoDiv = document.createElement('div');
        infoDiv.id = `${this.id}-info`;
        infoDiv.className = 'student-top-bar-info info-table-section';
        content.appendChild(infoDiv);
    }

    #initializeChildren() {
        const infoContainer = this.contentContainer.querySelector('.student-top-bar-info');

        // StudentSelectorModule builds its own element in _doRender() and sets this.element —
        // it never appends itself to a container. Pass null and append manually (same pattern
        // as HeaderModule). Use the same class names as the header selector so header-module.css styles apply.
        this.#selectorModule = new StudentSelectorModule(`${this.id}-selector-module`, null, {
            students: this.#studentArray ?? undefined,
            defaultStudentId: this.#currentStudentId ?? undefined,
            sortByName: this.getOption('sortByName'),
            containerClass: 'ma-student-selector',
            selectClass: 'header-module-student-select',
            labelClass: 'header-module-student-label',
            onSelectionChanged: (eventData) => this.#onStudentSelected(eventData),
        });
        this.#selectorModule.init();
        if (this.#selectorModule.element) {
            this.contentContainer.insertBefore(this.#selectorModule.element, infoContainer);
        }
        this.registerChildModule(this.#selectorModule);

        // Info table. totalItems travels in every #renderInfoTable payload, so
        // it needs no constructor seed.
        this.#infoTableModule = new MaStudentInfoTableModule(
            `${this.id}-info-module`,
            /** @type {HTMLElement} */ (infoContainer),
            {
                ...this._childOptions(),
                glossaryKey: 'ma.student.student-row',
            },
        );
        this.registerChildModule(this.#infoTableModule);
    }

    // ========================================================================
    // EVENT HANDLING
    // ========================================================================

    #onStudentSelected(eventData) {
        const studentId = eventData?.studentId;
        if (!studentId || studentId === this.#currentStudentId) return;

        this.#currentStudentId = studentId;
        this.#renderInfoTable(studentId);

        this.getOption('onStudentSelected')?.(studentId);
    }

    // ========================================================================
    // RENDERING HELPERS
    // ========================================================================

    async #renderInfoTable(studentId) {
        if (!this.#infoTableModule) return;
        await this.#infoTableModule.render({
            studentArray: this.#studentArray,
            rawStudentArray: this.#rawStudentArray,
            studentId,
            totalItems: this.#totalItems,
        });
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Set the selected student programmatically (without firing onStudentSelected)
     * @param {string} studentId - Student ID to select
     */
    async setStudent(studentId) {
        if (!studentId || studentId === this.#currentStudentId) return;
        this.#currentStudentId = studentId;

        if (this.#selectorModule) {
            this.#selectorModule.setStudent(studentId);
        }
        await this.#renderInfoTable(studentId);
    }
}
