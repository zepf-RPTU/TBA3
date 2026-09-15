/**
 * TableModule - Base class for table-based modules: it wraps a Tabulator table in a
 * ContentModule card and owns the presets, the filter and column-visibility dropdowns,
 * the reactive state, the suppression of Tabulator events during programmatic changes
 * and the settle promise the view's skeleton waits on. Concrete tables extend one of
 * the Base*TableModule classes or SlBaseTableModule, never this one directly.
 */

import { ContentModule } from '@tba3/module-base/modules/contentModule.js';
import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';
import { createTitleFormatter } from './glossaryFormatters.js';
import {
    updateProgressBarHeaderHighlight,
    isProgressBarColumnField,
} from './progressBarSorting.js';
import { TablePresetManager } from './internal/tablePresetManager.js';
import { TableEventSuppressor } from './internal/tableEventSuppressor.js';
import { VisibilityDeferralQueue } from './internal/visibilityDeferralQueue.js';
import { TableRedrawScheduler } from './internal/tableRedrawScheduler.js';
import {
    createColumnVisibilityMenu,
    COLUMN_VISIBILITY_CONTROL_SELECTOR,
} from './internal/columnVisibilityMenu.js';
import {
    createTableFilterMenu,
    syncTableFilterMenuButton,
    TABLE_FILTER_CONTROL_SELECTOR,
} from './internal/tableFilterMenu.js';
import { TableFilterController } from './internal/tableFilterController.js';
import { TableHeaderGeometry } from './internal/tableHeaderGeometry.js';
import { processColumnDefinitions } from './internal/columnDefinitionProcessor.js';
import {
    applyBodyAria,
    applyColumnGroupAria,
    applyGroupRowAria,
    applyHeaderAria,
} from './internal/tabulatorAria.js';
import { applyTableIcons } from './internal/tabulatorIcons.js';
import { applyReactiveState } from '@tba3/module-base/utils/reactiveStateMixin.js';
import { Tabulator } from './tabulatorBuild.js';

class TableModule extends ContentModule {
    /** @type {Tabulator | null} */
    #table;
    /**
     * Every table whose `tableBuilt` has fired. Kept per table rather than as one
     * flag for `#table`: a multi-table module (see SlBaseTableModule) needs the
     * answer for each of its tables, and a re-render's new table must not inherit
     * the previous one's state — a WeakSet gives both for free.
     * @type {WeakSet<Tabulator>}
     */
    #builtTables = new WeakSet();
    #presetManager;
    #isInitialBuild; // True during createTable() until tableBuilt + redraw completes
    #pendingSettles; // Set of {promise, resolve} for each build not yet settled (see whenSettled)
    #visibilityQueue; // Queue for operations deferred until container is visible
    #redrawScheduler; // Owns the settle-then-redraw machinery + overlap guard
    #eventSuppression;
    #columnVisibilityExcludedFields;
    #tableFilters; // Owns the filter-menu descriptors/values and their Tabulator filter
    // Container width the last show() redraw laid the columns out at (-1 = never
    // shown). Lets a revisit at the same width skip the forced redraw. See show().
    #lastShownWidth = -1;
    /**
     * Header-derived column floors and the post-resize header realign, per table
     * (see TableHeaderGeometry). Also the module's only registry of live tables —
     * the base class's `#table` is just the most recently created one (see
     * SlBaseTableModule).
     * @type {TableHeaderGeometry}
     */
    #headerGeometry;

    // Late-bound members installed by applyReactiveState (see reactiveStateMixin).
    // Declared so checkJs recognizes them on the base type and in table mixins;
    // types come from the mixin's ReactiveStateHost (single source of truth).
    /** @type {import('@tba3/module-base/utils/reactiveStateMixin.js').ReactiveStateHost['_state']} */
    _state;
    /** @type {import('@tba3/module-base/utils/reactiveStateMixin.js').ReactiveStateHost['setState']} */
    setState;
    /** @type {import('@tba3/module-base/utils/reactiveStateMixin.js').ReactiveStateHost['getState']} */
    getState;

