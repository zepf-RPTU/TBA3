/**
 * EnItemTableModule — the EN item/task overview table.
 *
 * Two group modes, switched from the header toolbar: `item`, a flat list of
 * individual items, and `task`, rows grouped by `exercise.name` through Tabulator's
 * dataTree with expandable aggregated parents. A Domäne mode change applies or
 * removes a Tabulator filter rather than recreating the table.
 */

import {
    BaseItemTableModule,
    createItemTablePresets,
} from '../../../common/tables/baseItemTableModule.js';
import { withDomainMode } from './enWithDomainMode.js';
import { EN_TERMS } from '../../enTerms.js';
import { createListFilter } from '../../../common/tables/tableDataUtils.js';
import {
    createGerLevelHtml,
    getItemLevelOrdinal,
    parseItemLevel,
} from '../../../common/domain/levels.js';
import { sortStylesByPriority, createStylesColumn } from './enStyleTableUtils.js';
import { createItemNumberColumn } from './enTableColumns.js';
import { createDistributionDownloadColumns } from '../../../common/tables/tableExport.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import {
    createProgressBarColumn,
    createPilotierungColumn,
    createPilotierungDownloadColumns,
} from '../../../common/tables/progressBarColumn.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import { groupItemsByTask } from './enItemTaskGrouping.js';
import { ensureHeaderActionButtonControl } from '@tba3/module-base/modules/header/headerActionDropdown.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import './enItemTableModule.css';

const GROUPING_TOGGLE_SELECTOR = '[data-header-action-button="table-grouping"]';

/**
 * Reduce a Niveau cell to the numbers it sorts by, so a task row's range and a single
 * item's level compare on the same scale.
 * @param {any} value - The cell value: one item level, or a range label on a task row.
 * @param {object} [rowData] - The row, read for the raw level list a task row carries.
 * @returns {{start: number|null, end: number|null, label: string}} Ordinals on the item scale — `null` for a value that is not a level — plus the label to fall back to.
 */
function getItemLevelSortMeta(value, rowData = {}) {
    // Task rows carry the range of their items' levels; single items one level. Both sort
    // by position on the item scale, `A1.1 < A1.2 < … < C1.2`.
    if (Array.isArray(rowData.competenceLevelsRaw) && rowData.competenceLevelsRaw.length > 0) {
        return {
            start: getItemLevelOrdinal(rowData.competenceLevelsRaw[0]),
            end: getItemLevelOrdinal(
                rowData.competenceLevelsRaw[rowData.competenceLevelsRaw.length - 1],
            ),
            label: rowData.competenceLevel || '',
        };
    }

    if (parseItemLevel(value)) {
        const ordinal = getItemLevelOrdinal(value);
        return { start: ordinal, end: ordinal, label: String(value) };
    }

    return {
        start: null,
        end: null,
        label: typeof value === 'string' ? value : '',
    };
}

/**
 * Tabulator sorter for the Niveau column.
 * @param {any} a - First cell value.
 * @param {any} b - Second cell value.
 * @param {object} aRow - First Tabulator row component.
 * @param {object} bRow - Second Tabulator row component.
 * @returns {number} Negative, zero or positive in the usual comparator sense.
 */
function compareItemLevelSortValues(a, b, aRow, bRow) {
    const sortA = getItemLevelSortMeta(a, aRow?.getData?.() ?? {});
    const sortB = getItemLevelSortMeta(b, bRow?.getData?.() ?? {});

    const hasNumericA = Number.isFinite(sortA.start);
    const hasNumericB = Number.isFinite(sortB.start);

    if (hasNumericA && hasNumericB) {
        if (sortA.start !== sortB.start) {
            return (sortA.start ?? 0) - (sortB.start ?? 0);
        }

        if (sortA.end !== sortB.end) {
            return (sortA.end ?? 0) - (sortB.end ?? 0);
        }
    } else if (hasNumericA !== hasNumericB) {
        return hasNumericA ? -1 : 1;
    }

    return sortA.label.localeCompare(sortB.label, undefined, { numeric: true });
}

