/**
 * TablePresetManager — manages preset filter/sort/limit buttons for Tabulator tables.
 *
 * Encapsulates preset DOM, button state, and table filter/sort/limit application
 * as a self-contained composition unit.
 *
 * Usage (inside TableModule):
 * ```javascript
 * this.#presetManager = new TablePresetManager();
 * const container = this.#presetManager.createContainer(presets);
 * // … append container to DOM …
 * this.#presetManager.attachListeners(presets, table);
 * this.#presetManager.initStateTracking(containerId, presets, table, initialSort, onResetCallback, getPersistentFilters);
 * // on cleanup:
 * this.#presetManager.destroy();
 * ```
 * @module tablePresetManager
 */

import { applyProgressBarSorting, resetProgressBarSorting } from '../progressBarSorting.js';
import { glossaryAnnotator } from '../../glossary/glossaryAnnotator.js';
import {
    createSegmentedButtonRow,
    createSegmentedChoiceButton,
    setSegmentedChoiceButtonState,
} from '@tba3/module-base/modules/header/segmentedButtonBuilder.js';
import './tablePresetManager.css';

/**
 * Identity of one preset button for the rebuild diff in `updatePresets`.
 * @param {string} label - Button label
 * @param {boolean} disabled - Whether the button renders disabled
 * @returns {string} A key that changes when either the label or the disabled state does.
 */
function presetKey(label, disabled) {
    return `${label}|${disabled}`;
}

// ============================================================================
// TABLE PRESET MANAGER
// ============================================================================

export class TablePresetManager {
    #presetContainer;
    #presetButtonHandlers;
    #tableState;
    #isProgrammaticUpdate;
    #hasLimitFilter;
    #trackedTable; // Reference to the Tabulator instance for .off() cleanup
    #trackedHandlers; // Named handler references for targeted .off() removal
    #initialSort; // Default sort configuration to restore on full reset
    #onResetCallback; // Optional callback invoked after a full reset
    #getPersistentFilters; // Callback returning filter functions to preserve across clears
    #clearTableFilters; // Callback dropping the filter-menu values on a full reset

