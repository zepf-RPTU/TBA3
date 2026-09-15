/**
 * TableFilterController — owns a table's filter descriptors and their current
 * values, and applies them to Tabulator as one programmatic filter.
 *
 * Composed into TableModule next to TablePresetManager / TableEventSuppressor.
 * Columns render no Tabulator header filters — filtering lives in the header-action
 * menu (`tableFilterMetadata.js`); this
 * controller is the single place that turns the extracted descriptors plus the
 * user's selections into an active Tabulator filter.
 *
 * Attachment is read back from Tabulator (`getFilters()`) rather than tracked in
 * a flag: the preset manager clears all programmatic filters on a preset switch
 * and re-applies the persistent ones (this controller's function among them), so
 * a local flag would drift. `apply()` is therefore idempotent — it attaches the
 * filter when missing and only refreshes when it is already there.
 */

import {
    extractTableFilterDescriptors,
    isTableFilterValueSet,
    matchesTableFilters,
} from '../tableFilterMetadata.js';

export class TableFilterController {
    /** @type {Array<import('../tableFilterMetadata.js').TableFilterDescriptor>} */
    #descriptors = [];
    /** @type {{[field: string]: any}} */
    #values = {};
    #getTable;
    #filterFunction;

    /**
     * @param {object} params - How the controller reaches the live table.
     * @param {() => (object | null)} params.getTable - Returns the current Tabulator instance
     */
    constructor({ getTable }) {
        this.#getTable = getTable;
        this.#filterFunction = (rowData) =>
            matchesTableFilters(this.#descriptors, this.#values, rowData);
    }

    /** @returns {Array<import('../tableFilterMetadata.js').TableFilterDescriptor>} The filterable columns of the current set, in column order. */
    get descriptors() {
        return this.#descriptors;
    }

    /** @returns {number} Number of fields with a value set. */
    get activeCount() {
        return Object.values(this.#values).filter(isTableFilterValueSet).length;
    }

    /**
     * The filter functions that must survive a preset switch: this controller's
     * composite filter, but only while the table actually has filterable columns.
     * @returns {Array<Function>} This controller's composite filter, or nothing when the table has no filterable columns.
     */
    get persistentFilters() {
        return this.#descriptors.length > 0 ? [this.#filterFunction] : [];
    }

    /**
     * Read the descriptors off a fresh column set, dropping values whose column
     * no longer exists (e.g. MA's `ks` when switching to a Leitidee pool).
     * @param {Array<object>} columns - Unprocessed column definitions
     * @returns {boolean} True when at least one value was dropped
     */
    setDescriptors(columns) {
        this.#descriptors = extractTableFilterDescriptors(columns);

        const fields = new Set(this.#descriptors.map((descriptor) => descriptor.field));
        let dropped = false;
        for (const field of Object.keys(this.#values)) {
            if (!fields.has(field)) {
                delete this.#values[field];
                dropped = true;
            }
        }

        return dropped;
    }

    /**
     * Replace the descriptors and drop every value. Used on a full table
     * (re)build, which starts without any filter applied.
     * @param {Array<object>} columns - Unprocessed column definitions
     */
    reset(columns) {
        this.#values = {};
        this.setDescriptors(columns);
    }

    /**
     * @param {string} field - Column field to read.
     * @returns {any} The current value, or '' when the field is not filtered
     */
    getValue(field) {
        return this.#values[field] ?? '';
    }

    /**
     * Set one field's filter value. Unknown fields are ignored — a column that
     * is not in the current set cannot be filtered (Tabulator warned instead).
     * @param {string} field - Column field to set; unknown fields are ignored.
     * @param {any} value - Empty string (or any "empty" value) clears the field
     * @returns {boolean} True when the value changed
     */
    setValue(field, value) {
        if (!this.#descriptors.some((descriptor) => descriptor.field === field)) return false;

        // Normalize "not set" to '' before comparing against the current value:
        // an unset field reads as undefined internally, so clearing it again
        // would otherwise report a change and trigger a re-filter — and a
        // re-filter drops the active preset (TablePresetManager#onDataFiltered).
        const nextValue = isTableFilterValueSet(value) ? value : '';
        if (this.getValue(field) === nextValue) return false;

        if (nextValue === '') {
            delete this.#values[field];
        } else {
            this.#values[field] = nextValue;
        }

        return true;
    }

    /**
     * Drop every filter value. Does not touch the table — callers decide whether
     * to re-apply (the menu does; the preset manager re-applies filters itself).
     * @returns {boolean} True when at least one value was cleared
     */
    clearValues() {
        if (Object.keys(this.#values).length === 0) return false;
        this.#values = {};
        return true;
    }

    /**
     * Push the current values to Tabulator: attach the composite filter when it
     * is missing, otherwise re-run it. Safe to call when no column is filterable.
     */
    apply() {
        const table = this.#getTable();
        if (!table) return;

        // Refresh first, and regardless of the descriptor count: a column swap
        // that removes the last filterable column drops its value, and an
        // already-attached filter still has to be re-run for those rows to come
        // back. Only the *attach* is conditional — a table without filterable
        // columns must not gain a filter (persistentFilters agrees).
        if (this.#isAttached(table)) {
            table.refreshFilter?.();
            return;
        }

        if (this.#descriptors.length === 0) return;

        table.addFilter?.(this.#filterFunction);
    }

    /**
     * Whether Tabulator currently holds this controller's filter function.
     * @param {object} table - Tabulator instance
     * @returns {boolean} True when Tabulator currently holds this controller's filter function.
     */
    #isAttached(table) {
        if (typeof table.getFilters !== 'function') return false;
        return table.getFilters().some((filter) => filter?.field === this.#filterFunction);
    }
}
