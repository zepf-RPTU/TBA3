/**
 * EnStudentTablesModule (EN) - Wrapper module combining EnStudentInfoTableModule
 * and EnStudentDataTableModule under a single ContentModule title bar.
 * The wrapper header replaces the visual title slot with the student selector
 * and delegates the data table's toolbar buttons into a separate local
 * controls strip inside the header actions via externalHeaderActionsContainer.
 */

import { ContentModule } from '@tba3/module-base';
import { EnStudentDataTableModule } from '@tba3/modules/tables/en-student-data';
import { EnStudentInfoTableModule } from '@tba3/modules/tables/en-student-info';
import { StudentSelectorModule } from '../../../common/modules/header/studentSelectorModule.js';
import { itemPreviewOverlay } from '../../../common/modules/overlays/itemPreviewOverlay.js';
import { getEnConfig } from '../../enConfig.js';
import './enStudentTablesModule.css';

export class EnStudentTablesModule extends ContentModule {
    /** @type {StudentSelectorModule|null} */
    #selectorModule = null;
    /** @type {EnStudentInfoTableModule|null} */
    #infoTableModule = null;
    /** @type {EnStudentDataTableModule|null} */
    #dataTableModule = null;
    /** @type {HTMLElement|null} */
    #selectorSlotElement = null;
    /** @type {HTMLElement|null} */
    #headerControlsContainer = null;
    /** @type {string|null} */
    #currentStudentId = null;

    getExportControlDefinition() {
        return this._buildExportControlDefinition('table');
    }

    /**
     * One instance serves every student — `updateStudent()` re-renders the child
     * tables in place.
     * @override
     */
    getExportIdentity() {
        return this.#currentStudentId;
    }

    /**
     * Render child tables inside the ContentModule content container
     * @override
     * @param {object} data - Everything the child tables render from.
     * @param {Array} data.studentArray - Student rows shaped for the table columns.
     * @param {Array} data.rawStudentArray - The same students unshaped, for the info table.
     * @param {Array} data.itemArray - The selected student's item rows.
     * @param {string} data.studentId - The student these tables belong to.
     */
    async _doRenderContent(data) {
        const content = this.contentContainer;
        const selectorSlot = this.#ensureSelectorSlot();
        const headerControlsContainer = this.#ensureHeaderControlsContainer();

        // Create internal containers
        const infoDiv = document.createElement('div');
        infoDiv.id = `${this.id}-info-container`;
        infoDiv.className = 'info-table-section';
        content.appendChild(infoDiv);

        const dataDiv = document.createElement('div');
        dataDiv.id = `${this.id}-data-container`;
        dataDiv.className = 'data-table-section';
        content.appendChild(dataDiv);

        this.#currentStudentId = data.studentId;

        const selectorModule = new StudentSelectorModule(`${this.id}-selector-module`, null, {
            students: data.studentArray,
            defaultStudentId: this.#currentStudentId ?? undefined,
            sortByName: true,
            containerClass: 'en-student-view-selector',
            selectClass: 'header-module-student-select',
            labelClass: 'header-module-student-label',
            onSelectionChanged: (eventData) => this.#handleStudentSelected(eventData),
        });
        this.#selectorModule = selectorModule;
        selectorModule.init();
        if (selectorSlot && selectorModule.element) {
            selectorSlot.appendChild(selectorModule.element);
        }
        this.registerChildModule(selectorModule);

        const enConfig = getEnConfig(this.getOption('dataStore'));

        // Create info table module
        const infoTableModule = new EnStudentInfoTableModule(`${this.id}-info`, infoDiv, {
            ...this._childOptions(),
            enConfig,
            domainMode: this.getOption('domainMode'),
            glossaryKey: this.getOption('infoGlossaryKey'),
        });
        this.#infoTableModule = infoTableModule;

        // Create data table module — delegate toolbar buttons to wrapper header
        const dataTableModule = new EnStudentDataTableModule(`${this.id}-data`, dataDiv, {
            ...this._childOptions(),
            glossaryKey: this.getOption('dataGlossaryKey'),
            enConfig,
            domainMode: this.getOption('domainMode'),
            externalHeaderActionsContainer: headerControlsContainer || this.headerActionsContainer,
            onItemSelected: this.getOption('onItemSelected'),
            onItemPreview: (task) => itemPreviewOverlay.show(task),
        });
        this.#dataTableModule = dataTableModule;

        // Render tables with initial student
        if (this.#currentStudentId) {
            await Promise.all([
                infoTableModule.init({
                    studentArray: data.studentArray,
                    rawStudentArray: data.rawStudentArray,
                    studentId: this.#currentStudentId,
                }),
                dataTableModule.init({
                    studentArray: data.studentArray,
                    rawStudentArray: data.rawStudentArray,
                    itemArray: data.itemArray,
                    studentId: this.#currentStudentId,
                }),
            ]);
        }

        this.registerChildModule(infoTableModule);
        this.registerChildModule(dataTableModule);
    }