    constructor() {
        this.#presetContainer = null;
        this.#presetButtonHandlers = [];
        this.#tableState = null;
        this.#isProgrammaticUpdate = false;
        this.#hasLimitFilter = false;
        this.#trackedTable = null;
        this.#trackedHandlers = null;
        this.#initialSort = null;
        this.#onResetCallback = null;
        this.#getPersistentFilters = null;
        this.#clearTableFilters = null;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Suppresses the dataFiltered/dataSorted auto-clear of the active preset.
     * Call before programmatic table operations (e.g. replaceData) that fire
     * those events but should not be treated as user-driven filter changes.
     * Always pair with endProgrammaticUpdate().
     */
    beginProgrammaticUpdate() {
        this.#isProgrammaticUpdate = true;
    }

    /** Counterpart to beginProgrammaticUpdate(). */
    endProgrammaticUpdate() {
        this.#isProgrammaticUpdate = false;
    }

    /**
     * Clears the active preset: resets the tracked index, the row-limit flag and
     * removes the active visual state from all preset buttons. Call when the table
     * is cleared (no data) or re-scoped so buttons do not appear active without a
     * filter. The caller owns clearing the table's filters themselves.
     */
    resetActivePreset() {
        if (this.#tableState) {
            this.#tableState.activePreset = null;
        }
        this.#hasLimitFilter = false;
        this.#clearPresetButtonActiveClass();
    }

    /**
     * Creates the preset buttons DOM container.
     * Returns `null` if `presets` is empty/falsy.
     * @param {Array<object>} presets - Preset config objects (each must have `.label`)
     * @returns {HTMLElement|null} Container element, or null
     */
    createContainer(presets) {
        if (!presets || presets.length === 0) return null;

        // Idempotent: return existing container on subsequent createTable() calls.
        // attachListeners() will re-wire the buttons to the new table instance.
        if (this.#presetContainer) return this.#presetContainer;

        this.#presetContainer = createSegmentedButtonRow('table-preset-container');
        this.#renderPresetButtons(presets);
        return this.#presetContainer;
    }

    /**
     * (Re)builds the button row inside the existing container: a "Reset" button
     * followed by one button per preset. Kept separate from createContainer() so
     * updatePresets() can reflect a *changed* preset list — a preset set can grow
     * or shrink at runtime (e.g. the MA class table drops its Kompetenzstufe-based
     * presets when scoped to a single Leitidee).
     * @param {Array<object>} presets - Preset config objects
     */
    #renderPresetButtons(presets) {
        const container = this.#presetContainer;
        if (!container) return;

        container.replaceChildren();

        // "Reset" button. Its text is shared by every table, so it lives with the
        // other generic button texts under `general.buttons` rather than per table.
        const resetBasePath = 'general.buttons.element_texts.table-reset';
        const clearButton = createSegmentedChoiceButton({
            label: glossaryAnnotator.getRequiredEntryText(`${resetBasePath}.label`),
            tooltipText: glossaryAnnotator.getRequiredEntryText(`${resetBasePath}.tooltip`),
        });
        clearButton.dataset.tablePresetButton = 'true';
        clearButton.dataset.tablePresetAction = 'reset';
        // Reset is an action, not a choice — it must not advertise a toggle state.
        clearButton.removeAttribute('aria-pressed');
        container.appendChild(clearButton);

        // Preset buttons
        presets.forEach((preset, index) => {
            const button = createSegmentedChoiceButton({
                label: preset.label,
                tooltipText: preset.tooltipText,
            });
            button.dataset.tablePresetButton = 'true';
            button.dataset.presetIndex = String(index);
            // aria-disabled rather than `disabled`: setSegmentedChoiceButtonState
            // resets `disabled` to false on every active-state clear, and a
            // disabled button would lose the tooltip explaining why.
            if (preset.disabled) {
                button.setAttribute('aria-disabled', 'true');
            }
            container.appendChild(button);
        });
    }

    /**
     * Label and disabled state of each rendered preset button (excludes Reset).
     * Used to skip a needless DOM rebuild when the preset set is unchanged.
     * @returns {Array<string>} One `label|disabled` key per preset button currently in the DOM.
     */
    #renderedPresetKeys() {
        if (!this.#presetContainer) return [];
        return [...this.#presetContainer.querySelectorAll('[data-preset-index]')].map((button) =>
            presetKey(button.textContent ?? '', button.getAttribute('aria-disabled') === 'true'),
        );
    }

    /**
     * Attaches click handlers to preset buttons.
     * Must be called after the container has been appended to the DOM and the
     * Tabulator table is fully built (so that sorting/filter commands succeed).
     * @param {Array<object>} presets - Same array passed to `createContainer`
     * @param {object} table - Tabulator table instance
     */
    attachListeners(presets, table) {
        if (!this.#presetContainer) return;

        // Detach stale handlers from a previous table instance before re-wiring
        this.#presetButtonHandlers.forEach(({ button, handler }) => {
            button.removeEventListener('click', handler);
        });
        this.#presetButtonHandlers = [];

        const buttons = this.#presetContainer.querySelectorAll('[data-table-preset-button="true"]');

        buttons.forEach((button) => {
            const handler = () => {
                if (button.dataset.tablePresetAction === 'reset') {
                    // Inside the programmatic window like a preset application:
                    // Reset's own clearFilter/setSort echo back as dataFiltered /
                    // dataSorted, and with a row-limit preset active the
                    // dataFiltered handler would otherwise run its limit-drop
                    // branch mid-Reset and re-attach the persistent filters a
                    // second time.
                    this.#isProgrammaticUpdate = true;
                    try {
                        this.#clearFilters(table, true);
                    } finally {
                        this.#isProgrammaticUpdate = false;
                    }
                    // Also forgets the row-limit flag: the limit filter is gone
                    // with the clearFilter above, and a flag left behind would
                    // make the next user filter/sort run the limit-drop branch.
                    this.resetActivePreset();
                } else {
                    const presetIndex = parseInt(button.getAttribute('data-preset-index'), 10);
                    if (!isNaN(presetIndex) && presets[presetIndex]) {
                        if (presets[presetIndex].disabled) return;
                        // Ignore click if this preset is already active
                        if (this.#tableState?.activePreset === presetIndex) return;
                        this.#applyStateToTable(table, presets[presetIndex]);
                        this.#clearPresetButtonActiveClass();
                        setSegmentedChoiceButtonState(button, true);
                        this.#setActivePreset(presetIndex);
                    }
                }
            };

            button.addEventListener('click', handler);
            this.#presetButtonHandlers.push({ button, handler });
        });
    }

    /**
     * Initializes internal table-state tracking and attaches Tabulator
     * `dataFiltered` / `dataSorted` listeners that auto-clear the active
     * preset when the user manually changes filters or sorting.
     * @param {string} containerId - Container ID (for bookkeeping)
     * @param {Array<object>} presets - Preset configurations
     * @param {object} table - Tabulator instance
     * @param {Array} [initialSort] - Default sort config to restore on full reset
     * @param {Function} [onResetCallback] - Called after a full reset (receives the table instance)
     * @param {Function} [getPersistentFilters] - Returns filter functions to re-apply after clearFilter()
     * @param {Function} [clearTableFilters] - Drops the filter-menu values on a full reset
     */
    initStateTracking(
        containerId,
        presets,
        table,
        initialSort,
        onResetCallback,
        getPersistentFilters,
        clearTableFilters,
    ) {
        this.#initialSort =
            Array.isArray(initialSort) && initialSort.length > 0 ? initialSort : null;
        this.#onResetCallback = typeof onResetCallback === 'function' ? onResetCallback : null;
        this.#getPersistentFilters =
            typeof getPersistentFilters === 'function' ? getPersistentFilters : null;
        this.#clearTableFilters =
            typeof clearTableFilters === 'function' ? clearTableFilters : null;
        this.#tableState = {
            containerId,
            filters: [],
            sorting: [],
            activePreset: null,
            presets: presets || [],
        };

        this.#attachStateTrackingListeners(table);
    }

