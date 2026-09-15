/**
 * EN KsDistribution Config — ChartHostModule descriptor for the EN KS distribution:
 * a stacked bar of the GER level distribution.
 */

import {
    createKsDistributionConfig,
    resolveKsSegmentClickEnabled,
} from '../../../../common/charts/ksDistribution/ksDistributionConfigPreset.js';
import { setActiveModes } from '../../../../common/charts/host/comparisonSync.js';
import { ensureHighlightedLevelState } from '../../../../common/charts/ksDistribution/ksHighlightContract.js';
import { ensureComparisonModeDropdown } from '../../../../common/charts/host/comparisonModeControl.js';
import { EnKsDistributionChart } from './enKsDistributionChart.js';
import { getThemeColors } from '../../../../common/services/themeService.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the chart host plus the comparison verb.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setActiveModes(activeModes: string[]): void,
 * }} EnKsDistributionHost
 */

export const enKsDistributionConfig = createKsDistributionConfig({
    // glossaryPath intentionally omitted: one descriptor serves both domains, so the caller
    // picks 'en.overview.ks-distribution.h' or '.l' (enKsDistribution.glossary.json) as glossaryKey.

    defaultOptions: {
        showModuleTitle: true,
        yAxisSide: 'left',
    },

    /**
     * Create EnKsDistributionChart with EN-specific options.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into.
     * @param {Array} data - Pre-aggregated API data (objects with competenceLevels)
     * @returns {EnKsDistributionChart} The renderer for this host.
     */
    createChart(host, data) {
        const chart = new EnKsDistributionChart(
            host.id,
            // Read the palette fresh so an in-place theme refresh (rerender) picks
            // up the new colors — do not cache via host options at view construction.
            getThemeColors().ks.byLevel,
            {
                highlightedLevel: ensureHighlightedLevelState(host),
                yAxisSide: host.getOption('yAxisSide'),
                comparisonState: host.getOption('comparisonState'),
                enableSegmentClick: resolveKsSegmentClickEnabled(host),
                apiData: data,
            },
        );
        // The chart answers for itself which groups a toggle can reveal; its
        // `groupIdToName` is filled by the constructor's `syncParsedApiData`, so it
        // does so from here on.
        ensureComparisonModeDropdown(host, host.getOption('comparisonState'), () =>
            chart
                .getDrawableComparisonIds()
                .map((id) => ({ id, label: chart.groupIdToName.get(id) ?? id })),
        );
        return chart;
    },

    extraPublicAPI: {
        setActiveModes,
    },
});
