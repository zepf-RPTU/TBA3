/**
 * Readers for one payload entry's `result` aggregations: the Richtig / Falsch /
 * Unbearbeitet buckets a student, an item, a group or a school carries.
 *
 * Every bucket is read by its `value`: the spec fixes no order of `aggregations[]`, so a
 * bucket the payload omits must neither shift the others nor read 0.
 */

import { AGG_TYPE_RESULT, RESULT, RESULT_VALUES } from './apiValueMaps.js';

/** @typedef {import('../data/schemas/aggregations.js').Aggregation} Aggregation */

/**
 * Which `ResultCounts` field each result value's frequency fills.
 * @type {Readonly<{[value: string]: 'correct'|'incorrect'|'notAttempted'}>}
 */
const COUNT_FIELD_BY_RESULT = Object.freeze({
    [RESULT.CORRECT]: 'correct',
    [RESULT.INCORRECT]: 'incorrect',
    [RESULT.NOT_ATTEMPTED]: 'notAttempted',
});

/**
 * One entry's result frequencies, keyed by what they count. A bucket the payload
 * omits is absent; `total` is `null` when no bucket carries one.
 * @typedef {object} ResultCounts
 * @property {number|null} total - The payload's own denominator, shared by every bucket
 * @property {number} [correct] - Responses scored `Richtig`
 * @property {number} [incorrect] - Responses scored `Falsch`
 * @property {number} [notAttempted] - Responses left `Unbearbeitet`
 */

/**
 * Read one entry's result frequencies. The buckets partition the entry's responses,
 * so any one of them carries the shared `total`; taking the largest tolerates a bucket
 * the payload happens to omit without inventing a denominator.
 * @param {ReadonlyArray<Aggregation>} aggregations - The entry's `aggregations[]`.
 * @returns {ResultCounts}
 */
export function readResultCounts(aggregations) {
    /** @type {ResultCounts} */
    const counts = { total: null };
    for (const aggregation of aggregations) {
        if (aggregation.type !== AGG_TYPE_RESULT) continue;
        const { total, frequency } = aggregation.descriptiveStatistics;
        if (total !== undefined) counts.total = Math.max(counts.total ?? 0, total);
        const field = COUNT_FIELD_BY_RESULT[aggregation.value];
        if (field && frequency !== undefined) {
            counts[field] = frequency;
        }
    }
    return counts;
}

/**
 * The share of `Richtig` an entry states, where it states one without counts (a
 * Landesschnitt, whose source stores solve shares and nothing countable).
 * @param {ReadonlyArray<Aggregation>} aggregations - The entry's `aggregations[]`.
 * @returns {number|null} The `Richtig` bucket's `mean`, or `null` when there is no such bucket.
 */
export function readCorrectShare(aggregations) {
    const correct = aggregations.find(
        (aggregation) =>
            aggregation.type === AGG_TYPE_RESULT && aggregation.value === RESULT.CORRECT,
    );
    return correct?.descriptiveStatistics.mean ?? null;
}

/**
 * One result value a payload delivers, as a table column or a tooltip row names it.
 * @typedef {object} ResultType
 * @property {string} value - The result aggregation value (`Richtig`, `Falsch`, `Unbearbeitet`), which is also its display label
 * @property {string} glossaryKey - Glossary lookup key, the lower-cased value
 * @property {number} numericCode - `RESULT_VALUES[value]`, the code the records carry
 */

/**
 * Every result value any entry carries, in the fixed order of `RESULT_VALUES`
 * (Richtig, Falsch, Unbearbeitet). Read by value across all entries, so one entry's
 * missing bucket neither drops the type nor shifts the others.
 * @param {ReadonlyArray<{aggregations: ReadonlyArray<Aggregation>}>} entries
 * @returns {ResultType[]} Empty when no entry carries one.
 */
export function readResultTypes(entries) {
    const delivered = new Set();
    for (const entry of entries) {
        for (const aggregation of entry.aggregations) {
            if (aggregation.type === AGG_TYPE_RESULT) delivered.add(aggregation.value);
        }
    }
    return Object.entries(RESULT_VALUES)
        .filter(([value]) => delivered.has(value))
        .map(([value, numericCode]) => ({
            value,
            glossaryKey: value.toLowerCase(),
            numericCode,
        }));
}

/**
 * Walk one student entry's result buckets item by item: each `includedIqbIds` member
 * with the result code of the bucket that lists it.
 * @param {ReadonlyArray<Aggregation>} aggregations - The student entry's `aggregations[]`.
 * @yields {[string, number]} `[iqbId, RESULT_VALUES code]` per listed item.
 * @returns {Generator<[string, number], void, void>} In payload order.
 */
export function* readItemResults(aggregations) {
    for (const aggregation of aggregations) {
        if (aggregation.type !== AGG_TYPE_RESULT) continue;
        const code = RESULT_VALUES[aggregation.value];
        if (code === undefined) continue;
        for (const iqbId of aggregation.includedIqbIds ?? []) yield [iqbId, code];
    }
}
