/**
 * MA KsDistribution Config — ChartHostModule descriptor for the MA KS distribution
 * chart: a stacked bar of the Kompetenzstufen inside a collapsible container. The levels
 * come from the payload alone.
 */

import {
    createKsDistributionConfig,
    resolveKsSegmentClickEnabled,
} from '../../../../common/charts/ksDistribution/ksDistributionConfigPreset.js';
import { setActiveModes } from '../../../../common/charts/host/comparisonSync.js';
import { ensureComparisonModeDropdown } from '../../../../common/charts/host/comparisonModeControl.js';
import { ensureHighlightedLevelState } from '../../../../common/charts/ksDistribution/ksHighlightContract.js';
import { MaKsDistributionChart } from './maKsDistributionChart.js';
import { getThemeColors } from '../../../../common/services/themeService.js';

// ============================================================================
// HEADER CONTROLS
// ============================================================================

/**
 * Create the ⌀ comparison dropdown in the module header, bound to the app's shared
 * comparison state — the same state the item lollipop's averages read, so one toggle
 * moves every MA chart.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose header carries the control.
 * @param {object} chart - The live renderer, which knows which comparison groups the payload carries; with only its own group to show, there is nothing to toggle and the control is removed.
 */
function ensureComparisonDropdown(host, chart) {
    ensureComparisonModeDropdown(host, host.getOption('comparisonState'), () =>
        chart
            .getDrawableComparisonIds()
            .map((id) => ({ id, label: chart.groupIdToName.get(id) ?? id })),
    );
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the chart host plus MA's own verbs.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setActiveModes(activeModes: string[]): void,
 *     toggleOrientation(): void,
 * }} MaKsDistributionHost
 */

export const maKsDistributionConfig = createKsDistributionConfig({
    glossaryPath: 'ma.overview.competence-distribution',

    defaultOptions: {
        showModuleTitle: true,
        collapsible: true,
        isHorizontal: false,
        enableSegmentClick: true,
        enableOrientationToggle: true,
    },

    /**
     * Create MaKsDistributionChart with MA-specific options.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into.
     * @param {Array} data - API data array
     * @returns {MaKsDistributionChart} The renderer for this host.
     */
    createChart(host, data) {
        const chart = new MaKsDistributionChart(
            host.id,
            // Read the palette fresh so an in-place theme refresh (rerender) picks
            // up the new colors — do not cache via host options at view construction.
            getThemeColors().ks.byLevel,
            {
                isHorizontal: host.configState.isHorizontal ?? host.getOption('isHorizontal'),
                highlightedLevel: ensureHighlightedLevelState(host),
                enableSegmentClick: resolveKsSegmentClickEnabled(host),
                comparisonState: host.getOption('comparisonState'),
                onLevelSelected: (level) => host.getOption('onLevelSelected')?.(level),
                apiData: data,
            },
        );

        ensureComparisonDropdown(host, chart);
        return chart;
    },

    extraPublicAPI: {
        setActiveModes,

        /**
         * Toggle between horizontal and vertical orientation.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the live renderer.
         */
        toggleOrientation(host) {
            const chart = host.chart;
            if (!chart) return;
            const isHorizontal = !chart.isHorizontal;
            // Persist on the host so a rebuild (e.g. theme change re-creating the
            // chart via createChart) keeps the toggled orientation.
            host.configState.isHorizontal = isHorizontal;
            chart.setState({ isHorizontal });
        },
    },
});
