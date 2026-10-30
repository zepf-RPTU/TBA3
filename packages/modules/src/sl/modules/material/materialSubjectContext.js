/**
 * The data half of the material pages: reads the SL document store and answers one plain
 * context object per Fach — the survey figures per group and for the school, and per Domäne
 * the performance figures, the Kompetenzstufen distributions, the deltas to the
 * Landesschnitt and to the last earlier year, and the best group per Kennzahl. It formats
 * nothing; the wording and the HTML live in `materialContentResolver.js`.
 *
 * Performance is per Domäne because the same Lösungsquote can be strong in one Domäne and
 * average in another. A Domäne is one with its own competence levels: a Fach whose levels
 * are Fach-level (Mathematik) is one entry with `domainId: null`, read over the whole Fach.
 */

import { dataset } from '../../../common/data/documentStore.js';
import { SL_DATASETS } from '../../slDatasets.js';
import { COMPETENCE_SHARES, competenceLevelShare } from '../../utils/slCompetenceShares.js';
import { SOLUTION_RATES } from '../../utils/slSolutionRates.js';
import { teachingQualityKey } from '../../utils/slSurveyDerivation.js';
import { MEDIUM_OR_ABOVE_ALIAS, formatStandardBands } from '../../utils/slCompetenceLevels.js';
import { groupNamesOf } from '../../slCompetenceLevelIndex.js';
import { aggregateSubjectStats } from '../../utils/slStudentStats.js';
import { readBooklets } from '../../utils/slBooklets.js';
import { readLevelShare } from '../../../common/domain/competenceLevelShare.js';
import { buildCompetenceLevelHistory } from '../../utils/slHistory.js';
import { EPSILON } from './materialFormat.js';
import { finiteRange } from '../../utils/slSelectionRanking.js';
import { isFiniteNumber } from '../../../common/utils/numberFormat.js';

/** @typedef {import('../../slCompetenceLevelIndex.js').CompetenceLevelIndex} CompetenceLevelIndex */

/**
 * The Fach-level figures of one material-page row, for a group or (with `groupName: null`) the school.
 * @typedef {object} MaterialMetrics
 * @property {string|null} groupName - The group, or `null` for the school.
 * @property {number} studentCount - Tested students.
 * @property {number|null} femaleShare - Female share among students with a stated gender.
 * @property {number|null} teachingQualityMean - Mean reported Unterrichtsqualität.
 * @property {number|null} selfEfficacyMean - Mean Selbstwirksamkeit.
 */

/**
 * The performance figures of one target in one Domäne.
 * @typedef {object} MaterialPerformance
 * @property {number|null} solutionRate - Lösungsquote.
 * @property {number|null} mediumOrAboveShare - Share at the Regelstandard or above.
 */

/**
 * One competence-level bar of a distribution.
 * @typedef {object} MaterialDistributionLevel
 * @property {string} label - The level's short name.
 * @property {number|null} share - Its share, as a fraction.
 * @property {string|undefined} scaleId - The value group's registered ladder.
 */

/**
 * The school's and the Landesschnitt's distribution of one Domäne.
 * @typedef {object} MaterialDomainDistribution
 * @property {string|null} domainId - The Domäne, `null` for a Fach with Fach-level competence levels.
 * @property {string|null} domainName - Its display name.
 * @property {{levels: MaterialDistributionLevel[]}|null} schoolDistribution
 * @property {{levels: MaterialDistributionLevel[]}|null} stateDistribution
 */

/**
 * One value per performance Kennzahl.
 * @template T
 * @typedef {object} PerformanceMap
 * @property {T} solutionRate - Lösungsquote.
 * @property {T} mediumOrAboveShare - Share at the Regelstandard or above.
 */

/**
 * One value per survey Kennzahl.
 * @template T
 * @typedef {object} SurveyMap
 * @property {T} teachingQualityMean - Mean Unterrichtsqualität.
 * @property {T} selfEfficacyMean - Mean Selbstwirksamkeit.
 */

