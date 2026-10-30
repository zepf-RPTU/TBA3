/**
 * Everything the SL derives from the questionnaire scales on the student value groups:
 * Selbstwirksamkeit (`sp_mean`) and Unterrichtsqualität (`tq_mean`) as per-group
 * box-plot aggregates and as per-student rows for the group comparison. Pure builders
 * over `students-competence-levels.json`; `SL_DATASETS` declares them as datasets.
 */

import { compareText } from '../../common/utils/compare.js';
import { calculateDetailedBoxPlotStats } from './slBoxPlotStats.js';
import { calculateRatingDistribution } from './slRatingDistribution.js';
import {
    getPropertyValue,
    readCovariate,
    readStudentGroup,
} from '../../common/domain/studentIdentity.js';
import { normalizeDataSubjectName } from './slSubjectConfig.js';
import { COVARIATE_TYPE, PROPERTY_KEY } from '../../common/domain/apiValueMaps.js';
import { TERM_CONSTANTS } from '../../common/domain/terms.js';

/** The display name of the school-wide survey rows, beside the group rows. */
const SCHOOL_SURVEY_LABEL = TERM_CONSTANTS.SCHOOL;

/**
 * The key a survey row is told apart by: `school` for the school row (`isSchool`),
 * `group:<name>` for a group, so a group literally named „Schule“ stays its own row.
 * The display name stays `groupName`.
 * @param {{groupName: string, isSchool?: boolean}} row
 * @returns {string}
 */
export function surveyRowKey(row) {
    return row.isSchool ? 'school' : `group:${row.groupName}`;
}

/** @typedef {import('./slBoxPlotStats.js').BoxPlotStats} BoxPlotStats */
/** @typedef {import('./slRatingDistribution.js').RatingDistributionEntry} RatingDistributionEntry */
/** @typedef {(typeof PROPERTY_KEY)[keyof typeof PROPERTY_KEY]} ValueGroupPropertyKey */
/** @typedef {import('../../common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup} StudentValueGroup */

/**
 * One Unterrichtsqualität or Selbstwirksamkeit aggregate: a group (or the school, as
 * `Schule`), per Fach for Unterrichtsqualität, with its student means.
 * @typedef {object} SurveyAggregate
 * @property {string} groupName - The group, or `Schule`: the display name.
 * @property {boolean} [isSchool] - The school row (`surveyRowKey` tells rows apart by it, never by name).
 * @property {string} [subjectName] - The Fach, on Unterrichtsqualität aggregates.
 * @property {number} count - Students behind the aggregate.
 * @property {number[]} values - One mean rating per student, ascending.
 * @property {BoxPlotStats|null} statistics
 * @property {RatingDistributionEntry[]} distribution
 */

/**
 * One Unterrichtsqualität aggregate: a group's (or, with `isSchool`, the school's) ratings in one Fach.
 * @typedef {{groupName: string, isSchool?: boolean, subjectName: string, count: number, values: number[], statistics: BoxPlotStats | null, distribution: RatingDistributionEntry[]}} TeachingQualityAggregate
 */

/**
 * One student's survey value in one group, for the group comparison.
 * @typedef {{studentId: string, subject: string|null, mean: number, gender: string|null, groupName: string}} ComparisonSurveyRow
 */

// ============================================================================
// SELF-EFFICACY BUILDERS
// ============================================================================

/**
 * A student has one entry per subject/domain; deduplicated per student, so each
 * student's sp_mean is counted once.
 * @param {StudentValueGroup[]} studentsData
 * @returns {SurveyAggregate[]} One entry per group, sorted by name; empty for a dataset without the scale.
 */
export function buildSelfEfficacyByGroup(studentsData) {
    return aggregateStudentMeans(studentsData, PROPERTY_KEY.SELF_EFFICACY_MEAN, (entry) => {
        const groupName = readStudentGroup(entry);
        return [{ key: groupName, fields: { groupName } }];
    }).sort((a, b) => compareText(a.groupName, b.groupName));
}

/**
 * @param {StudentValueGroup[]} studentsData
 * @returns {SurveyAggregate | null} `null` for a dataset without the scale.
 */
