/**
 * MA CompetenceLevelDistribution Config — ChartHostModule descriptor for the MA competence-level distribution
 * chart: a stacked bar per group and comparison group, one segment per Kompetenzstufe. The
 * levels come from the payload alone.
 */

import { CompetenceLevelDistributionChart } from '../../../../common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';
import { headerActionButton, renderIcon } from '@tba3/module-base';

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     onLevelSelected?: (level: string|null) => void,
 * }} MaCompetenceLevelDistributionOptions
 */

/** @typedef {import('../../../../common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js').CompetenceLevelDistributionState} CompetenceLevelDistributionState */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<CompetenceLevelDistributionChart, MaCompetenceLevelDistributionOptions, null, CompetenceLevelDistributionState>} MaCompetenceLevelDistributionChartHost */

/**
 * The orientation toggle of the module header; its icon shows the orientation a click
 * switches *to*.
 * @param {MaCompetenceLevelDistributionChartHost} host
 * @returns {import('lit').TemplateResult}
 */
function orientationToggle(host) {
    const lying = host.chart?.isHorizontal ?? false;
    return headerActionButton({
        name: 'orientation-toggle',
        ariaLabel: host.options.context.glossary.getRequiredEntryText(
            'general.buttons.element_texts.orientation-toggle.label',
        ),
        pressed: lying,
        // The orientation is the plot's alone: nothing to turn while the table shows.
        inactive: host.showsTable,
        buttonContent: renderIcon(lying ? 'swap_vert' : 'swap_horiz'),
        onClick: () => {
            host.state.isHorizontal.value = !lying;
        },
    });
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<CompetenceLevelDistributionChart, MaCompetenceLevelDistributionOptions, null, import('../../../../common/charts/host/chartHostModule.js').NoVerbs, CompetenceLevelDistributionState>} */
export const maCompetenceLevelDistributionConfig = {
    glossaryPath: 'ma.overview.competence-level-distribution',

    defaultOptions: {
        showModuleTitle: true,
    },

    documents: ['competence-levels.json'],

    /**
     * `isHorizontal: null` leaves the orientation to the chart's rule until the header
     * toggle picks one.
     * @returns {CompetenceLevelDistributionState}
     */
    initialState: () => ({ isHorizontal: null, highlightedLevels: [] }),

    /**
     * @param {MaCompetenceLevelDistributionChartHost} host
     * @returns {CompetenceLevelDistributionChart}
     */
    createRenderer(host) {
        return new CompetenceLevelDistributionChart(host.chartArea, {
            ...host.rendererOptions,
            // The host's signals: a write redraws the chart, a rebuilt one carries them over.
            isHorizontal: host.state.isHorizontal,
            highlightedLevels: host.state.highlightedLevels,
            // The item rings take one level at a time, so a click selects its level at
            // once and a click on the selected level clears it.
            onLevelClicked: (level) => {
                const levels = host.state.highlightedLevels.value.includes(level) ? [] : [level];
                host.state.highlightedLevels.value = levels;
                host.options.onLevelSelected?.(levels[0] ?? null);
            },
            apiData: host.options.context.documents.get('competence-levels.json'),
        });
    },

    headerActions: orientationToggle,
};