/**
 * One Domäne of the Fach: its distributions and every performance figure that compares
 * within it. `school` is the school's own value group; `groups` holds each group's figures
 * by group name; `ranges` and `bestGroups` compare the groups; the deltas are school minus
 * Landesschnitt, and `previousYear` this year's Regelstandard share minus that of the last
 * earlier year with data, with that year (`null` without one). `mixedBooklets`: the Domäne
 * was sat in several booklets, so its Lösungsquoten are suppressed.
 * @typedef {MaterialDomainDistribution & {
 *   school: MaterialPerformance,
 *   groups: Map<string|null, MaterialPerformance>,
 *   ranges: PerformanceMap<{min: number, max: number}|null>,
 *   bestGroups: PerformanceMap<Set<string|null>>,
 *   solutionRateDelta: number|null,
 *   mediumOrAboveDelta: number|null,
 *   previousYear: {year: string, delta: number}|null,
 *   mixedBooklets: boolean,
 * }} MaterialDomain
 */

/** @type {ReadonlyArray<keyof PerformanceMap<unknown>>} The per-Domäne Kennzahlen, in column order. */
export const PERFORMANCE_KEYS = Object.freeze(['solutionRate', 'mediumOrAboveShare']);

/** @type {ReadonlyArray<keyof SurveyMap<unknown>>} The Fach-level survey Kennzahlen, in column order. */
export const SURVEY_KEYS = Object.freeze(['teachingQualityMean', 'selfEfficacyMean']);

/**
 * One value per Kennzahl.
 * @template {string} K
 * @template T
 * @param {ReadonlyArray<K>} keys
 * @param {(key: K) => T} buildValue
 * @returns {{[P in K]: T}}
 */
function mapKeys(keys, buildValue) {
    return /** @type {{[P in K]: T}} */ (
        Object.fromEntries(keys.map((key) => [key, buildValue(key)]))
    );
}

/**
 * Everything one material page reads about a Fach.
 * @typedef {object} MaterialSubjectContextData
 * @property {string} subjectName - The canonical Fach name.
 * @property {string|null} veraStage - The VERA stage (`3`, `8`) the Fach's booklets name, or `null` when they name none or several.
 * @property {MaterialMetrics} schoolMetrics - The school's Fach-level figures.
 * @property {MaterialMetrics[]} groupMetrics - One entry per group with tested students.
 * @property {boolean} hasTeachingQuality - Whether the dataset carries Unterrichtsqualität.
 * @property {boolean} hasSelfEfficacy - Whether the dataset carries Selbstwirksamkeit.
 * @property {SurveyMap<{min: number, max: number}|null>} ranges - The group range per survey Kennzahl.
 * @property {SurveyMap<Set<string|null>>} bestGroups - The groups at the best value per survey Kennzahl.
 * @property {MaterialDomain[]} domains - One per Domäne, in the Fach's Domäne order.
 * @property {string|null} reportYear - The year the results are of: the current year's `testPeriod`, `null` when its value groups name none.
 * @property {{levels: string[], bands: string}} mediumOrAbove - The levels the Regelstandard alias picks out on the loaded scales, and their names (`III bzw. B1`; empty when no scale has one).
 */

/**
 * What the material page of a Fach is built from: the store's datasets it reads.
 * @typedef {object} MaterialSources
 * @property {CompetenceLevelIndex} index
 * @property {import('../../slDatasets.js').ResultSection[]} resultSections
 * @property {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} surveyRows
 * @property {Map<string, import('../../utils/slSurveyDerivation.js').TeachingQualityAggregate>} teachingQualityIndex
 * @property {Map<string|null, import('../../utils/slSurveyDerivation.js').SurveyAggregate>} selfEfficacyIndex
 * @property {import('../../utils/slHistory.js').HistoryIndex} history
 * @property {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} shares
 * @property {import('../../utils/slSolutionRates.js').SolutionRateQueries} solutionRates
 */

