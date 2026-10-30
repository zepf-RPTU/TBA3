/**
 * Pure data preparation for the SL Kompetenzstufen detail chart: turns the group, school
 * and comparison value groups of one or several Domänen into the sorted rows the
 * detail renderer plots, with each group's Unterrichtsqualität attached. No D3, no DOM.
 */

import { compareText } from '../../../../../common/utils/compare.js';
import { getChartDomainAbbreviation } from '../../../../../common/charts/domainLabelFormatter.js';
import { parseCompetenceLevels } from '../../../../../common/domain/competenceLevelAdapter.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import {
    lookupComparisonDistributions,
    resolveSchoolDistribution,
} from '../shared/competenceChartData.js';
import {
    comparisonAverageId,
    domainIdOf,
    firstPerKey,
} from '../../../../utils/slQueryPrimitives.js';
import { deriveGroupNames } from '../../../../slCompetenceLevelIndex.js';
import { surveyFigures, teachingQualityKey } from '../../../../utils/slSurveyDerivation.js';

/** @typedef {import('../shared/competenceChartData.js').LevelFigures} LevelFigures */
/** @typedef {import('../shared/competenceChartData.js').SubjectCompetenceLevelsValueGroup} SubjectCompetenceLevelsValueGroup */

/**
 * Unterrichtsqualität statistics of one group (or the school) in one Fach, as the box
 * drawer and the rating bars read them.
 * @typedef {import('../../../../utils/slBoxPlotStats.js').BoxPlotStats & {count: number, distribution: import('../../../../utils/slRatingDistribution.js').RatingDistributionEntry[]}} TeachingQualityStats
 */

/**
 * One prepared row of the detail chart: a group, the school or a comparison track in
 * one Fach/Domäne.
 * @typedef {object} CompetenceChartRow
 * @property {string} name
 * @property {string} type - `group`, `school` or `comparison`.
 * @property {string} [comparisonType] - For a comparison track, its payload `type` (`state`, …), which picks its short label and glossary term.
 * @property {string} renderKey - Key the renderer groups by; `comparison:<id>` for a comparison track.
 * @property {string} subject
 * @property {string} domain - Domäne id.
 * @property {string} domainLabel - Domäne display name, empty when the row has none.
 * @property {string} displayDomainLabel - Domäne name as drawn on tight axes.
 * @property {string[]} competenceLevelNames - The scale's bands, in scale order.
 * @property {string|undefined} scaleId - The registered ladder those bands sit on.
 * @property {LevelFigures} percentages - Share per band in percent.
 * @property {LevelFigures|null} counts - Headcount per band; `null` where none was delivered.
 * @property {number|null} total - Headcount the shares are of.
 * @property {TeachingQualityStats|null} teachingQuality - Unterrichtsqualität statistics, on a group's or the school's first row per Fach when the payload carries them.
 * @property {number} subjectDomainCount - How many Domänen this Fach has.
 * @property {number} domainIndex - The Domäne's position in the payload, which orders the chart's Fächer and Domänen.
 */

/**
 * The rows by their Domäne's position in the payload; the sort is stable, so the rows of
 * one Domäne keep their order.
 * @param {CompetenceChartRow[]} chartData
 * @returns {CompetenceChartRow[]} A copy, in payload order.
 */
export function rowsInPayloadOrder(chartData) {
    return [...chartData].sort((a, b) => a.domainIndex - b.domainIndex);
}

/**
 * The distinct keys of the rows in payload order: each key at the first Domäne any of
 * its rows belongs to.
 * @param {CompetenceChartRow[]} chartData
 * @param {(row: CompetenceChartRow) => string} keyOf
 * @returns {string[]}
 */
export function payloadOrder(chartData, keyOf) {
    return [...new Set(rowsInPayloadOrder(chartData).map(keyOf))];
}

/** @type {Readonly<Record<string, number>>} */
const TYPE_ORDER = Object.freeze({ group: 1, school: 2, comparison: 3 });

/**
 * The distinct comparison rows, one per track — a state that splits its average by
 * track ships several, and each gets its own ordinal and pill.
 * @param {CompetenceChartRow[]} chartData
 * @returns {CompetenceChartRow[]} One entry per track, in first-seen order.
 */
export function collectComparisonTrackRows(chartData) {
    const comparisons = chartData.filter((entry) => entry.type === 'comparison');
    return [...firstPerKey(comparisons, (entry) => entry.renderKey).values()];
}

