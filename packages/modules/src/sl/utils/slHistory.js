/**
 * Reads the SL history: a school's competence-levels value groups of
 * every year (`comparison=year`), with its student value groups.
 *
 * It only reads: the years and each year's numbers all come from the payload. The year
 * is `properties[testPeriod]`; which value groups are the current year the document store
 * has already decided (the earlier ones arrive as `prior-years.json`), so no year is
 * hardcoded.
 *
 * Two granularities live in one document:
 *   - `type: 'school'` value groups carry the Kompetenzstufen per (Fach, Domäne).
 *   - `type: 'student'` value groups carry `tq_mean` / `sp_mean`. A scope without
 *     questionnaire data carries neither, and the survey charts gate themselves off
 *     (`detectHistorySurveyScales`).
 *
 * The document is indexed once (`indexHistory`, the `SL_DATASETS.LONGITUDINAL_INDEX`
 * dataset); every builder here reads that index.
 */

import { ascending, group, mean } from 'd3-array';
import { formatChartSubjectDomainLabel } from '../../common/charts/domainLabelFormatter.js';
import { hasAnyShare, readLevelPercentages } from '../../common/domain/competenceLevelShare.js';
import {
    buildLevelDefinitions,
    getLevelsForDomain,
    getScaleIdForDomain,
} from './slLevelDefinitions.js';
import {
    getPropertyText,
    getPropertyValue,
    readCovariate,
} from '../../common/domain/studentIdentity.js';
import { domainIdOf } from './slQueryPrimitives.js';
import {
    COVARIATE_TYPE,
    PROPERTY_KEY,
    VALUE_GROUP_TYPE,
} from '../../common/domain/apiValueMaps.js';

/**
 * One value group of the timeline: a school value group per (Fach, Domäne) or a student
 * value group, its `properties` carrying `testPeriod` and on a student's `tq_mean` / `sp_mean`.
 * @typedef {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup
 */

/**
 * One year of a category timeline, as the line charts draw it.
 * @typedef {object} LongitudinalYear
 * @property {string} year - The year, `testPeriod`.
 * @property {{[category: string]: number}} categories - Percentage per category.
 */

/**
 * One year of raw survey values: one value per student.
 * @typedef {object} SurveyYear
 * @property {string} year - The year, `testPeriod`.
 * @property {number[]} values - One averaged value per student.
 */

/**
 * One Bereich the timeline can show: a (Fach, Domäne) the school sat in the current year.
 * @typedef {object} LongitudinalSubjectDomain
 * @property {string} subjectName - The Fach, `subject.name`.
 * @property {string|null} domainId - The Domäne id; null for a Fach with no split.
 * @property {string} label - The Bereich selector's label: the Fach alone when it has one Bereich, else `Fach: Domäne`.
 * @property {string[]} competenceLevelNames - The current year's scale's levels, lowest first.
 * @property {string|undefined} scaleId - The registered scale the Bereich is measured on.
 */

/**
 * A timeline value group with what the timeline reads off its properties, resolved once.
 * @typedef {object} IndexedValueGroup
 * @property {CompetenceLevelsValueGroup} valueGroup
 * @property {string|undefined} year - Its `testPeriod`, or undefined when unstamped.
 * @property {boolean} current
 * @property {number|null} teachingQualityMean - Its `tq_mean`; null when absent or not a number.
 * @property {number|null} selfEfficacyMean - Its `sp_mean`; null when absent or not a number.
 */

/**
 * The timeline document sorted by granularity once.
 * @typedef {object} HistoryIndex
 * @property {Map<string|undefined, Map<string|null, IndexedValueGroup[]>>} schools - The school's value groups by Fach, then Domäne id, in payload order.
 * @property {IndexedValueGroup[]} students - Every student value group, in payload order.
 * @property {Map<string|undefined, IndexedValueGroup[]>} studentsBySubject - `students` by Fach, in payload order.
 * @property {import('./slLevelDefinitions.js').LevelDefinitions} levelDefinitions - The ladder per `Fach|Domäne`: the scale its current-year school value groups resolve to.
 * @property {string[]} years - Every year the document carries, oldest first: the timeline's x-axis.
 * @property {string|undefined} currentYear - The current year's stamp, undefined when its value groups carry none.
 */

