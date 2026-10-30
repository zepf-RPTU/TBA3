/**
 * Builds the EN group's item records and one student's item rows from the item and
 * aggregation documents.
 */

import { AGG_TYPE_STYLE } from '../../common/domain/apiValueMaps.js';
import { styleComparator } from './enStyleOrder.js';
import {
    buildItemResultCounts,
    itemResultFields,
    readItemResults,
    readStudentName,
    RESULT_CODE,
    sortItemsWithinExercises,
} from '../../common/domain/index.js';

/** @typedef {import('../../common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */

/** @typedef {import('../../common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */
/** @typedef {import('../../common/data/schemas/aggregations.js').StudentAggregationsValueGroup} StudentAggregationsValueGroup */

/** @typedef {{studentId: string, firstName: string, lastName: string}} ItemStudent */

/**
 * A student coded anything but `Richtig` on an item; `attempted` is false for `Unbearbeitet`.
 * @typedef {ItemStudent & {attempted: boolean}} ItemNonSolver
 */

/**
 * The students who solved an item and those who did not.
 * @typedef {{solvers: ItemStudent[], nonSolvers: ItemNonSolver[]}} ItemSolverSets
 */

/**
 * One EN item record: the raw items.json item (`iqbId`, `name`, `exercise`,
 * `parameters`, `descriptiveStatistics`, spread as delivered, hence the open tail) plus the
 * fields derived here.
 * @typedef {ItemsValueGroup['items'][number] & import('../../common/domain/itemResultCounts.js').ItemResultCounts & ItemSolverSets & {
 *   iqbId: string,
 *   exerciseName: string,
 *   domain: string,
 *   domainLabel: string,
 *   competenceLevel: string,
 *   style: string[],
 *   percentageCorrect: number|null,
 *   percentageIncorrect: number|null,
 *   percentageNotAttempted: number|null,
 *   meanPercentage: number,
 *   pilotSolutionFrequency: number|null,
 *   pilotSolutionFrequencyDiff: number|null,
 * }} EnItemRecord
 */

/**
 * One item as one student answered it.
 * @typedef {{
 *   iqbId: string,
 *   name: string,
 *   exerciseName: string,
 *   domain: string,
 *   domainLabel: string,
 *   competenceLevel: string,
 *   style: string[],
 *   resultCode: number,
 * }} EnStudentItemRow
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build the enriched item records from items.json: each spreads the raw API item and
 * adds the derived fields of {@link EnItemRecord}.
 *
 * The three `percentage*` shares all come from the per-item result breakdown, so the
 * progress bar's segments partition the same responses; `meanPercentage` is the
 * item's `mean` from items.json, the statistic the comparison groups carry too.
 * @param {ItemsValueGroup[]} itemsData - items.json
 * @param {StudentAggregationsValueGroup[]|null} studentStyleAggData - students-aggregations.json, the source of
 *   the per-item solver / non-solver name lists.
 * @param {AggregationsValueGroup[]|null} itemAggData - items-aggregations.json, the API's per-item
 *   Richtig/Falsch/Unbearbeitet breakdown.
 * @param {Array<{value: string, fieldName: string, label: string}>} [styleCategories] - Style categories in priority order; `style` is sorted into it.
 * @returns {EnItemRecord[]}
 */
export function buildItemArray(itemsData, studentStyleAggData, itemAggData, styleCategories = []) {
    const resultCounts = buildItemResultCounts(itemAggData);
    const solverSets = _buildItemSolverSets(studentStyleAggData);
    const compareStyles = styleComparator(styleCategories);

    /** @type {EnItemRecord[]} */
    const items = [];

    for (const group of itemsData) {
        const { id: domainId, name: domainLabel } = group.domain;

        for (const item of sortItemsWithinExercises(group.items)) {
            const params = item.parameters;

            // The arrays are shared across all records built from one aggregation
            // payload: read-only for consumers.
            const { solvers = [], nonSolvers = [] } = solverSets.get(item.iqbId) ?? {};

            items.push({
                ...item,
                // Top-level, as every table field over store data: Tabulator writes each
                // cell's value back into its row data, and a nested field would land in
                // the frozen payload object.
                exerciseName: item.exercise.name,
                domain: domainId,
                domainLabel,
                competenceLevel: params.competenceLevel.nameShort,
                style: (params.competences ?? [])
                    .flatMap((c) => (c.type === AGG_TYPE_STYLE && c.name ? [c.name] : []))
                    .sort(compareStyles),
                ...itemResultFields(item, resultCounts),
                solvers,
                nonSolvers,
            });
        }
    }

    return items;
}

/**
 * One student's rows of the item table: each group item the student has a result for,
 * with that result code, in the group records' booklet order.
 * @param {EnItemRecord[]} itemRecords
 * @param {Map<string, number>} itemResults - The student's `RESULT_VALUES` code per iqbId.
 * @returns {EnStudentItemRow[]}
 */
export function buildStudentItemRows(itemRecords, itemResults) {
    return itemRecords.flatMap((item) => {
        const resultCode = itemResults.get(item.iqbId);
        // In no result bucket: the student was not tested on the item.
        if (resultCode === undefined) return [];
        return [
            {
                iqbId: item.iqbId,
                name: item.name,
                exerciseName: item.exerciseName,
                domain: item.domain,
                domainLabel: item.domainLabel,
                competenceLevel: item.competenceLevel,
                style: item.style,
                resultCode,
            },
        ];
    });
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * The group's per-item solver and non-solver lists, inverted from every student's
 * result aggregations. Each aggregation is filed by its `value`: the spec fixes no
 * order of `aggregations[]`.
 *
 * Membership is client-derived because `students-aggregations.json` already carries
 * it; only the counts come from the API ({@link buildItemResultCounts}). The counts are
 * not derived from the same lists: `includedIqbIds` is optional in the spec, while the
 * item value groups are what the API answers per item.
 *
 * No domain filtering is needed: iqbIds are unique across domains.
 * @param {StudentAggregationsValueGroup[]|null} studentStyleAggData
 * @returns {Map<string, ItemSolverSets>} Per iqbId, the students coded `Richtig` and those coded anything else.
 * @private
 */
function _buildItemSolverSets(studentStyleAggData) {
    if (!studentStyleAggData) return new Map();

    /** @type {Map<string, ItemSolverSets>} */
    const groups = new Map();
    const groupFor = (/** @type {string} */ iqbId) => {
        let group = groups.get(iqbId);
        if (!group) {
            group = { solvers: [], nonSolvers: [] };
            groups.set(iqbId, group);
        }
        return group;
    };

    for (const entry of studentStyleAggData) {
        const student = readStudentName(entry);
        for (const [iqbId, code] of readItemResults(entry.aggregations)) {
            _fileStudent(groupFor(iqbId), student, code);
        }
    }

    return groups;
}

/**
 * File one student into an item's groups by result code: `Richtig` is a solver,
 * `Falsch` and `Unbearbeitet` are non-solvers, the latter with `attempted: false`.
 * @param {ItemSolverSets} group
 * @param {ItemStudent} student
 * @param {number} code - A `RESULT_VALUES` code.
 * @private
 */
function _fileStudent(group, student, code) {
    switch (code) {
        case RESULT_CODE.CORRECT:
            group.solvers.push(student);
            break;
        case RESULT_CODE.INCORRECT:
            group.nonSolvers.push({ ...student, attempted: true });
            break;
        case RESULT_CODE.NOT_ATTEMPTED:
            group.nonSolvers.push({ ...student, attempted: false });
            break;
        default:
            break;
    }
}
