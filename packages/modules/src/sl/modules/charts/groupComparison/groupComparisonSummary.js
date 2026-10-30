/**
 * The figures behind the info box's group-comparison sentence (`summaries.comparison`):
 * the measure and each group's headline figures. It owns no filtering: it reads the rows
 * the chart draws (`COMPARISON_ROWS`), so the sentence and the picture cannot disagree.
 */

import { calculateDetailedBoxPlotStats } from '../../../utils/slBoxPlotStats.js';
import { isAtOrAboveMedium } from '../../../utils/slCompetenceLevels.js';
import { summarizeRatingValues } from '../../../utils/slRatingSummary.js';
import { filterByCategory } from './groupComparisonDataUtils.js';
import { dataset } from '../../../../common/data/documentStore.js';
import {
    CHART_TYPE_CONFIG,
    COMPARISON_ROWS,
    COMPARISON_SOURCES,
    POINTS_MIXED_BOOKLETS,
    groupLabelOf,
} from './groupComparisonChartTypes.js';

/** @typedef {import('./groupComparisonDataUtils.js').CompetenceStudentRecord} CompetenceStudentRecord */
/** @typedef {import('./groupComparisonDataUtils.js').RatingRecord} RatingRecord */
/** @typedef {import('./groupComparisonDataUtils.js').PointRecord} PointRecord */
/** @typedef {import('./groupComparisonChartTypes.js').ComparisonRecord} ComparisonRecord */
/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */
/** @typedef {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} CompetenceLevelPalette */
/** @typedef {import('../../../../common/context/moduleContext.js').DatasetContext} SummaryContext */

/**
 * One group's headline figures. A figure the measure does not report stays `null`.
 * @typedef {object} GroupSummary
 * @property {string} label
 * @property {number} n - Students with a usable value.
 * @property {number|null} share - The measure's headline share, as a fraction: at or above Regelstandard for Kompetenzstufen, rated good or excellent for ratings, none for points.
 * @property {number|null} mean
 * @property {number|null} standardDeviation
 * @property {number|null} min
 * @property {number|null} max
 */

/**
 * What the info box narrates: both groups' figures.
 * @typedef {object} GroupComparisonSummary
 * @property {GroupSummary} group1
 * @property {GroupSummary} group2
 */

/**
 * The summary of one selection (`GroupComparisonSelection`), once per store and selection.
 * The context's glossary labels a group without data, its palette knows each competence
 * level's standard band.
 */
export const GROUP_COMPARISON_SUMMARY = dataset('sl.groupComparisonSummary', {
    inputs: [COMPARISON_SOURCES, COMPARISON_ROWS, POINTS_MIXED_BOOKLETS],
    params: (/** @type {GroupComparisonSelection} */ selection) => [selection],
    build: (sources, rowsOf, mixedBooklets, context, selection) =>
        buildGroupComparisonSummary(context, {
            chartType: selection.chartType,
            category: selection.category,
            group1Value: selection.group1,
            group2Value: selection.group2,
            labelOf: groupLabelOf(sources, selection),
            // A Lösungsquote pair on different booklets has no figures to narrate, as the
            // chart draws none.
            filteredData:
                selection.chartType === 'points' && mixedBooklets(selection)
                    ? null
                    : rowsOf(selection),
        }),
});

/**
 * Build a DOM-free summary of a group comparison from the rows the chart draws for it.
 * @param {SummaryContext} context
 * @param {object} options
 * @param {'competenceLevel'|'points'|'selfEfficacy'|'teachingQuality'} options.chartType
 * @param {'gender'|'group'|'subject'} options.category
 * @param {string|null} options.group1Value - `null` auto-selects.
 * @param {string|null} options.group2Value - `null` auto-selects.
 * @param {(value: string) => string} options.labelOf - How a group value reads, as the chart names it (`groupLabelOf`).
 * @param {ComparisonRecord[]|null} options.filteredData - The rows the chart drew, already subject- and scope-filtered.
 * @returns {GroupComparisonSummary}
 */
