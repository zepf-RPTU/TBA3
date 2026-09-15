/**
 * Per-item result breakdown — the class's Richtig / Falsch / Unbearbeitet counts.
 *
 * Reads `items_aggregation.json`, the API's `type=items&aggregation=result` payload:
 * one value-group per item, keyed by IQB id, holding the three `Ergebnis` buckets.
 * All three buckets share one `total` (the item's responses) and their frequencies sum
 * to it, so the counts are read directly rather than inferred by subtraction.
 *
 * Shared by the EN and MA item adapters, which both need exactly these four numbers
 * and must not disagree about them.
 */

import { RESULT_VALUES } from './apiValueMaps.js';

/**
 * @typedef {object} ItemResultCounts
 * @property {number} total - responses to the item
 * @property {number} correctCount - responses scored correct
 * @property {number} incorrectCount - responses scored incorrect
 * @property {number} notAttemptedCount - responses left unanswered
 */

/**
 * Counts for an item the result payload does not cover. Shared so the two adapters
 * cannot fall back to different numbers.
 * @type {ItemResultCounts}
 */
export const NO_RESULT_COUNTS = Object.freeze({
    total: 0,
    correctCount: 0,
    incorrectCount: 0,
    notAttemptedCount: 0,
});

/**
 * Build an iqbId → counts lookup from the per-item aggregation payload.
 * @param {Array|null|undefined} itemAggregationData - items_aggregation.json
 * @returns {Map<string, ItemResultCounts>} Counts keyed by `iqbId`; empty when the payload carries none.
 */
export function buildItemResultCounts(itemAggregationData) {
    /** @type {Map<string, ItemResultCounts>} */
    const counts = new Map();

    for (const entry of itemAggregationData ?? []) {
        if (!entry.id) continue;

        const record = { total: 0, correctCount: 0, incorrectCount: 0, notAttemptedCount: 0 };

        for (const aggregation of entry.aggregations ?? []) {
            if (aggregation.type !== 'Ergebnis') continue;

            const stats = aggregation.descriptiveStatistics ?? {};
            const frequency = stats.frequency ?? 0;
            // The buckets partition the item's responses, so any one of them carries
            // the item's `total`; taking the largest tolerates a bucket the payload
            // happens to omit without inventing a denominator.
            record.total = Math.max(record.total, stats.total ?? 0);

            switch (RESULT_VALUES[aggregation.value]) {
                case 1:
                    record.correctCount = frequency;
                    break;
                case 0:
                    record.incorrectCount = frequency;
                    break;
                case -1:
                    record.notAttemptedCount = frequency;
                    break;
                default:
                    break;
            }
        }

        counts.set(entry.id, record);
    }

    return counts;
}

/**
 * One result bucket's share of an item's responses. Shared by the EN and MA item
 * adapters, which draw the same distribution bar and must not disagree about what an
 * item with no responses shows.
 * @param {number} count - Responses in the bucket.
 * @param {number} total - Responses to the item, as {@link ItemResultCounts} reports it.
 * @returns {number|null} The share in percent; `null` for an item without responses, which is absent rather than 0 %.
 */
export function resultShare(count, total) {
    return total > 0 ? (count / total) * 100 : null;
}
