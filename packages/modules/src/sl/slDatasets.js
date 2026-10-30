/**
 * SL dataset catalog — the one authoritative definition of every derived SL dataset: its
 * key, the documents or datasets it reads, and the builder that produces it. Cards name
 * these keys in their `documents` and read them with `getDataset`; the flat
 * competence-levels array is discriminated once, by `COMPETENCE_LEVEL_INDEX`.
 */

import { dataset } from '../common/data/documentStore.js';
import { buildCompetenceLevelIndex } from './slCompetenceLevelIndex.js';
import { buildLevelDefinitions } from './utils/slLevelDefinitions.js';
import {
    buildSelfEfficacyByGroup,
    buildSelfEfficacySchool,
    buildTeachingQualityByGroupSubject,
    buildTeachingQualityIndex,
    buildSelfEfficacyIndex,
    buildComparisonSelfEfficacy,
    buildComparisonTeachingQuality,
} from './utils/slSurveyDerivation.js';
import {
    buildDomainResultsFromJson,
    buildGroupResultsFromJson,
    buildSchoolResults,
    buildComparisonPoints,
} from './utils/slResultsDerivation.js';
import {
    buildLongitudinalSubjectDomains,
    detectHistorySurveyScales,
    indexHistory,
} from './utils/slHistory.js';
import {
    buildLongitudinalMaxShare,
    buildLongitudinalTimelines,
    buildSurveyBoxTimeline,
} from './utils/slLongitudinalTimelines.js';
import { buildSelfEfficacyInfoBoxSummary } from './utils/slSelfEfficacySummary.js';
import { buildGroupNameById } from './utils/slGroupJoin.js';
import { deriveMaterialSubjects } from './utils/slSubjectConfig.js';
import { readTraitLabels } from '../common/domain/studentIdentity.js';

/** Sorted by group name; empty for a dataset without the scale */
const SELF_EFFICACY_BY_GROUP = dataset('sl.selfEfficacyByGroup', {
    inputs: ['students-competence-levels.json'],
    build: buildSelfEfficacyByGroup,
});

/** `null` for a dataset without the scale */
const SELF_EFFICACY_SCHOOL = dataset('sl.selfEfficacySchool', {
    inputs: ['students-competence-levels.json'],
    build: buildSelfEfficacySchool,
});

/** The info-box figures of self-efficacy: the school, the best and the weakest group */
const SELF_EFFICACY_SUMMARY = dataset('sl.selfEfficacySummary', {
    inputs: [SELF_EFFICACY_BY_GROUP, SELF_EFFICACY_SCHOOL],
    build: (selfEfficacyByGroup, selfEfficacySchool) =>
        buildSelfEfficacyInfoBoxSummary({ selfEfficacyByGroup, selfEfficacySchool }),
});

/** Teaching-quality boxplot stats by group and subject */
const TEACHING_QUALITY = dataset('sl.teachingQuality', {
    inputs: ['students-competence-levels.json'],
    build: buildTeachingQualityByGroupSubject,
});

/** Competence level definitions per subject and domain */
const LEVEL_DEFINITIONS = dataset('sl.levelDefinitions', {
    inputs: ['competence-levels.json'],
    build: (competenceLevels, context) => buildLevelDefinitions(context.palette, competenceLevels),
});

const COMPETENCE_LEVEL_INDEX = dataset('sl.competenceLevelIndex', {
    inputs: ['competence-levels.json'],
    build: buildCompetenceLevelIndex,
});

/** One result per group × Fach × Domäne, in payload order */
const DOMAIN_RESULTS = dataset('sl.domainResults', {
    inputs: [COMPETENCE_LEVEL_INDEX, 'students-competence-levels.json', LEVEL_DEFINITIONS],
    build: (index, students, levelDefinitions, context) =>
        buildDomainResultsFromJson(context, index, students, levelDefinitions),
});

/** The school's result per Fach×Domäne, summed over its groups */
const SCHOOL_RESULTS = dataset('sl.schoolResults', {
    inputs: [DOMAIN_RESULTS],
    build: buildSchoolResults,
});

/** Domain results grouped by group, the groups sorted by name */
const GROUP_RESULTS = dataset('sl.groupResults', {
    inputs: [DOMAIN_RESULTS],
    build: buildGroupResultsFromJson,
});