/**
 * Whether a row draws a Unterrichtsqualität mark. Only a group's or the school's rows
 * carry the statistics.
 * @param {CompetenceChartRow} row
 * @returns {boolean}
 */
export function rowHasTeachingQuality(row) {
    return Boolean(row.teachingQuality);
}

/**
 * Sort comparator: type order (group → school → comparison), then name.
 * @param {string} aType
 * @param {string} aName
 * @param {string} bType
 * @param {string} bName
 * @returns {number}
 */
export function compareByTypeThenName(aType, aName, bType, bName) {
    return TYPE_ORDER[aType] !== TYPE_ORDER[bType]
        ? TYPE_ORDER[aType] - TYPE_ORDER[bType]
        : compareText(aName, bName);
}

/**
 * One derived Unterrichtsqualität row from the document store.
 * @typedef {object} TeachingQualityRow
 * @property {string} groupName - Group name, or `Schule` for the school aggregate.
 * @property {string} subjectName
 * @property {number} count - Students rated.
 * @property {number[]} [values] - One mean rating per student.
 * @property {import('../../../../utils/slBoxPlotStats.js').BoxPlotStats|null} statistics - Box-plot statistics of those means.
 * @property {import('../../../../utils/slRatingDistribution.js').RatingDistributionEntry[]} distribution - Those means over the rating bands.
 */

/**
 * @typedef {object} CompetenceDetailPrepareOptions
 * @property {import('../../../../slCompetenceLevelIndex.js').CompetenceLevelIndex} index - The indexed payload: each Fach/Domäne's school and comparison value groups.
 * @property {string|null} [groupName] - The scope group; empty or `null` for every group.
 * @property {boolean} [showOnlySchoolData] - Draw the school and comparison rows only.
 * @property {Map<string, TeachingQualityRow>|null} [teachingQuality] - The Unterrichtsqualität index (`SL_DATASETS.TEACHING_QUALITY_INDEX`).
 */

/**
 * Row order of the detail chart: type, then name. Fächer and Domänen are ordered by
 * `payloadOrder`, not by row order.
 * @param {CompetenceChartRow} a
 * @param {CompetenceChartRow} b
 * @returns {number}
 */
function sortByTypeAndName(a, b) {
    return compareByTypeThenName(a.type, a.name, b.type, b.name);
}

/**
 * The Fach and Domäne every row of one Domäne group shares.
 * @typedef {object} DomainContext
 * @property {string} subject
 * @property {string} domain - Domäne id.
 * @property {string} domainLabel - Domäne display name, empty for a Fach without Domänen.
 * @property {string} displayDomainLabel - The Domäne as drawn on tight axes: abbreviated when its Fach has several.
 * @property {number} subjectDomainCount - How many Domänen the Fach has.
 * @property {number} domainIndex - The Domäne's position in the payload.
 */

/**
 * The context of each Domäne group, in input order.
 * @param {SubjectCompetenceLevelsValueGroup[][]} domainBuckets - One group-entry array per Domäne.
 * @returns {DomainContext[]} One context per group.
 */
function buildDomainContexts(domainBuckets) {
    /** @type {Map<string, Set<string|null>>} Fach → its Domänen */
    const domainsBySubject = new Map();
    for (const group of domainBuckets) {
        const subject = group[0]?.subject?.name;
        if (!subject) continue;
        if (!domainsBySubject.has(subject)) domainsBySubject.set(subject, new Set());
        domainsBySubject.get(subject)?.add(domainIdOf(group[0]));
    }

    return domainBuckets.map((group, domainIndex) => {
        const first = group[0];
        const subject = first.subject?.name;
        const subjectDomainCount = domainsBySubject.get(subject)?.size || 1;
        const domainLabel = first.domain?.name ?? '';
        return /** @type {DomainContext} */ ({
            subject,
            domain: first.domain?.id,
            domainLabel,
            displayDomainLabel:
                domainLabel && subjectDomainCount > 1
                    ? getChartDomainAbbreviation(domainLabel)
                    : domainLabel,
            subjectDomainCount,
            domainIndex,
        });
    });
}

/**
 * Prepare the detail rows across one or several Domänen: per Domäne one row per group,
 * the school's row and one per delivered comparison, each carrying its Domäne's context.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {SubjectCompetenceLevelsValueGroup[][]} domainBuckets - One group-entry array per Domäne.
 * @param {CompetenceDetailPrepareOptions} options
 * @returns {CompetenceChartRow[]} The rows, sorted group → school → comparison.
 */