function buildGroupComparisonSummary(
    { glossary, palette },
    { chartType, category, group1Value, group2Value, labelOf, filteredData },
) {
    const metricMode = CHART_TYPE_CONFIG[chartType].family;
    const summarizeGroup = SUMMARY_BUILDERS[metricMode];
    const split = filterByCategory(filteredData, category, group1Value, group2Value, labelOf);
    if (!split) {
        const noData = glossary.getRequiredEntryText('general.messages.no-data-short');
        return {
            group1: createEmptyGroupSummary(noData),
            group2: createEmptyGroupSummary(noData),
        };
    }
    return {
        group1: summarizeGroup(split[0].records, split[0].label, palette),
        group2: summarizeGroup(split[1].records, split[1].label, palette),
    };
}

/**
 * How one group's figures are summarised, per measure family (the registry's `family`).
 * Everything else — the split, the labels — is one path in `buildGroupComparisonSummary`.
 * Typed as methods: each builder reads its own family's records, and only the family
 * key pairs them with the rows (as in `GroupComparisonChartType`).
 * @type {{
 *     competence(rows: ComparisonRecord[], label: string, palette: CompetenceLevelPalette): GroupSummary,
 *     points(rows: ComparisonRecord[], label: string, palette: CompetenceLevelPalette): GroupSummary,
 *     rating(rows: ComparisonRecord[], label: string, palette: CompetenceLevelPalette): GroupSummary,
 * }}
 */
const SUMMARY_BUILDERS = Object.freeze({
    competence: createCompetenceGroupSummary,
    points: createPointGroupSummary,
    rating: createRatingGroupSummary,
});

/**
 * A group summary with every figure `null` rather than zero — a group with no data has
 * no mean, and reporting `0` would read as a measurement.
 * @param {string} label
 * @returns {GroupSummary}
 */
function createEmptyGroupSummary(label) {
    return {
        label,
        n: 0,
        share: null,
        mean: null,
        standardDeviation: null,
        min: null,
        max: null,
    };
}

/**
 * One group's competence figures.
 * @param {CompetenceStudentRecord[]} groupData
 * @param {string} label
 * @param {CompetenceLevelPalette} palette
 * @returns {GroupSummary} `share` stays `null` for a scale that names no standards.
 */
function createCompetenceGroupSummary(groupData, label, palette) {
    return {
        ...createEmptyGroupSummary(label),
        n: groupData.length,
        share: getMediumOrAboveShare(palette, groupData),
    };
}

/**
 * One group's rating figures, computed over the entries that carry a finite mean.
 * @param {RatingRecord[]} groupData
 * @param {string} label
 * @returns {GroupSummary} Every figure stays `null` when no entry had a usable value.
 */
function createRatingGroupSummary(groupData, label) {
    const ratingSummary = summarizeRatingValues(groupData.map((entry) => entry.mean));

    return {
        ...createEmptyGroupSummary(label),
        n: ratingSummary?.count ?? 0,
        share: ratingSummary?.goodOrExcellentShare ?? null,
        mean: ratingSummary?.mean ?? null,
        standardDeviation: ratingSummary?.standardDeviation ?? null,
        min: ratingSummary?.min ?? null,
        max: ratingSummary?.max ?? null,
    };
}

/**
 * One group's point figures.
 * @param {PointRecord[]} groupData
 * @param {string} label
 * @returns {GroupSummary} Every figure stays `null` for a group without rows.
 */
function createPointGroupSummary(groupData, label) {
    const values = groupData.map((record) => record.solutionRatePercent);
    const stats = calculateDetailedBoxPlotStats(values);

    return {
        ...createEmptyGroupSummary(label),
        n: values.length,
        mean: stats?.mean ?? null,
        standardDeviation: stats?.standardDeviation ?? null,
        min: stats?.min ?? null,
        max: stats?.max ?? null,
    };
}

/**
 * Share of a group at or above the Regelstandard (`ge_medium`); a share the scale cannot
 * express, because it tags no `medium` band, is unknown, not zero.
 * @param {CompetenceLevelPalette} palette - The app's palette, which knows each level's standard band.
 * @param {CompetenceStudentRecord[]} groupData
 * @returns {number|null} The share as a fraction, or `null` when the scale tags no medium band or the group is empty.
 */
function getMediumOrAboveShare(palette, groupData) {
    if (groupData.length === 0) return null;

    const reached = groupData.map((entry) =>
        isAtOrAboveMedium(palette, entry?.competenceLevelName, entry?.competenceScaleId),
    );
    if (reached.every((value) => value === null)) {
        return null;
    }

    return reached.filter((value) => value === true).length / groupData.length;
}