/** The Testgruppen by the group id `aggregations.json` names them by */
const GROUP_NAME_BY_ID = dataset('sl.groupNameById', {
    inputs: ['aggregations.json', COMPETENCE_LEVEL_INDEX],
    build: buildGroupNameById,
});

/** Per-student self-efficacy for the group comparison (flat array) */
const COMPARISON_SELF_EFFICACY = dataset('sl.comparisonSelfEfficacy', {
    inputs: ['students-competence-levels.json'],
    build: buildComparisonSelfEfficacy,
});

/** Per-student teaching quality for the group comparison (flat array) */
const COMPARISON_TEACHING_QUALITY = dataset('sl.comparisonTeachingQuality', {
    inputs: ['students-competence-levels.json'],
    build: buildComparisonTeachingQuality,
});

/** Per-student raw point scores for the group comparison (flat array) */
const COMPARISON_POINTS = dataset('sl.comparisonPoints', {
    inputs: ['students-aggregations.json'],
    build: buildComparisonPoints,
});

/** Teaching-quality rows by group (`null` for the school) and Fach (`teachingQualityKey`); read through `findTeachingQuality` */
const TEACHING_QUALITY_INDEX = dataset('sl.teachingQualityIndex', {
    inputs: [TEACHING_QUALITY],
    build: buildTeachingQualityIndex,
});

/** Self-efficacy rows by group, the school's under `null`; read through `findSelfEfficacy` */
const SELF_EFFICACY_INDEX = dataset('sl.selfEfficacyIndex', {
    inputs: [SELF_EFFICACY_BY_GROUP, SELF_EFFICACY_SCHOOL],
    build: buildSelfEfficacyIndex,
});

// The current year is not repeated among the earlier ones: its school and student
// value groups are the ones the rest of the dashboard reads, stamped with their
// `testPeriod` by the same answer.
/** The history — the current year's value groups and the earlier years — sorted by granularity, each value group with its year, provenance and survey values */
const LONGITUDINAL_INDEX = dataset('sl.longitudinalIndex', {
    inputs: ['competence-levels.json', 'students-competence-levels.json', 'prior-years.json'],
    build: (competenceLevels, students, priorYears, context) =>
        indexHistory(context.palette, [...competenceLevels, ...students], priorYears),
});

/** The Bereiche the timeline covers; the "Bereich" selector's index points into it */
const LONGITUDINAL_SUBJECT_DOMAINS = dataset('sl.longitudinalSubjectDomains', {
    inputs: [LONGITUDINAL_INDEX],
    build: buildLongitudinalSubjectDomains,
});

/** Every line-chart Verlauf timeline: the school's Selbstwirksamkeit, and Kompetenzstufen and Unterrichtsqualität per Bereich */
const LONGITUDINAL_TIMELINES = dataset('sl.longitudinalTimelines', {
    inputs: [LONGITUDINAL_INDEX, LONGITUDINAL_SUBJECT_DOMAINS],
    build: buildLongitudinalTimelines,
});

/** One Bereich's box-plot Verlauf (Unterrichtsqualität and Selbstwirksamkeit per year), read with the Bereich's index; empty past the list */
const LONGITUDINAL_SURVEY_BOXES = dataset('sl.longitudinalSurveyBoxes', {
    inputs: [LONGITUDINAL_INDEX, LONGITUDINAL_SUBJECT_DOMAINS],
    params: (/** @type {number} */ domainIndex) => [domainIndex],
    build: (index, subjectDomains, _context, domainIndex) => {
        const subjectDomain = subjectDomains[domainIndex];
        return subjectDomain ? buildSurveyBoxTimeline(index, subjectDomain) : [];
    },
});

/** The largest share, in percent, any line-chart timeline reaches over every Bereich; their shared y maximum */
const LONGITUDINAL_MAX_SHARE = dataset('sl.longitudinalMaxShare', {
    inputs: [LONGITUDINAL_TIMELINES],
    build: buildLongitudinalMaxShare,
});

/** Which survey scales the timeline carries */
const HISTORY_SURVEY_SCALES = dataset('sl.historySurveyScales', {
    inputs: [LONGITUDINAL_INDEX],
    build: detectHistorySurveyScales,
});

