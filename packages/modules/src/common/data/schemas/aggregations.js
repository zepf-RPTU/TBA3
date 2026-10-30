/**
 * `aggregations.json`, `students-aggregations.json` and `items-aggregations.json`: per value
 * group, results broken down by a keyed aggregation (`type`/`value`, e.g. `result` /
 * `Richtig`).
 * `includedIqbIds` names the items a student's aggregation covers, where the API sends it.
 */

import * as v from 'valibot';
import { DescriptiveStatistics } from './primitives.js';
import { studentValueGroupEntries, valueGroupEntries } from './valueGroup.js';

const Aggregation = v.looseObject({
    type: v.string(),
    value: v.string(),
    includedIqbIds: v.optional(v.array(v.string())),
    descriptiveStatistics: DescriptiveStatistics,
});

export const AggregationsValueGroup = v.looseObject({
    ...valueGroupEntries,
    aggregations: v.array(Aggregation),
});

/** `students-aggregations.json`: a student's value group. */
export const StudentAggregationsValueGroup = v.looseObject({
    ...AggregationsValueGroup.entries,
    ...studentValueGroupEntries,
});

/** @typedef {v.InferOutput<typeof Aggregation>} Aggregation */
/** @typedef {v.InferOutput<typeof AggregationsValueGroup>} AggregationsValueGroup */
/** @typedef {v.InferOutput<typeof StudentAggregationsValueGroup>} StudentAggregationsValueGroup */
