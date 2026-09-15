/**
 * BaseClassTableModule — shared base for the EN and MA class overview tables.
 *
 * Holds the lifecycle both apps have in common (render, filter params, event
 * wiring). The subclass supplies the columns and the traits accessor, and may
 * take the optional hooks around them.
 */

import { TableModule } from './tableModule.js';
import { createListFilter } from './tableDataUtils.js';
import { LABELS } from './tableLabels.js';

/** Both EN and MA sort the class table by last name; spread before handing to Tabulator. */
export const CLASS_TABLE_DEFAULT_SORT = Object.freeze([{ column: 'lastName', dir: 'asc' }]);

/**
 * BaseClassTableModule - Abstract base for class overview tables
 * @augments TableModule
 * @abstract
 */
export class BaseClassTableModule extends TableModule {
    /** @type {Array|null} */ _currentStudentArray = null;
    /** @type {Array|null} */ _selectedStudents = null;

    // ========================================================================
    // ABSTRACT METHODS (must be overridden by subclasses)
    // ========================================================================

    /**
     * Get the full column definitions array for the table.
     * @abstract
     * @param {object} _filterParams - Pre-generated filter parameters
     * @param {object} _filterParams.genderFilterParams - Gender filter params
     * @param {object} _filterParams.traitFilterParams - Trait filter params
     * @returns {Array} Tabulator column definitions
     */
    _getColumns(_filterParams) {
        throw new Error(`${this.constructor.name} must implement _getColumns(filterParams)`);
    }

    /**
     * Get the domain-specific getTraitsAsText function.
     * Used for generating trait filter parameters.
     * @abstract
     * @returns {Function} getTraitsAsText function reference
     */
    _getTraitsAsTextFn() {
        throw new Error(`${this.constructor.name} must implement _getTraitsAsTextFn()`);
    }

    // ========================================================================
    // OPTIONAL HOOKS (may be overridden by subclasses)
    // ========================================================================

    /**
     * Hook called during _doRenderContent() after storing core fields.
     * @param {object} _data - The render data object
     */
    _onBeforeRender(_data) {
        /* no-op by default */
    }

    /**
     * Preprocess the student array before passing to createTable.
     * EN: transforms domain data + retainNamedColumns.
     * MA: retainNamedColumns only.
     * @param {Array} studentArray - Raw student array
     * @returns {Array} Processed data for table
     */
    _preprocessData(studentArray) {
        return studentArray;
    }

    /**
     * Get Tabulator configuration options.
     * @returns {object} Tabulator options
     */
    _getTableOptions() {
        return {
            selectableRows: true,
            selectableRowsPersistence: false,
        };
    }

    /**
     * Get filter presets for Tabulator.
     * @returns {Array|undefined} Array of Preset objects, or undefined for no presets
     */
    _getPresets() {
        return undefined;
    }

    /**
     * Hook called after row selection changes.
     * EN uses this to sync its style chart.
     * @param {Array} _selectedData - Currently selected row data
     */
    _onSelectionChanged(_selectedData) {
        /* no-op by default */
    }

    /**
     * Hook called after data is filtered.
     * EN uses this to sync its style chart.
     * @param {Array} _filteredStudents - Filtered student data
     * @param {Array} _filters - Active filters
     */
    _onDataFiltered(_filteredStudents, _filters) {
        /* no-op by default */
    }

    /**
     * Hook called after table creation and event handler attachment.
     * EN uses this for the dataSorted handler and progress-bar sorting.
     */
    _onAfterTableCreated() {
        /* no-op by default */
    }

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * Render the class table module.
     * Shared skeleton: validate → store data → preprocess → build columns → create table → attach events.
     * @override
     * @param {object} data - Data for rendering
     * @param {Array} data.studentArray - Current student array
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        // Store core data
        this._currentStudentArray = data.studentArray;

        // Subclass hook for domain-specific data storage
        this._onBeforeRender(data);

        // Preprocess data (EN: transform + retainNamedColumns; MA: retainNamedColumns)
        const processedData = this._preprocessData(this._currentStudentArray);

        // Generate shared filter parameters from original (unprocessed) student data
        const genderFilterParams = createListFilter(this._currentStudentArray, 'gender');
        const traitFilterParams = createTraitFilterParams(
            this._currentStudentArray,
            this._getTraitsAsTextFn(),
        );

        // Get full column set from subclass
        const filterParams = { genderFilterParams, traitFilterParams };
        const allColumns = this._getColumns(filterParams);

        // Create the table
        this.table = this.createTable({
            containerId: this.contentContainer.id,
            columns: allColumns,
            data: processedData,
            initialSort: [...CLASS_TABLE_DEFAULT_SORT],
            options: this._getTableOptions(),
            presets: this._getPresets(),
        });

        // Attach standard event handlers with shared callback logic
        this.attachStandardEventHandlers({
            onSelectionChanged: (selectedData) => {
                this._selectedStudents = selectedData.length > 0 ? selectedData : null;
                this._onSelectionChanged(selectedData);
            },
            onDataFiltered: (filteredStudents, filters) => {
                // Suppress during initial build to prevent duplicate events
                if (this.isInitialBuild) return;
                this._selectedStudents = null;
                this._onDataFiltered(filteredStudents, filters);
            },
        });

        // Post-creation hook
        this._onAfterTableCreated();
    }
}

// ============================================================================
// TRAIT (MERKMALE) HEADER-FILTER PARAMS
// ============================================================================

/**
 * Creates trait filter parameters from data array
 * Extracts unique traits and builds Tabulator filter params
 * @param {Array} dataArray - Array of data objects (students, items, etc.)
 * @param {Function} getTraitsFn - Function to extract traits from a data item, returns HTML element or text
 * @returns {object} Tabulator headerFilterParams object
 */
export function createTraitFilterParams(dataArray, getTraitsFn) {
    const allTraits = new Set();
    let hasEmptyTraits = false;

    dataArray.forEach((item) => {
        const traits = getTraitsFn(item);
        const traitElements = traits.querySelectorAll
            ? traits.querySelectorAll('.trait-item')
            : null;

        if (traitElements && traitElements.length > 0) {
            traitElements.forEach((element) => {
                const traitName = element.textContent || element.innerText || '';
                if (traitName.trim()) {
                    allTraits.add(traitName.trim());
                }
            });
        } else {
            const traitText = traits.textContent || traits.innerText || traits.toString();
            if (traitText === '—' || traitText === '' || !traitText) {
                hasEmptyTraits = true;
            }
        }
    });

    const traitValues = { '': LABELS.ALLE };
    Array.from(allTraits)
        .sort()
        .forEach((trait) => {
            traitValues[trait] = trait;
        });
    if (hasEmptyTraits) {
        traitValues[LABELS.KEINE] = LABELS.KEINE;
    }

    return {
        values: traitValues,
        sort: function (a, b) {
            if (a === LABELS.ALLE) return 1;
            if (b === LABELS.ALLE) return -1;
            if (a === LABELS.KEINE) return 1;
            if (b === LABELS.KEINE) return -1;
            return a.localeCompare(b);
        },
    };
}