/** The payload's label per trait code, from the person document the results read */
const TRAIT_LABELS = dataset('sl.traitLabels', {
    inputs: ['students-competence-levels.json'],
    build: readTraitLabels,
});

/**
 * Every reference average the dataset delivers, by its payload id: the key an average is
 * plotted, shown and hidden by.
 */
const COMPARISON_IDS = dataset('sl.comparisonIds', {
    inputs: [COMPETENCE_LEVEL_INDEX],
    build: (index) => index.comparisonTracks.map((/** @type {{id: string}} */ track) => track.id),
});

/** The Fächer with material pages: those the school's own value groups carry, in payload order */
const AVAILABLE_MATERIAL_SUBJECTS = dataset('sl.availableMaterialSubjects', {
    inputs: ['competence-levels.json'],
    build: deriveMaterialSubjects,
});

/**
 * The survey gate: at least one aggregate row survived the group/subject builders. No
 * survey column or switch may show without it, so a payload that ships the key on every
 * student yet parses to no row (no numeric value, no group or subject to bucket by) shows
 * none. It counts rows
 * rather than testing truthiness: the builders return an empty array for a dataset without
 * the scale.
 */
const SURVEY_ROWS = dataset('sl.surveyRows', {
    inputs: [TEACHING_QUALITY, SELF_EFFICACY_BY_GROUP, SELF_EFFICACY_SCHOOL],
    build: (teachingQuality, selfEfficacyByGroup, selfEfficacySchool) => ({
        hasTeachingQuality: teachingQuality.length > 0,
        hasSelfEfficacy: selfEfficacyByGroup.length > 0 || Boolean(selfEfficacySchool),
    }),
});

/**
 * The results a section of the school stands on.
 * @typedef {object} ResultSection
 * @property {string|null} groupName - The group, which its survey rows are filed under; `null` for the school.
 * @property {import('./utils/slStudentStats.js').SlDomainResult[]} results - One per Fach × Domäne.
 */

/**
 * The school's section, then each group's, sorted by name: the one source of a section's
 * headcount.
 */
const RESULT_SECTIONS = dataset('sl.resultSections', {
    inputs: [SCHOOL_RESULTS, GROUP_RESULTS],
    build: (schoolResults, groupResults) => /** @type {ResultSection[]} */ ([
        { groupName: null, results: schoolResults },
        ...groupResults.map((results) => ({ groupName: results[0].groupName, results })),
    ]),
});

/** The derived SL datasets, by name. The documents they read are named by file. */
export const SL_DATASETS = Object.freeze({
    AVAILABLE_MATERIAL_SUBJECTS,
    SELF_EFFICACY_BY_GROUP,
    SELF_EFFICACY_SCHOOL,
    SELF_EFFICACY_SUMMARY,
    TEACHING_QUALITY,
    LEVEL_DEFINITIONS,
    COMPETENCE_LEVEL_INDEX,
    COMPARISON_IDS,
    DOMAIN_RESULTS,
    SCHOOL_RESULTS,
    GROUP_RESULTS,
    RESULT_SECTIONS,
    SURVEY_ROWS,
    TRAIT_LABELS,
    GROUP_NAME_BY_ID,
    COMPARISON_SELF_EFFICACY,
    COMPARISON_TEACHING_QUALITY,
    COMPARISON_POINTS,
    TEACHING_QUALITY_INDEX,
    SELF_EFFICACY_INDEX,
    LONGITUDINAL_INDEX,
    LONGITUDINAL_SUBJECT_DOMAINS,
    LONGITUDINAL_TIMELINES,
    LONGITUDINAL_SURVEY_BOXES,
    LONGITUDINAL_MAX_SHARE,
    HISTORY_SURVEY_SCALES,
});

/**
 * Whether the loaded dataset carries any results at all.
 *
 * The API narrows the appended Landesschnitt to the (Fach, Domäne) pairs the school sat,
 * so for a school with no scored results every document comes back `[]`, state value
 * groups included. Every card then shows its own "Keine Daten" placeholder; this probe
 * gives the reason once.
 * @param {import('../common/data/documentStore.js').DocumentStore} documents
 * @returns {boolean}
 */
export function hasSlResults(documents) {
    return documents.get('competence-levels.json').length > 0;
}
