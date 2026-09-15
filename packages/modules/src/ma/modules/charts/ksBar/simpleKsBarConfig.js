/**
 * SimpleKsBarConfig — ChartHostModule descriptor for the MA KS bar: a horizontal
 * stacked bar of the Kompetenzstufen with click-to-filter.
 *
 * The owning view pairs it with the class table: a segment click reaches the table
 * through `onLevelSelected`, and a table reset comes back through `updateHighlight`.
 */

import { getThemeColors } from '../../../../common/services/themeService.js';
import {
    normalizeHighlightedLevel,
    ensureHighlightedLevelState,
} from '../../../../common/charts/ksDistribution/ksHighlightContract.js';
import { SimpleKsBarChart } from './simpleKsBarChart.js';
import {
    findClassGroup,
    parseCompetenceLevels,
} from '../../../../common/charts/competenceLevelAdapter.js';

// ============================================================================
// INTERNAL STATE (per-host, stored in host.configState)
// ============================================================================

/**
 * Calculate KS distribution from API data: the class's own row, found by its
 * `type` — the document carries the comparison rows too, in no fixed order.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the results are cached on.
 * @param {Array} apiData - Pre-aggregated competence-level data as the payload delivers it.
 */
function calculateDistributionFromApi(host, apiData) {
    const classGroup = findClassGroup(parseCompetenceLevels(apiData).groups);
    host.configState.distribution = classGroup?.percentages ?? {};
    host.configState.counts = classGroup?.counts ?? {};
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the chart host plus this config's own verb.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     updateHighlight(level: string|null): void,
 * }} SimpleKsBarHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const simpleKsBarConfig = {
    glossaryPath: 'ma.class.competence-distribution',

    defaultOptions: {
        showModuleTitle: true,
        collapsible: true,
        enableModuleExport: true,
    },

    /**
     * Create the SimpleKsBarChart renderer.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the bar draws into.
     * @param {Array} data - Pre-aggregated competence-level data.
     * @returns {object} The renderer for this host.
     */
    createRenderer(host, data) {
        calculateDistributionFromApi(host, data);
        const highlightedLevel = ensureHighlightedLevelState(host);

        const levelColors = getThemeColors().ks.byLevel;

        return new SimpleKsBarChart(host.id, host.configState.distribution, levelColors, {
            highlightedLevel,
            ksCounts: host.configState.counts,
            onLevelClick: (level) => {
                // Keep the host-level source of truth in sync: a recreated chart
                // seeds itself from ensureHighlightedLevelState(host).
                host.configState.highlightedLevel = level;
                host.getOption('onLevelSelected')?.(level);
            },
        });
    },

    publicAPI: {
        /**
         * Highlight one Kompetenzstufe, or clear the highlight. The class table calls
         * this back through `onKsFilterCleared` when its filter is reset.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the selection state.
         * @param {string|null} level - The level to highlight; `null` or `''` clears it.
         */
        updateHighlight(host, level) {
            const normalized = normalizeHighlightedLevel(level);
            host.configState.highlightedLevel = normalized;

            if (typeof host.chart?.updateHighlightedLevel === 'function') {
                host.chart.updateHighlightedLevel(normalized);
            }
        },
    },
};
