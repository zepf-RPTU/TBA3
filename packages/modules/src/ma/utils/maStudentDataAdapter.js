/**
 * MA Student Data Adapter — transforms the JSON API documents into MA student records.
 */

import { percentOf } from '../../common/domain/itemResultCounts.js';
import { readResultCounts, readStudentIdentity } from '../../common/domain/index.js';
import { readItemLevelSpan } from '../../common/services/competenceScalePayload.js';

/**
 * One student's results over the whole booklet or one item pool.
 * @typedef {object} MaStudentRecord
 * @property {string} studentId - The student's payload id.
 * @property {string} firstName - '' when not shipped.
 * @property {string} lastName - '' when not shipped.
 * @property {string} gender - The gender as the API spells it, '' when not shipped.
 * @property {string} competenceLevelName - The student's Kompetenzstufe `nameShort`.
 * @property {import('../../common/services/competenceScalePayload.js').ItemLevelSpan|null} competenceLevelItemSpan -
 *   The item slots that Kompetenzstufe covers on the student's own booklet; null when not shipped.
 * @property {number} totalCount - Items the student's own results cover in scope, not
 *   attempted ones included; the N of "Richtig (von N)".
 * @property {number|null} percentageCorrect - Correct share of the answered and unanswered items, 0–100; null for a student without results.
 * @property {number|null} percentageIncorrect - Incorrect share, 0–100; null without results.
 * @property {number|null} percentageNotAttempted - Not-attempted share, 0–100; null without results.
 * @property {number} correctCount
 * @property {number} incorrectCount
 * @property {number} notAttemptedCount
 * @property {Set<string>} traits - The trait codes set for the student.
 */

/**
 * One student's result on one item: `resultCode` is a `RESULT_CODE`, `competenceLevel`
 * the item's Aufgabenniveau `nameShort`, and the item's values per competence grouping
 * sit in `competenceGroup<n>` fields.
 * @typedef {{
 *   domainLabel: string,
 *   exerciseName: string,
 *   name: string,
 *   competenceLevel: string,
 *   resultCode: number,
 * } & Record<`competenceGroup${number}`, string[]>} MaStudentItemRow
 */

/** @typedef {import('../../common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../common/data/schemas/aggregations.js').StudentAggregationsValueGroup} AggregationsValueGroup */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build the aggregated studentArray from competence-level + aggregation JSON data.
 * @param {CompetenceLevelsValueGroup[]} competenceLevelsData - students-competence-levels.json
 * @param {AggregationsValueGroup[]} aggregationData - students-aggregations.json
 * @returns {MaStudentRecord[]}
 */
export function buildStudentRecords(competenceLevelsData, aggregationData) {
    const resultMap = tallyStudentResults(aggregationData);

    return competenceLevelsData.map((entry) => ({
        ...readStudentIdentity(entry),
        competenceLevelName: entry.competenceLevels?.[0]?.nameShort ?? '',
        competenceLevelItemSpan: readItemLevelSpan(entry, entry.competenceLevels?.[0]),
        ...deriveResultFields(resultMap.get(entry.id)),
    }));
}

/**
 * Re-scope aggregated student records to one Leitidee (an item pool). Takes the
 * counts from the student's aggregation value group for that Leitidee, while reusing
 * identity, gender, traits and Kompetenzstufe from the whole-booklet records.
 *
 * The same value groups the whole-booklet counts are summed from, so the Leitidee pools add
 * up to "Gesamt" — including items without an IQB id, which no per-item list names.
 * @param {MaStudentRecord[]} baseStudentArray - Whole-booklet records (buildStudentRecords output)
 * @param {AggregationsValueGroup[]} aggregationData - students-aggregations.json, one value group per student×Leitidee
 * @param {string} domainId - The Leitidee's domain id
 * @returns {MaStudentRecord[]}
 */
function buildScopedStudentRecords(baseStudentArray, aggregationData, domainId) {
    const tally = tallyStudentResults(
        aggregationData.filter((entry) => entry.domain?.id === domainId),
    );

    return baseStudentArray.map((student) => ({
        ...student,
        ...deriveResultFields(tally.get(student.studentId)),
    }));
}