/**
 * EnItemTableModule - Reusable item table component for EN
 * Encapsulates the item overview table with filtering and export
 * @augments BaseItemTableModule
 */
export class EnItemTableModule extends withDomainMode(BaseItemTableModule) {
    /** @type {any[]|null} */
    #allItemsData = null;
    /** @type {any[]|null} */
    #selectedItems = null;
    /** @type {string|null} */
    #currentDomain = null;
    /** @type {((data: any) => boolean)|null} */
    #domainFilterFunction = null; // Reference to active domain filter for removal
    #groupMode = 'item'; // 'item' (flat) or 'task' (grouped by exercise.name)
    /** @type {number|null} */
    #filterSyncTimer = null;

    /**
     * Creates a new EnItemTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            enableModuleExport: true,
        });

        // Wired by the owning view to the lollipop chart and the item detail panel.
        if (typeof options.onDataSync === 'function') {
            this.registerCallback('dataSync', options.onDataSync);
        }
        if (typeof options.onItemSelected === 'function') {
            this.registerCallback('itemSelected', options.onItemSelected);
        }
    }

    /**
     * The Hören/Lesen switch rescopes this table in place, so the domain is
     * what tells two captures apart. Filters and sorting are not part of it —
     * those narrow the same table, which stays one report card.
     * @override
     */
    getExportIdentity() {
        return this._state.mode ?? null;
    }

    // ========================================================================
    // BASE CLASS HOOK IMPLEMENTATIONS
    // ========================================================================

    /**
     * Override render to add domain guard check before delegating to base.
     * @override
     */
    async _doRenderContent(data) {
        // Store EN-specific data before base render
        this.#allItemsData = data.itemsData;

        // Items are flat records: `domain` is the payload's domain.id, the value a
        // domain mode names.
        if (!data.itemsData.some((item) => item.domain)) {
            console.warn('EnItemTableModule: No domains found for subject: en');
            return;
        }

        await super._doRenderContent(data);
    }

    /**
     * Override to add grouping toggle button before the standard
     * table-local header controls.
     * @override
     */
    _createHeaderToolbarButtons() {
        this.#createGroupingToggleButton();
        super._createHeaderToolbarButtons();
    }

    /**
     * Creates a toggle button in the header toolbar to switch between
     * flat item view and task-grouped view.
     */
    #createGroupingToggleButton() {
        const headerActions = this.headerActionsContainer;
        if (!headerActions) return;

        const toggleTooltip =
            'Nach Aufgabe gruppieren (Dieser Modus ist experimentell und in Bearbeitung!)';

