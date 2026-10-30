/**
 * Everything the SL derives from the scored results: the per-group domain results with
 * their per-student rows, and the per-student point scores for the group comparison.
 * Pure builders over the SL documents; `SL_DATASETS` declares them as datasets. The
 * competence-level ladder they read is `slLevelDefinitions.js`.
 */

import { compareText } from '../../common/utils/compare.js';
import { group } from 'd3-array';
import { readResultCounts, toPercent } from '../../common/domain/index.js';
import { readLevelsTotal } from '../../common/domain/competenceLevelShare.js';
import {
    readCovariate,
    readStudentGroup,
    readTraitCodes,
} from '../../common/domain/studentIdentity.js';
import { COVARIATE_TYPE } from '../../common/domain/apiValueMaps.js';
import { TERM_CONSTANTS } from '../../common/domain/terms.js';
import { getScaleIdForDomain, subjectDomainKey } from './slLevelDefinitions.js';
import { aggregateGroupResults, aggregateStudentStats } from './slStudentStats.js';
import { domainIdOf } from './slQueryPrimitives.js';

// ============================================================================
// DOMAIN / GROUP RESULTS
// ============================================================================

/**
 * One result per group × Fach × Domäne, each with its per-student rows for cross-domain
 * aggregation.
 * Every result names its scale (`stats.scaleId`, and `competenceScaleId` on each student)
 * next to its level order, so `competenceLevelNames` resolve on the right ladder.
 * The Fach/Domäne definition decides the scale, since a value group listing few levels
 * may not resolve one; the value group's own levels are the fallback.
 * @param {import('../../common/context/moduleContext.js').DatasetContext} context - The app's palette, naming a value group's scale.
 * @param {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @param {import('../../common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup[]} studentsData
 * @param {import('./slLevelDefinitions.js').LevelDefinitions} [levelDefinitions]
 * @returns {import('./slStudentStats.js').SlDomainResult[]}
 */
export function buildDomainResultsFromJson({ palette }, index, studentsData, levelDefinitions) {
    const groupEntries = index.groups;
    if (!groupEntries.length) return [];

    const studentIndex = _indexStudentsByGroupSubjectDomain(studentsData);

    const results = [];

    for (const entry of groupEntries) {
        const subjectName = entry.subject?.name;
        const domainId = domainIdOf(entry);
        const domainName = entry.domain?.name ?? null;
        const groupName = entry.name;
        if (!subjectName || !groupName) continue;

        /** @type {Record<string, number>} */
        const competenceLevelCounts = {};
        // Payload order; `Object.keys` of the counts would re-sort integer-like level names.
        const competenceLevelNames = [];
        for (const cl of entry.competenceLevels) {
            competenceLevelCounts[cl.nameShort] = cl.descriptiveStatistics.frequency ?? 0;
            competenceLevelNames.push(cl.nameShort);
        }
        const nrStudents = readLevelsTotal(entry.competenceLevels) ?? 0;
        const scaleId =
            getScaleIdForDomain(levelDefinitions ?? null, subjectName, domainId) ??
            palette.scaleIdOf(entry);

        const studentKey = `${groupName}|${subjectName}|${domainId}`;
        const students = studentIndex.get(studentKey) ?? [];

        const studentResults = students.map((student) => {
            return {
                studentId: student.id,
                gender: readCovariate(student.covariates, COVARIATE_TYPE.GENDER),
                groupName: groupName,
                traits: readTraitCodes(student.covariates),
                competenceLevelName: student.competenceLevels?.[0]?.nameShort ?? null,
                competenceScaleId: scaleId,
            };
        });
        const { traitCounts, genderCounts } = aggregateStudentStats(studentResults);

        results.push({
            subjectName,
            domainId,
            domainName,
            groupName: groupName,
            stats: {
                nrStudents,
                traitCounts,
                genderCounts,
                competenceLevelCounts,
                competenceLevelNames,
                scaleId,
            },
            studentResults,
        });
    }

    return results;
}

/**
 * Group flat domain results by group: one inner array per group, the groups sorted by name.
 * @param {import('./slStudentStats.js').SlDomainResult[]} domainResults
 * @returns {import('./slStudentStats.js').SlDomainResult[][]}
 */
export function buildGroupResultsFromJson(domainResults) {
    if (!domainResults?.length) return [];

    return Array.from(group(domainResults, (result) => result.groupName))
        .sort(([a], [b]) => compareText(a, b))
        .map(([, results]) => results);
}

/**
 * The school's result per Fach×Domäne: the sums of its group rows, the one aggregate
 * both SL tables show as their school rows. It keeps the groups' scale where they agree
 * on one, so its bars paint a level name two ladders share on the ramp the group rows do.
 * @param {import('./slStudentStats.js').SlDomainResult[]} domainResults
 * @returns {import('./slStudentStats.js').SlDomainResult[]} One school result per Fach×Domäne, `groupName: 'Schule'`.
 */
