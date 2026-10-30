/**
 * The EN item overview table: one selectable row per item. A Domäne mode change swaps a
 * persistent filter rather than recreating the table.
 */

import { BaseItemTableModule } from '../../../common/tables/baseItemTableModule.js';
import { DomainModeController } from './domainModeController.js';
import { createEnItemColumns } from './enTableColumns.js';
import { createStylesColumn } from './enStyleTableUtils.js';
import { EN_DATASETS } from '../../enDatasets.js';

/**
 * @typedef {import('../../../common/tables/tableModule.js').TableOptions &
 *   import('./domainModeController.js').DomainModeOptions & {
 *     onDataSync?: (data: import('../charts/itemLollipop/itemLollipopConfig.js').ItemLollipopSyncPayload) => void,
 *     onItemSelected?: (selection: import('../enItemDetail/enItemDetailModule.js').ItemSelection) => void,
 * }} EnItemTableOptions
 */

/** @augments {BaseItemTableModule<EnItemTableOptions>} */
export class EnItemTableModule extends BaseItemTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [EN_DATASETS.ITEM_RECORDS, EN_DATASETS.CONFIG];

    /** @override */
    static selectableRows = true;

    /** @type {DomainModeController} */
    #domain;

    /** @override */
    _setup() {
        super._setup();
        this.#domain = DomainModeController.filteringRows(this, (filter, redraw) => {
            this._setPersistentFilter('domain', filter);
            if (redraw) this.redraw();
        });
    }

    /**
     * The Domäne mode rescopes this table in place, so it tells two captures apart;
     * filters and sorting narrow the same report card.
     * @override
     */
    getExportIdentity() {
        return this.#domain.mode;
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    _readItems() {
        return this.options.context.documents.getDataset(EN_DATASETS.ITEM_RECORDS);
    }

    /**
     * @override
     * @param {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} resultColumns - The shared result columns, after the item columns.
     */
    _getColumns(resultColumns) {
        return [
            ...createEnItemColumns(this.options.context, this.#domain),
            ...resultColumns,
            ...createStylesColumn(this.#domain.enConfig.styleCategories),
        ];
    }

    /**
     * A filter has already dropped the selection, which clears the tabs.
     * @override
     * @param {import('../../../common/tables/tableModule.js').DisplayedRows} shown
     */
    _onDisplayedRowsChanged({ rows, selected }) {
        const selectedIds = new Set(selected.map((item) => item.iqbId));
        const shownIds = rows.map((item) => item.iqbId);
        const drawn = shownIds.filter((id) => selectedIds.has(id));
        this.options.onDataSync?.({ ids: drawn.length > 0 ? drawn : shownIds });
        this.#syncDetailSelection(selected);
    }

    /**
     * Report the selection as ids (`onItemSelected`); an empty array means none.
     * @param {import('../../../common/tables/columnFactories.js').RowData[]} items
     */
    #syncDetailSelection(items) {
        this.options.onItemSelected?.({ itemIds: items.map((item) => item.iqbId) });
    }
}

customElements.define('tba-en-item-table', EnItemTableModule);