export function prepareCompetenceDetailChartData(palette, domainBuckets, options) {
    const { index, groupName = null, showOnlySchoolData = false, teachingQuality = null } = options;
    const contexts = buildDomainContexts(domainBuckets);
    // Each Domäne parsed once: every row of it sits on the ladder of its fullest value group,
    // so a group that reached few levels still names the whole ladder.
    const parsedBuckets = domainBuckets.map((group) => parseCompetenceLevels(palette, group));
    /** @type {CompetenceChartRow[]} */
    const chartData = [];

    // Unterrichtsqualität is rated per Fach, not per Domäne: it goes on a group's (and the
    // school's) first row in each Fach only, so a Fach split into Domänen shows one Q mark.
    const withTeachingQuality = new Set();
    /**
     * @param {string|null} name - The group, or `null` for the school.
     * @param {string} subject
     * @returns {TeachingQualityStats|null} Its statistics on its Fach's first row, else `null`.
     */
    const teachingQualityOnce = (name, subject) => {
        const key = `${name ?? ''}|${subject}`;
        if (withTeachingQuality.has(key)) return null;
        const stats = lookupTeachingQuality(teachingQuality, name, subject);
        if (stats) withTeachingQuality.add(key);
        return stats;
    };

    if (!showOnlySchoolData) {
        const groupNames = groupName ? [groupName] : deriveGroupNames(domainBuckets.flat());
        // Each Domäne's first entry per group, by its payload position, so a group and its
        // parse are found without a scan.
        const entryIndexByDomain = domainBuckets.map((bucket) =>
            firstPerKey(bucket.keys(), (i) => bucket[i].name),
        );

        for (const name of groupNames) {
            contexts.forEach((context, domainIndex) => {
                const entryIndex = entryIndexByDomain[domainIndex].get(name);
                if (
                    entryIndex === undefined ||
                    !domainBuckets[domainIndex][entryIndex].competenceLevels.length
                ) {
                    return;
                }
                const parsed = parsedBuckets[domainIndex];
                const group = parsed.groups[entryIndex];
                chartData.push({
                    ...context,
                    name,
                    type: 'group',
                    renderKey: 'group',
                    competenceLevelNames: parsed.levels,
                    scaleId: parsed.scaleId,
                    percentages: group.percentages,
                    counts: group.counts,
                    total: group.total,
                    teachingQuality: teachingQualityOnce(name, context.subject),
                });
            });
        }
    }

    contexts.forEach((context, domainIndex) => {
        const { subject, domain } = context;
        const { levels, scaleId } = parsedBuckets[domainIndex];
        const school = resolveSchoolDistribution(index.schoolFor(subject, domain));
        chartData.push({
            ...context,
            name: TERM_CONSTANTS.SCHOOL_AVERAGE,
            type: 'school',
            renderKey: 'school',
            competenceLevelNames: levels,
            scaleId,
            ...school,
            teachingQuality: teachingQualityOnce(null, subject),
        });

        // One row per delivered comparison, each on its own ladder and with its own
        // headcount, never the school's.
        const references = lookupComparisonDistributions(
            palette,
            index.comparisonsFor(subject, domain),
        );
        for (const reference of references) {
            chartData.push({
                ...context,
                name: reference.entry.name,
                type: 'comparison',
                comparisonType: reference.entry.type,
                renderKey: comparisonAverageId(reference.entry.id),
                competenceLevelNames: levels,
                scaleId: reference.scaleId ?? scaleId,
                percentages: reference.percentages,
                counts: reference.counts,
                total: reference.total,
                teachingQuality: null,
            });
        }
    });

    return chartData.sort(sortByTypeAndName);
}

/**
 * The Unterrichtsqualität statistics for one group and Fach, in the shape the
 * renderer's box drawer expects.
 * @param {Map<string, TeachingQualityRow>|null} teachingQuality - The teaching-quality index from the document store (`SL_DATASETS.TEACHING_QUALITY_INDEX`).
 * @param {string|null} groupName - Group name, or `null` for the school aggregate
 * @param {string} subjectName
 * @returns {TeachingQualityStats | null} The group's statistics, or `null` when the payload carries none for that pair.
 */
function lookupTeachingQuality(teachingQuality, groupName, subjectName) {
    if (!teachingQuality || !subjectName) return null;
    // The whole statistics object: the box drawer reads its quartiles, fences and extremes.
    return surveyFigures(teachingQuality.get(teachingQualityKey(groupName, subjectName)));
}
