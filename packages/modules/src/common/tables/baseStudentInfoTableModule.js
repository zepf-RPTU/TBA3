/**
 * BaseStudentInfoTableModule — shared base for the EN and MA student info tables.
 *
 * Holds the lifecycle both apps have in common (render, update, clear, the
 * replaceData fallback). The subclass supplies the columns and the row data.
 */

import { TableModule } from './tableModule.js';

/**
 * BaseStudentInfoTableModule - Abstract base for student info tables
 * @augments TableModule
 * @abstract
 */
export class BaseStudentInfoTableModule extends TableModule {
    /** @type {Array|null} */ _studentArray = null;
    /** @type {Array|null} */ _rawStudentArray = null;
    /** @type {string|null} */ _currentStudentId = null;

    /**
     * Creates a new BaseStudentInfoTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element
     * @param {object} options - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    // ========================================================================
    // ABSTRACT METHODS (must be overridden by subclasses)
    // ========================================================================

    /**
     * Get column definitions for the info table.
     * @abstract
     * @returns {Array} Tabulator column definitions
     */
    _getColumns() {
        throw new Error(`${this.constructor.name} must implement _getColumns()`);
    }

    /**
     * Build the row data for the table from student data.
     * @abstract
     * @param {object} _studentData - The student record from studentArray
     * @param {string} _schuelerId - Student ID
     * @returns {Array} Table data array (typically a single-element array)
     */
    _buildTableData(_studentData, _schuelerId) {
        throw new Error(
            `${this.constructor.name} must implement _buildTableData(studentData, schuelerId)`,
        );
    }

    // ========================================================================
    // OPTIONAL HOOKS (may be overridden by subclasses)
    // ========================================================================

    /**
     * Hook called during _doRenderContent() after storing core fields but before
     * the null-student guard delegates to clear().
     * @param {object} _data - The render data object
     */
    _onBeforeRender(_data) {
        /* no-op by default */
    }

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * Render the info table for a specific student.
     * @override
     * @param {object} data - Data for rendering
     * @param {Array} data.studentArray - Array of student data
     * @param {Array} data.rawStudentArray - Raw student data array
     * @param {string} data.studentId - Student ID to display
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        // Store core data
        this._studentArray = data.studentArray;
        this._rawStudentArray = data.rawStudentArray;
        this._currentStudentId = data.studentId;

        this.setData({
            studentArray: data.studentArray,
            rawStudentArray: data.rawStudentArray,
        });

        // Subclass hook (e.g. EN reads the appState mode, MA stores totalItems)
        this._onBeforeRender(data);

        if (!this._currentStudentId) {
            this.clear();
            return;
        }

        // Render the info table
        await this._renderInfoTable(this._currentStudentId);
    }

    /**
     * Render or update the student info table.
     * Finds the student, builds data, creates or updates the table.
     * @protected
     * @param {string} schuelerId - Student ID
     */
    async _renderInfoTable(schuelerId) {
        if (!this._studentArray || !this._rawStudentArray) {
            return;
        }

        // Find student data
        const studentData = this._studentArray.find((student) => student.studentId === schuelerId);

        if (!studentData) {
            this.clear();
            return;
        }

        // Build table data (subclass-specific)
        const tableData = this._buildTableData(studentData, schuelerId);

        // Get column definitions (subclass-specific)
        const columns = this._getColumns();

        // If table already exists, try to update data in-place
        if (await this.safeReplaceData(tableData)) return;

        // Create the info table
        this.table = this.createTable({
            containerId: this.contentContainer.id,
            columns,
            data: tableData,
            options: {
                selectableRows: false,
                disablePresets: true,
            },
        });
    }

    /**
     * Clear the info table.
     */
    clear() {
        if (this.table) {
            this.table.destroy();
            this.table = null;
        }

        if (this.container) {
            this.contentContainer.innerHTML = '';
        }
    }
}