/**
 * Everything one material page reads about a Fach (its canonical name), built once per
 * Fach and store: a type toggle or a theme switch only re-renders the words.
 */
export const MATERIAL_SUBJECT_CONTEXT = dataset('sl.materialSubjectContext', {
    inputs: [
        SL_DATASETS.COMPETENCE_LEVEL_INDEX,
        SL_DATASETS.RESULT_SECTIONS,
        SL_DATASETS.SURVEY_ROWS,
        SL_DATASETS.TEACHING_QUALITY_INDEX,
        SL_DATASETS.SELF_EFFICACY_INDEX,
        SL_DATASETS.LONGITUDINAL_INDEX,
        COMPETENCE_SHARES,
        SOLUTION_RATES,
    ],
    params: (/** @type {string} */ subjectName) => [subjectName],
    build: (
        index,
        resultSections,
        surveyRows,
        teachingQualityIndex,
        selfEfficacyIndex,
        history,
        shares,
        solutionRates,
        { palette },
        subjectName,
    ) =>
        buildMaterialSubjectContext(
            {
                index,
                resultSections,
                surveyRows,
                teachingQualityIndex,
                selfEfficacyIndex,
                history,
                shares,
                solutionRates,
            },
            palette,
            subjectName,
        ),
});

/**
 * @param {MaterialSources} sources
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string} subjectName
 * @returns {MaterialSubjectContextData}
 */
function buildMaterialSubjectContext(sources, palette, subjectName) {
    const { index, shares, solutionRates } = sources;
    const mediumOrAbove = {
        levels: shares.getAliasLevels(MEDIUM_OR_ABOVE_ALIAS) ?? [],
        bands: formatStandardBands(palette, MEDIUM_OR_ABOVE_ALIAS) ?? '',
    };
    const resultsBySection = new Map(
        sources.resultSections.map(({ groupName, results }) => [groupName, results]),
    );

    /**
     * @param {string|null} groupName - The group, or `null` for the school.
     * @returns {MaterialMetrics}
     */
    const buildMetrics = (groupName) => {
        const { nrStudents, genderCounts } = aggregateSubjectStats(
            (resultsBySection.get(groupName) ?? []).filter(
                (result) => result.subjectName === subjectName,
            ),
        );
        return {
            groupName,
            studentCount: nrStudents,
            femaleShare: femaleShareOf(genderCounts),
            teachingQualityMean:
                sources.teachingQualityIndex.get(teachingQualityKey(groupName, subjectName))
                    ?.statistics?.mean ?? null,
            selfEfficacyMean: sources.selfEfficacyIndex.get(groupName)?.statistics?.mean ?? null,
        };
    };

    const groupMetrics = groupNamesOf(index, subjectName)
        .map(buildMetrics)
        .filter((metrics) => metrics.studentCount > 0);
    // The page compares with "the Landesschnitt"; a payload splitting it by track has
    // none, and the deltas then stay empty rather than pooling the tracks.
    const stateTarget = shares.getSoleStateTarget();

    /**
     * @param {import('../../utils/slQueryPrimitives.js').QueryTarget} target - School, group or state.
     * @param {string|null} domainId - The Domäne, `null` for the whole Fach.
     * @returns {MaterialPerformance}
     */
    const readPerformance = (target, domainId) => ({
        solutionRate: solutionRates.getSolutionRate({ target, subjectName, domainId }),
        mediumOrAboveShare: shares.getCompetenceLevelShare({
            target,
            subjectName,
            domainId,
            levelAlias: MEDIUM_OR_ABOVE_ALIAS,
        }),
    });

    /**
     * @param {MaterialDomainDistribution} distribution
     * @returns {MaterialDomain}
     */
    const buildDomain = (distribution) => {
        const { domainId } = distribution;
        const school = readPerformance('school', domainId);
        const groups = new Map(
            groupMetrics.map(({ groupName }) => [
                groupName,
                readPerformance(/** @type {string} */ (groupName), domainId),
            ]),
        );
        const state = stateTarget ? readPerformance(stateTarget, domainId) : null;
        return {
            ...distribution,
            school,
            groups,
            ranges: mapKeys(PERFORMANCE_KEYS, (key) =>
                finiteRange([...groups.values()].map((row) => row[key])),
            ),
            bestGroups: mapKeys(PERFORMANCE_KEYS, (key) => buildBestGroupSet(groups, key)),
            solutionRateDelta: difference(school.solutionRate, state?.solutionRate ?? null),
            mediumOrAboveDelta: difference(
                school.mediumOrAboveShare,
                state?.mediumOrAboveShare ?? null,
            ),
            previousYear: buildPreviousYear(
                sources.history,
                palette,
                subjectName,
                domainId,
                mediumOrAbove.levels,
            ),
            mixedBooklets: solutionRates.hasMixedBooklets(subjectName, domainId),
        };
    };

    const groupsByName = new Map(groupMetrics.map((metrics) => [metrics.groupName, metrics]));
    return {
        subjectName,
        veraStage: deriveVeraStage(index, subjectName),
        schoolMetrics: buildMetrics(null),
        groupMetrics,
        // Asked of the dataset, not of this subject: a subject without a value keeps its
        // column with a dash; only a dataset without the scale drops it.
        ...sources.surveyRows,
        ranges: mapKeys(SURVEY_KEYS, (key) =>
            finiteRange(groupMetrics.map((metrics) => metrics[key])),
        ),
        bestGroups: mapKeys(SURVEY_KEYS, (key) => buildBestGroupSet(groupsByName, key)),
        domains: buildDomainDistributions(index, palette, shares, stateTarget, subjectName).map(
            buildDomain,
        ),
        reportYear: sources.history.currentYear ?? null,
        mediumOrAbove,
    };
}