        ensureHeaderActionButtonControl(headerActions, {
            selector: GROUPING_TOGGLE_SELECTOR,
            buttonAttributes: {
                'data-header-action-button': 'table-grouping',
                'aria-pressed': String(this.#groupMode === 'task'),
            },
            ariaLabel: toggleTooltip,
            tooltipText: toggleTooltip,
            syncButton: (button) => {
                button.setAttribute('aria-pressed', String(this.#groupMode === 'task'));
                button.classList.toggle('is-active', this.#groupMode === 'task');
                button.innerHTML = iconSvg('layers');
            },
            onClick: () => {
                const isTaskMode = this.#groupMode === 'task';
                this.#setGroupMode(isTaskMode ? 'item' : 'task');
            },
        });
    }

    /**
     * Enrich flat items with sorted style data (mode-independent).
     * @param {Array<object>} itemsData - Flat item rows as the store delivers them.
     * @returns {Array<object>} The same rows with their styles sorted into Aufgabenniveau priority order.
     */
    #enrichItems(itemsData) {
        const styleCategories = this.getOption('enConfig').styleCategories;
        return itemsData.map((item) => {
            const styles = item.style || [];
            const sortedStyles = sortStylesByPriority([...styles], styleCategories);
            return {
                ...item,
                combinedStyles: sortedStyles,
                primaryStyle: sortedStyles.length > 0 ? sortedStyles[0] : '',
            };
        });
    }

    /**
     * Enrich items with sorted style data, then optionally group by task.
     * @override
     */
    _preprocessItemData(itemsData) {
        const enriched = this.#enrichItems(itemsData);

        // In task mode, group the enriched items
        if (this.#groupMode === 'task') {
            return groupItemsByTask(enriched, this.getOption('enConfig').styleCategories);
        }

        return enriched;
    }

    /** @override */
    _getColumns(processedData) {
        // Generate filter parameters from ALL processed items
        const niveauFilterParams = createListFilter(
            processedData,
            'competenceLevel',
            null,
            (a, b) => getItemLevelOrdinal(a) - getItemLevelOrdinal(b),
        );
        const aufgabenFilterParams = createListFilter(processedData, 'exercise.name');

        const baseColumns = [
            createColumnDef('ID', 'iqbId', {
                headerFilter: 'input',
                visible: false,
                tableMeta: { excludeFromColumnVisibilityMenu: true },
            }),
            createItemNumberColumn(() => this._state.mode, {
                title: EN_TERMS.ITEM_NUMBER,
                includeTaskRow: true,
                onItemPreview: this.getOption('onItemPreview'),
            }),
            createColumnDef(EN_TERMS.EXERCISE, 'exercise.name', {
                headerFilter: 'list',
                headerFilterParams: aufgabenFilterParams,
                widthGrow: COLUMN_GROW_RATIOS.name,
                formatter: function (cell) {
                    const data = cell.getRow().getData();
                    const value = cell.getValue() || '';
                    if (data.isTaskRow && data.itemCount) {
                        return `<strong>${value}</strong> <span class="task-item-count">(${data.itemCount} Items)</span>`;
                    }
                    return value;
                },
            }),
            createColumnDef(EN_TERMS.ITEM_LEVEL, 'competenceLevel', {
                headerFilter: 'list',
                headerFilterParams: niveauFilterParams,
                widthGrow: COLUMN_GROW_RATIOS.level,
                hozAlign: 'center',
                sorter: function (a, b, aRow, bRow) {
                    return compareItemLevelSortValues(a, b, aRow, bRow);
                },
                formatter: function (cell) {
                    const data = cell.getRow().getData();
                    const value = cell.getValue();
                    if (data.isTaskRow) {
                        return createGerLevelHtml(value || 'N/A', 'span', 'ger-text');
                    }
                    return createGerLevelHtml(value || 'N/A', 'span', 'ger-text');
                },
            }),
        ];

        // Single style column (shared with the per-student data table)
        const styleColumn = createStylesColumn(processedData, {
            title: EN_TERMS.STYLES,
            styleCategories: this.getOption('enConfig').styleCategories,
        });

        const resultColumns = [
            createProgressBarColumn(
                {
                    showCounts: true,
                    correctCountField: 'correctCount',
                    incorrectCountField: 'incorrectCount',
                    notAttemptedCountField: 'notAttemptedCount',
                    benchmarkField: 'pilotierungswert',
                },
                'Verteilung: Richtig | Unbearbeitet | Falsch',
                'percentageCombined',
                {
                    headerFilter: false,
                },
            ),
            ...createDistributionDownloadColumns({ follows: 'percentageCombined' }),
            createPilotierungColumn(),
            ...createPilotierungDownloadColumns(),
        ];

        return [...baseColumns, styleColumn, ...resultColumns];
    }

    /**
     * Presets for EN item table (task mode also checks child items).
     * @override
     */
    _getPresets() {
        return createItemTablePresets('en.item.item-table.interface', {
            includeChildrenInIncompleteFilter: true,
        });
    }

    /** @override */
    _getTableOptions() {
        const base = {
            selectableRows: true,
            selectableRowsPersistence: false,
            height: '100%',
        };

        if (this.#groupMode === 'task') {
            return {
                ...base,
                dataTree: true,
                dataTreeStartExpanded: false,
                dataTreeChildField: '_children',
                dataTreeSelectPropagate: false,
                dataTreeChildIndent: 20,
                // In task mode no row is selectable — the lollipop chart is locked
                // to task-level aggregates and must not react to child item clicks.
                // rowClick still fires for item detail navigation (independently of selectability).
                selectableRowsCheck: () => false,
            };
        }

        return base;
    }

    /**
     * Post-creation: attach EN-specific event handlers + apply initial domain filter.
     * @override
     */
    _onAfterTableCreated() {
        this.#attachTableEvents();

        // Initial mode application + chart sync are handled structurally by the
        // mixin's _onTableReady() → _applyModeChange() → then our _onTableReady
        // override below hands the chart its data.
    }

    // ========================================================================
    // GROUP MODE — item vs. task
    // ========================================================================

    /**
     * Switch between item and task grouping mode.
     * Destroys and recreates the Tabulator instance because
     * dataTree is a construction-time option.
     * @param {'item'|'task'} mode - The grouping to switch to; the same mode is a no-op.
     */
    #setGroupMode(mode) {
        if (mode === this.#groupMode) return;
        this.#groupMode = mode;

        // Destroy existing table
        if (this.table) {
            this.table.destroy();
            this.table = null;
        }

        // Reset filter state (will be re-applied)
        this.#domainFilterFunction = null;
        this.#selectedItems = null;

        // Clear the detail panel's tabs — the recreated table's initial build is
        // suppressed, so it won't emit a dataFiltered event to clear them.
        this.#syncDetailSelection([]);

        // Recreate via the shared skeleton tail (columns, sorting setup,
        // _onAfterTableCreated → event handlers). Table data follows the new
        // group mode; column filter params always read the flat enriched items.
        const flatData = this.#enrichItems(this.#allItemsData || []);
        const tableData =
            this.#groupMode === 'task'
                ? groupItemsByTask(flatData, this.getOption('enConfig').styleCategories)
                : flatData;
        this._createItemTable(tableData, flatData);

        // Note: _onTableReady is called after tableBuilt event by createTable().
        // That will re-apply domain filter and fire the initial chart sync.
    }

    // ========================================================================
    // TABLE LIFECYCLE
    // ========================================================================

    /**
     * Called after the table is fully built and the initial redraw completes.
     * Delegates to the mixin first (applies domain filter), then publishes
     * the filtered data so the lollipop chart receives its initial dataset.
     * @override
     * @protected
     */
    _onTableReady() {
        // Mixin applies mode filter via super._onTableReady() → _applyModeChange().
        // Suppress Tabulator events during this phase to prevent a duplicate sync.
        this.withSuppressedTableEvents(
            ['rowSelectionChanged', 'dataFiltered', 'dataSorted'],
            () => {
                super._onTableReady();
            },
            { release: 'timeout' },
        );

        // Tabulator 6 processes addFilter() asynchronously — even
        // getRows("active") returns stale (unfiltered) data when called
        // right after addFilter().  Apply the JS filter function manually
        // so the initial sync always carries correctly filtered items.
        const table = this.table;
        if (!table) return;
        let currentItems = table.getRows('active').map((row) => row.getData());
        const domainFilterFunction = this.#domainFilterFunction;
        if (domainFilterFunction) {
            currentItems = currentItems.filter(domainFilterFunction);
        }
        this.#updateChartsWithFilteredData(currentItems);
    }

    /**
     * Persistent filters (domain filter) survive preset resets.
     * @override
     */
    _getPersistentFilters() {
        return this.#domainFilterFunction ? [this.#domainFilterFunction] : [];
    }

    /**
     * Apply domain filter without destroying the table (optimized mode change).
     * Uses a programmatic Tabulator filter on the row's `domain`, which is the id a
     * domain mode names.
     * @param {string} mode - `'all'` or a domain id
     */
    _applyModeChange(mode) {
        const table = this.table;
        if (!table) return;

        // Track whether we cross the 'all' boundary — only then does the Nr.
        // column formatter switch between "with prefix" and "without prefix"
        // and require a full redraw. domain0↔domain1 transitions only change
        // the active filter; addFilter already re-renders the visible rows
        // via the dataFiltered handler, so a redraw() would be redundant.
        const wasAll = this.#currentDomain === 'all';

        // Remove existing domain filter if any.
        // When transitioning between two domain modes (not back to 'all'), suppress the
        // intermediate dataFiltered/dataSorted events that fire synchronously after
        // removeFilter. Without suppression the lollipop chart's ChartRenderer._render()
        // isRendering guard fires on the intermediate "all items" state and blocks the
        // subsequent addFilter update, leaving the chart displaying all items instead of
        // the new domain's items.
        const filterFn = this.#domainFilterFunction;
        if (filterFn) {
            if (mode !== 'all') {
                this.withSuppressedTableEvents(['dataFiltered', 'dataSorted'], () => {
                    table.removeFilter(filterFn);
                });
            } else {
                table.removeFilter(filterFn);
            }
            this.#domainFilterFunction = null;
        }

        if (mode !== 'all') {
            this.#currentDomain = mode;
            const domainFilterFunction = (data) => data.domain === mode;
            this.#domainFilterFunction = domainFilterFunction;
            table.addFilter(domainFilterFunction);
        } else {
            this.#currentDomain = 'all';
        }

        // Redraw only when the Nr. column prefix visibility changes.
        const isAll = mode === 'all';
        if (wasAll !== isAll) {
            this.redraw();
        }
    }

    /**
     * Attach event handlers to the table
     */
    #attachTableEvents() {
        if (!this.table) return;

        // Handle row click - hand the clicked item to the detail panel
        this.table.on('rowClick', (e, row) => {
            this.handleTreeToggleRowClick(row, {
                onLeafClick: (itemData) => {
                    // In item mode the detail panel's tabs mirror the multi-selection,
                    // driven by rowSelectionChanged — so a click needn't sync here.
                    // In task mode rows aren't selectable, so the click is the only signal.
                    if (this.#groupMode === 'task') {
                        this.triggerCallback('itemSelected', { item: itemData });
                    }
                },
            });
        });

        // Handle row selection
        this.table.on('rowSelectionChanged', (selectedData) => {
            // Suppress when triggered by deselectRow() inside dataFiltered —
            // that handler will fire the definitive sync itself.
            if (this.isTableEventSuppressed('rowSelectionChanged')) return;

            this.#selectedItems = selectedData.length > 0 ? selectedData : null;

            // Update charts with selected items
            this.#updateCharts();

            // Feed the selection set to the item detail panel (one tab per item)
            this.#syncDetailSelection(selectedData);
        });

        // Handle data filtering
        this.table.on('dataFiltered', (filters, rows) => {
            // Suppress during initial build
            if (this.isInitialBuild) return;
            // Suppress during _onTableReady — that method fires its own single sync
            if (this.isTableEventSuppressed('dataFiltered')) return;

            // Reset selection when filters change.
            // Wrap in withSuppressedTableEvents() so the deselectRow → rowSelectionChanged
            // cascade doesn't produce a duplicate sync.
            this.withSuppressedTableEvents('rowSelectionChanged', () => {
                this.table?.deselectRow();
                this.#selectedItems = null;
            });

            // Clear the detail panel's tabs to mirror the reset selection
            this.#syncDetailSelection([]);

            // Extract filtered item data
            const filteredItems = rows.map((row) => row.getData());

            // Update charts with filtered data (debounced to avoid a chart
            // rebuild per keystroke in header input filters — mirrors
            // EnClassTableModule._onDataFiltered)
            if (this.#filterSyncTimer) clearTimeout(this.#filterSyncTimer);
            this.#filterSyncTimer = this.resources.trackTimeout(() => {
                this.#filterSyncTimer = null;
                this.#updateChartsWithFilteredData(filteredItems);
            }, 150);
        });

        // Handle data sorting - update charts to mirror sort order
        this.table.on('dataSorted', (sorters, rows) => {
            if (this.isInitialBuild) return;
            // Suppress during _onTableReady — redraw() inside _applyModeChange fires
            // dataSorted, which would produce a duplicate sync
            if (this.isTableEventSuppressed('dataSorted')) return;
            // Only update if we have no selection (selection takes priority)
            if (this.#selectedItems && this.#selectedItems.length > 0) {
                return;
            }

            // Extract sorted item data and update charts
            const sortedItems = rows.map((row) => row.getData());
            this.#updateChartsWithFilteredData(sortedItems);
        });
    }

