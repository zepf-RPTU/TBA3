/**
 * The preset filter/sort/limit buttons of a Tabulator table: their template, their
 * active state, and applying a preset to the table. A preset's filters are on the
 * table exactly while it is active, so no filter applies without a pressed button or
 * a filter-menu value showing it.
 *
 * The manager does not listen to the table. Tabulator also refilters and resorts on
 * changes nobody chose (a data swap, a persistent filter), and only the owner can
 * tell those apart from the user's. Nor does it write Tabulator's filter list: it
 * exposes the active preset's filters (`filters`), and the owner's `syncFilters`
 * puts them on the table together with its own.
 */

import { applyProgressBarSorting, resetProgressBarSorting } from '../progressBarSorting.js';
import { signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import './tablePresetManager.css';

/** @typedef {import('../preset.js').Preset} Preset */

/**
 * A filter function Tabulator runs over each row.
 * @typedef {(rowData: {[field: string]: any}) => boolean} TableRowFilter
 */

/**
 * One entry of Tabulator's `setFilter` list: a field filter, or a filter function
 * in `field`.
 * @typedef {{field: string|TableRowFilter, type?: string, value?: any}} TableFilterEntry
 */

/**
 * What the manager reads of a table: the sort cycle's members (it drives the
 * progress-bar sorting), its lifecycle flags, the redraw block around a preset's calls,
 * the sort, and the active rows a row limit keeps.
 * @typedef {import('../progressBarSorting.js').SortTable & {
 *   initialized: boolean,
 *   destroyed: boolean,
 *   blockRedraw(): void,
 *   restoreRedraw(): void,
 *   setSort(sorters: Array<import('tabulator-tables').Sorter>): void,
 *   getRows(range: 'active'): Array<{getData(): {[field: string]: any}}>,
 * }} PresetTable
 */

/**
 * The row-limit filter: keeps the first `limit` active rows, in display order.
 * Tabulator hands a filter the row's own data object (`Row.getData()` without a
 * transform), so the rows are kept by identity and need no id field.
 * @param {PresetTable} table
 * @param {number} limit
 * @returns {TableRowFilter|null} Null on an empty table.
 */
function pickLimitFilter(table, limit) {
    const rows = table.getRows('active');
    if (rows.length === 0) return null;
    const keep = new Set(rows.slice(0, limit).map((row) => row.getData()));
    return (data) => keep.has(data);
}

/**
 * @param {Preset} preset
 * @returns {TableFilterEntry[]} The preset's own filters as entries of Tabulator's list.
 */
function presetFilterEntries(preset) {
    return (preset.filters ?? []).map((field) => ({ field }));
}

/**
 * Whether a preset stays active through the user's sort or filter-menu change: one that
 * filters without a row limit, whose filters apply under any sort and alongside the
 * menu's. A row limit pinned the top rows in the preset's order, picked from the rows
 * before the change, and a preset that only sorts has nothing left once re-sorted.
 * @param {Preset} preset
 * @returns {boolean}
 */
function outlivesUserChange(preset) {
    return (preset.filters?.length ?? 0) > 0 && !preset.limit;
}

/**
 * The presets and the active one are signals: a toolbar that rendered `template()`
 * follows them.
 */
export class TablePresetManager {
    /** @type {import('@preact/signals-core').Signal<Preset[]>} The presets a click applies, and the buttons `template()` shows. */
    #presets = signal([]);
    /** @type {import('@preact/signals-core').Signal<number|null>} Index of the active preset. */
    #activePresetIndex = signal(null);
    /** True while the manager's own calls run, so a sort they cause is not taken for the user's. */
    #isApplying = false;
    /** @type {TableFilterEntry[]} The active preset's own filters. */
    #presetFilters = [];
    /** @type {TableRowFilter|null} The active preset's row limit. */
    #limitFilter = null;
    /** @type {PresetTable | null} The Tabulator instance `bind()` bound; null before that. */
    #table = null;
    /** @type {() => void} The owner's: puts every filter, `filters` included, on the table. */
    #syncFilters;

    /**
     * @param {() => void} syncFilters - Replaces the table's filter list with the
     *   owner's filters plus this manager's `filters`.
     */
    constructor(syncFilters) {
        this.#syncFilters = syncFilters;
    }

    // ========================================================================
    // EVENT HANDLERS
    // ========================================================================

    /**
     * Whether a click may apply anything: not until the bound table is built (a preset
     * that sorts before the column DOM exists throws, and Tabulator sets `initialized`
     * right before `tableBuilt`), nor after it is destroyed (`clear()` leaves the
     * buttons in the header while no table is left to apply them to).
     * @returns {PresetTable|null}
     */
    #clickableTable() {
        const table = this.#table;
        return table?.initialized && !table.destroyed ? table : null;
    }

    /**
     * A click on a preset button. A click on the active one applies it again, which
     * brings back its sort after the user re-sorted; one on an unavailable preset
     * applies nothing.
     * @param {MouseEvent} event
     */
    #onPresetClick = (event) => {
        const table = this.#clickableTable();
        const button = /** @type {HTMLElement} */ (event.currentTarget);
        const presetIndex = parseInt(button.dataset.presetIndex ?? '', 10);
        const preset = this.#presets.peek()[presetIndex];
        if (!table || !preset || preset.unavailableReason) return;
        this.#applyStateToTable(table, preset);
        this.#activePresetIndex.value = presetIndex;
    };

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /** @returns {boolean} */
    get hasActivePreset() {
        return this.#activePresetIndex.peek() !== null;
    }

    /** @returns {Preset|null} The pressed preset, null while none is. */
    get #activePreset() {
        const active = this.#activePresetIndex.peek();
        return active === null ? null : (this.#presets.peek()[active] ?? null);
    }

    /** @returns {boolean} Whether the table offers presets; read in a template, it tracks them. */
    get hasPresets() {
        return this.#presets.value.length > 0;
    }

    /** @returns {TableFilterEntry[]} The active preset's filters, its row limit last. */
    get filters() {
        return this.#limitFilter
            ? [...this.#presetFilters, { field: this.#limitFilter }]
            : this.#presetFilters;
    }

    /**
     * Re-apply the active preset after the owner changed what it ranks over (a
     * persistent filter swap): a row limit picked from the old rows is out of date.
     */
    reapplyActivePreset() {
        const preset = this.#activePreset;
        if (preset && this.#table) this.#reapply(this.#table, preset);
    }

    /**
     * The user changed the sort or a filter-menu value: the active preset ends, its
     * filters with it, unless it `outlivesUserChange`.
     * @returns {boolean} Whether the table was refiltered, with the owner's current filters.
     */
    onUserChange() {
        if (this.#isApplying) return false;
        const preset = this.#activePreset;
        return preset !== null && !outlivesUserChange(preset) && this.resetActivePreset();
    }

    /**
     * Run the preset's own table changes. Tabulator reports the sort they cause
     * synchronously, inside `operation`, so the owner's `onUserChange()` for it is
     * ignored.
     * @param {() => void} operation - The table calls to make.
     */
    #asOwnChange(operation) {
        this.#isApplying = true;
        try {
            operation();
        } finally {
            this.#isApplying = false;
        }
    }

    /**
     * Clears the active preset and removes its filters from the bound table. Call when
     * the table is cleared (no data) or re-scoped, so no button looks active without
     * its filter, and when the user clears every filter. A table already destroyed is
     * left alone.
     * @returns {boolean} Whether the table was refiltered, with the owner's current filters.
     */
    resetActivePreset() {
        const hadFilters = this.filters.length > 0;
        this.#forgetActivePreset();
        if (!hadFilters || !this.#table || this.#table.destroyed) return false;
        this.#syncFilters();
        return true;
    }

    /** Drops the active preset and its filters without touching a table. */
    #forgetActivePreset() {
        this.#presetFilters = [];
        this.#limitFilter = null;
        this.#activePresetIndex.value = null;
    }

    /**
     * The preset button row: one button per preset, the active one pressed; `nothing`
     * without presets. An unavailable preset keeps its place, `aria-disabled` and still
     * focusable, so its tooltip can say why. lit-html patches the row, so a preset set
     * that changes at runtime changes only what differs, and one whose labels stay
     * keeps its buttons.
     * @returns {unknown}
     */
    template() {
        const presets = this.#presets.value;
        if (presets.length === 0) return nothing;
        const activeIndex = this.#activePresetIndex.value;

        const presetButtons = presets.map((preset, index) => {
            const active = activeIndex === index;
            return html`<button
                class=${active ? 'btn btn--text is-active' : 'btn btn--text'}
                data-preset-index=${index}
                data-tooltip-text=${preset.unavailableReason || preset.tooltipText || nothing}
                aria-pressed=${String(active)}
                aria-disabled=${preset.unavailableReason ? 'true' : nothing}
                @click=${this.#onPresetClick}
            >
                ${preset.label}
            </button>`;
        });
        return html`<div
            class="btn-group btn-group--segmented btn-group--wrap table-preset-container"
        >
            ${presetButtons}
        </div>`;
    }

    /**
     * Binds the manager to a (new) table, which starts without an active preset. The
     * buttons apply `presets` to it once it is built.
     * @param {PresetTable} table
     * @param {Preset[]} presets
     */
    bind(table, presets) {
        this.#table = table;
        this.#presets.value = presets;
        this.#forgetActivePreset();
    }

    /**
     * Replaces the presets. An active preset the new set still offers, and not as
     * unavailable, is re-applied with its new configuration (one that outlives the
     * user's changes keeps the current sort); otherwise it is cleared.
     * @param {Preset[]} newPresets
     * @param {{redrawHeld?: boolean}} [options] - `redrawHeld`: the caller has blocked the
     *   table's redraw and hands the block over; a re-application lifts it.
     * @returns {boolean} Whether it lifted the caller's block; without a re-application
     *   the caller still holds it.
     */
    updatePresets(newPresets, { redrawHeld = false } = {}) {
        const table = this.#table;
        if (!table) return false;

        const activeIndex = this.#activePresetIndex.peek();

        // Clicks now apply the new preset objects.
        this.#presets.value = newPresets;

        if (activeIndex === null) return false;

        const active = newPresets[activeIndex];
        if (active && !active.unavailableReason) {
            this.#reapply(table, active, redrawHeld);
            this.#activePresetIndex.value = activeIndex;
            return redrawHeld;
        }
        this.resetActivePreset();
        return false;
    }

    /**
     * Drops the presets and the table; the buttons' clicks go inert with them.
     */
    destroy() {
        this.#forgetActivePreset();
        this.#presets.value = [];
        this.#table = null;
    }

    // ========================================================================
    // FILTER / SORT / LIMIT APPLICATION
    // ========================================================================

    /**
     * Applies a preset's sort to a table, including progress-bar virtual-column logic.
     * @param {PresetTable} table
     * @param {import('../preset.js').PresetSort} sort
     */
    #applySorting(table, { column, dir }) {
        if (applyProgressBarSorting(table, column, dir)) return;
        resetProgressBarSorting(table);
        table.setSort([{ column, dir }]);
    }

    /**
     * Applies a complete state (filters, sorting, limit), replacing the previous
     * preset's filters. `setSort` replaces the sorters, so no sort is cleared first.
     * @param {PresetTable} table
     * @param {Preset} state
     * @param {{sort?: boolean, redrawHeld?: boolean}} [options] - `sort: false` leaves the
     *   table's sort standing; `redrawHeld`: the caller has blocked the redraw, and the
     *   restore here ends its block (blocking again would drop the refresh it queued).
     */
    #applyStateToTable(table, state, { sort = true, redrawHeld = false } = {}) {
        this.#asOwnChange(() => {
            // Each filter and sort call refilters and re-renders on its own;
            // blocked, Tabulator runs the pipeline once on restore. Restored before
            // the limit, which reads the sorted active rows.
            if (!redrawHeld) table.blockRedraw();
            try {
                this.#presetFilters = presetFilterEntries(state);
                this.#limitFilter = null;
                this.#syncFilters();
                if (sort) this.#applySorting(table, state.sort);
            } finally {
                table.restoreRedraw();
            }

            // The limit keeps the top of the rows the other filters and the sort left.
            if (state.limit) {
                this.#limitFilter = pickLimitFilter(table, state.limit);
                if (this.#limitFilter) this.#syncFilters();
            }
        });
    }

    /**
     * Applies the active preset again after its rows or its configuration changed. A
     * preset that outlives the user's changes puts only its filters on the table
     * again, since the sort may be the user's by now; any other is applied whole, its
     * own order still standing, so a row limit is picked again in it.
     * @param {PresetTable} table
     * @param {Preset} state
     * @param {boolean} [redrawHeld] - The caller's redraw block, which this lifts.
     */
    #reapply(table, state, redrawHeld = false) {
        this.#applyStateToTable(table, state, { sort: !outlivesUserChange(state), redrawHeld });
    }
}
