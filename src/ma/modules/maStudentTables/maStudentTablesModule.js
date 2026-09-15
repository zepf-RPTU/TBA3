/**
 * MaStudentTablesModule - Orchestrator module for the MA student data table
 * Extends ContentModule to provide a unified title bar; the data table's toolbar
 * buttons are delegated to the wrapper header via externalHeaderActionsContainer.
 */

import { ContentModule } from '@tba3/module-base';
import { MaStudentDataTableModule } from '@tba3/modules/tables/ma-student-data';
import { itemPreviewOverlay } from '../../../common/modules/overlays/itemPreviewOverlay.js';
import './maStudentTablesModule.css';

/**
 * MaStudentTablesModule - Manages the student data table for MA
 * @augments ContentModule
 */
export class MaStudentTablesModule extends ContentModule {
    /** @type {any[]|null} */
    #rawStudentArray = null;
    /** @type {any[]|null} */
    #studentArray = null;
    /** @type {string|null} */
    #currentStudentId = null;
    /** @type {MaStudentDataTableModule|null} */
    #dataTableModule = null;

    /**
     * Creates a new MaStudentTablesModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element
     * @param {{[key: string]: any}} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        // Register callback from options
        if (options.onSelectionChanged) {
            this.registerCallback('selectionChanged', options.onSelectionChanged);
        }
    }

    getExportControlDefinition() {
        return this._buildExportControlDefinition('table');
    }

    /**
     * One instance serves every student — `setSelectedStudentId()` swaps the
     * child tables in place.
     * @override
     */
    getExportIdentity() {
        return this.#currentStudentId;
    }

    /**
     * Initialize the data table module (lazy initialization).
     * Creates an internal DOM container inside the ContentModule's contentContainer.
     */
    #initializeChildModules() {
        if (this.#dataTableModule) {
            return; // Already initialized
        }

        const content = this.contentContainer;
        if (!content) {
            throw new Error(`MaStudentTablesModule[${this.id}]: contentContainer not available`);
        }

        // Create internal container
        const dataDiv = document.createElement('div');
        dataDiv.id = `${this.id}-data-container`;
        dataDiv.className = 'data-table-section';
        content.appendChild(dataDiv);

        // Create data table module — delegate toolbar buttons to wrapper header
        this.#dataTableModule = new MaStudentDataTableModule(`${this.id}-data`, dataDiv, {
            ...this._childOptions(),
            externalHeaderActionsContainer: this.headerActionsContainer,
            onItemPreview: (task) => itemPreviewOverlay.show(task),
        });

        this.registerChildModule(this.#dataTableModule);
    }

    /**
     * Render the child modules inside the ContentModule content container
     * @override
     * @param {object} data - Data for rendering
     * @param {Array} data.rawStudentArray - Raw student data array
     * @param {Array} [data.studentArray] - Processed student data array
     * @param {string} data.studentId - Initial student ID (optional)
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        this.#rawStudentArray = data.rawStudentArray;
        this.#studentArray = data.studentArray ?? null;
        this.#currentStudentId = data.studentId;

        // Initialize child modules lazily
        this.#initializeChildModules();

        // Render child modules with initial student
        if (this.#currentStudentId) {
            await this.#updateChildModules(this.#currentStudentId);
        }
    }

    /**
     * Update the data table with new student
     * @param {string} studentId - Student ID
     */
    async #updateChildModules(studentId) {
        await this.#dataTableModule?.render({
            studentArray: this.#studentArray,
            rawStudentArray: this.#rawStudentArray,
            studentId,
        });

        // Only the child table re-rendered, so this module's own export controls
        // — and the student in their id — would otherwise stay stale.
        this.syncExportControls();
    }

    /**
     * Set the selected student by ID
     * @param {string} schuelerId - Student ID to select
     */
    async setSelectedStudentId(schuelerId) {
        // Update if student changed
        if (this.#currentStudentId !== schuelerId) {
            this.#currentStudentId = schuelerId;
            await this.#updateChildModules(schuelerId);
            this.triggerCallback('selectionChanged', schuelerId);
        }
    }

    /**
     * Redraw the data table module
     */
    redraw() {
        this.#dataTableModule?.redraw();
    }
}
