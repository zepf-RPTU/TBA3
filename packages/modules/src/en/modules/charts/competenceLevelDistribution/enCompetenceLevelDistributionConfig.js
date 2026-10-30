/**
 * ChartHostModule descriptor for the EN competence-level distribution: a stacked bar of
 * one domain's GER levels.
 */

import { CompetenceLevelDistributionChart } from '../../../../common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     domainId: string,
 *     yAxisSide: 'left' | 'right',
 * }} EnCompetenceLevelDistributionOptions
 */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<CompetenceLevelDistributionChart, EnCompetenceLevelDistributionOptions>} EnCompetenceLevelDistributionHost */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<CompetenceLevelDistributionChart, EnCompetenceLevelDistributionOptions>} */
export const enCompetenceLevelDistributionConfig = {
    // One entry serves every domain: the caller passes the domain's name as the `Domäne`
    // replacement, which also keeps each instance's tour step distinct.
    glossaryPath: 'en.overview.competence-level-distribution',

    defaultOptions: {
        showModuleTitle: true,
    },

    documents: ['competence-levels.json'],

    /**
     * @param {EnCompetenceLevelDistributionHost} host
     * @returns {CompetenceLevelDistributionChart}
     * @throws {Error} when the host names no domain: an undefined id would match every value group
     *   that carries no domain and draw it as this domain's distribution
     */
    createRenderer(host) {
        const documents = host.options.context.documents;
        const domainId = host.options.domainId;
        if (!domainId)
            throw new Error(`enCompetenceLevelDistributionConfig[${host.id}]: no domainId option`);
        return new CompetenceLevelDistributionChart(host.chartArea, {
            ...host.rendererOptions,
            valueSide: host.options.yAxisSide,
            apiData: documents
                .get('competence-levels.json')
                .filter((entry) => entry.domain?.id === domainId),
        });
    },
};
