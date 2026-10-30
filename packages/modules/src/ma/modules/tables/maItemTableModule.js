/**
 * MaItemTableModule — the Mathe item overview table: one row per item, with its
 * Aufgabenniveau, result distribution, Leitidee and competences. The competence
 * columns follow the `showCompetences` option.
 */

import { BaseItemTableModule } from '../../../common/tables/baseItemTableModule.js';
import {
    competenceColumnsController,
    createMaClassificationColumns,
    createMaItemColumns,
} from './maTableColumns.js';
import { MA_DATASETS } from '../../maDatasets.js';

/**
 * @typedef {import('../../../common/tables/tableModule.js').TableOptions &
 *   import('./maTableColumns.js').CompetenceColumnsOptions} MaItemOverviewTableOptions
 */

/** @augments {BaseItemTableModule<MaItemOverviewTableOptions>} */
export class MaItemTableModule extends BaseItemTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [MA_DATASETS.ITEM_RECORDS, MA_DATASETS.COMPETENCE_GROUPINGS];

    /** @type {import('../../../common/tables/tableModeController.js').TableModeController<boolean>} */
    #showCompetences;

    /** @override */
    _setup() {
        super._setup();
        this.#showCompetences = competenceColumnsController(
            this,
            () => this.#groupings(),
            (getShouldShow) => this._applyColumnVisibility(getShouldShow),
        );
    }

    /** @override */
    _readItems() {
        return this.options.context.documents.getDataset(MA_DATASETS.ITEM_RECORDS);
    }

    /**
     * @override
     * @param {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} resultColumns
     */
    _getColumns(resultColumns) {
        const { context } = this.options;
        return [
            ...createMaItemColumns(context),
            ...resultColumns,
            ...createMaClassificationColumns(this.#groupings(), this.#showCompetences.value),
        ];
    }

    /** @returns {import('../../utils/maCompetenceGroupings.js').MaCompetenceGrouping[]} */
    #groupings() {
        return this.options.context.documents.getDataset(MA_DATASETS.COMPETENCE_GROUPINGS);
    }
}

customElements.define('tba-ma-item-table', MaItemTableModule);
