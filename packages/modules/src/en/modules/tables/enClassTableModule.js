/**
 * EnClassTableModule — the EN class overview table.
 *
 * Follows the Domäne mode through `setState({ mode })`, pushed by the owning view, and
 * hands its visible/selected ids to `onDataSync`, which the view forwards to the style
 * chart. A mode change shows and hides columns rather than recreating the table.
 */

import { BaseClassTableModule } from '../../../common/tables/baseClassTableModule.js';
import { withDomainMode } from './enWithDomainMode.js';
import { EN_TERMS } from '../../enTerms.js';
import { DATA_SYNC_ACTIONS } from './enDataSyncActions.js';
import { retainNamedColumns } from '../../../common/tables/tableDataUtils.js';
import { getTraitsAsText } from '../../../common/tables/traitUtils.js';
import { createGerLevelHtml } from '../../../common/domain/levels.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import {
    createColumnDef,
    createStudentIdLinkColumn,
    createTraitsColumn,
} from '../../../common/tables/columnFactories.js';
import { createDistributionDownloadColumns } from '../../../common/tables/tableExport.js';
import { LABELS } from '../../../common/tables/tableLabels.js';
import { createProgressBarColumn } from '../../../common/tables/progressBarColumn.js';
import { setupProgressBarSorting } from '../../../common/tables/progressBarSorting.js';
import { Preset } from '../../../common/tables/preset.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';
import { ensureHeaderActionButtonControl } from '@tba3/module-base/modules/header/headerActionDropdown.js';
import {
    deriveDomainResultFields,
    shouldShowColumnForMode,
    buildStyleFieldUpdate,
} from './enDomainModeRules.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';

/**
 * Header-action selector of the scatterplot-search button. Exported so the
 * class view can anchor its tour step to the button without repeating the id.
 */
export const SCATTER_SEARCH_BUTTON_SELECTOR = '[data-header-action-button="scatter-search"]';

/**
 * The part of the EN dataset configuration the class table reads (tba3 passes its `EnConfig`).
 * @typedef {object} EnClassTableConfig
 * @property {string[]} domainIds - The two domain ids, in display order.
 * @property {string[]} domainLabels - The two domain labels, in display order.
 * @property {Array<{value: string, fieldName: string, label: string}>} styleCategories - The Aufgabenniveau categories and the record field each is stored under.
 * @property {(domainId: string) => string} domainFieldPrefix - The student-record field prefix of one domain.
 * @property {(domainId: string, suffix: string) => string|null} fieldName - The student-record column for one domain and field.
 * @property {() => void} assertExactlyTwoDomains - Throws unless the dataset has exactly two domains.
 */

/**
 * EnClassTableModule - Reusable class table component for EN
 * Encapsulates the class overview table with filtering and export
 * @augments BaseClassTableModule
 */
export class EnClassTableModule extends withDomainMode(BaseClassTableModule) {
    /** @type {number|null} */
    #filterSyncTimer = null; // Debounce timer for filter → chart sync

    /** @type {EnClassTableConfig} */
    #enConfig;

    // Scatterplot-driven student filter (persistent across preset resets and
    // table re-renders; the parent view confirms a selection in the modal).
    /** @type {((rowData: any) => boolean)|null} */
    #externalStudentFilterFunction = null;
    /** @type {Set<string>|null} */
    #externalStudentFilterIds = null;

    /**
     * Creates a new EnClassTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        options.enConfig.assertExactlyTwoDomains();
        super(id, container, options);
        this.#enConfig = options.enConfig;

        this.setDefaults({
            enableModuleExport: true,
        });

        // Header action button that opens the scatterplot student-search modal
        // (wired by the parent view, which owns the modal lifecycle).
        if (typeof options.onOpenScatterSearch === 'function') {
            this.registerCallback('openScatterSearch', options.onOpenScatterSearch);
        }

        // Notify the parent view when a full table reset clears the scatterplot
        // filter, so it can reset its own selection state.
        if (typeof options.onScatterFilterReset === 'function') {
            this.registerCallback('scatterFilterReset', options.onScatterFilterReset);
        }

        // Visible/selected ids for the style chart the view pairs this table with.
        if (typeof options.onDataSync === 'function') {
            this.registerCallback('dataSync', options.onDataSync);
        }

        // A click on a student id link; the view selects the student and navigates.
        if (typeof options.onStudentSelected === 'function') {
            this.registerCallback('studentSelected', options.onStudentSelected);
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

    /** @override */
    _getTraitsAsTextFn() {
        return getTraitsAsText;
    }

