/**
 * MA Item Data Adapter — transforms the item documents into the enriched MA item
 * records.
 */

import {
    buildItemResultCounts,
    itemResultFields,
    readItemResults,
    sortItemsWithinExercises,
} from '../../common/domain/index.js';
import { itemCompetenceFields } from './maCompetenceGroupings.js';

/**
 * One MA item; its values per competence grouping sit in `competenceGroup<n>` fields
 * (see `maCompetenceGroupings.js`).
 * @typedef {import('../../common/domain/itemResultCounts.js').ItemResultCounts & {
 *   iqbId: string,
 *   name: string,
 *   exerciseName: string,
 *   competenceLevel: string,
 *   domain: string,
 *   domainLabel: string,
 *   results: Map<string, number>,
 *   responseCount: number,
 *   solvedCount: number,
 *   percentageCorrect: number|null,
 *   percentageIncorrect: number|null,
 *   percentageNotAttempted: number|null,
 *   meanPercentage: number,
 *   pilotSolutionFrequency: number|null,
 *   pilotSolutionFrequencyDiff: number|null,
 * } & Record<`competenceGroup${number}`, string[]>} MaItemRecord
 */

/** @typedef {import('../../common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */
/** @typedef {import('../../common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build an array of enriched item records from items.json.
 *
 * The three `percentage*` shares are the item's result counts over its `total`, so the
 * distribution bar they draw always sums to the item's own responses. An item the
 * per-item aggregation does not cover has `total` 0 and all three shares `null`.
 * `responseCount` and `solvedCount` are items.json's own `descriptiveStatistics.total` and
 * `.frequency` (0 when absent): the group figures the item rings count, so the rings need
 * no per-item aggregation.
 * `meanPercentage` is the payload's `descriptiveStatistics.mean` in percent — the share
 * the item lollipop sets beside the school and state means, which arrive the same way.
 *
 * `results` is rebuilt from the result aggregations of students-aggregations.json: one
 * result code per student id, so a student the payload repeats counts once.
 * @param {ItemsValueGroup[]} itemsData - items.json (array of domain groups with items[])
 * @param {AggregationsValueGroup[]} aggregationData - students-aggregations.json (per-student per-domain entries)
 * @param {AggregationsValueGroup[]|null} itemAggData - items-aggregations.json, the API's per-item
 *   Richtig/Falsch/Unbearbeitet breakdown
 * @param {import('./maCompetenceGroupings.js').MaCompetenceGrouping[]} groupings - The
 *   competence groupings (`MA_DATASETS.COMPETENCE_GROUPINGS`); each record carries its values per grouping.
 * @returns {MaItemRecord[]}
 */
export function buildItemArray(itemsData, aggregationData, itemAggData, groupings) {
    const itemResultsMap = _buildItemResultsMap(aggregationData);
    const resultCounts = buildItemResultCounts(itemAggData);

    /** @type {MaItemRecord[]} */
    const items = [];

    for (const group of itemsData) {
        const { id: domainId, name: domainLabel } = group.domain;

        for (const item of sortItemsWithinExercises(group.items)) {
            const stats = item.descriptiveStatistics;
            const results = itemResultsMap.get(item.iqbId) ?? new Map();

            items.push({
                iqbId: item.iqbId,
                name: item.name,
                exerciseName: item.exercise.name,
                competenceLevel: item.parameters.competenceLevel.nameShort,
                domain: domainId,
                domainLabel,
                ...itemCompetenceFields(item, groupings),
                results,
                responseCount: stats.total ?? 0,
                solvedCount: stats.frequency ?? 0,
                ...itemResultFields(item, resultCounts),
            });
        }
    }

    return items;
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Each item's per-student results, read off the students' result aggregations
 * (Richtig/Falsch/Unbearbeitet), one value group per student and Leitidee.
 * @param {AggregationsValueGroup[]} aggregationData - students-aggregations.json
 * @returns {Map<string, Map<string, number>>} iqbId → studentId → resultCode
 */
function _buildItemResultsMap(aggregationData) {
    /** @type {Map<string, Map<string, number>>} */
    const map = new Map();

    for (const entry of aggregationData) {
        const studentId = entry.id;

        for (const [iqbId, resultCode] of readItemResults(entry.aggregations)) {
            let results = map.get(iqbId);
            if (!results) map.set(iqbId, (results = new Map()));
            results.set(studentId, resultCode);
        }
    }

    return map;
}