/**
 * @param {{[gender: string]: number}} genderCounts - Students per gender code, of those whose gender the payload states.
 * @returns {number|null} The female share among them; `null` when no student states one, rather than reading as zero.
 */
function femaleShareOf(genderCounts) {
    let known = 0;
    let female = 0;
    for (const [gender, count] of Object.entries(genderCounts)) {
        const token = gender.trim().toLowerCase();
        // A blank code states no gender: neither female nor not female.
        if (!token) continue;
        known += count;
        if (token === 'female') female += count;
    }
    return known > 0 ? female / known : null;
}

/**
 * @param {number|null} value
 * @param {number|null} reference - What it is compared with.
 * @returns {number|null} `value - reference`, or `null` when either is missing.
 */
function difference(value, reference) {
    return isFiniteNumber(value) && isFiniteNumber(reference) ? value - reference : null;
}

/**
 * The school's Regelstandard share in one Domäne, latest year minus the last earlier year
 * with data, from the Verlauf timeline. That year need not be the one before (a Domäne
 * not tested every year), so it travels with the delta for the copy to name. Each year's
 * share follows the current year's rule (`competenceLevelShare`): a scale that cannot
 * express the levels makes it unknown, not 0 %, and an unknown year has no delta.
 * @param {import('../../utils/slHistory.js').HistoryIndex} historyIndex - The Verlauf timeline.
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string} subjectName
 * @param {string|null} domainId - The Domäne, `null` for a Fach with Fach-level competence levels.
 * @param {string[]} levelNames - The Regelstandard levels.
 * @returns {{year: string, delta: number}|null} The earlier year (its `testPeriod`) and the delta; `null` with fewer than two years of data or a share either year cannot state.
 */
function buildPreviousYear(historyIndex, palette, subjectName, domainId, levelNames) {
    const history = buildCompetenceLevelHistory(historyIndex, subjectName, domainId);
    if (history.length < 2) return null;
    const [previous, latest] = history.slice(-2);
    const previousShare = competenceLevelShare(palette, [previous.valueGroup], levelNames);
    const latestShare = competenceLevelShare(palette, [latest.valueGroup], levelNames);
    if (previousShare === null || latestShare === null) return null;
    return { year: previous.year, delta: latestShare - previousShare };
}