    /**
     * Transform data: separate domain values + retainNamedColumns, then
     * refresh the view's studentStore with the rows handed to the table so
     * the chart sync can carry ids only.
     * @override
     */
    _preprocessData(studentArray) {
        const rows = this.#transformStudentData(studentArray);
        this.getOption('studentStore').setAll(rows);
        return rows;
    }

    /**
     * Build all column definitions for EN class table.
     * @override
     */
    _getColumns({ genderFilterParams, traitFilterParams }) {
        // Define columns - using HTML strings and built-in formatters for performance
        const baseColumns = [
            createStudentIdLinkColumn(EN_TERMS.STUDENT_ID, 'studentId', {
                onClick: ({ value }) => this.triggerCallback('studentSelected', value),
            }),
            createColumnDef(EN_TERMS.LASTNAME, 'lastName', {
                headerFilter: 'input',
                widthGrow: COLUMN_GROW_RATIOS.name,
                tableMeta: {
                    skipHeaderGlossaryAnnotation: true,
                    skipCellGlossaryAnnotation: true,
                },
                formatter: 'plaintext',
            }),
            createColumnDef(EN_TERMS.FIRSTNAME, 'firstName', {
                headerFilter: 'input',
                widthGrow: COLUMN_GROW_RATIOS.name,
                tableMeta: {
                    skipHeaderGlossaryAnnotation: true,
                    skipCellGlossaryAnnotation: true,
                },
                formatter: 'plaintext',
            }),
            createColumnDef(EN_TERMS.GENDER, 'gender', {
                headerFilter: 'list',
                headerFilterParams: genderFilterParams,
                hozAlign: 'center',
                widthGrow: COLUMN_GROW_RATIOS.gender,
                formatter: 'plaintext',
            }),
        ];

        // Single Merkmale column shared with MA (filter/sort on cache-backed trait text).
        baseColumns.push(
            createTraitsColumn(EN_TERMS.TRAITS, { headerFilterParams: traitFilterParams }),
        );

        // Percent formatter shared by hidden style columns
        const percentFormatter = function (cell) {
            const value = cell.getValue();
            return typeof value === 'number' ? `${value.toFixed(1)}%` : 'N/A';
        };

        // Add domain-separated results and GER columns
        // Using shared progress bar formatter with per-domain field prefixes
        baseColumns.push(
            createProgressBarColumn(
                { fieldPrefix: 'd0', showCounts: true },
                `${this.#enConfig.domainLabels[0]} – ${LABELS.VERTEILUNG}: ${LABELS.RICHTIG} | ${LABELS.UNBEARBEITET} | ${LABELS.FALSCH}`,
                'd0Percentages',
                { tableMeta: { skipCellGlossaryAnnotation: true } },
            ),
            ...createDistributionDownloadColumns({
                follows: 'd0Percentages',
                fieldPrefix: 'd0',
                titlePrefix: `${this.#enConfig.domainLabels[0]} – `,
            }),
            createColumnDef(
                `${EN_TERMS.GER_PREFIX} ${this.#enConfig.domainLabels[0]}`,
                'd0GerHtml',
                {
                    formatter: 'html',
                    hozAlign: 'center',
                    widthGrow: COLUMN_GROW_RATIOS.level,
                    // The field holds pre-baked markup; the download takes the plain level.
                    accessorDownload: (_value, data) => data.d0Ger ?? '',
                    tableMeta: { skipCellGlossaryAnnotation: true },
                },
            ),
            createProgressBarColumn(
                { fieldPrefix: 'd1', showCounts: true },
                `${this.#enConfig.domainLabels[1]} – ${LABELS.VERTEILUNG}: ${LABELS.RICHTIG} | ${LABELS.UNBEARBEITET} | ${LABELS.FALSCH}`,
                'd1Percentages',
                { tableMeta: { skipCellGlossaryAnnotation: true } },
            ),
            ...createDistributionDownloadColumns({
                follows: 'd1Percentages',
                fieldPrefix: 'd1',
                titlePrefix: `${this.#enConfig.domainLabels[1]} – `,
            }),
            createColumnDef(
                `${EN_TERMS.GER_PREFIX} ${this.#enConfig.domainLabels[1]}`,
                'd1GerHtml',
                {
                    formatter: 'html',
                    hozAlign: 'center',
                    widthGrow: COLUMN_GROW_RATIOS.level,
                    // The field holds pre-baked markup; the download takes the plain level.
                    accessorDownload: (_value, data) => data.d1Ger ?? '',
                    tableMeta: { skipCellGlossaryAnnotation: true },
                },
            ),
            ...this.#enConfig.styleCategories.map((cat) =>
                createColumnDef(cat.label, cat.fieldName, {
                    hozAlign: 'center',
                    widthGrow: COLUMN_GROW_RATIOS.percentage,
                    visible: false,
                    formatter: percentFormatter,
                    tableMeta: { skipCellGlossaryAnnotation: true },
                }),
            ),
            // Hidden sort-target columns for presets (Tabulator requires a column
            // definition to resolve setSort — data fields alone are not enough).
            createColumnDef('d0SummedResult', 'd0SummedResult', {
                visible: false,
                sorter: 'number',
                tableMeta: { excludeFromColumnVisibilityMenu: true },
            }),
            createColumnDef('d1SummedResult', 'd1SummedResult', {
                visible: false,
                sorter: 'number',
                tableMeta: { excludeFromColumnVisibilityMenu: true },
            }),
            createColumnDef('avgSummedResult', 'avgSummedResult', {
                visible: false,
                sorter: 'number',
                tableMeta: { excludeFromColumnVisibilityMenu: true },
            }),
        );