export function buildSelfEfficacySchool(studentsData) {
    const [school] = aggregateStudentMeans(studentsData, PROPERTY_KEY.SELF_EFFICACY_MEAN, () => [
        { key: SCHOOL_SURVEY_LABEL, fields: { groupName: SCHOOL_SURVEY_LABEL, isSchool: true } },
    ]);
    return school ?? null;
}

/**
 * The self-efficacy rows keyed by group, the school row under `null`.
 * @param {SurveyAggregate[]} byGroup
 * @param {SurveyAggregate|null} school
 * @returns {Map<string|null, SurveyAggregate>}
 */
export function buildSelfEfficacyIndex(byGroup, school) {
    /** @type {Map<string|null, SurveyAggregate>} */
    const index = new Map(byGroup.map((row) => [row.groupName, row]));
    if (school) index.set(null, school);
    return index;
}

// ============================================================================
// TEACHING QUALITY BUILDERS
// ============================================================================

/**
 * A student has one entry per domain of a subject; deduplicated per student and
 * subject, so each student's tq_mean is counted once per subject.
 * @param {StudentValueGroup[]} studentsData
 * @returns {TeachingQualityAggregate[]} Includes both per-group and school-aggregate entries (`isSchool`).
 */
export function buildTeachingQualityByGroupSubject(studentsData) {
    // One walk: an entry counts towards its group's row and its Fach's school row, so
    // the school row counts only students a group row counts too. Both share one map, so
    // the keys are tuples: no Fach or group name can stand for another row.
    return aggregateStudentMeans(
        studentsData,
        PROPERTY_KEY.TEACHING_QUALITY_MEAN,
        /**
         * @param {StudentValueGroup} entry
         * @returns {Array<{key: string, fields: {groupName: string, isSchool?: boolean, subjectName: string}}>} The entry's group row and its Fach's school row.
         */
        (entry) => {
            const groupName = readStudentGroup(entry);
            const subjectName = entry.subject?.name;
            return subjectName
                ? [
                      {
                          key: JSON.stringify([groupName, subjectName]),
                          fields: { groupName, subjectName },
                      },
                      {
                          key: JSON.stringify([null, subjectName]),
                          fields: { groupName: SCHOOL_SURVEY_LABEL, isSchool: true, subjectName },
                      },
                  ]
                : [];
        },
    );
}

/**
 * The key a teaching-quality row is found by: the group (`null` for the school) and the
 * Fach under its data name, so a Fach matches whatever its spelling and no group
 * name can stand for the school.
 * @param {string|null} groupName - `null` for the school.
 * @param {string} subjectName - The Fach, in any spelling.
 * @returns {string}
 */
export function teachingQualityKey(groupName, subjectName) {
    return JSON.stringify([groupName, normalizeDataSubjectName(subjectName)]);
}

/**
 * The teaching-quality rows keyed by `teachingQualityKey`.
 * @param {TeachingQualityAggregate[]} rows
 * @returns {Map<string, TeachingQualityAggregate>}
 */
export function buildTeachingQualityIndex(rows) {
    return new Map(
        rows.map((row) => [
            teachingQualityKey(row.isSchool ? null : row.groupName, row.subjectName),
            row,
        ]),
    );
}

/**
 * A survey aggregate's figures in one object: its box-plot
 * statistics with the headcount and the rating bands merged in.
 * @param {Pick<SurveyAggregate, 'statistics' | 'count' | 'distribution'>|null|undefined} aggregate
 * @returns {(BoxPlotStats & {count: number, distribution: RatingDistributionEntry[]})|null} `null` without statistics.
 */
export function surveyFigures(aggregate) {
    if (!aggregate?.statistics) return null;
    return {
        ...aggregate.statistics,
        count: aggregate.count,
        distribution: aggregate.distribution,
    };
}

// ============================================================================
// COMPARISON BUILDERS
// ============================================================================

/**
 * `sp_mean` is cross-subject, so a student's domain and subject entries collapse into one.
 * @param {StudentValueGroup[]} studentsData
 * @returns {Array<{studentId: string, subject: null, mean: number, gender: string|null, groupName: string}>} One row per student and group; `gender` is `null` for a student without a gender covariate.
 */