/**
 * @param {import('../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette - The app's palette, which names each Bereich's ladder.
 * @param {CompetenceLevelsValueGroup[]} current
 * @param {CompetenceLevelsValueGroup[]} earlier
 * @returns {HistoryIndex}
 */
export function indexHistory(palette, current, earlier) {
    /**
     * @param {CompetenceLevelsValueGroup} valueGroup
     * @param {boolean} isCurrent
     * @returns {IndexedValueGroup}
     */
    const indexOne = (valueGroup, isCurrent) => {
        const properties = valueGroup.properties ?? [];
        return {
            valueGroup,
            year: getPropertyText(properties, PROPERTY_KEY.TEST_PERIOD) ?? undefined,
            current: isCurrent,
            teachingQualityMean: getPropertyValue(properties, PROPERTY_KEY.TEACHING_QUALITY_MEAN),
            selfEfficacyMean: getPropertyValue(properties, PROPERTY_KEY.SELF_EFFICACY_MEAN),
        };
    };
    const indexed = [
        ...current.map((valueGroup) => indexOne(valueGroup, true)),
        ...earlier.map((valueGroup) => indexOne(valueGroup, false)),
    ];
    const schools = indexed.filter(({ valueGroup }) => valueGroup.type === VALUE_GROUP_TYPE.SCHOOL);
    const students = indexed.filter(
        ({ valueGroup }) => valueGroup.type === VALUE_GROUP_TYPE.STUDENT,
    );
    // Sorted here: the payload's order is the server's emission order. The stamps are
    // `YYYY` or `YYYY-MM` and order as text.
    const years = /** @type {string[]} */ (
        [...new Set(indexed.map(({ year }) => year))].filter((year) => year !== undefined)
    ).sort(ascending);
    return {
        schools: new Map(
            [...group(schools, ({ valueGroup }) => valueGroup.subject?.name)].map(
                ([subject, subjectSchools]) => [
                    subject,
                    group(subjectSchools, ({ valueGroup }) => domainIdOf(valueGroup)),
                ],
            ),
        ),
        students,
        studentsBySubject: group(students, ({ valueGroup }) => valueGroup.subject?.name),
        // The current year's school value groups; a student value group lists one level.
        // ASSUMPTION-SL-HISTORY-SAME-LADDER: earlier years use the current year's
        // competence-level ladder, so its ladder is every year's; a level outside it is
        // not drawn.
        levelDefinitions: buildLevelDefinitions(
            palette,
            schools.filter((entry) => entry.current).map(({ valueGroup }) => valueGroup),
        ),
        years,
        currentYear: indexed.find((entry) => entry.current && entry.year !== undefined)?.year,
    };
}

/**
 * The Bereiche the timeline can show: every (Fach, Domäne) a current-year school value
 * group covers, Fach by Fach in payload order, with a Fach's Domänen kept together. Everything a
 * Bereich needs besides the yearly numbers comes from the same document: the ladder
 * from its current-year school value groups (the scale they resolve to, since a value
 * group lists only the levels its population reached).
 * @param {HistoryIndex} index
 * @returns {LongitudinalSubjectDomain[]}
 */
export function buildLongitudinalSubjectDomains(index) {
    /** @type {Array<{subjectName: string, domainId: string|null, domainName: string|null}>} */
    const pairs = [];
    for (const [subjectName, byDomain] of index.schools) {
        if (!subjectName) continue;
        for (const [domainId, indexed] of byDomain) {
            if (!indexed.some(({ current }) => current)) continue;
            const domainName = indexed[0].valueGroup.domain?.name ?? null;
            pairs.push({ subjectName, domainId, domainName });
        }
    }
    const pairsBySubject = group(pairs, ({ subjectName }) => subjectName);

    return pairs.map(({ subjectName, domainId, domainName }) => ({
        subjectName,
        domainId,
        label: formatChartSubjectDomainLabel(
            subjectName,
            pairsBySubject.get(subjectName)?.length === 1 ? null : domainName,
            { abbreviate: false },
        ),
        competenceLevelNames: getLevelsForDomain(index.levelDefinitions, subjectName, domainId),
        scaleId: getScaleIdForDomain(index.levelDefinitions, subjectName, domainId),
    }));
}

