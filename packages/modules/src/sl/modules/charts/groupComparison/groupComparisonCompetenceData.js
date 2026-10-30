/**
 * Kompetenzstufen data for the GroupComparisonChart: list the Fach/Domäne entries the
 * selector offers, each with its own domain results, read a Fach/Domäne's students and
 * level order off its entry, and count each group's students per level row.
 */

import { group, rollup, sum } from 'd3-array';
import { buildCompetenceLevelRows } from './competenceLevelRows.js';
import {
    EMPTY_COMPARISON,
    buildComparisonData,
    filterByCategory,
} from './groupComparisonDataUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { subjectDomainKey } from '../../../utils/slLevelDefinitions.js';

/** @typedef {import('./groupComparisonDataUtils.js').SlDomainResult} SlDomainResult */
/** @typedef {import('./groupComparisonDataUtils.js').SubjectDomainEntry} SubjectDomainEntry */
/** @typedef {import('./groupComparisonDataUtils.js').CompetenceStudentRecord} CompetenceStudentRecord */
/** @typedef {import('./groupComparisonDataUtils.js').SegmentCount} SegmentCount */
/** @typedef {import('./groupComparisonDataUtils.js').GroupComparisonChartData} GroupComparisonChartData */
/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */

/**
 * The students of one Fach/Domäne with their competence level.
 * @param {SubjectDomainEntry|undefined} entry
 * @returns {CompetenceStudentRecord[]} One record per student and domain result; none for no entry.
 */
export function domainStudentRecords(entry) {
    if (!entry) return [];
    return entry.results.flatMap((domain) =>
        (domain.studentResults ?? []).map((student) => ({
            studentId: student.studentId,
            gender: student.gender,
            groupName: student.groupName,
            competenceLevelName: student.competenceLevelName,
            competenceScaleId: domain.stats?.scaleId,
            subject: entry.key,
        })),
    );
}

/**
 * The Fach/Domäne entries the selector offers, in first-seen order, each carrying its
 * domain results: one grouping pass over the flat results backs the control, the
 * `subjectIndex` selection and every read of one Fach/Domäne.
 * @param {SlDomainResult[]} domainResults
 * @returns {SubjectDomainEntry[]}
 */
export function buildSubjectDomainList(domainResults) {
    return [...group(domainResults, (r) => subjectDomainKey(r.subjectName, r.domainId))].map(
        ([key, results]) => ({
            key,
            subjectName: results[0].subjectName,
            domainId: results[0].domainId,
            domainName: results[0].domainName,
            results,
        }),
    );
}

/**
 * @param {CompetenceStudentRecord[]} students
 * @returns {{[level: string]: number}} Headcount per level; a student without one is left out.
 */
function groupByCompetenceLevel(students) {
    const levels = students.flatMap((student) => student.competenceLevelName ?? []);
    return Object.fromEntries(
        rollup(
            levels,
            (perLevel) => perLevel.length,
            (level) => level,
        ),
    );
}

/**
 * The segment for one group in one comparison row; the renderer drops an empty one.
 * @param {string|null} level - The level this row stands for; null where the group's scale does not reach.
 * @param {{[level: string]: number}} levelCounts
 * @param {string|undefined} scaleId - The group's ladder, so the renderer paints the level on it.
 * @returns {SegmentCount[]} The level's segment; none without a level.
 */
function buildCompetenceSegments(level, levelCounts, scaleId) {
    if (level === null) return [];
    return [{ key: level, count: levelCounts[level] || 0, paint: { level, scaleId } }];
}

/**
 * The level order of a Fach/Domäne (`stats.competenceLevelNames`) and the ladder those
 * names sit on (`stats.scaleId`).
 * @param {SubjectDomainEntry|undefined} subjectDomain
 * @returns {{order: string[], scaleId: string|undefined}|null} Null when no domain result lists its levels.
 */
export function extractLevelOrder(subjectDomain) {
    for (const entry of subjectDomain?.results ?? []) {
        // Not Object.keys(competenceLevelCounts): it re-sorts integer-like keys ('2', '3' before '1a', '1b').
        const order = entry?.stats?.competenceLevelNames;
        if (order?.length) return { order, scaleId: entry.stats?.scaleId };
    }
    return null;
}

/**
 * Each group's students counted per level row; a row neither group reached is left out.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {CompetenceStudentRecord[]|null} subjectData
 * @param {GroupComparisonSelection['category']} category
 * @param {string|null} group1Value - `null` auto-selects.
 * @param {string|null} group2Value - `null` auto-selects.
 * @param {import('./competenceLevelRows.js').CompetenceLevelRow[]|null} [levelRows] - Ordered row definitions built from the selected subjects' level orders; without them the rows are derived from the data alone.
 * @param {(value: string) => string} [labelOf] - How a group value reads (`filterByCategory`).
 * @returns {GroupComparisonChartData}
 */
export function prepareCompetenceGroupData(
    palette,
    subjectData,
    category = 'gender',
    group1Value = null,
    group2Value = null,
    levelRows = null,
    labelOf,
) {
    const split = filterByCategory(subjectData, category, group1Value, group2Value, labelOf);
    if (!split || !subjectData) return EMPTY_COMPARISON;
    const groups = split.map((side) => side.records);
    const levelCounts = groups.map(groupByCompetenceLevel);

    // Each group's ladder, read off its students — the Kategorie "Fach" puts two
    // ladders side by side, and a level name can belong to both.
    const scaleIds = groups.map(
        (students) => students.find((student) => student.competenceScaleId)?.competenceScaleId,
    );
    scaleIds[1] ??= scaleIds[0];

    const fallbackOrder = [
        ...new Set(subjectData.flatMap((student) => student.competenceLevelName || [])),
    ];
    const resolvedLevelRows =
        Array.isArray(levelRows) && levelRows.length > 0
            ? levelRows
            : buildCompetenceLevelRows(palette, [{ order: fallbackOrder, scaleId: scaleIds[0] }]);

    // A row from one ladder names group 1's level for both groups.
    const activeRows = resolvedLevelRows
        .map((row) => ({
            row,
            segments: [0, 1].map((index) => {
                const level =
                    index < row.sourceLevels.length ? row.sourceLevels[index] : row.sourceLevels[0];
                return buildCompetenceSegments(level, levelCounts[index], scaleIds[index]);
            }),
        }))
        .filter(({ segments }) =>
            segments.some((rowSegments) => sum(rowSegments, (segment) => segment.count) > 0),
        );

    // One label per row, unless the two ladders name some row differently.
    const labelPairs = activeRows.map(({ row }) => [row.labels[0], row.labels[1] ?? row.labels[0]]);
    const usePairLabels = labelPairs.some(
        ([group1Label, group2Label]) => group1Label !== group2Label,
    );

    return buildComparisonData(
        TERM_CONSTANTS.COMP_LEVEL,
        split,
        activeRows.map(({ row }, index) => ({
            key: row.key,
            labels: usePairLabels ? labelPairs[index] : [labelPairs[index][0]],
        })),
        (_records, groupIndex) => activeRows.map(({ segments }) => segments[groupIndex]),
    );
}