export function buildComparisonSelfEfficacy(studentsData) {
    // `bySubject: false` writes `subject: null` on every row.
    return /** @type {Array<ComparisonSurveyRow & {subject: null}>} */ (
        buildComparisonRows(studentsData, PROPERTY_KEY.SELF_EFFICACY_MEAN, false)
    );
}

/**
 * Deduplicates across domains within the same subject.
 * @param {StudentValueGroup[]} studentsData
 * @returns {Array<{studentId: string, subject: string, mean: number, gender: string|null, groupName: string}>} One row per student and Fach; `gender` is `null` for a student without a gender covariate.
 */
export function buildComparisonTeachingQuality(studentsData) {
    // `bySubject: true` skips every entry without a Fach.
    return /** @type {Array<ComparisonSurveyRow & {subject: string}>} */ (
        buildComparisonRows(studentsData, PROPERTY_KEY.TEACHING_QUALITY_MEAN, true)
    );
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Fold the student value groups into one aggregate per group: each student's
 * `propertyKey` value counted once per group (the first entry with a value wins), the groups in the
 * order they are first seen, each with its box-plot statistics and rating bands.
 * @template {object} Fields
 * @param {StudentValueGroup[]} studentsData
 * @param {ValueGroupPropertyKey} propertyKey - The scale's property, `sp_mean` or `tq_mean`.
 * @param {(entry: StudentValueGroup) => Array<{key: string, fields: Fields}>} groupOf - The groups the entry counts towards and the fields each aggregate leads with; none leaves the entry out.
 * @returns {Array<Fields & {count: number, values: number[], statistics: BoxPlotStats | null, distribution: RatingDistributionEntry[]}>} One aggregate per group, its values ascending.
 */
function aggregateStudentMeans(studentsData, propertyKey, groupOf) {
    /** @type {Map<string, {fields: Fields, students: Map<string, number>}>} */
    const groups = new Map();

    for (const entry of studentsData) {
        const memberships = groupOf(entry);
        if (memberships.length === 0) continue;

        const value = getPropertyValue(entry.properties, propertyKey);
        if (value === null) continue;

        // A student is a group and an id: ids repeat across groups, and the school
        // aggregate spans them.
        const studentKey = `${readStudentGroup(entry)}|${entry.id}`;
        for (const group of memberships) {
            let students = groups.get(group.key)?.students;
            if (!students) {
                students = new Map();
                groups.set(group.key, { fields: group.fields, students });
            }
            if (!students.has(studentKey)) students.set(studentKey, value);
        }
    }

    return Array.from(groups.values(), ({ fields, students }) => {
        const values = Array.from(students.values()).sort((a, b) => a - b);
        return {
            ...fields,
            count: values.length,
            values,
            statistics: calculateDetailedBoxPlotStats(values),
            distribution: calculateRatingDistribution(values),
        };
    });
}

/**
 * One row per student and group (and per Fach when `bySubject`) carrying the
 * student's `propertyKey` value; the first entry with a value wins.
 * @param {StudentValueGroup[]} studentsData
 * @param {ValueGroupPropertyKey} propertyKey - The scale's property, `sp_mean` or `tq_mean`.
 * @param {boolean} bySubject - Split by Fach (`tq_mean`) rather than collapse across it (`sp_mean`).
 * @returns {ComparisonSurveyRow[]} In first-seen order.
 */
function buildComparisonRows(studentsData, propertyKey, bySubject) {
    // Keyed with the group too: student ids are reused across groups.
    /** @type {Map<string, ComparisonSurveyRow>} */
    const seen = new Map();

    for (const entry of studentsData) {
        const subject = bySubject ? (entry.subject?.name ?? null) : null;
        if (bySubject && !subject) continue;

        const groupName = readStudentGroup(entry);
        const dedupeKey = `${entry.id}|${groupName}|${subject}`;
        if (seen.has(dedupeKey)) continue;

        const mean = getPropertyValue(entry.properties, propertyKey);
        if (mean === null) continue;

        seen.set(dedupeKey, {
            studentId: entry.id,
            subject,
            mean,
            // Kept without a gender: only the Geschlecht category needs one, and it
            // filters by value.
            gender: readCovariate(entry.covariates, COVARIATE_TYPE.GENDER),
            groupName,
        });
    }

    return Array.from(seen.values());
}
