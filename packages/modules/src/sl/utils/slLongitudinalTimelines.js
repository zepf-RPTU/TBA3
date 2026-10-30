/**
 * The history timelines, built from the indexed history (`slHistory.js`). The
 * line-chart timelines of every Bereich are one dataset
 * (`SL_DATASETS.LONGITUDINAL_TIMELINES`), since the shared y maximum reads all of them;
 * the box-plot timeline is built per Bereich only when that mode is shown.
 */

import { calculateRatingDistribution } from './slRatingDistribution.js';
import { calculateDetailedBoxPlotStats } from './slBoxPlotStats.js';
import { buildCompetenceLevelHistory, buildSurveyHistory } from './slHistory.js';

/** @typedef {import('./slHistory.js').HistoryIndex} HistoryIndex */
/** @typedef {import('./slHistory.js').LongitudinalYear} LongitudinalYear */
/** @typedef {import('./slHistory.js').LongitudinalSubjectDomain} LongitudinalSubjectDomain */
/** @typedef {import('./slBoxPlotStats.js').BoxPlotStats} BoxPlotStats */

/**
 * One year of the combined box-plot figure: box statistics for both measures.
 * @typedef {object} LongitudinalBoxPlotYear
 * @property {string} year - The year, `testPeriod`.
 * @property {BoxPlotStats} teachingQuality - Unterrichtsqualität statistics.
 * @property {BoxPlotStats} selfEfficacy - Selbstwirksamkeit statistics.
 */

/**
 * The line-chart timelines of every Bereich.
 * @typedef {object} LongitudinalTimelines
 * @property {string[]} years - Every year of the history, oldest first: one shared x-axis, so a year a timeline lacks shows as a gap.
 * @property {LongitudinalYear[]} selfEfficacy - The school's Selbstwirksamkeit: asked once per student, not per Fach.
 * @property {Array<{competenceLevelShares: LongitudinalYear[], teachingQuality: LongitudinalYear[]}>} bySubjectDomain - Kompetenzstufen and Unterrichtsqualität per Bereich, in `LONGITUDINAL_SUBJECT_DOMAINS` order.
 */

/**
 * Turn per-year raw survey values into the rating-band timeline the line charts
 * draw. A year with no value on the 1–5 scale bands to nothing and is dropped rather
 * than plotted as an empty column.
 * @param {import('./slHistory.js').SurveyYear[]} slices
 * @returns {LongitudinalYear[]}
 */
function toBucketTimeline(slices) {
    return slices.flatMap(({ year, values }) => {
        const bands = calculateRatingDistribution(values);
        if (!bands.some((band) => band.count > 0)) return [];
        return [
            {
                year,
                categories: Object.fromEntries(bands.map((band) => [band.key, band.percentage])),
            },
        ];
    });
}

/**
 * Unterrichtsqualität values per year, scoped to the Bereich, so Unterrichtsqualität in
 * Deutsch reports each year's Deutsch students rather than the whole school.
 * @param {HistoryIndex} index
 * @param {LongitudinalSubjectDomain} subjectDomain
 * @returns {import('./slHistory.js').SurveyYear[]}
 */
function teachingQualitySlices(index, subjectDomain) {
    return buildSurveyHistory(index, 'teachingQualityMean', {
        subject: subjectDomain.subjectName,
        domainId: subjectDomain.domainId,
    });
}

/**
 * @param {HistoryIndex} index
 * @param {LongitudinalSubjectDomain[]} subjectDomains
 * @returns {LongitudinalTimelines}
 */
export function buildLongitudinalTimelines(index, subjectDomains) {
    return {
        years: index.years,
        selfEfficacy: toBucketTimeline(buildSurveyHistory(index, 'selfEfficacyMean')),
        bySubjectDomain: subjectDomains.map((subjectDomain) => ({
            competenceLevelShares: buildCompetenceLevelHistory(
                index,
                subjectDomain.subjectName,
                subjectDomain.domainId,
            ),
            teachingQuality: toBucketTimeline(teachingQualitySlices(index, subjectDomain)),
        })),
    };
}

/**
 * The largest share any of the three line-chart cards can show, over every
 * Bereich: the y maximum they share.
 * @param {LongitudinalTimelines} timelines
 * @returns {number} The largest share in percent; 0 when there is nothing to show.
 */
export function buildLongitudinalMaxShare(timelines) {
    let max = 0;
    for (const timeline of [
        timelines.selfEfficacy,
        ...timelines.bySubjectDomain.flatMap(({ competenceLevelShares, teachingQuality }) => [
            competenceLevelShares,
            teachingQuality,
        ]),
    ]) {
        for (const { categories } of timeline) {
            for (const value of Object.values(categories)) max = Math.max(max, value);
        }
    }
    return max;
}

/**
 * A Bereich's Unterrichtsqualität and the school's Selbstwirksamkeit as the box-plot
 * timeline: both measures' statistics per year.
 *
 * A year is kept only when both measures have values: the chart draws two connected
 * rows over one x-scale, and a year missing from one row would break its connecting line.
 * @param {HistoryIndex} index
 * @param {LongitudinalSubjectDomain} subjectDomain
 * @returns {LongitudinalBoxPlotYear[]} Oldest year first.
 */
export function buildSurveyBoxTimeline(index, subjectDomain) {
    const teaching = new Map(teachingQualitySlices(index, subjectDomain).map((s) => [s.year, s]));
    const selfEfficacy = new Map(
        buildSurveyHistory(index, 'selfEfficacyMean').map((s) => [s.year, s]),
    );
    return index.years.flatMap((year) => {
        const tqSlice = teaching.get(year);
        const spSlice = selfEfficacy.get(year);
        if (!tqSlice || !spSlice) return [];
        const teachingQuality = calculateDetailedBoxPlotStats(tqSlice.values);
        const selfEfficacyStats = calculateDetailedBoxPlotStats(spSlice.values);
        if (!teachingQuality || !selfEfficacyStats) return [];
        return [{ year, teachingQuality, selfEfficacy: selfEfficacyStats }];
    });
}
