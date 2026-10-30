/**
 * Shared base for item overview tables, one row per item: the render lifecycle and the
 * shared presets. The subclass supplies the columns, placing the shared result
 * columns among them, and the item records.
 */

import { TableModule } from './tableModule.js';
import { createItemResultColumns } from './progressBarColumn.js';

/** @type {ReadonlyArray<import('tabulator-tables').Sorter>} By item number. */
const ITEM_TABLE_DEFAULT_SORT = Object.freeze([{ column: 'name', dir: 'asc' }]);

/** From this share not attempted, an item counts as incomplete ("Hohe Nichtbearbeitung"). */
const NOT_ATTEMPTED_THRESHOLD_PERCENT = 25;

/**
 * @param {{percentageNotAttempted?: number|null}} row
 * @returns {boolean}
 */
const isIncomplete = (row) => (row.percentageNotAttempted ?? 0) >= NOT_ATTEMPTED_THRESHOLD_PERCENT;

/**
 * @template {import('./tableModule.js').TableOptions} [O=import('./tableModule.js').TableOptions]
 * @augments {TableModule<O>}
 */
export class BaseItemTableModule extends TableModule {
    /**
     * The table's columns: those that describe the items, with the shared result
     * columns placed among them.
     * @abstract
     * @param {import('./columnFactories.js').TableColumnDefinition[]} resultColumns - The shared result columns (Verteilung, Pilotierung and their export columns).
     * @returns {import('./columnFactories.js').TableColumnDefinition[]}
     */
    // eslint-disable-next-line no-unused-vars
    _getColumns(resultColumns) {
        throw new Error(`${this.constructor.name} must implement _getColumns()`);
    }

    /**
     * The item records the table shows, read from the `documents` store.
     * @abstract
     * @returns {Array<{[field: string]: any}>} One record per item.
     */
    _readItems() {
        throw new Error(`${this.constructor.name} must implement _readItems()`);
    }

    /**
     * The three shared presets: "Stärkste 5", "Schwächste 5", and "Hohe
     * Nichtbearbeitung" (from 25 % not attempted).
     * @override
     * @returns {import('./preset.js').PresetSpec[]}
     */
    _getPresets() {
        return [
            { key: 'best-five', sort: { column: 'percentageCorrect', dir: 'desc' }, limit: 5 },
            { key: 'worst-five', sort: { column: 'percentageIncorrect', dir: 'desc' }, limit: 5 },
            {
                key: 'incomplete',
                sort: { column: 'percentageNotAttempted', dir: 'desc' },
                filters: [isIncomplete],
            },
        ];
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        this.createTable({
            columns: this._getColumns(createItemResultColumns(this.options.context)),
            data: this._readItems(),
            initialSort: ITEM_TABLE_DEFAULT_SORT,
        });
    }
}
