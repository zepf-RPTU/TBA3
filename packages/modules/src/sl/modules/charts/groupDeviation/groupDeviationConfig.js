/**
 * groupDeviationConfig — ChartHostModule descriptor for one subject×domain row of the
 * SL school summary; its renderer picks its row out of the memoised school summary
 * on every pass.
 */

import { computed } from '@preact/signals-core';
import { GroupDeviationChart } from './groupDeviationChart.js';
import { getSchoolSummary, SCHOOL_SUMMARY } from './schoolSummary.js';

/**
 * A card's options: the chart-host options plus the subject×domain row it owns and the
 * metric it shows — the app's signal, or a fixed metric; the default one when left out.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     subjectName?: string,
 *     domainId?: string | null,
 *     metricId?: string | import('@preact/signals-core').Signal<string>,
 * }} GroupDeviationOptions
 */

/**
 * The card's state: the metric; the active averages are read from the `comparisonState`
 * option at render time.
 * @typedef {{metricId: string|undefined}} GroupDeviationState
 */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<GroupDeviationChart, GroupDeviationOptions, null, GroupDeviationState>} GroupDeviationHost */
/** @typedef {import('./schoolSummary.js').SchoolSummary} SchoolSummary */

/**
 * Pick this host's entry out of one half of a summary payload (rows or absences).
 * @template {{subjectName: string, domainId: string|null}} TEntry
 * @param {GroupDeviationHost} host - The host, whose options name its subject×domain.
 * @param {TEntry[]} entries
 * @returns {TEntry|null} `null` when that half does not contain it.
 */
function selectEntryForHost(host, entries) {
    const subjectName = host.options.subjectName;
    const domainId = host.options.domainId ?? null;

    return (
        entries.find(
            (entry) => entry.subjectName === subjectName && (entry.domainId ?? null) === domainId,
        ) ?? null
    );
}

/**
 * Renderer input for the subject×domain this host owns.
 *
 * `row` is null when the metric yields no data for it, and `absence` then carries the
 * reason — the two halves of the summary partition the dataset, so exactly one of them
 * matches, and the chart can say why a row has no data.
 * @param {GroupDeviationHost} host
 * @param {SchoolSummary} summary
 * @returns {import('./groupDeviationChart.js').GroupDeviationData} No column band: the chart derives it from the row's own entries.
 */
function resolveChartData(host, summary) {
    return {
        row: selectEntryForHost(host, summary.rows),
        absence: selectEntryForHost(host, summary.absences),
        yDomain: summary.yDomain,
        labelLines: summary.labelLines,
        neutralKey: summary.neutralKey,
        metric: summary.metric,
    };
}

/**
 * The summary of a selection: the metric, the active averages of the app's comparison
 * state (every delivered one without it).
 * @param {GroupDeviationHost} host - The host, whose options carry the store and the comparison state.
 * @param {string|undefined} metricId
 * @returns {SchoolSummary}
 */
function resolveSummary(host, metricId) {
    return getSchoolSummary(host.options.context.documents, {
        metricId,
        comparisonState: host.options.comparisonState,
    });
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<GroupDeviationChart, GroupDeviationOptions, null, import('../../../../common/charts/host/chartHostModule.js').NoVerbs, GroupDeviationState>} */
export const groupDeviationConfig = {
    glossaryPath: 'sl.summary.deviation',

    documents: [SCHOOL_SUMMARY],

    defaultOptions: {
        showModuleTitle: true,
        subjectName: '',
    },

    /**
     * The metric is the `metricId` option: the app's signal itself.
     * @param {GroupDeviationHost} host
     * @returns {import('@tba3/module-base').StateInit<GroupDeviationState>}
     */
    initialState: (host) => ({ metricId: host.options.metricId }),

    /**
     * @param {GroupDeviationHost} host
     * @returns {GroupDeviationChart}
     */
    createRenderer(host) {
        return new GroupDeviationChart(host.chartArea, {
            ...host.rendererOptions,
            // The metric and the ⌀ toggles pick the summary; a change of either redraws.
            data: computed(() =>
                resolveChartData(host, resolveSummary(host, host.state.metricId.value)),
            ),
        });
    },

    /**
     * @param {GroupDeviationHost} host
     * @returns {Array<{id: string, label: string}>} Every delivered average, active or not.
     */
    comparisonModes(host) {
        return resolveSummary(host, host.state.metricId.value).averages.map((average) => ({
            id: average.id,
            label: average.label,
        }));
    },
};
