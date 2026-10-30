/**
 * ChartHostModule descriptor for the EN item lollipop. It plots exactly the ids the
 * `applySync` verb hands it, in that order, and filters nothing itself.
 */

import { sameItems } from '@tba3/module-base';
import { ItemLollipopChart } from './itemLollipopChart.js';
import { itemNumberLabel, withDomainPrefix } from '../../../utils/enDomainPrefix.js';
import { readResultTypes } from '../../../../common/domain/resultAggregations.js';
import { EN_DATASETS } from '../../../enDatasets.js';
import { getRecordsByIds } from '../../../../common/data/datasetIndex.js';
import { groupByDomain } from '../../../../common/charts/renderers/lollipopMarks.js';

/** @typedef {import('./itemLollipopChart.js').ItemData} ItemData */

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     domainMode?: string | import('@preact/signals-core').Signal<string>,
 * }} ItemLollipopOptions
 */

/**
 * `items` are the ones the table last synced, labelled for the chart; `null` before its
 * first sync.
 * @typedef {{mode: string, items: ItemData[] | null}} ItemLollipopState
 */

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<ItemLollipopChart, ItemLollipopOptions, ItemLollipopController, ItemLollipopState>} ItemLollipopChartHost
 */

/**
 * @typedef {object} ItemLollipopSyncPayload
 * @property {string[]} [ids] - Ids of the items to draw: the selected rows, else the visible ones, in display order.
 */

/**
 * Mirrors the item table into the host's state: the chart shares its `items` signal.
 */
class ItemLollipopController {
    /** @type {string|null} The last sync's mode, to skip a repeat. */
    #syncedMode = null;
    /** @type {string[]|null} The last sync's ids, to skip a repeat. */
    #syncedIds = null;

    /**
     * @param {ItemLollipopChartHost} host
     */
    constructor(host) {
        this.host = host;
    }

    /**
     * @param {ItemLollipopSyncPayload|null|undefined} data
     * @returns {void}
     */
    applySync(data) {
        const ids = data?.ids ?? [];
        const mode = this.host.state.mode.value;
        // The table re-fires the same ids on every redraw; the chart already shows them.
        if (mode === this.#syncedMode && sameItems(ids, this.#syncedIds)) return;
        this.#syncedMode = mode;
        this.#syncedIds = ids;
        const records = getRecordsByIds(
            this.host.options.context.documents,
            EN_DATASETS.ITEM_RECORDS_BY_ID,
            ids,
        );
        // The chart labels each item by the same "H-01" rule the tables use.
        this.host.state.items.value = records.map((item) => ({
            ...item,
            displayName: itemNumberLabel(item.name, item.domainLabel, mode),
        }));
    }
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The verbs `publicAPI` binds onto the host, as its callers see them.
 * @typedef {object} ItemLollipopVerbs
 * @property {(data: ItemLollipopSyncPayload) => void} applySync
 */

/**
 * The host as this config leaves it: `#bindPublicAPI` assigns the verbs onto the
 * instance, so a field typed with this gets them checked instead of casting.
 * @typedef {ItemLollipopChartHost & ItemLollipopVerbs} ItemLollipopHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<ItemLollipopChart, ItemLollipopOptions, ItemLollipopController, ItemLollipopVerbs, ItemLollipopState>} */
export const itemLollipopConfig = {
    glossaryPath: 'en.item.lollipop',

    documents: [
        EN_DATASETS.ITEM_RECORDS,
        EN_DATASETS.ITEM_RECORDS_BY_ID,
        EN_DATASETS.ITEM_COMPARISON_GROUPS,
        'items-aggregations.json',
    ],

    /**
     * @param {ItemLollipopChartHost} host
     * @returns {import('@tba3/module-base').StateInit<ItemLollipopState>}
     */
    initialState: (host) => ({ mode: host.options.domainMode ?? 'all', items: null }),

    /**
     * @param {ItemLollipopChartHost} host
     * @returns {boolean} Whether there are items to draw.
     */
    rebuildOn: (host) => host.state.items.value !== null,

    createController: (host) => new ItemLollipopController(host),

    defaultOptions: {
        showModuleTitle: true,
    },

    /**
     * @param {ItemLollipopChartHost} host
     * @returns {ItemLollipopChart|null} `null` before the table's first sync.
     */
    createRenderer(host) {
        if (!host.state.items.value) return null;
        const documents = host.options.context.documents;
        const items = documents.getDataset(EN_DATASETS.ITEM_RECORDS);
        return new ItemLollipopChart(host.chartArea, host.state.items, {
            ...host.rendererOptions,
            // Every item's level, label and domain, not the synced subset's: the Niveau
            // legend, the x-axis reserve and the strip order stay the same through every
            // sync, so none moves the plot. A strip without a heading shows the widest
            // label, the domain-prefixed one of `all` mode; headed strips show bare numbers.
            itemCompetenceLevels: items.map((record) => record.competenceLevel),
            axisLabels: items.map((record) => withDomainPrefix(record.name, record.domainLabel)),
            itemNames: items.map((record) => record.name),
            domains: groupByDomain(items).map(([domain]) => domain),
            comparisonGroups: documents.getDataset(EN_DATASETS.ITEM_COMPARISON_GROUPS),
            resultTypes: readResultTypes(documents.get('items-aggregations.json')),
        });
    },

    /**
     * The Domäne mode changes which domain's items the chart shows, so it tells two
     * captures apart; a table filter narrows the same card.
     * @param {ItemLollipopChartHost} host
     * @returns {string}
     */
    getExportIdentity(host) {
        return host.state.mode.value;
    },

    publicAPI: {
        /**
         * @param {ItemLollipopChartHost} host
         * @param {ItemLollipopSyncPayload} data
         */
        applySync(host, data) {
            host.controller.applySync(data);
        },
    },
};
