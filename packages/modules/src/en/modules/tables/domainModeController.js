/**
 * The EN Domäne mode (`all` | domain id) of an EN table.
 *
 * Every EN table follows the header's Domäne switch the same way: its `domainMode`
 * option is a mode signal (or a plain mode), a
 * `TableModeController` applies each change through the callback the table hands it,
 * and the table builds for `mode`. One binding for every EN table, plus the EN config
 * they all read; `filteringRows` binds a table that keeps the mode as a domain row
 * filter.
 */

import { TableModeController } from '../../../common/tables/tableModeController.js';
import { EN_DATASETS } from '../../enDatasets.js';
import { applyModeVisibility, shouldShowColumnForMode } from './enDomainModeRules.js';

/**
 * The option every EN table takes on top of its base's: the Domäne mode it follows —
 * a signal, or a fixed mode; `'all'` when left out.
 * @typedef {{domainMode?: string | import('@preact/signals-core').Signal<string>}} DomainModeOptions
 */

/**
 * @typedef {import('../../../common/tables/tableModeController.js').TableModeHost & {
 *   options: DomainModeOptions & {context: import('../../../common/context/moduleContext.js').ModuleContext},
 * }} DomainModeHost
 */

export class DomainModeController {
    #host;
    /** @type {TableModeController<string>} */
    #mode;

    /**
     * @param {DomainModeHost} host
     * @param {(mode: string, previous: string) => void} apply - Brings the table to a new mode from the one it was in (its `_applyModeChange`).
     */
    constructor(host, apply) {
        this.#host = host;
        this.#mode = new TableModeController(host, {
            mode: host.options.domainMode ?? 'all',
            key: 'mode',
            apply,
        });
    }

    /**
     * A controller for a table that keeps the mode as its persistent domain row filter —
     * the rows of one domain (`row.domain` is the id a mode names), none for `all`. The
     * filter is set at once, so the first build starts with it. A switch that enters or
     * leaves `all` also redraws: the Nr. column's formatter reads the mode (a domain
     * prefix only in `all`) and the rows of the kept domain stay rendered. Between two
     * domains every row is new, so the refilter suffices.
     * @param {DomainModeHost} host
     * @param {(filter: ((row: {domain?: unknown}) => boolean) | null, redraw: boolean) => void} setRowFilter - Sets the table's `domain` persistent filter, and redraws when told to.
     * @returns {DomainModeController}
     */
    static filteringRows(host, setRowFilter) {
        /**
         * @param {string} mode - `'all'` or a domain id.
         * @returns {((row: {domain?: unknown}) => boolean) | null} The filter; null for `all`.
         */
        const filterFor = (mode) => (mode === 'all' ? null : (row) => row.domain === mode);
        const controller = new DomainModeController(host, (mode, previous) =>
            setRowFilter(filterFor(mode), (previous === 'all') !== (mode === 'all')),
        );
        setRowFilter(filterFor(controller.mode), false);
        return controller;
    }

    /**
     * The mode in force: `'all'` or a domain id. A tracked read.
     * @returns {string}
     */
    get mode() {
        return this.#mode.value;
    }

    /**
     * The group's EN config, which the mode rules and the columns read.
     * @returns {import('../../enConfig.js').EnConfig}
     */
    get enConfig() {
        return this.#host.options.context.documents.getDataset(EN_DATASETS.CONFIG);
    }

    /**
     * Column definitions with each one's visibility set for the mode in force, for a
     * table to build with.
     * @param {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} columns
     * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} A new array; governed definitions are copies with `visible` set.
     */
    withModeVisibility(columns) {
        return applyModeVisibility(columns, this.mode, this.enConfig);
    }

    /**
     * Which built columns a mode shows, for a table's `_applyColumnVisibility`.
     * @param {string} mode - `'all'` or a domain id
     * @returns {(column: import('tabulator-tables').ColumnComponent) => boolean|undefined} Whether the column shows; `undefined` for one the mode rules leave alone.
     */
    columnVisibility(mode) {
        const enConfig = this.enConfig;
        return (column) => shouldShowColumnForMode(column.getField(), mode, enConfig);
    }
}