        return baseColumns;
    }

    /** @override */
    _getTableOptions() {
        return {
            index: 'studentId',
            selectableRows: true,
            selectableRowsPersistence: false,
        };
    }

    /**
     * Add the scatterplot search button before the standard table-local
     * header controls (column visibility).
     * @override
     */
    _createHeaderToolbarButtons() {
        this.#createScatterSearchButton();
        super._createHeaderToolbarButtons();
    }

    /**
     * Apply the scatterplot's confirmed student filter without replacing
     * table data. A persistent programmatic filter on `studentId`.
     * @param {Iterable<string>|null} studentIds - Student IDs to keep visible
     */
    applyExternalStudentFilter(studentIds) {
        const nextIds = new Set(studentIds || []);
        if (nextIds.size === 0) {
            this.clearExternalStudentFilter();
            return;
        }

        this.#externalStudentFilterIds = nextIds;
        this.#syncExternalStudentFilter();
    }

    /** Clear the scatterplot-driven student filter. */
    clearExternalStudentFilter() {
        if (
            this.table &&
            this.#externalStudentFilterFunction &&
            typeof this.table.removeFilter === 'function'
        ) {
            this.table.removeFilter(this.#externalStudentFilterFunction);
        }

        this.#externalStudentFilterFunction = null;
        this.#externalStudentFilterIds = null;
    }

    /**
     * The scatterplot filter must survive preset resets.
     * @override
     */
    _getPersistentFilters() {
        return this.#externalStudentFilterFunction ? [this.#externalStudentFilterFunction] : [];
    }

    /**
     * (Re)attach the scatterplot filter to the current table. Called on apply
     * and after each table (re)creation, so the filter survives re-renders.
     */
    #syncExternalStudentFilter() {
        if (!this.table) return;

        if (this.#externalStudentFilterFunction && typeof this.table.removeFilter === 'function') {
            this.table.removeFilter(this.#externalStudentFilterFunction);
            this.#externalStudentFilterFunction = null;
        }

        if (!this.#externalStudentFilterIds || this.#externalStudentFilterIds.size === 0) {
            return;
        }

        const activeIds = new Set(this.#externalStudentFilterIds);
        this.#externalStudentFilterFunction = (rowData) => activeIds.has(rowData.studentId);
        this.table.addFilter(this.#externalStudentFilterFunction);
    }

    /**
     * On a full table reset (Reset button), also clear the scatterplot filter
     * and notify the parent view so its selection state resets in lock-step.
     * @override
     */
    _onTableReset() {
        this.clearExternalStudentFilter();
        this.triggerCallback('scatterFilterReset');
    }

    /**
     * Presets for EN class table.
     * @override
     */
    _getPresets() {
        const sortColumn = this.#getSortColumnForMode(this._state.mode);
        const tooltipBasePath = 'en.class.class-table.interface';

        return [
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.best-five.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.best-five.tooltip`,
                ),
                sort: [{ column: sortColumn, dir: 'desc' }],
                limit: 5,
            }),
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.worst-five.label`,
                ),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.worst-five.tooltip`,
                ),
                sort: [{ column: sortColumn, dir: 'asc' }],
                limit: 5,
            }),
        ];
    }

    /**
     * Map domain mode to the appropriate sort column for presets.
     * @param {string} mode - 'all', or a domain.id (e.g. 'ho', 'le')
     * @returns {string} Field name to sort by
     */
    #getSortColumnForMode(mode) {
        const [d0, d1] = this.#enConfig.domainIds;
        if (mode === d0) return 'd0SummedResult';
        if (mode === d1) return 'd1SummedResult';
        return 'avgSummedResult';
    }

    /**
     * Header toolbar button that opens the scatterplot modal for visual
     * student search/selection. The parent view owns the modal and receives
     * the click via the registered 'openScatterSearch' callback.
     */
    #createScatterSearchButton() {
        const headerActions = this.headerActionsContainer;
        if (!headerActions) return;

        const tooltip = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.scatter-search.tooltip',
        );

        ensureHeaderActionButtonControl(headerActions, {
            selector: SCATTER_SEARCH_BUTTON_SELECTOR,
            buttonAttributes: { 'data-header-action-button': 'scatter-search' },
            ariaLabel: tooltip,
            tooltipText: tooltip,
            syncButton: (button) => {
                button.innerHTML = iconSvg('filter_alt');
            },
            onClick: () => this.triggerCallback('openScatterSearch'),
        });
    }

    /**
     * Sync the chart on selection change.
     * @override
     */
    _onSelectionChanged(_selectedData) {
        this.#syncChart(DATA_SYNC_ACTIONS.SELECT);
    }

    /**
     * Sync the chart on filter change (debounced to avoid chart rebuilds per keystroke).
     * @override
     */
    _onDataFiltered(_filteredStudents, _filters) {
        if (this.isTableEventSuppressed('dataFiltered')) return;
        if (this.#filterSyncTimer) clearTimeout(this.#filterSyncTimer);
        this.#filterSyncTimer = this.resources.trackTimeout(() => {
            this.#filterSyncTimer = null;
            this.#syncChart(DATA_SYNC_ACTIONS.FILTER);
        }, 150);
    }

    /**
     * Post-creation: dataSorted handler, progress-bar sorting.
     * @override
     */
    _onAfterTableCreated() {
        const table = this.table;
        if (!table) return;

        // Re-attach the scatterplot filter to the freshly created table (a
        // no-op while none is active). dataFiltered is guarded by
        // isInitialBuild, so this cannot fire a premature sync.
        this.#syncExternalStudentFilter();
        // Handle data sorting - update chart to mirror sort order
        table.on('dataSorted', (_sorters, _rows) => {
            if (this.isInitialBuild || this.isTableEventSuppressed('dataSorted')) return;
            // Only update if we have no selection (selection takes priority)
            if (this._selectedStudents && this._selectedStudents.length > 0) {
                return;
            }

            this.#syncChart(DATA_SYNC_ACTIONS.SORT);
        });

        // Initial sync and mode application are deferred to _onTableReady()
        // because Tabulator 6 initializes asynchronously — getRows() / getColumns()
        // return empty before tableBuilt fires.

        // Setup progress bar sorting for both domain columns
        setupProgressBarSorting(table, 'd0Percentages', { fieldPrefix: 'd0' });
        setupProgressBarSorting(table, 'd1Percentages', { fieldPrefix: 'd1' });
    }

    /**
     * then floor this module's own container height so the neighboring style
     * lollipop chart's min-height (which can claim space from this table's grid
     * row) can never squeeze the table down to near-invisible.
     * @override
     */
    _onTableReady() {
        super._onTableReady(); // mixin: _applyModeChange → #syncChart(FILTER)
        this.#applyTableMinHeight();
    }

    // _onTableReady is otherwise handled by the withTableModeState mixin, which
    // calls _applyModeChange → #syncChart(FILTER), covering both
    // domain-column visibility AND the initial sync for the chart.

    /**
     * Apply a minimum height to this module's own container (the `.table-section`
     * grid item), based on the actually-rendered header + row heights, so the
     * neighboring style lollipop chart's own min-height can never squeeze this
     * table below a usable handful of rows. Computed once at initial ready —
     * row height doesn't change per row, and the floor deliberately doesn't
     * track the full (possibly filtered) roster.
     */
    #applyTableMinHeight() {
        if (!this.container) return;
        const moduleHeaderHeight =
            this.container.querySelector('.content-module-header')?.getBoundingClientRect()
                .height ?? 0;
        const tableHeaderHeight =
            this.container.querySelector('.tabulator-header')?.getBoundingClientRect().height ?? 0;
        const rowHeight =
            this.container.querySelector('.tabulator-row')?.getBoundingClientRect().height ?? 0;
        if (rowHeight === 0) return;

        // Match the "Stärkste 5" / "Schwächste 5" presets above — enough rows to stay usable, not the full roster.
        const MIN_VISIBLE_ROWS = 5;
        const visibleRows = Math.min(
            MIN_VISIBLE_ROWS,
            this.table?.getRows('active')?.length ?? MIN_VISIBLE_ROWS,
        );
        const minHeight = moduleHeaderHeight + tableHeaderHeight + visibleRows * rowHeight;
        this.container.style.minHeight = `${Math.ceil(minHeight)}px`;
    }

    // ========================================================================
    // DATA SYNC (table → chart, via the view's onDataSync callback)
    // ========================================================================

    /**
     * Hand the current id lists to the paired chart.
     * @param {string} action - DATA_SYNC_ACTIONS value (FILTER, SELECT, or SORT)
     */
    #syncChart(action) {
        const table = this.table;
        if (!table) return;
        // Ordered id arrays instead of full row objects; the chart resolves them
        // through the shared studentStore. visibleIds = current display/sort order.
        const visibleRows = table.getRows('active').map((row) => row.getData());
        const visibleIds = visibleRows.map((r) => r.studentId);

        // selectedIds: only set when this is a selection action with rows selected
        const selectedStudents = this._selectedStudents;
        const selectedIds =
            action === DATA_SYNC_ACTIONS.SELECT && selectedStudents && selectedStudents.length > 0
                ? selectedStudents.map((r) => r.studentId)
                : undefined;

        this.triggerCallback('dataSync', {
            visibleIds,
            selectedIds,
            mode: this._state.mode,
        });
    }

    /**
     * Transform student array data for table display
     * @param {Array} studentArray - Student array to transform
     * @returns {Array} Transformed student array with calculated fields
     */
    #transformStudentData(studentArray) {
        const [d0, d1] = this.#enConfig.domainIds;
        const d0Prefix = this.#enConfig.domainFieldPrefix(d0);
        const d1Prefix = this.#enConfig.domainFieldPrefix(d1);

        // Hoist style-category-derived constants out of the per-student map.
        // Categories are derived once from data and never change at runtime.
        const styleFieldNames = this.#enConfig.styleCategories.map((c) => c.fieldName);
        const styleDefaults = Object.fromEntries(styleFieldNames.map((f) => [f, null]));

        const transformedStudentArray = studentArray.map((student) => {
            const d1Summed = student[this.#enConfig.fieldName(d1, 'SummedResult') ?? ''] || 0;
            const d0Summed = student[this.#enConfig.fieldName(d0, 'SummedResult') ?? ''] || 0;
            const avgSummed = (d0Summed + d1Summed) / 2;
            const d1Percentage = student[this.#enConfig.fieldName(d1, 'Percentage') ?? ''] || '0%';
            const d0Percentage = student[this.#enConfig.fieldName(d0, 'Percentage') ?? ''] || '0%';
            const d1Ger = student[this.#enConfig.fieldName(d1, 'CompLevel') ?? ''] || 'N/A';
            const d0Ger = student[this.#enConfig.fieldName(d0, 'CompLevel') ?? ''] || 'N/A';

            // Result counts from the adapter records, keyed by what they count (prefix = domain.id)
            const d1ResultCounts = student[`${d1Prefix}ResultCounts`];
            const d0ResultCounts = student[`${d0Prefix}ResultCounts`];

            const d0GerLevel = d0Ger || 'N/A';
            const d1GerLevel = d1Ger || 'N/A';
            const d1GerHtml = createGerLevelHtml(d1GerLevel);
            const d0GerHtml = createGerLevelHtml(d0GerLevel);

            // Style percentages from the adapter records. A student without a row in a
            // domain has none, and the style cells show "N/A" rather than 0 %.
            const styleDataDomain0 = student[d0] ?? {};
            const styleDataDomain1 = student[d1] ?? {};

            return {
                ...student,
                d1SummedResult: d1Summed,
                d0SummedResult: d0Summed,
                avgSummedResult: avgSummed,
                d1Percentage: d1Percentage,
                d0Percentage: d0Percentage,
                d1Ger: d1Ger,
                d0Ger: d0Ger,
                // Per-domain percentage/count fields for the progress bar formatter
                ...deriveDomainResultFields('d0', d0ResultCounts),
                ...deriveDomainResultFields('d1', d1ResultCounts),
                // GER level HTML
                d1GerHtml,
                d0GerHtml,
                // Domain-specific style percentages (nested objects from adapter)
                [d0]: styleDataDomain0,
                [d1]: styleDataDomain1,
                // Display fields (will be updated based on current mode)
                ...styleDefaults,
            };
        });

        // Retain only needed columns
        return retainNamedColumns(transformedStudentArray, [
            'studentId',
            'lastName',
            'firstName',
            'gender',
            'traits',
            'd1SummedResult',
            'd0SummedResult',
            'avgSummedResult',
            'd1Percentage',
            'd0Percentage',
            'd1Ger',
            'd0Ger',
            'd0PercentageCorrect',
            'd0PercentageIncorrect',
            'd0PercentageNotAttempted',
            'd0CorrectCount',
            'd0IncorrectCount',
            'd0NotAttemptedCount',
            'd1PercentageCorrect',
            'd1PercentageIncorrect',
            'd1PercentageNotAttempted',
            'd1CorrectCount',
            'd1IncorrectCount',
            'd1NotAttemptedCount',
            'd1GerHtml',
            'd0GerHtml',
            ...this.#enConfig.domainIds,
            ...styleFieldNames,
        ]);
    }

    // ========================================================================
    // EXPORT FUNCTIONALITY
    // ========================================================================

    /**
     * Apply mode change to show/hide columns (optimized update - no table destruction)
     * @param {string} mode - The mode to apply
     */
    _applyModeChange(mode) {
        const table = this.table;
        if (!table) return;

        this.withSuppressedTableEvents(
            ['rowSelectionChanged', 'dataFiltered', 'dataSorted'],
            () => {
                // Update style percentage display fields based on selected domain FIRST
                // so the lollipop chart update uses the correct values.
                // Uses bulk updateData() instead of per-row row.update() to avoid
                // triggering Tabulator's internal formatting/sorting for each row.
                if (mode !== 'all') {
                    const cats = this.#enConfig.styleCategories;
                    const updates = table.getRows().map((row) => {
                        const data = row.getData();
                        return {
                            studentId: data.studentId,
                            ...buildStyleFieldUpdate(data[mode], cats),
                        };
                    });
                    table.updateData(updates);
                }

                // Clear any active row selection — domain switching should reset the
                // lollipop to show all students, matching the item view behaviour.
                // rowSelectionChanged is suppressed above, so no duplicate sync fires.
                table.deselectRow();
                this._selectedStudents = null;

                // Update chart with current data and new mode (after style values are updated)
                this.#syncChart(DATA_SYNC_ACTIONS.FILTER);

                // Get all columns
                const columns = table.getColumns();

                const styleFields = new Set(this.#enConfig.styleCategories.map((c) => c.fieldName));

                this._applyColumnVisibilityChanges(columns, (column) => {
                    const field = column.getField();

                    // Menu-excluded columns are never shown: the hidden sort targets
                    // (they exist only for setSort) and the export-only columns.
                    // shouldShowColumnForMode() would otherwise reveal them in 'all'
                    // mode, which returns true for any field it does not know.
                    if (this._isColumnVisibilityLocked(field)) {
                        return false;
                    }

                    return shouldShowColumnForMode(
                        field,
                        mode,
                        this.#enConfig.domainIds,
                        styleFields,
                    );
                });

                // Update presets to sort by the correct domain column for the new mode
                this._updatePresets(this._getPresets());
            },
            { release: 'timeout' },
        );
    }
}
