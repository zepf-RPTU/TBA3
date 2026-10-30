/**
 * The school-summary rows for one selection (metric, active ⌀ averages), as datasets of the
 * store. The rows are built once per metric with every delivered average; a ⌀ toggle only
 * filters them.
 */

import { dataset } from '../../../../common/data/documentStore.js';
import { COMPETENCE_SHARES } from '../../../utils/slCompetenceShares.js';
import { SOLUTION_RATES } from '../../../utils/slSolutionRates.js';
import {
    buildSummaryRows,
    entryVerdict,
    selectActiveAverages,
} from '../../../utils/slSchoolSummaryMetrics.js';
import { getSummaryMetric } from '../../../utils/slSchoolSummaryMetricRegistry.js';
import { SL_DATASETS } from '../../../slDatasets.js';
import { resolveLabelLineCount } from './groupDeviationChart.js';

/**
 * The rows every card of one selection draws against.
 * @typedef {import('../../../utils/slSchoolSummaryMetrics.js').SummarySelection & {
 *   labelLines: number,
 *   neutralKey: boolean,
 * }} SchoolSummary
 */

/** One metric's rows with every delivered average, once per store and metric */
const SUMMARY_ROWS = dataset('sl.schoolSummaryRows', {
    inputs: [SL_DATASETS.COMPETENCE_LEVEL_INDEX, COMPETENCE_SHARES, SOLUTION_RATES],
    params: (/** @type {string} */ metricId) => [metricId],
    build: (index, shares, rates, _context, metricId) =>
        buildSummaryRows({
            queries: { shares, rates },
            index,
            metric: getSummaryMetric(metricId),
        }),
});

/**
 * The summary of one selection: a metric id (an unknown one falls back to the default)
 * and the sorted ids of the active averages (`null` for every delivered one), once per
 * store and selection.
 *
 * `labelLines` is resolved over every card's labels at once, for the reason given at
 * `resolveLabelLineCount` in groupDeviationChart.js; so is `neutralKey`, whether any card
 * draws a bar at no difference, for the reason given at the chart's `chartKey`. It splits
 * the labels, it measures nothing: what is measured in pixels (`summaryMinRowWidth`) is
 * measured when it is laid out, against the fonts loaded then.
 */
export const SCHOOL_SUMMARY = dataset('sl.schoolSummary', {
    inputs: [SUMMARY_ROWS],
    params: (/** @type {string|undefined} */ metricId, /** @type {string[]|null} */ averageIds) => [
        getSummaryMetric(metricId).id,
        averageIds,
    ],
    build: (rowsOf, _context, metricId, averageIds) => {
        const metric = getSummaryMetric(metricId);
        const summary = selectActiveAverages(rowsOf(metric.id), averageIds);
        const entries = summary.rows.flatMap((row) => row.entries);
        return /** @type {SchoolSummary} */ ({
            ...summary,
            labelLines: resolveLabelLineCount(entries.map((entry) => entry.label)),
            neutralKey: entries.some(
                (entry) => entryVerdict(entry, metric.higherIsBetter) === 'neutral',
            ),
        });
    },
});

/**
 * The summary of one selection (metric, active ⌀ averages). Every card reads the
 * same object, so the y domain and the label band they share come from the store.
 * @param {import('../../../../common/data/documentStore.js').DocumentStore} documents
 * @param {object} selection
 * @param {string} [selection.metricId] - An unknown id falls back to the default.
 * @param {import('../../../../common/charts/comparisonState.js').ComparisonStateReader|null} [selection.comparisonState] - Without one every delivered average is plotted.
 * @returns {SchoolSummary}
 */
export function getSchoolSummary(documents, { metricId, comparisonState = null } = {}) {
    const activeAverageIds = comparisonState?.activeModes.value ?? null;
    return documents.getDataset(
        SCHOOL_SUMMARY,
        metricId,
        activeAverageIds ? [...activeAverageIds].sort() : null,
    );
}
