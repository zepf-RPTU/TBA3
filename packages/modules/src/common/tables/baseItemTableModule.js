/**
 * BaseItemTableModule — shared base for the EN and MA item/task overview tables.
 *
 * Holds the lifecycle both apps have in common (render, update, export). The
 * subclass supplies the columns and the export row, and may take the optional hooks.
 */

import { TableModule } from './tableModule.js';
import { setupProgressBarSorting, setupPilotierungColumnSorting } from './progressBarSorting.js';
import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';
import { Preset } from './preset.js';

/** Both EN and MA sort the item table by item number; spread before handing to Tabulator. */
const ITEM_TABLE_DEFAULT_SORT = Object.freeze([{ column: 'name', dir: 'asc' }]);

/**
 * BaseItemTableModule - Abstract base for item overview tables
 * @augments TableModule
 * @abstract
 */
export class BaseItemTableModule extends TableModule {
    // ========================================================================
    // ABSTRACT METHODS (must be overridden by subclasses)
    // ========================================================================

    /**
     * Get the full column definitions array for the table.
     * @abstract
     * @param {Array} _processedData - Items to derive filter params from
     * @returns {Array} Tabulator column definitions
     */
    _getColumns(_processedData) {
        throw new Error(`${this.constructor.name} must implement _getColumns(processedData)`);
    }

    // ========================================================================
    // OPTIONAL HOOKS (may be overridden by subclasses)
    // ========================================================================

    /**
     * Preprocess item data before passing to createTable.
     * EN: enriches with sorted styles. MA: no-op.
     * @param {Array} itemsData - Raw items array
     * @returns {Array} Processed items for table
     */
    _preprocessItemData(itemsData) {
        return itemsData;
    }

    /**
     * Get Tabulator configuration options.
     * @returns {object} Tabulator options
     */
    _getTableOptions() {
        return { selectableRows: false };
    }

    /**
     * Get filter presets for Tabulator.
     * @returns {Array|undefined} Array of Preset objects, or undefined for no presets
     */
    _getPresets() {
        return undefined;
    }

    /**
     * Hook called after table creation and setupProgressBarSorting.
     * EN uses this for complex event attachment + initial mode filter.
     * MA uses this for simple dataFiltered handler.
     */
    _onAfterTableCreated() {
        /* no-op by default */
    }

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * Render the item table module.
     * Shared skeleton: validate → setData → preprocess → create table (columns,
     * sorting setup, post-creation hook — see _createItemTable).
     * @override
     * @param {object} data - Data for rendering
     * @param {Array} data.itemsData - Array of item/task data
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        // Store data reference on base
        this.setData(data.itemsData);

        // Preprocess (EN: enrich with sorted styles; MA: identity)
        const processedData = this._preprocessItemData(data.itemsData);

        this._createItemTable(processedData);
    }

    /**
     * Create the Tabulator instance from already-preprocessed data — the shared
     * tail of the render skeleton (columns → createTable → progress-bar/
     * Pilotierung sorting → _onAfterTableCreated). Also the rebuild path for
     * subclasses that must destroy-and-recreate the table because a
     * construction-time Tabulator option changed (EN's task-grouping toggle
     * flips `dataTree`).
     * @protected
     * @param {Array} processedData - Rows to load into the table
     * @param {Array} [filterSourceData=processedData] - Items to derive column
     *   filter params from; EN's task mode passes the flat enriched items here,
     *   because a task-grouped tree would hide child-item values from the
     *   filter lists.
     */
    _createItemTable(processedData, filterSourceData = processedData) {
        this.table = this.createTable({
            containerId: this.contentContainer.id,
            columns: this._getColumns(filterSourceData),
            data: processedData,
            initialSort: [...ITEM_TABLE_DEFAULT_SORT],
            options: this._getTableOptions(),
            presets: this._getPresets(),
        });

        // Setup progress bar multi-field sorting
        if (this.table) {
            setupProgressBarSorting(this.table, 'percentageCombined');
            setupPilotierungColumnSorting(this.table);
        }

        // Post-creation hook (event handlers, initial filters)
        this._onAfterTableCreated();
    }

    // ========================================================================
    // EXPORT FUNCTIONALITY
    // ========================================================================
}

// ============================================================================
// SHARED ITEM-TABLE PRESETS
// ============================================================================

/**
 * Builds the three item-table presets shared by EN and MA: "Stärkste 5",
 * "Schwächste 5", and "Hohe Nichtbearbeitung" (≥ 25% not attempted). Both the
 * button label (`label`) and its tooltip (`tooltip`) are resolved from the
 * glossary under the given base path, so the German wording has one home.
 * @param {string} tooltipBasePath - Glossary base path (e.g. 'ma.items.item-table.interface')
 * @param {object} [options={}] - Whether task-mode parent rows count toward the incomplete filter.
 * @param {boolean} [options.includeChildrenInIncompleteFilter=false] - When true, the
 *   "Hohe Nichtbearbeitung" filter also includes task-mode parent rows whose `_children`
 *   contain an item above the threshold (EN task-grouping mode).
 * @returns {Preset[]} The three shared presets, labelled and tooltipped from the glossary.
 */
export function createItemTablePresets(
    tooltipBasePath,
    { includeChildrenInIncompleteFilter = false } = {},
) {
    const NOT_ATTEMPTED_THRESHOLD = 25;

    return [
        new Preset({
            label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.best-five.label`),
            tooltipText: glossaryAnnotator.getRequiredEntryText(
                `${tooltipBasePath}.best-five.tooltip`,
            ),
            sort: [{ column: 'percentageCorrect', dir: 'desc' }],
            limit: 5,
        }),
        new Preset({
            label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.worst-five.label`),
            tooltipText: glossaryAnnotator.getRequiredEntryText(
                `${tooltipBasePath}.worst-five.tooltip`,
            ),
            sort: [{ column: 'percentageIncorrect', dir: 'desc' }],
            limit: 5,
        }),
        new Preset({
            label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.incomplete.label`),
            tooltipText: glossaryAnnotator.getRequiredEntryText(
                `${tooltipBasePath}.incomplete.tooltip`,
            ),
            sort: [{ column: 'percentageNotAttempted', dir: 'desc' }],
            filters: [
                {
                    field: 'percentageNotAttempted',
                    type: 'custom',
                    value: (data) => {
                        if (parseFloat(data.percentageNotAttempted) >= NOT_ATTEMPTED_THRESHOLD)
                            return true;
                        if (includeChildrenInIncompleteFilter && Array.isArray(data._children)) {
                            return data._children.some(
                                (child) =>
                                    parseFloat(child.percentageNotAttempted) >=
                                    NOT_ATTEMPTED_THRESHOLD,
                            );
                        }
                        return false;
                    },
                },
            ],
        }),
    ];
}
