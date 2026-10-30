/**
 * CompetenceChartConfig — ChartHostModule configuration for the SL competence
 * distribution (overview) chart.
 */

import { CompetenceOverviewRenderer } from './competenceOverviewRenderer.js';
import { SL_DATASETS } from '../../../../slDatasets.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../../common/charts/host/chartHostModule.js').ChartHostConfig<CompetenceOverviewRenderer>} */
export const competenceChartConfig = {
    documents: [SL_DATASETS.COMPETENCE_LEVEL_INDEX],

    /**
     * @param {import('../../../../../common/charts/host/chartHostModule.js').ChartHostModule<CompetenceOverviewRenderer>} host
     * @returns {CompetenceOverviewRenderer}
     */
    createRenderer(host) {
        const index = host.options.context.documents.getDataset(SL_DATASETS.COMPETENCE_LEVEL_INDEX);
        return new CompetenceOverviewRenderer(host.chartArea, index, host.rendererOptions);
    },
};