export function buildSchoolResults(domainResults) {
    const bySubjectDomain = group(domainResults ?? [], (result) =>
        subjectDomainKey(result.subjectName, result.domainId),
    );

    return Array.from(bySubjectDomain.values(), (results) => {
        const [first] = results;
        const scaleIds = new Set(results.map((result) => result.stats.scaleId));
        return {
            subjectName: first.subjectName,
            domainId: first.domainId,
            domainName: first.domainName,
            groupName: TERM_CONSTANTS.SCHOOL,
            stats: {
                ...aggregateGroupResults(results),
                scaleId: scaleIds.size === 1 ? first.stats.scaleId : undefined,
            },
            studentResults: results.flatMap((groupResult) => groupResult.studentResults || []),
        };
    });
}

// ============================================================================
// COMPARISON POINTS
// ============================================================================

/**
 * Per-student point data, one record per student and Fach/Domäne.
 *
 * Reads students-aggregations.json — the API's `type=students&aggregation=result`
 * document: one value group per (student, subject, domain) carrying the three `result`
 * buckets. `Richtig` is the student's raw score, and the three frequencies
 * partition the responses that student gave, so `maxPoints` is their own
 * answered count rather than a group-wide item count, which differs under booklet
 * rotation.
 *
 * Records are grouped by student, group, subject and domain — the group is part of
 * the key because student ids repeat across groups.
 * @param {import('../../common/data/schemas/aggregations.js').StudentAggregationsValueGroup[]} studentsAggregationData
 * @returns {Array<{studentId: string, subject: string, domainId: string|null, domainName: string|null, rawPoints: number, maxPoints: number, solutionRatePercent: number, gender: string|null, groupName: string}>} One row per student, Fach and Domäne; `gender` is `null` for a student without a gender covariate.
 */
export function buildComparisonPoints(studentsAggregationData) {
    const records = [];

    for (const entry of studentsAggregationData) {
        const subjectName = entry.subject?.name;
        const groupName = readStudentGroup(entry);
        // A student without a gender covariate still counts for Lerngruppe and Fach; the
        // Geschlecht category filters by value and so leaves them out on its own.
        const gender = readCovariate(entry.covariates, COVARIATE_TYPE.GENDER);
        if (!subjectName) continue;

        const domainId = domainIdOf(entry);
        const domainName = entry.domain?.name ?? null;
        const counts = readResultCounts(entry.aggregations);
        const rawPoints = counts.correct ?? 0;
        const maxPoints = rawPoints + (counts.incorrect ?? 0) + (counts.notAttempted ?? 0);

        if (maxPoints === 0) continue;

        records.push({
            studentId: entry.id,
            subject: subjectName,
            domainId,
            domainName,
            rawPoints,
            maxPoints,
            gender,
            groupName,
        });
    }

    return sumPointsByKey(
        records,
        (record) =>
            `${record.studentId}|${record.groupName}|${record.subject}|${record.domainId ?? 'null'}`,
        (record) => record,
    );
}

/**
 * Sum the points of the records sharing a key, and derive each total's Lösungsquote
 * from the summed points — averaging the parts' shares would weight a two-item part
 * like a twenty-item one.
 * @template {{rawPoints: number, maxPoints: number}} TRecord
 * @template {object} TSeed
 * @param {TRecord[]} records - The records to sum; each has `maxPoints > 0` (`buildComparisonPoints` drops a value group without responses), so every total has a Lösungsquote.
 * @param {(record: TRecord) => string} keyOf
 * @param {(record: TRecord) => TSeed} seedOf - The fields a total keeps from the first record of its key.
 * @returns {Array<TSeed & {rawPoints: number, maxPoints: number, solutionRatePercent: number}>} One total per key, in first-seen order.
 */
export function sumPointsByKey(records, keyOf, seedOf) {
    /** @type {Map<string, TSeed & {rawPoints: number, maxPoints: number}>} */
    const totals = new Map();

    for (const record of records) {
        const key = keyOf(record);
        let total = totals.get(key);
        if (!total) {
            total = { ...seedOf(record), rawPoints: 0, maxPoints: 0 };
            totals.set(key, total);
        }
        total.rawPoints += record.rawPoints;
        total.maxPoints += record.maxPoints;
    }

    return Array.from(totals.values(), (total) => ({
        ...total,
        solutionRatePercent: toPercent(total.rawPoints / total.maxPoints),
    }));
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Students without a Fach are left out.
 * @param {import('../../common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup[]} studentsData
 * @returns {Map<string, import('../../common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup[]>} Keyed `groupName|subjectName|domainId`.
 */
function _indexStudentsByGroupSubjectDomain(studentsData) {
    return group(
        studentsData.filter((entry) => entry.subject?.name),
        (entry) => `${readStudentGroup(entry)}|${entry.subject?.name}|${domainIdOf(entry)}`,
    );
}