    /**
     * Replaces preset configurations and re-wires click handlers, re-rendering the
     * button row when the preset set itself changed (grew, shrank, or was relabelled).
     * If a preset was active and still exists, re-applies it with the updated
     * configuration; otherwise the now-dangling active preset is cleared.
     * @param {Array<object>} newPresets - New preset config objects
     * @param {object} table - Tabulator table instance
     */
    updatePresets(newPresets, table) {
        if (!this.#tableState) return;

        const presets = newPresets ?? [];
        const activeIndex = this.#tableState.activePreset;
        this.#tableState.presets = presets;

        // Only touch the DOM when the button set actually changed. Callers that
        // merely re-target a preset's sort column (EN/SL) keep identical labels,
        // so their button row must not be rebuilt (that would flicker).
        const keys = presets.map((preset) =>
            presetKey(preset.label ?? '', preset.disabled === true),
        );
        const rendered = this.#renderedPresetKeys();
        const buttonsChanged =
            keys.length !== rendered.length || keys.some((key, index) => key !== rendered[index]);
        if (buttonsChanged) {
            this.#renderPresetButtons(presets);
        }

        // Re-wire click handlers to reference the new preset objects
        this.attachListeners(presets, table);

        // If a preset was active, re-apply with the updated configuration
        if (activeIndex !== null && activeIndex !== undefined && presets[activeIndex]) {
            this.#applyStateToTable(table, presets[activeIndex]);
            this.#setActivePreset(activeIndex);
        } else {
            // The previously active preset no longer exists in the new set.
            this.#clearActivePreset();
            this.#clearPresetButtonActiveClass();
        }
    }

    /**
     * Disposes of all DOM references and event listeners.
     */
    destroy() {
        // Remove Tabulator event listeners
        if (this.#trackedTable && this.#trackedHandlers) {
            try {
                this.#trackedTable.off('dataFiltered', this.#trackedHandlers.dataFiltered);
                this.#trackedTable.off('dataSorted', this.#trackedHandlers.dataSorted);
            } catch {
                /* table may already be destroyed */
            }
            this.#trackedTable = null;
            this.#trackedHandlers = null;
        }

        this.#presetButtonHandlers.forEach(({ button, handler }) => {
            button.removeEventListener('click', handler);
        });
        this.#presetButtonHandlers = [];
        this.#presetContainer = null;
        this.#tableState = null;
        this.#isProgrammaticUpdate = false;
        this.#hasLimitFilter = false;
        this.#initialSort = null;
        this.#onResetCallback = null;
        this.#getPersistentFilters = null;
        this.#clearTableFilters = null;
    }

    // ========================================================================
    // FILTER / SORT / LIMIT APPLICATION
    // ========================================================================

    /**
     * Performs a full table reset: clears all filters (including the filter
     * menu's values), sorting, progress-bar sort state, row selection, and
     * re-applies the table's initial/default sort.
     * @param {object} table - Tabulator instance
     * @param {boolean} [isFullReset=false] - When true (Reset button), performs
     *   the complete reset including the filter-menu values, progress bar state,
     *   initial sort restoration, row deselection, and the onReset callback.
     *   When false (preset switch), only clears programmatic filters & sort.
     */
    #clearFilters(table, isFullReset = false) {
        if (table && typeof table.clearFilter === 'function') {
            // Clear sort before filters to prevent Tabulator Sort module errors
            // when custom progress bar sorting state conflicts with internal state
            table.clearSort();
            table.clearFilter();

            // A full reset also drops the filter-menu values. This must happen
            // before the persistent filters are re-applied below, since the menu's
            // own filter is one of them — re-attaching it first would restore the
            // very values the Reset button is clearing.
            if (isFullReset) {
                this.#clearTableFilters?.();
            }

            // Re-apply persistent filters (the filter menu's, plus app-level ones
            // such as the domain filter) that must survive preset resets.
            this.#applyPersistentFilters(table);

            if (isFullReset) {
                resetProgressBarSorting(table);

                // Deselect all selected rows
                if (typeof table.deselectRow === 'function') {
                    table.deselectRow();
                }

                // Re-apply the table's default sort
                if (this.#initialSort) {
                    table.setSort(this.#initialSort);
                }

                // Notify the owning module so it can reset external state
                this.#onResetCallback?.(table);
            }
        }
    }

    /**
     * Re-applies the filters that must outlive a `clearFilter()`: the filter
     * menu's own filter and any app-level persistent filters.
     * @param {object} table - Tabulator instance
     */
    #applyPersistentFilters(table) {
        const persistent = this.#getPersistentFilters?.();
        if (!persistent || persistent.length === 0) return;

        persistent.forEach((filterFunction) => table.addFilter(filterFunction));
    }

    /**
     * Applies filters to a table
     * @param {object} table - Tabulator instance
     * @param {Array | object} filters - Filter configs or `{ programmatic: [...] }`
     */
    #applyFilters(table, filters) {
        const filterArray = Array.isArray(filters) ? filters : filters?.programmatic || [];
        if (!filterArray || filterArray.length === 0) return;

        filterArray.forEach((filter) => {
            if (filter.type === 'custom' || typeof filter.value === 'function') {
                table.addFilter(filter.value);
            } else if (filter.field && filter.type && filter.value !== undefined) {
                table.addFilter(filter.field, filter.type, filter.value);
            }
        });
    }

    /**
     * Applies sorting to a table, including progress-bar virtual-column logic.
     * @param {object} table - Tabulator instance
     * @param {Array} sorting - Sort configs
     */
    #applySorting(table, sorting) {
        if (!sorting || sorting.length === 0) return;

        const sortConfig = sorting[0];
        const sortKey = sortConfig?.column || sortConfig?.field;

        if (sortConfig && applyProgressBarSorting(table, sortKey, sortConfig.dir)) {
            return;
        }

        const tabulatorSort = sorting.map((s) => ({
            column: s.column || s.field,
            dir: s.dir,
        }));
        table.setSort(tabulatorSort);
        resetProgressBarSorting(table);
    }

    /**
     * Applies row limit via filter
     * @param {object} table - Tabulator instance
     * @param {number} limit - Max rows
     */
    #applyLimit(table, limit) {
        if (!limit || typeof limit !== 'number') {
            this.#hasLimitFilter = false;
            return;
        }

        const sortedData = table.getData('active');
        if (sortedData.length === 0) {
            this.#hasLimitFilter = false;
            return;
        }

        const firstRow = sortedData[0];
        const DEFAULT_ID_FIELDS = ['studentId', 'itemId', 'iqbId', 'id'];
        let idField = 'id';
        for (const field of DEFAULT_ID_FIELDS) {
            if (firstRow[field] !== undefined) {
                idField = field;
                break;
            }
        }

        const keepIds = new Set();
        const actualLimit = Math.min(limit, sortedData.length);
        for (let i = 0; i < actualLimit; i++) {
            if (sortedData[i][idField]) {
                keepIds.add(sortedData[i][idField]);
            }
        }

        table.addFilter((data) => keepIds.has(data[idField]));
        this.#hasLimitFilter = true;
    }

    /**
     * Applies a complete state (filters, sorting, limit)
     * @param {object} table - Tabulator instance
     * @param {object} state - State object
     */
    #applyStateToTable(table, state) {
        if (!state) return;

        this.#isProgrammaticUpdate = true;
        this.#clearFilters(table);

        if (state.filters) {
            this.#applyFilters(table, state.filters);
        }

        const sorting = state.sorting || state.sort;
        if (sorting) {
            this.#applySorting(table, sorting);
        }

        if (state.limit) {
            this.#applyLimit(table, state.limit);
        }

        this.#isProgrammaticUpdate = false;
    }

    // ========================================================================
    // BUTTON STATE
    // ========================================================================

    #clearPresetButtonActiveClass() {
        if (this.#presetContainer) {
            this.#presetContainer.querySelectorAll('[data-preset-index]').forEach((btn) => {
                setSegmentedChoiceButtonState(btn, false);
            });
        }
    }

    #clearActivePreset() {
        if (this.#tableState) {
            this.#tableState.activePreset = null;
        }
    }

    #setActivePreset(presetIndex) {
        if (!this.#tableState) return;

        this.#tableState.activePreset = presetIndex;
        this.#clearPresetButtonActiveClass();

        if (this.#presetContainer) {
            const button = this.#presetContainer.querySelector(
                `[data-preset-index="${presetIndex}"]`,
            );
            if (button) {
                setSegmentedChoiceButtonState(button, true);
            }
        }
    }

    /**
     * Attaches Tabulator event listeners to auto-clear preset state when
     * the user manually changes filters or sorting.
     * @param {object} table - Tabulator instance
     */
    #attachStateTrackingListeners(table) {
        if (!this.#tableState) return;

        // Detach listeners from the previous table instance (if any)
        if (this.#trackedTable && this.#trackedHandlers) {
            try {
                this.#trackedTable.off('dataFiltered', this.#trackedHandlers.dataFiltered);
                this.#trackedTable.off('dataSorted', this.#trackedHandlers.dataSorted);
            } catch {
                /* table may already be destroyed */
            }
        }

        // Store reference for cleanup in destroy()
        this.#trackedTable = table;

        const onDataFiltered = () => {
            if (this.#isProgrammaticUpdate) return;

            if (this.#hasLimitFilter) {
                // The user filtered while a row-limit preset ("Stärkste 5") was
                // active: the limit pinned a now-stale row set, so drop it — but
                // keep the filters that caused this event in the first place.
                this.#isProgrammaticUpdate = true;
                table.clearFilter();
                this.#hasLimitFilter = false;
                this.#clearPresetButtonActiveClass();
                this.#clearActivePreset();
                this.#applyPersistentFilters(table);
                this.#isProgrammaticUpdate = false;
            } else {
                this.#clearPresetButtonActiveClass();
                this.#clearActivePreset();
            }
        };

        const onDataSorted = () => {
            if (this.#hasLimitFilter && !this.#isProgrammaticUpdate) {
                this.#isProgrammaticUpdate = true;
                table.clearFilter();
                this.#hasLimitFilter = false;
                this.#clearPresetButtonActiveClass();
                this.#clearActivePreset();
                this.#applyPersistentFilters(table);
                // Use queueMicrotask instead of setTimeout to avoid untracked timer
                queueMicrotask(() => {
                    this.#isProgrammaticUpdate = false;
                });
            } else if (!this.#isProgrammaticUpdate) {
                this.#clearPresetButtonActiveClass();
                this.#clearActivePreset();
            }
        };

        // Store named references so destroy() can remove only our handlers
        this.#trackedHandlers = { dataFiltered: onDataFiltered, dataSorted: onDataSorted };

        table.on('dataFiltered', onDataFiltered);
        table.on('dataSorted', onDataSorted);
    }
}
