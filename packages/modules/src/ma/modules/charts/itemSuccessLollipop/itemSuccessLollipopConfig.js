/**
 * ItemSuccessLollipopConfig — ChartHostModule descriptor for the MA item-success
 * lollipop: the share of students who solved each item, with a marker per comparison
 * population items.json carries (Schulschnitt, Landesschnitt, any other).
 */

import { ItemSuccessLollipopChart } from './itemSuccessLollipopChart.js';
import { MA_DATASETS } from '../../../maDatasets.js';

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<ItemSuccessLollipopChart>} ItemSuccessLollipopChartHost */

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<ItemSuccessLollipopChart>} */
export const itemSuccessLollipopConfig = {
    glossaryPath: 'ma.item.item-graph',

    documents: [MA_DATASETS.ITEM_RECORDS, MA_DATASETS.ITEM_COMPARISON_GROUPS],

    defaultOptions: {
        showModuleTitle: true,
        collapsible: true,
    },

    /**
     * @param {ItemSuccessLollipopChartHost} host
     * @returns {ItemSuccessLollipopChart}
     */
    createRenderer(host) {
        const documents = host.options.context.documents;
        return new ItemSuccessLollipopChart(
            host.chartArea,
            documents.getDataset(MA_DATASETS.ITEM_RECORDS),
            {
                ...host.rendererOptions,
                comparisonGroups: documents.getDataset(MA_DATASETS.ITEM_COMPARISON_GROUPS),
            },
        );
    },
};