    /**
     * Push the Domäne mode to both tables. Called by the owning view from its
     * app-state observer.
     * @param {string} mode - 'all' or a domain id
     */
    setDomainMode(mode) {
        this.#infoTableModule?.setState({ mode });
        this.#dataTableModule?.setState({ mode });
    }

    /**
     * Update tables with new student selection
     * @param {string} studentId - Student ID
     * @param {object} appData - Application data
     */
    async updateStudent(studentId, appData) {
        if (!studentId) return;
        this.#currentStudentId = studentId;

        const selectorModule = this.#selectorModule;
        if (selectorModule) {
            if (Array.isArray(appData?.studentArray)) {
                selectorModule.setStudents(appData.studentArray);
            }
            selectorModule.setStudent(studentId);
        }

        await Promise.all([
            this.#infoTableModule?.render({
                studentArray: appData?.studentArray,
                rawStudentArray: appData?.rawStudentArray,
                studentId,
            }),
            this.#dataTableModule?.render({
                studentArray: appData?.studentArray,
                rawStudentArray: appData?.rawStudentArray,
                itemArray: appData?.itemArray,
                studentId,
            }),
        ]);

        // Only the child tables re-rendered, so this module's own export
        // controls — and the student in their id — would otherwise stay stale.
        this.syncExportControls();
    }

    #ensureSelectorSlot() {
        const container = this.container;
        if (!container) return null;
        const header = container.querySelector('.content-module-header');
        const titleElement = header?.querySelector('.content-module-title');
        if (!(header instanceof HTMLElement) || !(titleElement instanceof HTMLElement)) {
            return null;
        }

        if (this.#selectorSlotElement?.isConnected) {
            return this.#selectorSlotElement;
        }

        const selectorSlot = document.createElement('div');
        selectorSlot.className = 'en-student-view-selector-slot layout-row';
        header.insertBefore(selectorSlot, titleElement);
        titleElement.hidden = true;
        titleElement.setAttribute('aria-hidden', 'true');
        this.#selectorSlotElement = selectorSlot;
        return selectorSlot;
    }

    #ensureHeaderControlsContainer() {
        const headerActions = this.headerActionsContainer;
        if (!(headerActions instanceof HTMLElement)) {
            return null;
        }

        if (this.#headerControlsContainer?.isConnected) {
            return this.#headerControlsContainer;
        }

        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'en-student-view-header-controls layout-row layout-row--wrap';
        headerActions.prepend(controlsContainer);
        this.#headerControlsContainer = controlsContainer;
        return controlsContainer;
    }

    #handleStudentSelected(eventData) {
        const studentId = eventData?.studentId;
        if (!studentId || studentId === this.#currentStudentId) {
            return;
        }

        this.#currentStudentId = studentId;
        this.getOption('onStudentSelected')?.(studentId);
    }
}
