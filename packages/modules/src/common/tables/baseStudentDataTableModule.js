/**
 * BaseStudentDataTableModule — shared base for the EN and MA student data tables.
 *
 * Holds the lifecycle both apps have in common (render, update, clear, data
 * preparation). The subclass supplies `_renderForStudent(schuelerId)`.
 */

import { TableModule } from './tableModule.js';
import { retainNamedColumns } from './tableDataUtils.js';
import { compareItemLevelToReportedLevel } from '../domain/levels.js';

/**
 * BaseStudentDataTableModule - Abstract base for student data tables
 * @augments TableModule
 * @abstract
 */
export class BaseStudentDataTableModule extends TableModule {
    /** @type {Array|null} */ _rawStudentArray = null;
    /** @type {string|null} */ _currentStudentId = null;
    /** @type {Map<any, any[]>|null} */
    #rowsByStudentId = null;
    /** @type {any[]|null} */
    #indexedRawStudentArray = null;

    /**
     * Creates a new BaseStudentDataTableModule instance
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
     * Render the data table for a specific student.
     * Subclasses implement the full render pipeline (filter, columns, table creation).
     * @abstract
     * @param {string} _schuelerId - Student ID
     * @returns {Promise<void>}
     */
    async _renderForStudent(_schuelerId) {
        throw new Error(`${this.constructor.name} must implement _renderForStudent(schuelerId)`);
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
    // SHARED HELPERS
    // ========================================================================

    /**
     * Prepare student data: filter by student ID and retain specified columns.
     * @protected
     * @param {string} schuelerId - Student ID
     * @param {string[]} retainedColumns - Column names to keep
     * @returns {Array} Filtered and column-reduced data
     */
    _prepareStudentRows(schuelerId, retainedColumns) {
        if (!this._rawStudentArray) {
            return [];
        }

        const studentRows = this.#getRowsByStudentId(schuelerId);
        return studentRows.length === 0 ? [] : retainNamedColumns(studentRows, retainedColumns);
    }

    #getRowsByStudentId(schuelerId) {
        if (!Array.isArray(this._rawStudentArray) || this._rawStudentArray.length === 0) {
            return [];
        }

        if (this.#indexedRawStudentArray !== this._rawStudentArray) {
            const rowsByStudentId = new Map();

            for (const row of this._rawStudentArray) {
                const rowStudentId = row?.studentId;
                if (rowStudentId === undefined || rowStudentId === null) continue;

                let rows = rowsByStudentId.get(rowStudentId);
                if (!rows) {
                    rows = [];
                    rowsByStudentId.set(rowStudentId, rows);
                }
                rows.push(row);
            }

            this.#rowsByStudentId = rowsByStudentId;
            this.#indexedRawStudentArray = this._rawStudentArray;
        }

        return this.#rowsByStudentId?.get(schuelerId) || [];
    }

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * Render the data table for a specific student
     * @override
     * @param {object} data - Data for rendering
     * @param {Array} data.rawStudentArray - Raw student data array
     * @param {string} data.studentId - Student ID to display
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        // Store core data
        this._rawStudentArray = data.rawStudentArray;
        this._currentStudentId = data.studentId;

        this.setData({
            rawStudentArray: data.rawStudentArray,
        });

        // Subclass hook (e.g. EN stores itemArray & extracts domains)
        this._onBeforeRender(data);

        if (!this._currentStudentId) {
            this.clear();
            return;
        }

        // Delegate to subclass
        await this._renderForStudent(this._currentStudentId);
    }

    /**
     * Clear the data table.
     */
    clear() {
        if (this.table) {
            this.table.destroy();
            this.table = null;
        }

        // Reset active preset button so it doesn't appear active on an empty table.
        this._clearPresetState();

        if (this.container) {
            this.contentContainer.innerHTML = '';
        }
    }

    /** @override */
    destroy() {
        this.#rowsByStudentId = null;
        this.#indexedRawStudentArray = null;
        super.destroy();
    }
}

// ============================================================================
// LEVEL PRESET PREDICATES ("Unter KS" / "Über KS")
// ============================================================================
// "Below" presets include every result; "solved above" presets only include solved
// items. Both return false when the item level and the reported level cannot be
// related — an unknown level never leaks into a filtered view. How the two relate
// (same scale, KMK-rank bridge, or not at all) is decided in one place,
// `compareItemLevelToReportedLevel`.

/**
 * Item Aufgabenniveau strictly below the level the student reached.
 * @param {string} itemLevel - Item level as sent (e.g. 'B1.2', 'Ib')
 * @param {string|null|undefined} reportedLevel - Student's reported level (e.g. 'B2', 'KS 3')
 * @returns {boolean} True only when the two levels are comparable and the item sits below; an unrelatable pair is false, never "below".
 */
export function isItemBelowReportedLevel(itemLevel, reportedLevel) {
    const diff = compareItemLevelToReportedLevel(itemLevel, reportedLevel);
    return diff !== null && diff < 0;
}

/**
 * Item Aufgabenniveau strictly above the level the student reached.
 * @param {string} itemLevel - Item level as sent (e.g. 'C1.1', 'IV')
 * @param {string|null|undefined} reportedLevel - Student's reported level (e.g. 'B2', 'KS 3')
 * @returns {boolean} True only when the two levels are comparable and the item sits above; an unrelatable pair is false, never "above".
 */
export function isItemAboveReportedLevel(itemLevel, reportedLevel) {
    const diff = compareItemLevelToReportedLevel(itemLevel, reportedLevel);
    return diff !== null && diff > 0;
}
