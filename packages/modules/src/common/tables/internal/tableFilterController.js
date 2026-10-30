/**
 * Owns a table's filter descriptors (`tableFilterMetadata.js`) and their current
 * values, and turns them into one row filter (`filter`), which the owner puts on the
 * table with its other filters.
 */

import {
    extractTableFilterDescriptors,
    isTableFilterValueSet,
    matchesTableFilters,
} from './tableFilterMetadata.js';
import { sameItems } from '@tba3/module-base';
import { signal } from '@preact/signals-core';

/** @typedef {import('./tableFilterMetadata.js').TableFilterValue} TableFilterValue */

/**
 * The descriptors and the values are signals, so a toolbar that read them (the
 * filter button and its count) follows them; every write replaces the value.
 */
export class TableFilterController {
    /** @type {import('@preact/signals-core').Signal<Array<import('./tableFilterMetadata.js').TableFilterDescriptor>>} */
    #descriptors = signal([]);
    /** @type {import('@preact/signals-core').Signal<{readonly [field: string]: TableFilterValue}>} Set values only: `setValue` deletes a cleared field. */
    #values = signal({});
    /** @type {import('./tablePresetManager.js').TableRowFilter} */
    #filterFunction = (rowData) =>
        matchesTableFilters(this.#descriptors.peek(), this.#values.peek(), rowData);

    /** @returns {Array<import('./tableFilterMetadata.js').TableFilterDescriptor>} The filterable columns of the current set, in column order. */
    get descriptors() {
        return this.#descriptors.value;
    }

    /** @returns {import('@preact/signals-core').ReadonlySignal<{readonly [field: string]: TableFilterValue}>} The set values by field. */
    get values() {
        return this.#values;
    }

    /** @returns {number} Number of fields with a value set. */
    get activeCount() {
        return Object.keys(this.#values.value).length;
    }

    /** @returns {import('./tablePresetManager.js').TableRowFilter|null} The row filter of the current values; null while none is set. */
    get filter() {
        return Object.keys(this.#values.peek()).length > 0 ? this.#filterFunction : null;
    }

    /**
     * Read the descriptors off a fresh column set, dropping values whose column is
     * gone.
     * @param {import('../columnFactories.js').TableColumnDefinition[]} columns - Unprocessed.
     * @returns {boolean} True when at least one value was dropped
     */
    setDescriptors(columns) {
        const descriptors = extractTableFilterDescriptors(columns);
        this.#descriptors.value = descriptors;

        const fields = new Set(descriptors.map((descriptor) => descriptor.field));
        const values = this.#values.peek();
        const kept = Object.fromEntries(
            Object.entries(values).filter(([field]) => fields.has(field)),
        );
        const dropped = Object.keys(kept).length < Object.keys(values).length;
        if (dropped) this.#values.value = kept;
        return dropped;
    }

    /**
     * Replace the descriptors and drop every value: a table build starts unfiltered.
     * @param {import('../columnFactories.js').TableColumnDefinition[]} columns - Unprocessed.
     */
    reset(columns) {
        this.#values.value = {};
        this.setDescriptors(columns);
    }

    /**
     * @param {string} field
     * @returns {TableFilterValue} The current value; while the field is not filtered, the
     *   empty form of its type: `[]` for a list filter, '' for a text filter or a field no
     *   column declares.
     */
    getValue(field) {
        return this.#values.peek()[field] ?? this.#emptyValue(field);
    }

    /**
     * @param {string} field - A field no column in the current set declares is ignored.
     * @param {TableFilterValue} value - The typed text of a text filter, the selected values of a list filter; '' or `[]` clears the field.
     * @returns {boolean} True when the value changed
     */
    setValue(field, value) {
        if (!this.#descriptors.peek().some((descriptor) => descriptor.field === field)) {
            return false;
        }

        // Clearing an unset field, or writing the value it already holds, is no change:
        // reporting one would trigger a re-filter, and a user's filter change drops the
        // active preset. A list is a set, stored sorted, so it compares item by item.
        // Either empty form ('' or `[]`) clears, whatever the field's type.
        const next = Array.isArray(value) ? [...new Set(value)].sort() : value;
        const current = this.#values.peek()[field];
        const unchanged = !isTableFilterValueSet(next)
            ? current === undefined
            : Array.isArray(next)
              ? Array.isArray(current) && sameItems(current, next)
              : current === next;
        if (unchanged) return false;

        const values = { ...this.#values.peek(), [field]: next };
        if (!isTableFilterValueSet(next)) delete values[field];
        this.#values.value = values;
        return true;
    }

    /**
     * @param {string} field
     * @returns {TableFilterValue} `[]` for a list filter, '' otherwise.
     */
    #emptyValue(field) {
        const descriptor = this.#descriptors.peek().find((entry) => entry.field === field);
        return descriptor?.type === 'list' ? [] : '';
    }

    /**
     * Drop every filter value.
     * @returns {boolean} True when at least one value was cleared
     */
    clearValues() {
        if (Object.keys(this.#values.peek()).length === 0) return false;
        this.#values.value = {};
        return true;
    }
}
