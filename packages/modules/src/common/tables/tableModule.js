/**
 * Base class for table modules: a Tabulator table in a ContentModule card. Concrete
 * tables extend a shared base table class, never this one directly.
 */

import {
    ContentModule,
    headerActionButton,
    renderIcon,
    resizeService,
    sameItems,
} from '@tba3/module-base';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { signal } from '@preact/signals-core';
import {
    progressBarSortKey,
    resetProgressBarSorting,
    setupProgressBarSorting,
} from './progressBarSorting.js';
import { TablePresetManager } from './internal/tablePresetManager.js';
import { resolvePreset } from './preset.js';
import { ReadinessGate } from './internal/readinessGate.js';
import { columnVisibilityMenu } from './internal/columnVisibilityMenu.js';
import { tableFilterMenu } from './internal/tableFilterMenu.js';
import { TableFilterController } from './internal/tableFilterController.js';
import { TableHeaderGeometry } from './internal/tableHeaderGeometry.js';
import { processColumnDefinitions } from './internal/columnDefinitionProcessor.js';
import {
    applyBodyAria,
    applyColumnGroupAria,
    applyGroupRowAria,
    applyHeaderTabStops,
    applyRowSelectionAria,
    installHeaderKeyboard,
    installRowKeyboard,
    applyRowSelectableAria,
} from './internal/tabulatorAria.js';
import { SORT_GLYPHS_HTML, applyGroupIcons } from './internal/tabulatorIcons.js';
import { keepTableFocus } from './internal/tableFocusKeeper.js';
import { Tabulator } from './tabulatorBuild.js';
import { printActiveRows } from './internal/printActiveRows.js';
import { setDownloadFormat } from './downloadNumberFormat.js';
import { labelByTitle } from '../utils/scrollRegion.js';
import { html, nothing } from 'lit';

/** For Tabulator's CSV writer; the BOM is the caller's to add. */
const CSV_OPTIONS = Object.freeze({ delimiter: ';', bom: false });

/**
 * How long the first build waits for a container that has no width yet: at
 * `waitForLayout`'s 50 ms frame cap, 500 ms for a box that never widens.
 */
const WIDENING_WAIT_FRAMES = 10;

/** @typedef {import('./columnFactories.js').TableColumnDefinition} TableColumnDefinition */

/** @typedef {import('./internal/tablePresetManager.js').TableRowFilter} TableRowFilter */

/**
 * The table `setRows` puts rows into: built from it when the module has none, its
 * columns swapped in when their fields differ from the live table's.
 * @typedef {object} RowsSpec
 * @property {TableColumnDefinition[]} columns - Unprocessed.
 * @property {ReadonlyArray<import('tabulator-tables').Sorter>} [initialSort] - The sort a new table starts with, and Reset returns to.
 * @property {import('tabulator-tables').Options} [options] - Tabulator options of a new table, over the module's defaults.
 * @property {(row: {[field: string]: any}) => void} [onRowClick] - Called with a clicked row's data.
 */

/**
 * The leaf fields of a column set, in order.
 * @param {TableColumnDefinition[]} columns
 * @returns {string}
 */
function leafFieldsOf(columns) {
    /**
     * @param {TableColumnDefinition} column
     * @returns {string[]}
     */
    const leaves = (column) =>
        column.columns ? column.columns.flatMap(leaves) : [column.field ?? ''];
    return columns.flatMap(leaves).join('\n');
}

/**
 * What a table shows, as `_onDisplayedRowsChanged()` receives it.
 * @typedef {object} DisplayedRows
 * @property {Array<{[field: string]: any}>} rows - The active rows in display order.
 * @property {Array<{[field: string]: any}>} selected - The selected rows in selection order.
 */

/**
 * @param {Tabulator} table
 * @param {Array<{field: string, dir: string}>} sorters - Its active sorters.
 * @returns {string} A key that changes exactly when the sort does, the progress-bar step included.
 */
function sortKeyOf(table, sorters) {
    const key = sorters.map(({ field, dir }) => `${field}:${dir}`).join('|');
    return `${key}|${progressBarSortKey(table)}`;
}

/**
 * A group header's cell: a group header is a row of the grid (internal/tabulatorAria.js
 * re-roles it), and a row needs a cell; Tabulator prepends only the toggle arrow. The
 * label is the toggle button, whose click reaches the header's toggle.
 * Tabulator rebuilds every header on a toggle, so the state is read fresh each time, and
 * the key lets tableFocusKeeper find the rebuilt button. A node, not markup: Tabulator
 * writes a string through the page's sanitizing Trusted Types policy, which drops data
 * attributes.
 * @param {unknown} value - The group's key.
 * @param {import('tabulator-tables').GroupComponent} group - The group whose toggle the label is.
 * @returns {HTMLElement}
 */
function groupHeaderCell(value, group) {
    const cell = document.createElement('span');
    cell.setAttribute('role', 'gridcell');
    // The one cell spans the row: as many columns as a data row has.
    const columns = group
        .getTable()
        .getColumns()
        .filter((column) => column.isVisible());
    cell.setAttribute('aria-colspan', String(Math.max(columns.length, 1)));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'table-group-toggle';
    toggle.dataset.groupKey = String(value);
    toggle.setAttribute('aria-expanded', String(group.isVisible()));
    toggle.textContent = String(value);
    cell.append(toggle);
    return cell;
}

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *   context: import('../context/moduleContext.js').ModuleContext,
 * }} TableOptions
 */

/**
 * @template {TableOptions} [O=TableOptions]
 * @augments {ContentModule<O>}
 */
class TableModule extends ContentModule {
    /**
     * Whether the table's rows can be selected: `true` for several, `1` for one. A table
     * that allows it drops the selection on every data refresh (a filter, a row swap):
     * the user may not see those rows.
     * @type {boolean|number}
     */
    static selectableRows = false;