/**
 * The Kompetenzstufen timeline for one (Fach, Domäne).
 *
 * Percentages follow `readLevelPercentages`: `frequency / total` where the value group counts,
 * the level's `mean` for one that ships shares alone.
 *
 * A year whose bands are all empty means "no result for this domain" and is dropped; a
 * row of zeros would draw as a flat line.
 * @param {HistoryIndex} index
 * @param {string} subject - The Fach, matched against `subject.name`.
 * @param {string|null} domainId - The Domäne, matched against `domain.id`; null for a Fach with no split.
 * @returns {Array<LongitudinalYear & {valueGroup: CompetenceLevelsValueGroup}>} One entry per year that has data, oldest first, with the value group it was read from.
 */
export function buildCompetenceLevelHistory(index, subject, domainId) {
    const indexed = index.schools.get(subject)?.get(domainId) ?? [];

    /** @type {Array<LongitudinalYear & {valueGroup: CompetenceLevelsValueGroup}>} */
    const timeline = [];
    for (const { valueGroup, year } of indexed) {
        if (!year) continue;

        const categories = readLevelPercentages(valueGroup.competenceLevels);
        if (!hasAnyShare(categories)) continue;

        timeline.push({ year, categories, valueGroup });
    }

    return timeline.sort((a, b) => ascending(a.year, b.year));
}

/**
 * The per-student survey values per year, for one measure.
 *
 * Returns raw values rather than statistics so every year goes through the same
 * `calculateRatingDistribution` / `calculateDetailedBoxPlotStats` as the current year, and
 * every year has true quartiles.
 *
 * Each year is its own Jahrgang, so a Bereich is narrowed per year by the value groups'
 * own Fach and Domäne, never by the current year's student ids. A value group without a
 * Domäne stands for its whole Fach and counts towards each of its Domänen.
 * @param {HistoryIndex} index
 * @param {'teachingQualityMean'|'selfEfficacyMean'} measure
 * @param {{subject?: string, domainId?: string|null}} [filter] - Restrict to one Fach and, within it, one Domäne (`null` for a Fach with no split).
 * @returns {SurveyYear[]} One entry per year that has values, oldest first.
 */
export function buildSurveyHistory(index, measure, { subject, domainId } = {}) {
    const indexed = (
        subject === undefined ? index.students : (index.studentsBySubject.get(subject) ?? [])
    ).filter((entry) => {
        if (entry.year === undefined || !Number.isFinite(entry[measure])) return false;
        if (domainId === undefined) return true;
        const entryDomainId = domainIdOf(entry.valueGroup);
        return entryDomainId === null || entryDomainId === domainId;
    });
    return [...group(indexed, (entry) => /** @type {string} */ (entry.year))]
        .map(([year, yearEntries]) => ({
            year,
            // Averaged per student first, then handed on as one value per student: a
            // student sitting several subjects would otherwise weigh more than one sitting
            // one. A student is a group and an id: ids repeat across groups.
            values: [
                ...group(
                    yearEntries,
                    (entry) =>
                        `${readCovariate(entry.valueGroup.covariates, COVARIATE_TYPE.GROUP)}|${entry.valueGroup.id}`,
                ).values(),
            ].map(
                (students) =>
                    /** @type {number} */ (
                        mean(students, (entry) => /** @type {number} */ (entry[measure]))
                    ),
            ),
        }))
        .sort((a, b) => ascending(a.year, b.year));
}

/**
 * Which survey timelines the document carries: a survey timeline exists exactly when it
 * has a year to draw, and the combined box plot needs both scales (`offersBoxPlot`).
 * @param {HistoryIndex} index
 * @returns {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean, offersBoxPlot: boolean}} Whether any year carries `tq_mean` / `sp_mean`, and whether both do.
 */
export function detectHistorySurveyScales(index) {
    /**
     * @param {'teachingQualityMean'|'selfEfficacyMean'} measure
     * @returns {boolean} Whether any stamped student value group carries a value for it.
     */
    const carries = (measure) =>
        index.students.some((entry) => entry.year !== undefined && Number.isFinite(entry[measure]));
    const hasTeachingQuality = carries('teachingQualityMean');
    const hasSelfEfficacy = carries('selfEfficacyMean');
    return {
        hasTeachingQuality,
        hasSelfEfficacy,
        offersBoxPlot: hasTeachingQuality && hasSelfEfficacy,
    };
}
