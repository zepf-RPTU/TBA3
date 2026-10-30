/**
 * Per-item result breakdown: the group's Richtig / Falsch / Unbearbeitet counts.
 *
 * Reads `items-aggregations.json`, the item value groups of the aggregations answer
 * (`datasetEndpoints.js`): one value-group per item, keyed by IQB id, holding the three
 * `result` buckets.
 * All three buckets share one `total` (the item's responses) and their frequencies sum
 * to it, so the counts are read directly, not inferred by subtraction.
 */

import { readResultCounts } from './resultAggregations.js';
import { computePilotSolutionFrequency } from './pilotSolutionFrequency.js';

/**
 * @typedef {object} ItemResultCounts
 * @property {number} total - responses to the item
 * @property {number} correctCount - responses scored correct
 * @property {number} incorrectCount - responses scored incorrect
 * @property {number} notAttemptedCount - responses left unanswered
 */

/**
 * Counts for an item the result payload does not cover.
 * @type {ItemResultCounts}
 */
const NO_RESULT_COUNTS = Object.freeze({
    total: 0,
    correctCount: 0,
    incorrectCount: 0,
    notAttemptedCount: 0,
});

/**
 * The items' result counts, summed: the responses the pooled Lösungsquote stands on,
 * one per student and item.
 * @param {ReadonlyArray<ItemResultCounts>} itemArray
 * @returns {ItemResultCounts}
 */
export function pooledResultCounts(itemArray) {
    let total = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let notAttemptedCount = 0;
    for (const item of itemArray) {
        total += item.total;
        correctCount += item.correctCount;
        incorrectCount += item.incorrectCount;
        notAttemptedCount += item.notAttemptedCount;
    }
    return { total, correctCount, incorrectCount, notAttemptedCount };
}

/**
 * Build an iqbId → counts lookup from the per-item aggregation payload.
 * @param {import('../data/schemas/aggregations.js').AggregationsValueGroup[]|null|undefined} itemAggregationData - items-aggregations.json
 * @returns {Map<string, ItemResultCounts>} Counts keyed by `iqbId`; empty when the payload carries none.
 */
export function buildItemResultCounts(itemAggregationData) {
    /** @type {Map<string, ItemResultCounts>} */
    const counts = new Map();

    for (const entry of itemAggregationData ?? []) {
        const { total, correct, incorrect, notAttempted } = readResultCounts(entry.aggregations);
        counts.set(entry.id, {
            total: total ?? 0,
            correctCount: correct ?? 0,
            incorrectCount: incorrect ?? 0,
            notAttemptedCount: notAttempted ?? 0,
        });
    }

    return counts;
}

/**
 * A part's share of a whole, in percent: a result bucket of an item's responses, a
 * Kompetenzstufe of a group, an item competence level of a booklet.
 * @param {number} count
 * @param {number} total
 * @returns {number|null} `null` for an empty whole, which is absent, not 0 %.
 */
export function percentOf(count, total) {
    return total > 0 ? (count / total) * 100 : null;
}

/**
 * An API share (0–1) as a percentage (0–100).
 * @param {number} share - A finite share; callers keep a missing one `null` themselves.
 * @returns {number}
 */
export function toPercent(share) {
    return share * 100;
}

/**
 * The result fields every item record carries, from the item and the group's result
 * counts: the counts, the three shares, the mean as a percentage and the Pilotierung
 * benchmark.
 * @param {{iqbId: string, descriptiveStatistics: {mean: number}, parameters?: any}} item - An item of items.json.
 * @param {Map<string, ItemResultCounts>} resultCounts - From {@link buildItemResultCounts}.
 * @returns {ItemResultCounts & {percentageCorrect: number|null, percentageIncorrect: number|null, percentageNotAttempted: number|null, meanPercentage: number, pilotSolutionFrequency: number|null, pilotSolutionFrequencyDiff: number|null}} The fields to spread into the record.
 */
export function itemResultFields(item, resultCounts) {
    const counts = resultCounts.get(item.iqbId) ?? NO_RESULT_COUNTS;
    const mean = item.descriptiveStatistics.mean;
    return {
        ...counts,
        percentageCorrect: percentOf(counts.correctCount, counts.total),
        percentageIncorrect: percentOf(counts.incorrectCount, counts.total),
        percentageNotAttempted: percentOf(counts.notAttemptedCount, counts.total),
        meanPercentage: toPercent(mean),
        ...computePilotSolutionFrequency(item.parameters, mean),
    };
}