    /**
     * Refresh the view's itemStore with the table's current rows so the lollipop
     * consumer can resolve the synced id payloads back to records.
     * getData() returns all rows (task-parent rows in 'task' mode, flat items in
     * 'item' mode), each keyed by iqbId.
     */
    #syncItemStore() {
        if (this.table) {
            this.getOption('itemStore').setAll(this.table.getData());
        }
    }

    /**
     * Map item/task rows to the ordered iqbId list handed to the lollipop.
     * In 'task' mode, only task-parent rows are sent — expanded dataTree child
     * rows must not leak into the sync.
     * @param {Array} items - Row data objects in display order
     * @returns {string[]} Ordered iqbId list
     */
    #extractChartItemIds(items) {
        const chartItems =
            this.#groupMode === 'task' ? items.filter((item) => item.isTaskRow) : items;
        return chartItems.map((item) => item.iqbId);
    }

    /**
     * Update charts with currently selected items.
     * Hands `onDataSync` id lists only; the lollipop resolves records from
     * itemStore.
     */
    #updateCharts() {
        const table = this.table;
        const selectedItems = this.#selectedItems;
        if (!selectedItems || selectedItems.length === 0) {
            // No selection — fall back to all visible (filtered) rows
            const filteredItems = table ? table.getRows('active').map((row) => row.getData()) : [];
            this.#updateChartsWithFilteredData(filteredItems);
            return;
        }

        this.#syncItemStore();

        // Active rows respect the domain filter; visibleIds preserves table sort
        // order, selectedIds is the selected subset (also in table order).
        const activeItems = table ? table.getRows('active').map((row) => row.getData()) : [];
        const selectedItemIds = new Set(selectedItems.map((item) => item.iqbId));

        this.triggerCallback('dataSync', {
            visibleIds: this.#extractChartItemIds(activeItems),
            selectedIds: this.#extractChartItemIds(
                activeItems.filter((item) => selectedItemIds.has(item.iqbId)),
            ),
            groupMode: this.#groupMode,
            mode: this._state.mode,
        });
    }

    /**
     * Update charts with filtered/sorted data.
     * Hands `onDataSync` id lists only (see #updateCharts).
     * @param {Array} filteredItems - Filtered/sorted rows in display order
     */
    #updateChartsWithFilteredData(filteredItems) {
        this.#syncItemStore();

        this.triggerCallback('dataSync', {
            visibleIds: this.#extractChartItemIds(filteredItems),
            groupMode: this.#groupMode,
            mode: this._state.mode,
        });
    }

    /**
     * Hand the current selection set to the item detail panel, which renders
     * one tab per item (mode drives the domain-prefixed tab label). An empty
     * array clears the panel's tabs.
     * @param {Array} items - Selected item rows (empty to clear)
     */
    #syncDetailSelection(items) {
        this.triggerCallback('itemSelected', {
            items,
            mode: this._state.mode,
        });
    }

    // ========================================================================
    // EXPORT FUNCTIONALITY
    // ========================================================================
}