    /** @type {Tabulator | null} */
    #table = null;
    /**
     * How far each table's build got: `built` once `tableBuilt` has fired, `ready` once
     * the build has settled and `_onDisplayedRowsChanged()` has run, the end of the
     * build window. Per table, so a rebuild's
     * new table does not inherit the last one's state.
     * @type {WeakMap<Tabulator, 'built'|'ready'>}
     */
    #buildPhase = new WeakMap();
    /**
     * The table whose build-settle redraw is still to come, so a show in the meantime
     * does not stack a redraw on it; a hide clears it, since the redraw that frame
     * brings was laid out for a box the show may have changed.
     * @type {Tabulator|null}
     */
    #settlePending = null;
    /** Depth of nested `#mutateTable()` calls. */
    #mutationDepth = 0;
    /**
     * The filters the module keeps on every table it builds, by key (see
     * `_setPersistentFilter`).
     * @type {Map<string, TableRowFilter>}
     */
    #persistentFilters = new Map();
    /** @type {TablePresetManager} */
    #presetManager;
    /**
     * One promise per build not yet settled (see `_contentSettled`); none until
     * createTable() runs.
     * @type {Set<Promise<void>>}
     */
    #pendingSettles = new Set();
    /** Holds `deferUntilReady`'s operations until the table is shown and built. */
    #readiness = new ReadinessGate({
        isVisible: () => this.#isContainerVisible(),
        isBuilding: () => this.#building,
        whenSettled: () => this.whenSettled(),
        isClosed: () => this.destroyed,
        onError: (error, key) => this.#reportOperationError(error, key),
    });
    /**
     * Queues one `_onDisplayedRowsChanged()` report of the current table, after the
     * refresh in progress (see `createTable`); a no-op without a table.
     * @type {() => void}
     */
    #queueReport = () => {};
    /** @type {Set<string>} */
    #columnVisibilityExcludedFields = new Set();
    /** @type {ReadonlyArray<import('tabulator-tables').Sorter>} The sort the current table started with, which Reset returns to. */
    #initialSort = [];
    /**
     * Whether a table has been built: the column and filter menus wait for one, and go
     * with it on `clear()`. A rebuild keeps them: they follow the new table's columns
     * at once, and hiding them for its build would blink the toolbar.
     */
    #toolbarReady = signal(false);
    /**
     * What the toolbar's status region announces: how many of the rows the table
     * shows, after each change that is not the module's own build.
     */
    #rowCountText = signal('');
    /**
     * The current table's `columnDefaults`, which a column swap processes new
     * definitions against as well.
     * @type {Partial<import('tabulator-tables').ColumnDefinition>}
     */
    #columnDefaults = {};
    /** The leaf fields of the current table's columns (`leafFieldsOf`). */
    #columnFields = '';
    /** Owns the filter-menu descriptors and values, and their Tabulator filter. */
    #tableFilters = new TableFilterController();
    /**
     * Header-derived column floors and the post-resize header realign of the
     * current table.
     * @type {TableHeaderGeometry}
     */
    #headerGeometry;

    /** @override */
    _setup() {
        super._setup();
        this.#presetManager = new TablePresetManager(() => this.#syncFilters());
        this.resources.trackSubscription(() => this.#presetManager.destroy());
        this.#headerGeometry = new TableHeaderGeometry(resizeService);
    }

    /**
     * The table's toolbar in its own title bar.
     * @override
     * @returns {unknown}
     */
    _headerActions() {
        return this.tableHeaderActions();
    }

    /**
     * The table's header controls: the preset row, then, once the table has been
     * built, the subclass's `_tableHeaderActions()`. What they show is held in
     * signals, so a parent card rendering this in its `_headerActions()` (a table
     * without a title bar of its own) follows it the same way.
     * @returns {unknown}
     */
    tableHeaderActions() {
        return [
            this.#presetManager.template(),
            this.#toolbarReady.value ? this._tableHeaderActions() : nothing,
            this.#rowCountStatus(),
        ];
    }

    /**
     * The polite status region a filter, a preset or a data swap is announced through.
     * Only a table whose rows the user can narrow has one; it is rendered empty before
     * its first update, which assistive tech needs to announce it.
     * @returns {unknown} The region, or `nothing`.
     */
    #rowCountStatus() {
        if (!this.#isNarrowable()) return nothing;
        return html`<span class="visually-hidden" role="status">${this.#rowCountText.value}</span>`;
    }

    /**
     * Whether the reader can narrow the rows, with a preset or the filter menu: such a
     * table announces its row count and offers Reset. Read in a template, it tracks both.
     * @returns {boolean}
     */
    #isNarrowable() {
        return this.#tableFilters.descriptors.length > 0 || this.#presetManager.hasPresets;
    }

    get table() {
        return this.#table;
    }

    /**
     * Whether the table is changing because this module changed it, not the user:
     * from `createTable()` until the build has settled, and for the duration of a
     * `#mutateTable()` call. Such changes neither end a preset nor reach
     * `_onDisplayedRowsChanged()`.
     *
     * A synchronous scope is enough: Tabulator dispatches `dataFiltered`,
     * `dataSorted` and `rowSelectionChanged` from inside the call that caused them.
     * @returns {boolean}
     */
    get #programmatic() {
        return this.#mutationDepth > 0 || this.#building;
    }

    /** @returns {boolean} True while the current table's build is in flight. */
    get #building() {
        return !!this.#table && this.#buildPhase.get(this.#table) !== 'ready';
    }

    /**
     * Change the table on the module's own behalf: the change does not reach
     * `_onDisplayedRowsChanged()`, and a sort it causes leaves an active preset in place.
     * @template T
     * @param {() => T} operation - The Tabulator calls to make.
     * @returns {T} What the operation returned.
     */
    #mutateTable(operation) {
        this.#mutationDepth += 1;
        try {
            return operation();
        } finally {
            this.#mutationDepth -= 1;
        }
    }

    /**
     * Called with what the table shows: once its build has settled, and after every
     * sort, selection or filter change that is not the module's own (`#mutateTable`,
     * the build); a preset's sort and filter count, and so do `_setPersistentFilter`
     * and `setRows`. The events of one call arrive as one report, after Tabulator's
     * refresh; a filter drops the selection first (`selectableRowsPersistence: false`).
     * @param {DisplayedRows} _shown
     * @protected
     */
    _onDisplayedRowsChanged(_shown) {
        // Default no-op. Subclasses override to mirror the rows into a chart.
    }

    /**
     * Called when the Reset button resets the table: a subclass clears external state
     * it applied to the table (a chart-driven student filter).
     * @protected
     */
    _onTableReset() {
        // Default no-op. Subclasses override to clear external state.
    }

    /**
     * The table's presets, by key: their copy is the entry of that key under the table's
     * interface texts (`resolvePreset`). `createTable` reads them, and `_refreshPresets()`
     * and `setRows` after every data swap again, so a preset may follow the data and the
     * table's mode.
     * @returns {import('./preset.js').PresetSpec[]} Empty for none.
     * @protected
     */
    _getPresets() {
        return [];
    }

    /** @returns {import('./preset.js').Preset[]} `_getPresets()` with their copy. */
    #presets() {
        return this._getPresets().map((spec) =>
            resolvePreset(this.options.context.glossary, this._interfaceGlossaryPath, spec),
        );
    }

    /**
     * Where this table's own controls (presets, links) keep their texts in the glossary:
     * the module's `glossaryKey` plus `.interface`.
     * @returns {string}
     * @protected
     */
    get _interfaceGlossaryPath() {
        return `${this.glossaryKey}.interface`;
    }

    // ========================================================================
    // PERSISTENT FILTERS
    // ========================================================================

    /**
     * Keep one of the module's own filters on the table under `key`, or remove it
     * with `null`. It outlives preset switches, Reset and data swaps, and every table
     * the module builds starts with it. An active preset is re-applied over the new
     * rows, because its row limit was picked from the old ones; that re-application
     * is the refilter. Without one, the swap refilters once.
     * @param {string} key - Which of the module's filters this is.
     * @param {TableRowFilter|null} filterFunction
     * @protected
     */
    _setPersistentFilter(key, filterFunction) {
        const previous = this.#persistentFilters.get(key) ?? null;
        if (previous === filterFunction) return;

        if (filterFunction) {
            this.#persistentFilters.set(key, filterFunction);
        } else {
            this.#persistentFilters.delete(key);
        }

        if (!this.#table) return;
        if (this.#presetManager.hasActivePreset) {
            this.#presetManager.reapplyActivePreset();
        } else {
            this.#syncFilters();
        }
    }

    /**
     * Every filter the table carries, in Tabulator's `setFilter` form: the persistent
     * ones, the filter menu's, and the active preset's with its row limit last. They
     * are ANDed, so the order matters only to the limit, which the preset picks from
     * the rows the others leave.
     * @returns {import('./internal/tablePresetManager.js').TableFilterEntry[]}
     */
    #filterList() {
        const menuFilter = this.#tableFilters.filter;
        return [
            ...[...this.#persistentFilters.values()].map((field) => ({ field })),
            ...(menuFilter ? [{ field: menuFilter }] : []),
            ...this.#presetManager.filters,
        ];
    }

    /**
     * The rows the filter menu derives its list options from: every row the
     * persistent filters let through, whatever the menu, a preset or the user's
     * other choices hide right now.
     * @returns {Array<{[field: string]: any}>}
     */
    #filterableRows() {
        const persistent = [...this.#persistentFilters.values()];
        return (this.#table?.getData() ?? []).filter((row) =>
            persistent.every((filter) => filter(row)),
        );
    }

    /** Replace the table's filters with `#filterList()`; one refilter. */
    #syncFilters() {
        const table = this.#table;
        if (table && !table.destroyed) table.setFilter(this.#filterList());
    }

    // ========================================================================
    // TABLE FILTER FACADE
    // ========================================================================

    /**
     * Set one filter field and re-filter the table. Fields that no column in the
     * current set declares are ignored.
     * @param {string} field
     * @param {import('./internal/tableFilterMetadata.js').TableFilterValue} value - The text of a text filter, the selected values of a list filter; '' or `[]` clears the field.
     * @protected
     */
    _setTableFilterValue(field, value) {
        if (!this.#tableFilters.setValue(field, value)) return;
        // The new value is set: a preset that ends with it refilters with it.
        if (!this.#presetManager.onUserChange()) this.#syncFilters();
    }

    /**
     * The filter-menu values by field, set fields only (a list filter's `string[]`, a
     * text filter's `string`). Every change replaces the object: a value set, a Reset,
     * a column swap that drops a field, a rebuild.
     * @returns {import('@preact/signals-core').ReadonlySignal<{readonly [field: string]: import('./internal/tableFilterMetadata.js').TableFilterValue}>}
     * @protected
     */
    get _filterValues() {
        return this.#tableFilters.values;
    }

    /**
     * Drop every filter the user can clear and refilter: the filter-menu values and the
     * active preset, filters and all. The panel's clear-all row, and Reset.
     */
    #clearTableFilters() {
        // One refilter: the preset's reset refilters when it held filters, after the
        // menu values are gone.
        const menuCleared = this.#tableFilters.clearValues();
        if (!this.#presetManager.resetActivePreset() && menuCleared) this.#syncFilters();
    }

    /**
     * The Reset button: the table as it was built. Drops the active preset and the
     * filter-menu values, the progress-bar sort state and the row selection, restores
     * the initial sort and tells the subclass last (`_onTableReset`), once the table is
     * clean and no preset is left to re-apply a filter it drops. Ignored until the table
     * is built (a sort before the column DOM exists throws) and after it is destroyed.
     */
    #resetView() {
        const table = this.#table;
        if (!table || table.destroyed || !this.#buildPhase.has(table)) return;
        // Blocked, Tabulator runs the filter and sort pipeline once on restore.
        table.blockRedraw();
        try {
            this.#clearTableFilters();
            resetProgressBarSorting(table);
            table.deselectRow();
            if (this.#initialSort.length > 0) {
                // A copy per call: Tabulator writes its Column into the items it is
                // given, and a column swap would leave this one's stale.
                table.setSort(this.#initialSort.map((sorter) => ({ ...sorter })));
            } else {
                table.clearSort();
            }
            this._onTableReset();
        } finally {
            table.restoreRedraw();
        }
    }

    /**
     * Ask `_getPresets()` again and re-apply the active preset with its new
     * configuration, or drop it when the new set no longer offers it. Use when what
     * a preset sorts or filters by follows module state (e.g. the Domäne mode).
     * @protected
     */
    _refreshPresets() {
        this.#presetManager.updatePresets(this.#presets());
    }

    // ========================================================================
    // VISIBILITY DEFERRAL PATTERN
    // ========================================================================

    /**
     * Whether the container has layout dimensions: the visibility queue's gate between
     * running and deferring an operation.
     * @returns {boolean}
     */
    #isContainerVisible() {
        return this.offsetWidth > 0 && this.offsetHeight > 0;
    }

    /**
     * Hold the first build until the container has a width, when it is laid out but
     * has none yet (a split layout still settling): a table built at zero width lays
     * itself out with every column hidden and snaps to its real widths only once a
     * resize reaches it, after the view is revealed. A container in a hidden view or
     * a collapsed card has no layout at all; that table builds now and is redrawn by
     * `_onShow()` when it is shown. Bounded by `WIDENING_WAIT_FRAMES`.
     * @override
     * @returns {Promise<void>}
     */
    async _renderContent() {
        // clientWidth, not offsetWidth: the card's border alone is not room.
        // Fonts are not waited for: the width the table builds against does not depend
        // on them.
        const widening =
            !this.initialized && this.contentContainer.clientWidth === 0
                ? this._whenLaidOut({
                      stableFrames: 1,
                      waitForFonts: false,
                      maxFrames: WIDENING_WAIT_FRAMES,
                  })
                : null;
        if (widening) {
            await widening;
            if (this.destroyed) return;
        }
        return super._renderContent();
    }

    /**
     * Resolves once every Tabulator build and its follow-up redraw have completed:
     * rows are present and column widths are final.
     *
     * Safe to await while the view is still hidden: the settle scheduler runs
     * with `requireVisible: false`, and `visibility: hidden` keeps the container
     * measurable.
     * @override
     * @returns {Promise<void>}
     */
    _contentSettled() {
        if (this.#pendingSettles.size === 0) return Promise.resolve();
        return Promise.all(this.#pendingSettles).then(() => undefined);
    }

    /**
     * Run an operation once the table can take it. A hidden table queues it until it is
     * shown, a table still building until the build has settled, since the build was
     * made for the state at its start and has no columns or rows to change yet
     * (Tabulator fires `dataFiltered` before the active rows update); either way a later
     * operation under the same key replaces the waiting one. Once the build has settled
     * the operation passes this gate again: a table hidden meanwhile holds it until it
     * is shown, a new build until that one has settled, and a module torn down drops
     * it. An operation that throws once it was deferred is logged
     * with its key; one that runs at once throws to the caller.
     * @param {string} key
     * @param {() => void} operation
     * @returns {boolean} False when it waits for the table to be shown
     */
    deferUntilReady(key, operation) {
        return this.#readiness.run(key, operation);
    }

    /**
     * Log an operation that failed after it was deferred, so no caller is left to see it.
     * @param {unknown} error
     * @param {string} key
     */
    #reportOperationError(error, key) {
        console.error(
            `TableModule[${this.id}]: Error executing pending operation '${key}':`,
            error,
        );
    }

    /**
     * Build the module's Tabulator table, replacing the one it had: processed columns,
     * the persistent filters, the presets (`_getPresets()`) and the build's settle slot.
     * The new table is `this.table`.
     * @param {object} spec
     * @param {HTMLElement} [spec.container]
     * @param {TableColumnDefinition[]} spec.columns - Unprocessed.
     * @param {Array<{[field: string]: any}>} spec.data
     * @param {ReadonlyArray<import('tabulator-tables').Sorter>} [spec.initialSort] - The sort the table starts with, and Reset returns to
     * @param {import('tabulator-tables').Options} [spec.options] - Tabulator options, over the module's defaults
     */
    createTable({
        container = this.contentContainer,
        columns,
        data,
        initialSort = [],
        options = {},
    }) {
        // One table per module: the one this build replaces goes first, so its
        // observers, listeners and settle slot are released through `tableDestroyed`.
        this.#destroyTable();

        // Cleared, never replaced: the column-visibility menu holds this exact Set.
        this.#columnVisibilityExcludedFields.clear();

        const presets = this.#presets();

        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';

        // Tabulator mounts into an inner host, so the content body keeps managing
        // flex layout and overflow.
        container.replaceChildren();
        container.appendChild(tableContainer);

        // table-host.css makes a `has-table` body a flex column whose sole scroll
        // region is the inner .table-container.
        const contentBody = container.closest('.content-module-body');
        if (contentBody) contentBody.classList.add('has-table');

        // Capture the filter descriptors before the column processor strips the
        // headerFilter* options off the definitions Tabulator receives. A fresh
        // build starts unfiltered.
        this.#tableFilters.reset(columns);

        this.#columnDefaults = { widthShrink: 1, vertAlign: 'middle', ...options.columnDefaults };
        this.#columnFields = leafFieldsOf(columns);
        const { definitions: processedColumns, headerSized } = processColumnDefinitions(columns, {
            excludedFields: this.#columnVisibilityExcludedFields,
            columnDefaults: this.#columnDefaults,
            glossary: this.options.context.glossary,
            rows: () => data,
        });

        // The empty-table message, an element the module rewrites: rows filtered out
        // have another way back than rows that were never there.
        const glossary = this.options.context.glossary;
        const placeholder = document.createElement('div');
        placeholder.className = 'tabulator-placeholder-contents';
        placeholder.textContent = glossary.getRequiredEntryText('general.messages.no-data');

        // A bag, not `Options`: `@types/tabulator-tables` has no function-valued filter
        // field, which `initialFilter` carries (`TableFilterEntry`).
        /** @type {{[key: string]: any}} */
        const defaultConfig = {
            data: data,
            columns: processedColumns,
            layout: 'fitColumns',
            height: '100%',
            // Every row in the DOM, so the accessibility tree holds the whole table, not
            // the rows a virtual renderer has attached; no table here has more than a few
            // hundred rows.
            renderVertical: 'basic',
            placeholder,
            selectableRows: /** @type {typeof TableModule} */ (this.constructor).selectableRows,
            selectableRowsPersistence: false,
            // The Material glyphs in Tabulator's arrow boxes (internal/tabulatorIcons.js).
            headerSortElement: SORT_GLYPHS_HTML,
            ...options,
            columnDefaults: this.#columnDefaults,
        };
        // The whole group header toggles, and its label is the keyboard's toggle.
        if (defaultConfig.groupBy) {
            defaultConfig.groupToggleElement = 'header';
            defaultConfig.groupHeader ??= (
                /** @type {unknown} */ value,
                /** @type {number} */ _count,
                /** @type {unknown[]} */ _data,
                /** @type {import('tabulator-tables').GroupComponent} */ group,
            ) => groupHeaderCell(value, group);
        }

        // A fresh build starts with the persistent filters only: the menu values
        // were reset above and the preset with the previous table.
        const initialFilter = this.#filterList();
        if (initialFilter.length > 0) defaultConfig.initialFilter = initialFilter;

        // A copy: Tabulator writes its `Column` into the sort items it is given.
        if (initialSort.length > 0) {
            defaultConfig.initialSort = initialSort.map((sorter) => ({ ...sorter }));
        }

        // This build's settle slot, armed before constructing Tabulator: the
        // constructor returns at once, but the table builds, redraws and measures
        // its columns over later frames (`_contentSettled()`). One slot per build:
        // a rebuild can start while the previous build is still pending, and must
        // not resolve that one's slot.
        /** @type {() => void} */
        let resolveThisBuild = () => {};
        /** @type {Promise<void>} */
        const buildSettled = new Promise((resolve) => {
            resolveThisBuild = resolve;
        });
        this.#pendingSettles.add(buildSettled);
        buildSettled.then(() => this.#pendingSettles.delete(buildSettled));

        const table = new Tabulator(tableContainer, defaultConfig);
        // Published for readers outside the module graph (the e2e specs read the
        // filtered row set off it); cleared on `tableDestroyed` below.
        Reflect.set(tableContainer, 'tabulator', table);

        // A table destroyed before it settled (clear(), the next createTable())
        // still releases its slot; resolving twice is a no-op.
        table.on('tableDestroyed', () => {
            resolveThisBuild();
            // Every destroy path goes through this event (the module's teardown,
            // clear(), a failed row swap, the next createTable()). The identity
            // checks leave a newer table alone.
            if (Reflect.get(tableContainer, 'tabulator') === table) {
                Reflect.set(tableContainer, 'tabulator', null);
            }
            if (this.#table === table) this.#presetManager.resetActivePreset();
        });

        this.#table = table;

        this.#headerGeometry.attach(table, tableContainer, headerSized);
        setupProgressBarSorting(table, columns);
        keepTableFocus(table, { scheduleFrame: (cb) => this.resources.trackAnimationFrame(cb) });

        this.#initialSort = initialSort;
        this.#presetManager.bind(table, presets);

        // A sort, selection or filter change that is not the module's own reaches
        // _onDisplayedRowsChanged once per call: Tabulator dispatches dataFiltered from
        // its filter stage, before the rows are sorted and made active, and one refresh
        // fires several of these events, so the report waits for the refresh to end.
        let reportPending = false;
        const reportDisplayedRows = () => {
            if (this.#programmatic || reportPending) return;
            reportPending = true;
            queueMicrotask(() => {
                reportPending = false;
                if (this.#table !== table) return;
                this.#rowCountText.value = applyTemplateTokens(
                    glossary.getRequiredEntryText('general.messages.row-count'),
                    { shown: table.getDataCount('active'), total: table.getDataCount() },
                );
                this.#reportDisplayedRows(table);
            });
        };
        this.#queueReport = reportDisplayedRows;

        // A sort the user made may end the active preset. Tabulator also dispatches
        // dataSorted on every refilter, so only a changed sort counts.
        let lastSortKey = sortKeyOf(table, []);
        table.on('dataSorted', (sorters) => {
            const sortKey = sortKeyOf(table, sorters);
            if (sortKey === lastSortKey) return;
            lastSortKey = sortKey;
            if (this.#programmatic) return;
            this.#presetManager.onUserChange();
            reportDisplayedRows();
        });
        // The basic renderer (`renderVertical` above) empties the body on every re-render
        // in place (a resize, the header realign), which drops the scroll to the top; the
        // position is put back once the rows are in again, after a sort or filter too. New
        // rows (a data swap, which Tabulator renders in place) open at the top: the old
        // offset points at nothing in them.
        let scrollTop = 0;
        let freshData = false;
        const holder = () => table.element.querySelector('.tabulator-tableholder');
        table.on('dataProcessing', () => {
            freshData = true;
        });
        table.on('renderStarted', () => {
            scrollTop = holder()?.scrollTop ?? 0;
        });
        table.on('renderComplete', () => {
            const element = holder();
            if (!element) return;
            if (freshData) {
                freshData = false;
                element.scrollTop = 0;
            } else if (scrollTop > 0) {
                element.scrollTop = scrollTop;
            }
        });
        // Registered before the build, so the first render is stamped too.
        if (defaultConfig.selectableRows) {
            table.on('renderComplete', () => applyRowSelectableAria(table));
        }
        table.on('rowSelectionChanged', (_data, _rows, selected, deselected) => {
            applyRowSelectionAria(selected, deselected);
            reportDisplayedRows();
        });
        // The message shows only while no row does: rows held are rows filtered out.
        table.on('dataFiltered', () => {
            placeholder.textContent = glossary.getRequiredEntryText(
                table.getDataCount() > 0
                    ? 'general.messages.no-data-filtered'
                    : 'general.messages.no-data',
            );
            reportDisplayedRows();
        });

        // The ARIA repairs Tabulator's own grid tree needs, each on the event that
        // creates the DOM it corrects (see internal/tabulatorAria.js); the body's on
        // `tableBuilt` below.
        table.on('columnsLoaded', () => {
            applyColumnGroupAria(table.element);
            applyHeaderTabStops(table.element);
        });
        table.on('dataGrouped', (groups) => applyGroupRowAria(groups));

        // The group-row arrow is the one glyph Tabulator takes no option for; a group
        // attaches it when its header renders.
        if (defaultConfig.groupBy) {
            table.on('renderComplete', () => applyGroupIcons(table.element));
        }

        table.on('tableBuilt', () => {
            applyBodyAria(table.element);
            // The grid is named by its card's title, or by the title a card without a
            // title bar would show.
            if (this.titleElement) labelByTitle(table.element, this.titleElement);
            else if (this.cardTitle) table.element.setAttribute('aria-label', this.cardTitle);
            if (defaultConfig.selectableRows === true) {
                table.element.setAttribute('aria-multiselectable', 'true');
            }
            installHeaderKeyboard(table.element);
            // One tab stop, rows on the arrows; a selectable row is a control the keyboard
            // activates as the pointer does.
            installRowKeyboard(table, { activates: Boolean(defaultConfig.selectableRows) });
            // The shared slim scrollbar (module-base interactive.css) on the scrolling body.
            table.element
                .querySelector('.tabulator-tableholder')
                ?.classList.add('styled-scrollbar');

            this.#buildPhase.set(table, 'built');

            // The header cells exist now; paint the progress-bar titles.
            resetProgressBarSorting(table);

            const afterRedraw = () => {
                try {
                    this.#toolbarReady.value = true;
                    this.#reportDisplayedRows(table);
                } finally {
                    // The build window closes here. In `finally`, so a throwing
                    // _onDisplayedRowsChanged() cannot leave the view stuck behind
                    // its skeleton until the fail-safe.
                    this.#buildPhase.set(table, 'ready');
                    resolveThisBuild();
                }
            };

            if (table === this.#table) {
                // Tabulator puts `initialFilter` back on the table as it builds, over a
                // filter set since createTable() (a chart click in that window).
                const fields = (/** @type {Array<{field: unknown}>} */ list) =>
                    list.map(({ field }) => field);
                if (!sameItems(fields(this.#filterList()), fields(initialFilter))) {
                    this.#syncFilters();
                }
                this.#settle(table, table.element.offsetWidth, afterRedraw);
            } else {
                // A table a rebuild superseded before it built never settles, so its
                // slot is released here.
                resolveThisBuild();
            }
        });
    }

    /**
     * Redraw the table, keeping its scroll position, if it is still the current, built,
     * live table (and, unless told otherwise, on screen: a hidden container measures
     * wrong widths). Every redraw is Tabulator's forced one: only that pass runs the cell
     * formatters again and re-measures row heights, which a theme, a state the formatters
     * read, a column shown or hidden and a new container width all need. It also resets
     * the scroll, so the scroll position is put back.
     * @param {Tabulator|null} [table]
     * @param {{requireVisible?: boolean}} [options]
     * @returns {boolean} Whether it redrew.
     */
    #redrawNow(table = this.#table, { requireVisible = true } = {}) {
        if (!table || table !== this.#table || !this.#buildPhase.has(table) || table.destroyed) {
            return false;
        }
        const { element } = table;
        if (requireVisible && (element.offsetWidth === 0 || element.offsetHeight === 0)) {
            return false;
        }
        const holder = element.querySelector('.tabulator-tableholder');
        const scrollTop = holder?.scrollTop ?? 0;
        const scrollLeft = holder?.scrollLeft ?? 0;
        table.redraw(true);
        if (holder) {
            holder.scrollTop = scrollTop;
            holder.scrollLeft = scrollLeft;
        }
        return true;
    }

    /**
     * The build-settle redraw, on the next frame, then `afterRedraw`. Skipped when
     * nothing it would correct has moved: the table still has the width it was built at
     * and every web font had loaded, so the rows Tabulator measured at build are the rows
     * on screen. When the redraw itself changed the width (a scrollbar appearing, a
     * sibling reflowing), a second one follows a frame later. An off-screen table redraws
     * too: a view awaits the settle while still hidden. While it is pending
     * (`#settlePending`), `_onShow()` stacks no redraw on it.
     * @param {Tabulator} table - The table whose `tableBuilt` just fired.
     * @param {number} builtWidth - Its width then.
     * @param {() => void} afterRedraw - Runs once the redraw settled, unless the table was replaced or destroyed.
     */
    #settle(table, builtWidth, afterRedraw) {
        const frame = (/** @type {() => void} */ callback) =>
            this.resources.trackAnimationFrame(callback);
        const finish = (/** @type {boolean} */ settled) => {
            if (this.#settlePending === table) this.#settlePending = null;
            if (settled && !table.destroyed && table === this.#table) afterRedraw();
        };
        this.#settlePending = table;
        frame(() => {
            if (table.element.offsetWidth === builtWidth && document.fonts.status === 'loaded') {
                finish(true);
                return;
            }
            if (!this.#redrawNow(table, { requireVisible: false })) {
                finish(false);
                return;
            }
            const redrawnWidth = table.element.offsetWidth;
            frame(() =>
                finish(
                    table.element.offsetWidth === redrawnWidth ||
                        this.#redrawNow(table, { requireVisible: false }),
                ),
            );
        });
    }

    /** @param {Tabulator} table - The current table. */
    #reportDisplayedRows(table) {
        // Read on demand: most tables show their rows to nobody.
        this._onDisplayedRowsChanged({
            get rows() {
                return table.getData('active');
            },
            get selected() {
                return table.getSelectedData();
            },
        });
    }

    /**
     * Replace the live table's column definitions in place, without destroying the
     * Tabulator instance or the surrounding module shell, for a column set that follows
     * state. Columns are processed as on the initial build. Filter-menu values
     * survive the swap: only values whose column is gone are dropped.
     * @param {import('tabulator-tables').Tabulator} table - The live table.
     * @param {TableColumnDefinition[]} columns - Unprocessed.
     */
    #swapColumns(table, columns) {
        this.#columnFields = leafFieldsOf(columns);
        // Cleared, never replaced, as in createTable().
        this.#columnVisibilityExcludedFields.clear();
        const { definitions, headerSized } = processColumnDefinitions(columns, {
            excludedFields: this.#columnVisibilityExcludedFields,
            columnDefaults: this.#columnDefaults,
            glossary: this.options.context.glossary,
            rows: () => table.getData(),
        });
        table.setColumns(definitions);
        // The new definitions carry new auto-derived floors; replace the old record.
        this.#headerGeometry.register(table, headerSized);

        // A filter value whose column disappeared is dropped, which needs a re-filter.
        if (this.#tableFilters.setDescriptors(columns)) {
            this.#syncFilters();
        }

        // The header cells are new: register their sort cycles and paint them.
        // setColumns() has already laid the new set out, so no redraw.
        setupProgressBarSorting(table, columns);
        resetProgressBarSorting(table);
    }

    /**
     * Redraw the table (formatters, column widths, header and row heights), keeping
     * its scroll position. Call it after showing/hiding columns, after the container's
     * width changed, or when something the formatters read changed; skipped while the
     * table is hidden or not yet built.
     */
    redraw() {
        this.#redrawNow();
    }

    /**
     * Show or hide the table's columns by `getShouldShow`, then redraw once, also
     * when no column changed, because a mode switch that shows the same columns
     * still changes what their formatters read. Columns excluded from the
     * visibility menu are never touched: their visibility is fixed by their
     * definition (hidden sort targets, export-only columns). A no-op without a table.
     * @param {(column: import('tabulator-tables').ColumnComponent) => boolean|undefined} getShouldShow - The column's
     *   visibility; `undefined` leaves it as it is (the user's choice stands).
     * @protected
     */
    _applyColumnVisibility(getShouldShow) {
        const table = this.#table;
        if (!table) return;

        table.blockRedraw();
        try {
            for (const column of table.getColumns()) {
                if (this.#columnVisibilityExcludedFields.has(column.getField())) continue;
                const shouldShow = getShouldShow(column);
                if (typeof shouldShow !== 'boolean' || column.isVisible() === shouldShow) continue;
                if (shouldShow) column.show();
                else column.hide();
            }
        } finally {
            table.restoreRedraw();
        }
        this.redraw();
    }

    /**
     * Let the next show redraw, even while a settle redraw is still to come.
     * @override
     */
    _onHide() {
        this.#settlePending = null;
    }

    /**
     * Redraw the table and run the operations deferred while it was hidden, once
     * it (or an ancestor) is shown again.
     * @override
     */
    _onShow() {
        // The header-derived floors are measured against the root font size and the
        // container (see TableHeaderGeometry), and a resize while this module was
        // display:none leaves them stale, with no container resize for the realign
        // observer to react to. Refreshed before the redraw below, which would
        // otherwise lay out at the stale floors.
        this.#headerGeometry.refresh();

        // The operations deferred while hidden run before the redraw: a deferred
        // data update can change content, and with it column widths. The flush is
        // synchronous, so both land before this paint.
        this.#readiness.flush();

        // Hidden, Tabulator laid the columns out at 0×0: redraw before the next paint,
        // unless the build's settle redraw is pending. If that moves the columns' room
        // (the body's scrollbar appears, a `fitDataFill` width changes), redraw again.
        const table = this.#table;
        if (!table || this.#settlePending === table) return;
        const body = table.element.querySelector('.tabulator-tableholder');
        const room = body?.clientWidth;
        if (this.#redrawNow() && body?.clientWidth !== room) this.#redrawNow();
    }

    // ========================================================================
    // EXPORT DESCRIPTOR HOOKS
    // ========================================================================

    /**
     * Type 'table': ExportService supplies CSV/JSON/PDF actions over the tables found
     * in the capture container. A titled table is exportable unless it opts out (`enableModuleExport: false`).
     * @override
     * @returns {'table'}
     */
    _getExportType() {
        return 'table';
    }

    /**
     * Swap the clone's table for the full HTML of the active rows (`printActiveRows`):
     * filtered and sorted as on screen, the rows of a collapsed row group included, which
     * the live DOM does not hold.
     * @override
     * @param {(live: Element) => Element|null} cloneOf - Maps a live element to its copy in the clone.
     */
    _prepareOwnClone(cloneOf) {
        const table = this.table;
        if (!table) return;
        const clonedTable = cloneOf(table.element);
        if (!clonedTable) return;

        const printed = document.createElement('div');
        // The print opens collapsed row groups and folds them again: the module's own change.
        this.#mutateTable(() => printed.append(printActiveRows(table)));
        clonedTable.replaceWith(printed);
    }

    /**
     * The active rows as CSV or JSON, through Tabulator's own writers, so filters, sort
     * order and column visibility are the ones on screen. A collapsed row group still
     * exports its rows: collapsing hides them from view, it does not filter them out.
     * @override
     * @param {'csv'|'json'} format
     * @returns {import('@tba3/module-base').ExportDataBlock[]} This table's block, under the card's title.
     */
    _ownExportData(format) {
        if (!this.table) return [];

        // The intercept callback receives the generated text synchronously, which
        // is also what lets the download accessors read the format flag.
        setDownloadFormat(format);
        let content = '';
        // Tabulator 6.5 takes the intercept callback as a fifth argument, which
        // `@types/tabulator-tables` (6.3) does not declare yet.
        const download =
            /** @type {(type: 'csv'|'json', filename: null, options: object, range: () => import('tabulator-tables').RowComponent[], intercept: (text: unknown) => void) => void} */ (
                /** @type {unknown} */ (this.table.download)
            );
        const table = this.table;
        download.call(
            table,
            format,
            null,
            format === 'csv' ? CSV_OPTIONS : {},
            // Tabulator's `'active'` range is its display list, which holds only the
            // header of a collapsed group; its filtered, sorted rows hold every row.
            () => table.getRows('active'),
            (text) => {
                content = String(text ?? '');
            },
        );
        return [{ title: this.cardTitle, text: content }];
    }

    /**
     * The toolbar controls after the preset row, shown once a table has been built:
     * the column menu, the filter menu, then Reset. Subclasses can override to add extra
     * buttons or to drop these.
     * @protected
     * @returns {unknown}
     */
    _tableHeaderActions() {
        return [this.#columnVisibilityMenu(), this.#tableFilterMenu(), this.#resetButton()];
    }

    /**
     * The Reset button: an action on the whole view, apart from the presets, which are
     * choices. Only a table whose rows the reader can narrow has one.
     * @returns {unknown} The button, or `nothing`.
     */
    #resetButton() {
        if (!this.#isNarrowable()) return nothing;
        return headerActionButton({
            name: 'table-reset',
            ariaLabel: this.options.context.glossary.getRequiredEntryText(
                'general.buttons.element_texts.table-reset.label',
            ),
            buttonContent: renderIcon('restart_alt'),
            onClick: () => this.#resetView(),
        });
    }

    /** @returns {unknown} */
    #columnVisibilityMenu() {
        return columnVisibilityMenu({
            glossary: this.options.context.glossary,
            getTable: () => this.table,
            excludedFields: this.#columnVisibilityExcludedFields,
            onToggleColumn: (col) => {
                const field = col.getField();
                const show = !col.isVisible();
                this._applyColumnVisibility((column) =>
                    column.getField() === field ? show : undefined,
                );
            },
            onShowAll: (columns) => {
                const fields = new Set(columns.map((col) => col.getField()));
                this._applyColumnVisibility((col) =>
                    fields.has(col.getField()) ? true : undefined,
                );
            },
        });
    }

    /**
     * The filter dropdown. A table whose columns declare no filters gets no button at
     * all; a column swap that brings
     * the first filterable column brings the button.
     * @returns {unknown} The dropdown, or `nothing`.
     */
    #tableFilterMenu() {
        if (this.#tableFilters.descriptors.length === 0) return nothing;
        return tableFilterMenu({
            glossary: this.options.context.glossary,
            activeCount: this.#tableFilters.activeCount,
            getDescriptors: () => this.#tableFilters.descriptors,
            getValue: (field) => this.#tableFilters.getValue(field),
            getRows: () => this.#filterableRows(),
            onChange: (field, value) => this._setTableFilterValue(field, value),
            onClearAll: () => this.#clearTableFilters(),
        });
    }

    // ========================================================================
    // ROW REPLACEMENT
    // ========================================================================

    /**
     * Show these rows in the spec's table. A live table swaps them in place, keeping its
     * filters and its sort, after the spec's columns when their fields differ from its
     * own; it carries the active preset over: re-applied to the new rows (its row limit
     * was picked from the old ones), or dropped when `_getPresets()` no longer offers
     * it. `_onDisplayedRowsChanged()` hears of all that once, at the end. Without a
     * table (none yet, or the swap failed and destroyed it) the spec builds one; a table
     * replaced, cleared or torn down while the swap was in flight leaves nothing to do.
     * @param {Array<{[field: string]: any}>} rows
     * @param {RowsSpec} spec
     * @returns {Promise<void>}
     */
    async setRows(rows, { columns, initialSort, options, onRowClick }) {
        if (await this.#replaceRows(rows, columns)) return;
        this.createTable({ columns, data: rows, initialSort, options });
        if (onRowClick) this.table?.on('rowClick', (_event, row) => onRowClick(row.getData()));
    }

    /**
     * The column swap, the row swap and the preset re-application are the module's own
     * changes, reported as one change at the end: in between, an active preset's row
     * limit still keeps the old rows (by identity) and lets none of the new ones through.
     * The rows and the preset run with the redraw blocked, so Tabulator filters and
     * sorts the new rows once; the columns go first, laid out by `setColumns` itself.
     * @param {Array<{[field: string]: any}>} data
     * @param {TableColumnDefinition[]} columns - Unprocessed.
     * @returns {Promise<boolean>} False when there is no table, or the swap failed and
     *   destroyed it; true also when the table was replaced, cleared or torn down while
     *   the swap was in flight, which leaves nothing for this call to build.
     */
    async #replaceRows(data, columns) {
        const table = this.table;
        if (!table) return false;
        if (leafFieldsOf(columns) !== this.#columnFields) {
            this.#mutateTable(() => this.#swapColumns(table, columns));
        }

        const restoreRedraw = () => {
            if (!table.destroyed) table.restoreRedraw();
        };
        table.blockRedraw();
        try {
            await this.#mutateTable(() => table.replaceData(data));
        } catch (error) {
            restoreRedraw();
            if (this.#table !== table) return true;
            console.warn(
                `${this.constructor.name}[${this.id}]: Failed to replace data, recreating table`,
                error,
            );
            this.#destroyTable();
            return false;
        }
        if (this.#table !== table) {
            restoreRedraw();
            return true;
        }

        this.#mutateTable(() => {
            // The swap's block ends with the one pass over the new rows, inside the
            // module's own change: lifted by the preset re-application (before it picks
            // a row limit from the sorted rows) or here, also when `_getPresets()` throws,
            // which would otherwise leave the table blocked for good.
            let lifted = false;
            try {
                lifted = this.#presetManager.updatePresets(this.#presets(), {
                    redrawHeld: true,
                });
            } finally {
                if (!lifted) restoreRedraw();
            }
        });
        this.#queueReport();
        return true;
    }

    #destroyTable() {
        this.#table?.destroy();
        this.#table = null;
        this.#queueReport = () => {};
    }

    /** Destroy the table and empty the body; its toolbar menus go with it. */
    clear() {
        this.#destroyTable();
        this.#toolbarReady.value = false;
        this.contentContainer.replaceChildren();
    }

    /**
     * @override
     */
    _teardown() {
        // Not tracked via resources: the module replaces its table
        // mid-lifecycle. Destroying it also releases its settle slot.
        this.#destroyTable();
        super._teardown();
    }
}

export { TableModule };
