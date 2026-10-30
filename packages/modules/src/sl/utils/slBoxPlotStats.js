/**
 * Box-plot statistics for the SL dashboards: one quartile definition and one whisker
 * rule, so the same mark means the same thing wherever it is drawn.
 */

import { mean as meanOf, quantileSorted } from 'd3-array';
import { formatCount, formatDecimal } from '../../common/utils/numberFormat.js';
import { TERM_CONSTANTS } from '../../common/domain/terms.js';
import { shareRows } from '../../common/charts/shareRows.js';
import { figureCell } from '../../common/charts/dataTableCells.js';

/** @typedef {import('../../common/services/cursorTooltip.js').TooltipRow} TooltipRow */

/**
 * @typedef {object} BoxPlotStats
 * @property {number} min
 * @property {number} max
 * @property {number} median
 * @property {number} q1 - 25th percentile.
 * @property {number} q3 - 75th percentile.
 * @property {number} mean
 * @property {number} standardDeviation - Population standard deviation.
 * @property {number} whiskerMin - Smallest value inside the Tukey fences (`q1 - 1.5 · iqr`, `q3 + 1.5 · iqr`).
 * @property {number} whiskerMax - Largest value inside the fences.
 * @property {number[]} outliers - Values outside the fences, ascending.
 * @property {number} outlierCount
 * @property {number} count
 */

/**
 * Quartiles are interpolated percentiles of the actual values, not a normal-distribution
 * approximation off the mean and standard deviation.
 * @param {Array<number>} values
 * @returns {BoxPlotStats | null} `null` for an empty set.
 */
export function calculateDetailedBoxPlotStats(values) {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    const mean = /** @type {number} */ (meanOf(sorted));
    // Population SD (divides by n): d3's `deviation` is the sample SD.
    let varianceSum = 0;
    for (const value of sorted) varianceSum += (value - mean) ** 2;
    const standardDeviation = Math.sqrt(varianceSum / n);

    const min = sorted[0];
    const max = sorted[n - 1];
    // Linearly interpolated quantiles (R-7).
    const median = /** @type {number} */ (quantileSorted(sorted, 0.5));
    const q1 = /** @type {number} */ (quantileSorted(sorted, 0.25));
    const q3 = /** @type {number} */ (quantileSorted(sorted, 0.75));
    const iqr = q3 - q1;

    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);

    // The whiskers end at the most extreme non-outlying observations, never at the fence
    // positions: the tooltip reports them as minimum and maximum, and every outlier
    // stays outside the cap.
    const inliers = sorted.filter((v) => v >= lowerFence && v <= upperFence);
    const whiskerMin = inliers.length > 0 ? inliers[0] : min;
    const whiskerMax = inliers.length > 0 ? inliers[inliers.length - 1] : max;

    return {
        min,
        max,
        median,
        q1,
        q3,
        mean,
        standardDeviation,
        whiskerMin,
        whiskerMax,
        outliers,
        outlierCount: outliers.length,
        count: n,
    };
}

/**
 * The tooltip every SL box plot shows: the centre, the spread, the box and the range it
 * reports as `Min / Max`, each to two decimals, then the number of students rated, and a
 * footer counting the values beyond the whiskers. `Min / Max` are the whisker ends by
 * default: the extremes of the non-outlying data.
 * @param {Partial<BoxPlotStats> & {median: number, mean: number, standardDeviation: number, q1: number, q3: number}} stats
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {number|null} [options.count] - Students rated; no row without it.
 * @param {number} [options.min] - The lower end the `Min / Max` row reports.
 * @param {number} [options.max] - The upper end the `Min / Max` row reports.
 * @returns {import('../../common/services/cursorTooltip.js').TooltipContent}
 */
export function boxPlotTooltip(
    stats,
    { title, subtitle, count = stats.count, min = stats.whiskerMin, max = stats.whiskerMax } = {},
) {
    return {
        title,
        subtitle,
        rows: [
            { label: TERM_CONSTANTS.MEDIAN, value: formatDecimal(stats.median) },
            { label: TERM_CONSTANTS.MEAN, value: formatDecimal(stats.mean) },
            { label: TERM_CONSTANTS.STD_DEV, value: formatDecimal(stats.standardDeviation) },
            {
                label: TERM_CONSTANTS.QUARTILES,
                value: `${formatDecimal(stats.q1)} / ${formatDecimal(stats.q3)}`,
            },
            {
                label: TERM_CONSTANTS.RANGE,
                value: `${formatDecimal(min)} / ${formatDecimal(max)}`,
            },
            count != null && { label: TERM_CONSTANTS.STUDENT_COUNT, value: formatCount(count) },
        ],
        footer: [
            (stats.outlierCount ?? 0) > 0 && {
                label: TERM_CONSTANTS.OUTLIERS,
                value: formatCount(/** @type {number} */ (stats.outlierCount)),
            },
        ],
    };
}

/**
 * A data table's columns for a box plot, after its row head: what `boxPlotTooltip`
 * lists, one column per figure. The statistics export with the two decimals they show.
 * @type {ReadonlyArray<import('../../common/charts/host/chartDataTable.js').ChartDataColumn>}
 */
export const BOX_STATS_COLUMNS = Object.freeze([
    { label: TERM_CONSTANTS.STUDENT_COUNT },
    { label: TERM_CONSTANTS.MEDIAN, digits: 2 },
    { label: TERM_CONSTANTS.MEAN, digits: 2 },
    { label: TERM_CONSTANTS.STD_DEV, digits: 2 },
    { label: 'Q1', digits: 2 },
    { label: 'Q3', digits: 2 },
    { label: 'Min', digits: 2 },
    { label: 'Max', digits: 2 },
]);

/**
 * One box's figures as data table cells, in `BOX_STATS_COLUMNS` order. Min and Max are
 * the whisker ends, as the tooltip reports them; without statistics every cell is empty.
 * @param {Partial<BoxPlotStats>|null|undefined} stats
 * @param {number|null} [count] - Students rated.
 * @returns {import('../../common/charts/host/chartDataTable.js').ChartDataCell[]}
 */
export function boxStatsCells(stats, count = stats?.count ?? null) {
    return [
        figureCell(count, formatCount),
        ...[
            stats?.median,
            stats?.mean,
            stats?.standardDeviation,
            stats?.q1,
            stats?.q3,
            stats?.whiskerMin,
            stats?.whiskerMax,
        ].map((value) => figureCell(value, formatDecimal)),
    ];
}

/**
 * The tooltip of one rating band (a Selbstwirksamkeit or Unterrichtsqualität answer):
 * which answer, the share of the students rated who gave it, and how many, then the
 * mean rating of the population as the footer.
 * @param {object} band - The hovered band.
 * @param {string} band.label
 * @param {number} band.count - Students who gave it.
 * @param {number} band.total - Students rated.
 * @param {number|null} band.percentage - Their share, in percent.
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {number} [options.mean] - The population's mean rating; no footer without it.
 * @returns {import('../../common/services/cursorTooltip.js').TooltipContent} No count row for no one rated.
 */
export function ratingBandTooltip({ label, count, total, percentage }, { title, subtitle, mean }) {
    return {
        title,
        ...(subtitle && { subtitle }),
        rows: shareRows({
            label: TERM_CONSTANTS.RATING,
            value: label,
            share: percentage,
            count,
            total,
        }),
        ...(mean !== undefined && {
            footer: [{ label: TERM_CONSTANTS.MEAN, value: formatDecimal(mean) }],
        }),
    };
}