/**
 * The school's and the Landesschnitt's distribution per Domäne of the Fach, in the Fach's
 * Domäne order.
 * @param {CompetenceLevelIndex} index
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} shares - Knows the Domänen and the Landesschnitt.
 * @param {{type: 'comparison', id: string}|null} stateTarget - The sole Landesschnitt.
 * @param {string} subjectName
 * @returns {MaterialDomainDistribution[]} One per Domäne with a school or a state value group.
 */
function buildDomainDistributions(index, palette, shares, stateTarget, subjectName) {
    if (!index.schoolId) {
        return [];
    }

    return shares
        .getOrderedDomainsForSubject(subjectName)
        .map(({ domainId, domainName }) => {
            const school = index.schoolFor(subjectName, domainId);
            const state = stateTarget
                ? (index
                      .comparisonsFor(subjectName, domainId)
                      .find((entry) => entry.id === stateTarget.id) ?? null)
                : null;
            return {
                domainId,
                domainName,
                schoolDistribution: school
                    ? { levels: buildDistributionLevels(palette, school) }
                    : null,
                stateDistribution: state
                    ? { levels: buildDistributionLevels(palette, state) }
                    : null,
            };
        })
        .filter((group) => group.schoolDistribution || group.stateDistribution);
}

/** One booklet id's VERA stage: the `V8` segment of `26-V8-DE-TH-1`. */
const VERA_STAGE_PATTERN = /(?:^|-)V(\d+)(?:-|$)/;

/**
 * The VERA stage the Fach was tested at, read off the booklets its current-year group
 * and school value groups name. A value group tested with several booklets joins their
 * ids with commas; a booklet id without a stage segment (the API's numeric fallback)
 * names none.
 * @param {CompetenceLevelIndex} index
 * @param {string} subjectName
 * @returns {string|null} The one stage they agree on, or `null` when they name none or several.
 */
function deriveVeraStage(index, subjectName) {
    const stages = new Set(
        [...index.groups, ...index.schools]
            .filter((entry) => entry.subject?.name === subjectName)
            .flatMap(readBooklets)
            .flatMap((bookletId) => VERA_STAGE_PATTERN.exec(bookletId)?.[1] ?? []),
    );
    return stages.size === 1 ? [...stages][0] : null;
}

/**
 * The competence-level bars one value group draws, with their share and ladder.
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} valueGroup
 * @returns {MaterialDistributionLevel[]} One entry per band, empty when the value group carries no levels.
 */
function buildDistributionLevels(palette, valueGroup) {
    // The value group's own ladder: two Fächer can share level names, so a bare name
    // could resolve to the wrong ramp.
    const scaleId = palette.scaleIdOf(valueGroup);

    return valueGroup.competenceLevels.map((level) => ({
        label: level.nameShort,
        share: readLevelShare(level.descriptiveStatistics),
        scaleId,
    }));
}

/**
 * The groups holding the best value of one metric: a set, so a tie names all of them.
 * @template {string} K
 * @param {Map<string|null, {[P in K]: number|null}>} rows - Each group's figures, by group name.
 * @param {K} metricKey
 * @returns {Set<string|null>} The group names at the maximum; empty when no row carries the metric.
 */
function buildBestGroupSet(rows, metricKey) {
    const numericValues = [...rows.values()].map((row) => row[metricKey]).filter(isFiniteNumber);

    if (numericValues.length === 0) {
        return new Set();
    }

    const maxValue = Math.max(...numericValues);
    return new Set(
        [...rows]
            .filter(([, row]) => {
                const value = row[metricKey];
                return isFiniteNumber(value) && Math.abs(value - maxValue) <= EPSILON;
            })
            .map(([groupName]) => groupName),
    );
}