/**
 * The student records of every Leitidee pool, re-scoped once per store.
 * @param {MaStudentRecord[]} baseStudentArray - Whole-booklet records (buildStudentRecords output)
 * @param {AggregationsValueGroup[]} aggregationData - students-aggregations.json, one value group per student×Leitidee
 * @param {Array<{domain: string}>} domains - The Leitideen the booklet declares.
 * @returns {Map<string, MaStudentRecord[]>} Per Leitidee id.
 */
export function buildStudentRecordsByDomain(baseStudentArray, aggregationData, domains) {
    return new Map(
        domains.map(({ domain }) => [
            domain,
            buildScopedStudentRecords(baseStudentArray, aggregationData, domain),
        ]),
    );
}

/**
 * Each student's rows of the student data table, one per item they sat, built by
 * unrolling each item record's per-student results, so the item's name, exercise,
 * level, Leitidee and competences are read from the one place that derives them.
 * @param {Array<Pick<import('./maItemDataAdapter.js').MaItemRecord, 'results' | 'domainLabel' | 'exerciseName' | 'name' | 'competenceLevel'> & Record<`competenceGroup${number}`, string[]>>} itemRecords
 * @param {Array<{field: `competenceGroup${number}`}>} groupings - The competence groupings whose fields the rows copy.
 * @returns {Map<string, MaStudentItemRow[]>} Per student id, in item order.
 */
export function buildStudentItemRowsByStudent(itemRecords, groupings) {
    /** @type {Map<string, MaStudentItemRow[]>} */
    const rows = new Map();
    for (const item of itemRecords) {
        const competences = Object.fromEntries(groupings.map(({ field }) => [field, item[field]]));
        for (const [studentId, resultCode] of item.results) {
            let studentRows = rows.get(studentId);
            if (!studentRows) rows.set(studentId, (studentRows = []));
            studentRows.push({
                domainLabel: item.domainLabel,
                exerciseName: item.exerciseName,
                name: item.name,
                competenceLevel: item.competenceLevel,
                ...competences,
                resultCode,
            });
        }
    }
    return rows;
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * @typedef {{correct: number, incorrect: number, notAttempted: number}} ResultTally
 */

/**
 * The result fields of a {@link MaStudentRecord}, derived from one student's tally. A
 * student without results has no shares (null), not 0 %: the bar shows no data.
 * @param {ResultTally|undefined} tally - Absent reads as no results.
 * @returns {Pick<MaStudentRecord, 'totalCount'|'percentageCorrect'|'percentageIncorrect'|'percentageNotAttempted'|'correctCount'|'incorrectCount'|'notAttemptedCount'>}
 */
function deriveResultFields(tally) {
    const { correct, incorrect, notAttempted } = tally ?? {
        correct: 0,
        incorrect: 0,
        notAttempted: 0,
    };
    const total = correct + incorrect + notAttempted;
    return {
        totalCount: total,
        percentageCorrect: percentOf(correct, total),
        percentageIncorrect: percentOf(incorrect, total),
        percentageNotAttempted: percentOf(notAttempted, total),
        correctCount: correct,
        incorrectCount: incorrect,
        notAttemptedCount: notAttempted,
    };
}

/**
 * Sum Richtig/Falsch/Unbearbeitet frequencies per student over the given value groups.
 * @param {AggregationsValueGroup[]} aggregationData - Value groups of students-aggregations.json, one per student×Leitidee
 * @returns {Map<string, ResultTally>} Per student id, the totals across the value groups.
 */
function tallyStudentResults(aggregationData) {
    /** @type {Map<string, ResultTally>} */
    const map = new Map();

    for (const entry of aggregationData) {
        let counts = map.get(entry.id);
        if (!counts) {
            counts = { correct: 0, incorrect: 0, notAttempted: 0 };
            map.set(entry.id, counts);
        }
        const {
            correct = 0,
            incorrect = 0,
            notAttempted = 0,
        } = readResultCounts(entry.aggregations);
        counts.correct += correct;
        counts.incorrect += incorrect;
        counts.notAttempted += notAttempted;
    }

    return map;
}