    /**
     * Creates a new TableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement|null} [container] - Container element or selector
     * @param {object} [options={}] - Configuration options
     */
    constructor(id, container = null, options = {}) {
        super(id, container, options);
        this.#table = null;
        this.#presetManager = new TablePresetManager();
        this.#isInitialBuild = false;
        // No table yet, so nothing to wait for until createTable() runs.
        this.#pendingSettles = new Set();
        this.#visibilityQueue = new VisibilityDeferralQueue({
            isVisible: () => this.#isContainerVisible(),
            // Run drained ops synchronously: flush() is only called from show(),
            // where the container is already visible, and running them before the
            // next paint is what lets show()'s redraw land in the same frame as
            // the deferred content change (see show()). Deferring them a frame —
            // as this used to (rAF + 50ms) — painted the table once with stale
            // content and snapped it two frames later.
            scheduleFlush: (runDrained) => {
                if (this.destroyed) return;
                runDrained();
            },
            onError: (error) => {
                console.error(`TableModule[${this.id}]: Error executing pending operation:`, error);
            },
        });
        this.#redrawScheduler = new TableRedrawScheduler({
            getTable: () => this.#table,
            isBuilt: () => this._isTableBuilt(this.#table),
            isDestroyed: () => this.destroyed,
            getContainer: () => this.container,
            scheduleFrame: (cb) => this.resources.trackAnimationFrame(cb),
        });
        this.#eventSuppression = new TableEventSuppressor((release) =>
            this.resources.trackTimeout(release, 0),
        );
        this.#columnVisibilityExcludedFields = new Set();
        this.#tableFilters = new TableFilterController({ getTable: () => this.#table });
        this.#headerGeometry = new TableHeaderGeometry({
            resizeService: this.resizeService,
            scopeId: this.id,
        });

        // Track presetManager for automatic teardown on destroy
        this.resources.trackDisposable(this.#presetManager);

        // Reactive state - subclasses add keys after super() + setDefaults():
        //   Object.assign(this._state, { vizMode: VIZ_MODES.STACKED_BAR });
        applyReactiveState(this);
    }

    /**
     * Recolor on a KS color-theme switch: force a redraw so cell formatters
     * re-run against the now-refreshed color cache. Refreshes tables whose KS
     * colors are resolved per render (see classTableModule / domainTableModule);
     * harmless no-op for tables without themed cells.
     * @override
     */
    onThemeChanged() {
        this.redraw();
        super.onThemeChanged();
    }

    /**
     * Default assignId to true for all table modules.
     * @override
     */
    validateContainer({ assignId = true } = {}) {
        return super.validateContainer({ assignId });
    }

    /**
     * The header actions container for toolbar buttons (column visibility and
     * other table-local controls).
     * When the `externalHeaderActionsContainer` option is set (e.g. by a parent
     * wrapper module), returns that external element instead of the module's own
     * header-actions element. This allows child tables to render their toolbar
     * buttons in a parent module's title bar.
     * @override
     * @returns {HTMLElement|null} The external container when one was supplied, otherwise the module's own header-actions element.
     */
    get headerActionsContainer() {
        return this.getOption('externalHeaderActionsContainer') || super.headerActionsContainer;
    }

    get table() {
        return this.#table;
    }

    /**
     * Whether the table is currently in initial build phase
     * Use this to suppress event publishing during table creation
     * @returns {boolean} True if createTable() is in progress and tableBuilt hasn't completed
     * @protected
     */
    get isInitialBuild() {
        return this.#isInitialBuild;
    }

    set table(value) {
        this.#table = value;
    }

    /**
     * Whether `table`'s `tableBuilt` has fired. Answers for any table this module
     * created, not just the current one — a multi-table module asks this before
     * redrawing each of its tables (see SlBaseTableModule#_applyVizModeChange).
     * @param {Tabulator|null|undefined} table - Any table this module created; a nullish value answers false.
     * @returns {boolean} True once `tableBuilt` has fired for that table.
     * @protected
     */
    _isTableBuilt(table) {
        return !!table && this.#builtTables.has(table);
    }

    /**
     * Whether a given Tabulator event is currently suppressed.
     * @protected
     * @param {string} eventName - Tabulator event name (e.g. 'dataFiltered')
     * @returns {boolean} True while a `withSuppressedTableEvents` call is holding that event.
     */
    isTableEventSuppressed(eventName) {
        return this.#eventSuppression.isSuppressed(eventName);
    }

    /**
     * Execute an operation while temporarily suppressing one or more Tabulator events.
     * Use `release: 'timeout'` for operations whose follow-up events can fire on the next task.
     * @protected
     * @param {string|string[]} eventNames - Event name or names to suppress
     * @param {Function} operation - Operation to execute while suppressed
     * @param {object} [options] - When to release the suppression.
     * @param {'sync'|'timeout'} [options.release='sync'] - When to release suppression
     */
    withSuppressedTableEvents(eventNames, operation, options = {}) {
        this.#eventSuppression.withSuppressed(eventNames, operation, options);
    }

    /**
     * Shared helper for rowClick handlers on dataTree tables.
     * Returns true when the row was treated as a tree-toggle row.
     * @protected
     * @param {object} row - Tabulator row component
     * @param {object} [options] - What to do when the click lands on a leaf row.
     * @param {Function} [options.onLeafClick] - (rowData, row) => void
     * @returns {boolean} True when the row was treated as a tree-toggle row, so the caller should not also select it.
     */
    handleTreeToggleRowClick(row, { onLeafClick } = {}) {
        const rowData = row.getData();
        if (rowData?.isTaskRow) {
            this.withSuppressedTableEvents(
                ['rowSelectionChanged', 'dataFiltered', 'dataSorted'],
                () => {
                    row.treeToggle();
                },
                { release: 'timeout' },
            );
            return true;
        }

        onLeafClick?.(rowData, row);
        return false;
    }

    /**
     * Apply a temporary CSS class to an element for lightweight click or toggle animations.
     * @protected
     * @param {HTMLElement|null} element - Target element
     * @param {string} className - Class to add temporarily
     * @param {number} [duration=150] - Duration in ms before removal
     */
    animateTemporaryElementClass(element, className, duration = 150) {
        if (!element) return;

        element.classList.add(className);
        this.resources.trackTimeout(() => {
            element.classList?.remove(className);
        }, duration);
    }

    // ========================================================================
    // REACTIVE STATE MANAGEMENT
    // Uses shared reactiveStateMixin (applyReactiveState).
    // Tables override _onStateChanged() for optimized updates (e.g., redraw
    // instead of full recreation, column show/hide for mode changes).
    // ========================================================================

    // setState() and getState() are provided by applyReactiveState() mixin.
    // See @tba3/module-base/utils/reactiveStateMixin.js

    /**
     * React to state changes. Override in subclasses for optimized updates.
     * Default implementation triggers a table redraw.
     *
     * Example override for optimized vizMode switching:
     * ```javascript
     * _onStateChanged(changedKeys, prevState) {
     *     if (changedKeys.includes('vizMode') && changedKeys.length === 1) {
     *         this.redraw(); // Formatters read _state.vizMode dynamically
     *         return;
     *     }
     *     super._onStateChanged(changedKeys, prevState);
     * }
     * ```
     * @param {string[]} changedKeys - Keys that changed
     * @param {object} prevState - Previous state snapshot
     */
    // eslint-disable-next-line no-unused-vars
    _onStateChanged(changedKeys, prevState) {
        this.redraw();
    }

    /**
     * Called once after the table is fully built and the initial redraw completes.
     * At this point getRows() returns data and all columns are rendered.
     * Override in subclasses to fire the initial chart sync or perform
     * other actions that depend on a fully-ready table.
     * @protected
     */
    _onTableReady() {
        // Default no-op. Subclasses override to publish initial sync, etc.
    }

    /**
     * Called when the Reset button performs a full table reset.
     * Override in subclasses to clear external state that was applied to
     * the table (e.g. chart-driven header filters, domain filters).
     * @protected
     */
    _onTableReset() {
        // Default no-op. Subclasses override to clear external state.
    }

    /**
     * Returns an array of filter functions that must survive preset resets
     * and preset switches (e.g. domain filters controlled at the app level).
     * Override in subclasses that use persistent programmatic filters.
     *
     * Note: the filter-menu values are persisted separately (see
     * #getPersistentFilters) — subclasses do not need to include them here.
     * @returns {Array<Function>} Filter functions to re-apply after clearFilter()
     * @protected
     */
    _getPersistentFilters() {
        return [];
    }

    // ========================================================================
    // TABLE FILTER FACADE
    // Columns declare `headerFilter*` options as before, but nothing renders a
    // Tabulator header filter any more: the definitions are extracted into
    // descriptors (see tables/tableFilterMetadata.js), driven by the header
    // filter menu, and applied as one programmatic filter. All filter reads and
    // writes — including the preset manager's — go through here.
    // ========================================================================

    /**
     * Set one filter field and re-filter the table. Fields that no column in the
     * current set declares are ignored.
     * @param {string} field - Column field to set; ignored when no column in the current set declares it.
     * @param {any} value - Empty string clears the field
     * @protected
     */
    _setTableFilterValue(field, value) {
        if (!this.#tableFilters.setValue(field, value)) return;
        this.#tableFilters.apply();
        this.#syncTableFilterButton();
    }

    /**
     * Filter functions to re-apply after the preset manager clears the table's
     * programmatic filters: the filter menu's own filter first, then whatever
     * the subclass keeps persistent.
     * @returns {Array<Function>} The filter menu's own filter first, then the subclass's persistent ones, in the order they must be re-applied.
     */
    #getPersistentFilters() {
        return [...this.#tableFilters.persistentFilters, ...this._getPersistentFilters()];
    }

    /**
     * Re-attach every filter that must outlive a `clearFilter()` — the filter
     * menu's own filter and the subclass's app-level ones — without duplicating
     * the ones Tabulator still holds. Used after a data swap whose `beforeReplace`
     * may or may not have cleared the table's filters.
     */
    #reattachPersistentFilters() {
        const table = this.#table;
        if (!table || typeof table.addFilter !== 'function') return;

        const attached = new Set((table.getFilters?.() ?? []).map((filter) => filter?.field));
        for (const filterFunction of this.#getPersistentFilters()) {
            if (!attached.has(filterFunction)) table.addFilter(filterFunction);
        }
    }

    /**
     * Drop the filter-menu values as part of the preset Reset. Called before the
     * persistent filters are re-applied, so the re-attached filter matches
     * everything; the table itself is re-filtered by the preset manager.
     */
    #clearTableFiltersOnReset() {
        this.#tableFilters.clearValues();
        this.#syncTableFilterButton();
    }

    /** Reflect the active filter count on the toolbar button. */
    #syncTableFilterButton() {
        syncTableFilterMenuButton(this.headerActionsContainer, this.#tableFilters.activeCount);
    }

    /**
     * Replaces preset configurations at runtime and re-applies the active
     * preset if one was selected. Use when preset sort/filter logic depends
     * on dynamic state (e.g. domain mode).
     * @param {Array<object>} newPresets - New Preset instances
     * @protected
     */
    _updatePresets(newPresets) {
        if (this.#presetManager && this.#table) {
            this.#presetManager.updatePresets(newPresets, this.#table);
        }
    }

    /**
     * Resets the active preset tracking and removes the active visual state
     * from all preset buttons. Call when the table is cleared (no data) so
     * buttons do not appear active without a filter being applied.
     * @protected
     */
    _clearPresetState() {
        this.#presetManager?.resetActivePreset();
    }

    // ========================================================================
    // VISIBILITY DEFERRAL PATTERN
    // ========================================================================

    /**
     * Whether the container currently has layout dimensions — the gate the
     * visibility queue uses to decide between running and deferring an operation.
     * @returns {boolean} True if container is visible, false otherwise
     */
    #isContainerVisible() {
        const container = this.container;
        return !!container && container.offsetWidth > 0 && container.offsetHeight > 0;
    }

    /**
     * Resolves once the initial Tabulator build and its follow-up redraw have
     * completed — i.e. rows are present and column widths are final.
     *
     * Safe to await while the view is still hidden: the settle scheduler runs
     * with `requireVisible: false`, and `visibility: hidden` keeps the container
     * measurable, so the build does not stall waiting to be shown.
     * @override
     * @returns {Promise<void>}
     */
    whenSettled() {
        if (this.#pendingSettles.size === 0) return Promise.resolve();
        return Promise.all([...this.#pendingSettles].map((entry) => entry.promise)).then(
            () => undefined,
        );
    }

    /**
     * Execute an operation immediately if container is visible, otherwise defer it
     * Deferred operations are executed when show() is called
     * @param {string} key - Unique key for this operation (used to replace existing pending ops)
     * @param {Function} operation - The operation to execute (receives no arguments)
     * @returns {boolean} True if executed immediately, false if deferred
     * @protected
     */
    deferOperationUntilVisible(key, operation) {
        return this.#visibilityQueue.runOrDefer(key, operation);
    }

    /**
     * Creates a Tabulator table with specified columns and data
     * Integrates preset filters, column enhancements, and state tracking
     *
     * The build is described by one spec object rather than positional
     * arguments, so call sites name what they set and omit what they don't.
     * @param {object} spec - The table build description
     * @param {string} spec.containerId - The ID of the HTML element to contain the table
     * @param {Array} spec.columns - Array of column definitions
     * @param {Array} spec.data - Array of data objects
     * @param {Array} [spec.initialSort] - Optional array of initial sort configurations
     * @param {{[key: string]: any}} [spec.options] - Optional Tabulator configuration options (e.g. disablePresets)
     * @param {Array} [spec.presets] - Optional array of filter preset configurations
     * @returns {object | null} - The Tabulator table instance with row selection enabled, or null when validation fails
     */
    createTable({ containerId, columns, data, initialSort = [], options = {}, presets = [] }) {
        // Mark initial build phase - suppresses sync event publishing in subclass handlers
        this.#isInitialBuild = true;
        // Cleared, never replaced: the column-visibility menu holds this exact Set.
        this.#columnVisibilityExcludedFields.clear();

        // Validate required parameters
        if (!containerId) {
            console.error('Container ID is required');
            return null;
        }

        if (!Array.isArray(columns) || columns.length === 0) {
            console.error('Columns must be a non-empty array');
            return null;
        }

        if (!Array.isArray(data)) {
            console.error('Data must be an array');
            return null;
        }

        // Verify the target DOM element exists
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container element with ID '${containerId}' not found in the DOM`);
            return null;
        }

        // Create the inner Tabulator host. Preset buttons now live in the
        // module header toolbar rather than inside a table wrapper.
        const shouldCreatePresets = !options.disablePresets;
        const headerActions = this.headerActionsContainer;

        // Presets are rendered in the header-actions toolbar when available.
        const presetContainer =
            shouldCreatePresets && headerActions
                ? this.#presetManager.createContainer(presets)
                : null;
        if (presetContainer && headerActions) {
            if (!headerActions.contains(presetContainer)) {
                headerActions.appendChild(presetContainer);
            }
        }

        if (shouldCreatePresets && presets.length > 0 && !headerActions) {
            console.warn(
                `TableModule[${this.id}]: presets requested but no headerActionsContainer is available; skipping preset button rendering.`,
            );
        }

        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';

        // Clear and append to the original container instead of replacing it.
        // Tabulator mounts into the dedicated inner host so the content body can
        // continue managing flex layout and overflow boundaries.
        container.innerHTML = '';
        container.appendChild(tableContainer);

        // Mark the nearest content-module-body as a table host so shared CSS
        // can make it a flex column with overflow hidden (sole scroll region
        // becomes the inner .table-container).
        const contentBody = container.closest('.content-module-body');
        if (contentBody) contentBody.classList.add('has-table');

        // Capture the filter descriptors before the column processor strips the
        // headerFilter* options off the definitions Tabulator receives. A fresh
        // build starts unfiltered, as an empty header-filter row used to.
        this.#tableFilters.reset(columns);

        // Process each column definition to apply enhancements (see internal/columnDefinitionProcessor.js)
        const { definitions: processedColumns, headerSized } = processColumnDefinitions(columns, {
            excludedFields: this.#columnVisibilityExcludedFields,
        });

        // Configure default table settings
        /** @type {{[key: string]: any}} */
        const defaultConfig = {
            data: data,
            columns: processedColumns,
            layout: 'fitColumns',
            height: '100%',
            width: '100%',
            placeholder: glossaryAnnotator.getRequiredEntryText('general.messages.no-data'),
            movableColumns: true,
            resizableColumns: false,
            resizableColumnFit: false,
            columnCalcs: 'both',
            // Default column settings for responsive width distribution
            columnDefaults: {
                widthGrow: 1,
                widthShrink: 1,
                // Annotate column header titles with glossary term popups
                ...(glossaryAnnotator.isInitialized
                    ? { titleFormatter: createTitleFormatter() }
                    : {}),
            },
            selectableRows: true,
            ...options,
        };

        // Add initial sort configuration if provided
        if (Array.isArray(initialSort) && initialSort.length > 0) {
            defaultConfig.initialSort = initialSort;
        }

        // Arm this build's own settle slot before constructing Tabulator: the
        // constructor returns immediately but the table builds, redraws and
        // measures its columns over later frames. whenSettled() lets a view
        // hold its skeleton up until every tracked build is done instead of
        // revealing moving content. Each build gets its own slot rather than
        // a single shared one — a module that manages several Tabulator
        // instances (see SlBaseTableModule) calls createTable() once
        // per table in the same render, and an earlier table's slot must not
        // be resolved early just because a later table started building.
        let resolveThisBuild;
        const buildSettled = new Promise((resolve) => {
            resolveThisBuild = resolve;
        });
        const settleEntry = { promise: buildSettled, resolve: resolveThisBuild };
        this.#pendingSettles.add(settleEntry);
        buildSettled.then(() => this.#pendingSettles.delete(settleEntry));

        // Initialize the Tabulator table instance
        const table = new Tabulator(tableContainer, defaultConfig);
        // The instance, reachable from outside the module graph (the e2e specs read the
        // filtered row set off it) — Tabulator's UMD global used to serve that role.
        // Cleared again on `tableDestroyed` below, so a reader one turn late gets nothing
        // rather than a destroyed instance that still answers.
        /** @type {any} */ (tableContainer).tabulator = table;

        // A build whose table dies before settling must still release its slot:
        // clear()/_destroyActiveTables() on a re-render can destroy a table that
        // never reached tableBuilt, and module destroy() only covers slots still
        // pending at module teardown. Resolving twice is a no-op, so this may
        // overlap the settled path safely.
        table.on('tableDestroyed', () => {
            resolveThisBuild();
            // Every destroy path goes through this event — the module's own, the SL
            // subclasses' `_destroyActiveTables()`, a mid-lifecycle recreate — so the
            // published instance is dropped here rather than at each call site. The
            // identity check leaves a newer table on the same container alone.
            if (/** @type {any} */ (tableContainer).tabulator === table) {
                /** @type {any} */ (tableContainer).tabulator = null;
            }
        });

        // Store the table reference; built state is tracked per table (see
        // #builtTables), so this not-yet-built table cannot inherit a previous
        // table's flag.
        this.table = table;

        this.#headerGeometry.register(table, headerSized);

        // Initialize preset state tracking (filter/sort conflict resolution)
        this.#presetManager.initStateTracking(
            containerId,
            presets,
            table,
            initialSort,
            () => this._onTableReset(),
            () => this.#getPersistentFilters(),
            () => this.#clearTableFiltersOnReset(),
        );

        // The ARIA repairs Tabulator's own grid tree needs, each on the event that
        // creates the DOM it corrects (see internal/tabulatorAria.js).
        table.on('tableBuilt', () => {
            applyHeaderAria(table.element);
            applyBodyAria(table.element);
        });
        table.on('columnsLoaded', () => applyColumnGroupAria(table.element));
        table.on('dataGrouped', (groups) => applyGroupRowAria(groups));

        // The Material glyphs in Tabulator's arrow boxes (internal/tabulatorIcons.js):
        // re-scanned on every event that may have built one — the header on a column
        // load, rows as the virtual renderer attaches them, the tree control each time
        // Tabulator regenerates it on a toggle.
        const applyIcons = () => applyTableIcons(table.element);
        table.on('tableBuilt', applyIcons);
        table.on('columnsLoaded', applyIcons);
        table.on('renderComplete', applyIcons);
        table.on('dataTreeRowExpanded', applyIcons);
        table.on('dataTreeRowCollapsed', applyIcons);

        // Update progress bar highlighting if percentageCombined column exists
        // Also trigger a redraw to ensure proper column widths when container dimensions are finalized
        table.on('tableBuilt', () => {
            // Per table, so a superseded table's late build records itself
            // without saying anything about the table the scheduler now serves
            // (isBuilt() asks for the current one).
            this.#builtTables.add(table);

            // Initialize progress bar header highlights for all progress bar columns
            for (const col of columns) {
                if (isProgressBarColumnField(col.field)) {
                    updateProgressBarHeaderHighlight(table, col.field, null);
                }
            }

            const afterRedraw = () => {
                try {
                    // Mark initial build as complete AFTER the redraw
                    // Any dataFiltered events from this redraw are still guarded by isInitialBuild
                    this.#isInitialBuild = false;

                    // Attach event listeners to preset buttons after table is fully built AND rendered
                    // This prevents errors when presets try to sort before column DOM elements exist
                    // Must be deferred to allow Tabulator to finish all internal initialization
                    if (presetContainer) {
                        this.#presetManager.attachListeners(presets, table);
                    }

                    // Place table-local toolbar buttons in the header when the title bar is active.
                    if (headerActions) {
                        this._createHeaderToolbarButtons();
                    }

                    // Notify subclasses that the table is fully ready
                    // getRows() now returns data, columns are rendered
                    this._onTableReady();
                } finally {
                    // Everything above is what "settled" means for a table.
                    // In `finally` so a throwing _onTableReady() cannot leave
                    // the view stuck behind its skeleton until the fail-safe.
                    resolveThisBuild();
                }
            };

            const scheduled = this.#redrawScheduler.scheduleSettled({
                table,
                requireVisible: false,
                afterRedraw,
            });

            if (!scheduled) {
                // The scheduler only serves the module's *current* table. In a
                // multi-table render (see SlBaseTableModule) every earlier
                // table's tableBuilt lands here already superseded, gets declined,
                // and its afterRedraw never runs — so "built" is that slot's final
                // signal. Without this release, whenSettled() wedges the view
                // behind its skeleton until the whenSubtreeSettled fail-safe.
                if (table !== this.#table) {
                    resolveThisBuild();
                    return;
                }
                // Declined for the CURRENT table: the overlap guard is held by a
                // settle frame armed before this table existed, which voids itself
                // next frame. Re-schedule then — releasing the slot immediately
                // would reveal the view over a half-initialized table (afterRedraw
                // never runs, isInitialBuild sticks true). If the retry is also
                // declined, release rather than wedge behind the skeleton.
                this.resources.trackAnimationFrame(() => {
                    const rescheduled =
                        !this.destroyed &&
                        table === this.#table &&
                        this.#redrawScheduler.scheduleSettled({
                            table,
                            requireVisible: false,
                            afterRedraw,
                        });
                    if (!rescheduled) resolveThisBuild();
                });
            }
        });

        this.#headerGeometry.observe(table, tableContainer);

        return table;
    }

    /**
     * Replace the table's column definitions in place, without destroying the
     * Tabulator instance or the surrounding module shell.
     *
     * Use when the column *set* itself depends on runtime state (e.g. the MA class
     * table drops its Kompetenzstufe column and rescopes the "Richtig (von N)"
     * header when scoped to a single Leitidee). Columns get the same treatment as
     * on the initial build (see internal/columnDefinitionProcessor.js).
     *
     * Filter-menu values survive the swap: they are reconciled against the new
     * column set, and only values whose column is gone are dropped (e.g. MA's
     * Kompetenzstufe filter when scoping to a Leitidee).
     * @param {Array<object>} columns - New column definitions (unprocessed)
     * @returns {boolean} True when the columns were applied
     */
    updateColumns(columns) {
        if (!this.#table || typeof this.#table.setColumns !== 'function') {
            console.warn(
                `${this.constructor.name}[${this.id}]: Cannot update columns - no table initialized`,
            );
            return false;
        }

        if (!Array.isArray(columns) || columns.length === 0) {
            console.warn(
                `${this.constructor.name}[${this.id}]: Cannot update columns - columns must be a non-empty array`,
            );
            return false;
        }

        // Re-collected while processing the new definitions. Cleared rather than
        // replaced: the column-visibility menu captured this exact Set instance.
        this.#columnVisibilityExcludedFields.clear();
        const { definitions, headerSized } = processColumnDefinitions(columns, {
            excludedFields: this.#columnVisibilityExcludedFields,
        });
        this.#table.setColumns(definitions);
        // The new definitions carry new auto-derived floors; replace the old record.
        this.#headerGeometry.register(this.#table, headerSized);

        // Re-read the filterable columns; a value whose column disappeared is
        // dropped, which changes the active row set and needs a re-filter.
        if (this.#tableFilters.setDescriptors(columns)) {
            this.#tableFilters.apply();
        }
        this.#createTableFilterButton();

        // The header cells are new, so re-seed the progress-bar header highlight.
        for (const column of columns) {
            if (isProgressBarColumnField(column.field)) {
                updateProgressBarHeaderHighlight(this.#table, column.field, null);
            }
        }

        this.#redrawScheduler.scheduleSettled();
        return true;
    }

    /**
     * Redraw the table to recalculate column widths
     * Call this after showing/hiding columns or after view becomes visible
     * If table is not visible or not yet built, skip redraw
     */
    redraw() {
        this.#redrawScheduler.redrawNow();
    }

    /**
     * Set a column's visibility only when its current state differs.
     * Returns whether the column visibility actually changed.
     * @param {object} column - Tabulator column component
     * @param {boolean} shouldShow - Target visibility state
     * @returns {boolean} True when the column visibility changed
     */
    #setColumnVisibility(column, shouldShow) {
        if (
            !column ||
            typeof column.isVisible !== 'function' ||
            typeof column.show !== 'function' ||
            typeof column.hide !== 'function'
        ) {
            return false;
        }

        const isVisible = column.isVisible();
        if (isVisible === shouldShow) {
            return false;
        }

        if (shouldShow) {
            column.show();
        } else {
            column.hide();
        }

        return true;
    }

    /**
     * Whether a column is excluded from the visibility menu, i.e. its visibility
     * is fixed by its definition and never a user choice.
     *
     * Covers the hidden sort-target and export-only columns: a mode- or
     * filter-driven visibility pass must leave those alone rather than reveal
     * them along with the columns the mode actually governs.
     * @param {string} field - The column's field name.
     * @returns {boolean} True when the column is menu-excluded.
     * @protected
     */
    _isColumnVisibilityLocked(field) {
        return this.#columnVisibilityExcludedFields.has(field);
    }

    /**
     * Apply multiple column visibility decisions and redraw once if needed.
     * @param {Iterable<object>} columns - Tabulator column components
     * @param {Function} getShouldShow - Returns target visibility for a column
     * @returns {boolean} True when at least one column visibility changed
     * @protected
     */
    _applyColumnVisibilityChanges(columns, getShouldShow) {
        if (
            !columns ||
            typeof columns[Symbol.iterator] !== 'function' ||
            typeof getShouldShow !== 'function'
        ) {
            return false;
        }

        let changed = false;
        const canBlockRedraw =
            this.#table &&
            typeof this.#table.blockRedraw === 'function' &&
            typeof this.#table.restoreRedraw === 'function';

        if (canBlockRedraw) {
            this.#table?.blockRedraw();
        }

        try {
            for (const column of columns) {
                const shouldShow = getShouldShow(column);
                if (typeof shouldShow !== 'boolean') {
                    continue;
                }

                changed = this.#setColumnVisibility(column, shouldShow) || changed;
            }
        } finally {
            if (canBlockRedraw) {
                this.#table?.restoreRedraw();
            }
        }

        if (changed) {
            this.#redrawScheduler.scheduleSettled();
        }

        return changed;
    }

    /**
     * Hide the table module.
     * Resets the pending-redraw guard so a subsequent show() will
     * schedule a fresh redraw rather than skipping it.
     * @override
     */
    hide() {
        this.#redrawScheduler.resetGuard();
        super.hide();
    }

    /**
     * Show the table module
     * Overrides base class to ensure table is redrawn when becoming visible
     * and to execute any pending operations that were deferred
     * @override
     */
    show() {
        if (this.visible) return;
        // Call parent show — this triggers childModule.redraw() on our children
        // via BaseModule.show()'s waitForLayout path
        super.show();

        const width = this.container?.offsetWidth ?? 0;

        // The header-derived floors are measured against the fluid root font size
        // (see TableHeaderGeometry), and a viewport resize while this module
        // was hidden left them stale: the container never resized while it was
        // display:none, so the realign observer had nothing to react to either.
        // Refresh BEFORE the redraws below, otherwise the table lays out at the old
        // floors and is corrected one debounce later — the visible column-width
        // snap the guard below exists to avoid.
        const floorsChanged = this.#headerGeometry.refreshAll();

        // Execute any pending operations that were deferred while hidden. A
        // deferred data update can change content — and therefore column widths —
        // on its own, so redraw once it has actually run — after the drained
        // operations, never before, otherwise the table would show stale
        // column widths and snap once the update lands — the same visible
        // glitch this whole guard exists to avoid. The flush runs synchronously
        // (see the constructor's scheduleFlush), so both land before this paint.
        const didDeferredWork = this.#visibilityQueue.flush(() => {
            this.#redrawScheduler.redrawNowGuarded();
        });
        if (didDeferredWork) {
            if (width > 0) this.#lastShownWidth = width;
            return;
        }

        // Skip the forced redraw on a revisit where nothing that affects column
        // widths changed: the container is the same width it was last laid out at
        // and no deferred update ran. The redraw exists only to avoid a visible
        // column-width snap, which cannot happen when neither width nor content
        // changed. Mirrors chartRenderer's #lastRenderedWidth guard. (The width
        // must be captured here, not in hide(): by the time hide() runs the view
        // container is already display:none, so offsetWidth would read 0.)
        //
        // New floors count as changed content: nothing else is going to apply
        // them, precisely because the container width did not move.
        if (!floorsChanged && width > 0 && width === this.#lastShownWidth) {
            return;
        }

        // Redraw table to recalculate column widths.
        // Run synchronously BEFORE the next paint so the user never sees the
        // table at stale column widths (the visible "column-width snap" on
        // every revisit was caused by waiting for a double-rAF before redraw,
        // which let one paint happen with the pre-hide widths first).
        // Force a synchronous layout flush by reading offsetWidth on the now-
        // visible container so Tabulator measures the final dimensions.
        this.#redrawScheduler.redrawNowGuarded();
        if (width > 0) this.#lastShownWidth = width;
    }

    // ========================================================================
    // EXPORT DESCRIPTOR HOOKS
    // ========================================================================

    /**
     * ContentModule-owned export contract for table surfaces.
     * TableModule describes the target (type 'table' → ExportService supplies
     * CSV/JSON/PDF actions over the tables found in `container`), but it does
     * not place the controls. Concrete table modules must opt in explicitly
     * via `enableModuleExport`.
     * @override
     * @returns {object | null} The table export target, or null when the module did not opt in via `enableModuleExport`.
     */
    getExportControlDefinition() {
        if (!this.getOption('enableModuleExport', false)) {
            return null;
        }

        return this._buildExportControlDefinition('table');
    }

    /**
     * Creates all header toolbar buttons owned by TableModule.
     * Called from the tableBuilt handler when a title bar is active.
     * Subclasses can override to add extra buttons (e.g. grouping toggle).
     * @protected
     */
    _createHeaderToolbarButtons() {
        this.#createColumnVisibilityButton();
        this.#createTableFilterButton();
    }

    /**
     * Creates a column visibility dropdown button inside the header-actions toolbar.
     * Delegates the widget construction to the shared createColumnVisibilityMenu
     * factory, supplying the lazy table accessor, the excluded-field set, and the
     * toggle-then-redraw behavior owned by this module.
     */
    #createColumnVisibilityButton() {
        createColumnVisibilityMenu({
            headerActions: this.headerActionsContainer,
            getTable: () => this.table,
            excludedFields: this.#columnVisibilityExcludedFields,
            onToggleColumn: (col) => {
                if (this.#setColumnVisibility(col, !col.isVisible())) {
                    this.redraw();
                }
            },
        });
    }

    /**
     * Creates the filter dropdown button inside the header-actions toolbar.
     * Tables whose columns declare no filters (SL summaries, one-row student
     * info tables) get no button at all.
     */
    #createTableFilterButton() {
        // Idempotent, and safe to call again after a column swap: a table whose
        // first filterable column only arrives with the new column set still gets
        // its button (createTableFilterMenu leaves an existing control alone).
        if (this.#tableFilters.descriptors.length > 0) {
            createTableFilterMenu({
                headerActions: this.headerActionsContainer,
                getDescriptors: () => this.#tableFilters.descriptors,
                getValue: (field) => this.#tableFilters.getValue(field),
                onChange: (field, value) => this._setTableFilterValue(field, value),
            });
        }

        this.#syncTableFilterButton();
    }

    // ========================================================================
    // SAFE DATA REPLACEMENT
    // ========================================================================

    /**
     * Safely replace table data with automatic destroy-and-recreate fallback.
     * On success the table keeps its current structure; on failure the table
     * instance is destroyed and nulled so that the caller can recreate it.
     * @param {Array} data - New row data to load into the table
     * @param {object} [options] - Optional callbacks around the replace operation
     * @param {Function} [options.beforeReplace] - Called before replaceData (e.g. clearSort)
     * @param {Function} [options.afterReplace] - Called after successful replaceData (e.g. setSort)
     * @returns {Promise<boolean>} true if replaceData succeeded, false if the table was destroyed
     */
    async safeReplaceData(data, { beforeReplace, afterReplace } = {}) {
        if (!this.table) return false;

        // Suppress the preset manager's dataFiltered/dataSorted auto-clear while
        // we swap data — those events fire programmatically, not from user action.
        this.#presetManager.beginProgrammaticUpdate();
        try {
            if (typeof beforeReplace === 'function') beforeReplace();
            await this.table.replaceData(data);
            if (typeof afterReplace === 'function') afterReplace();
            // A beforeReplace that cleared the table's filters (MA's pool switch
            // drops the active preset's filter that way) also dropped the filter
            // menu's filter and the subclass's persistent ones — re-attach both,
            // so neither the menu values nor e.g. an external id filter is lost.
            this.#reattachPersistentFilters();
            return true;
        } catch (error) {
            console.warn(
                `${this.constructor.name}[${this.id}]: Failed to replace data, recreating table`,
                error,
            );
            this.table.destroy();
            this.table = null;
            return false;
        } finally {
            this.#presetManager.endProgrammaticUpdate();
        }
    }

    // ========================================================================
    // HELPER METHODS FOR COMMON TABLE PATTERNS
    // ========================================================================

    /**
     * Helper: Attach standard table event handlers
     * Attaches Tabulator event listeners for row selection and data filtering.
     * Callbacks handle module-specific logic; chart sync is NOT done here.
     * Tables that pair with a chart hand it their ids through a callback option.
     * @protected
     * @param {object} handlers - The two callbacks the standard handlers report to.
     * @param {Function} handlers.onSelectionChanged - Callback receiving selectedData array
     * @param {Function} handlers.onDataFiltered - Callback receiving (filteredData, filters); the row selection is reset before it runs
     */
    attachStandardEventHandlers({ onSelectionChanged, onDataFiltered }) {
        if (!this.table) {
            console.warn(`TableModule[${this.id}]: Cannot attach event handlers - no table`);
            return;
        }

        this.table.on('rowSelectionChanged', (selectedData) => {
            if (this.isTableEventSuppressed('rowSelectionChanged')) return;
            onSelectionChanged(selectedData);
        });

        this.table.on('dataFiltered', (filters, rows) => {
            if (this.isTableEventSuppressed('dataFiltered')) return;

            if (this.table) {
                this.withSuppressedTableEvents('rowSelectionChanged', () => {
                    this.table?.deselectRow();
                });
            }

            onDataFiltered(
                rows.map((row) => row.getData()),
                filters,
            );
        });
    }

    /**
     * @override
     */
    destroy() {
        // Clean up header toolbar button listeners
        const headerActions = this.headerActionsContainer;
        if (headerActions) {
            for (const selector of [
                COLUMN_VISIBILITY_CONTROL_SELECTOR,
                TABLE_FILTER_CONTROL_SELECTOR,
            ]) {
                const w = /** @type {any} */ (headerActions.querySelector(selector));
                if (w?._cleanupListeners) w._cleanupListeners();
            }
        }

        // Destroy Tabulator table instance (not tracked via resources.trackDisposable
        // because subclasses may destroy+recreate the table mid-lifecycle)
        if (this.#table && !this.#table.destroyed && typeof this.#table.destroy === 'function') {
            this.#table.destroy();
        }

        this.#eventSuppression.clear();

        // Release every pending settle slot: a table destroyed mid-build never
        // reaches its tableBuilt handler, and an unresolved promise would hold
        // a view behind its skeleton until the fail-safe timeout.
        this.#pendingSettles.forEach((entry) => entry.resolve());

        super.destroy();
    }
}

export { TableModule };
