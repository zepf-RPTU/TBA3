/**
 * Box-plot statistics for the SL dashboards (longitudinal box plots, rating
 * summaries, group comparison). SL-only: no EN/MA chart draws box plots, so
 * this lives with its consumers rather than in common/charts.
 *
 * One quartile definition and one whisker rule, deliberately. The file used to ship a
 * second `calculateBoxPlotStats` with `Math.floor` quartiles alongside the interpolated
 * ones below, and the three SL drawers each invented their own whiskers — Tukey fences
 * in one, mean ± z·SD in another, mean ± 1.5·SD labelled "Min/Max" in the third — so
 * the same visual mark meant three different things depending on the view.
 */

/**
 * Calculates a percentile value from a sorted array using linear interpolation.
 * @param {Array<number>} sortedValues - Pre-sorted array of numbers
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number} The interpolated percentile value
 */
function calculatePercentile(sortedValues, percentile) {
    const n = sortedValues.length;
    const index = (percentile / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
        return sortedValues[lower];
    }

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Calculates box plot statistics from an array of values, including outlier detection.
 * Quartiles are interpolated percentiles of the actual values, not a normal-distribution
 * approximation off the mean and standard deviation.
 * @param {Array<number>} values - Array of numeric values
 * @returns {object | null} Detailed statistics including min, max, q1, median, q3, iqr, mean, stddev, fences, whisker ends and outliers — or `null` for an empty set, because a box plot of nothing has no shape.
 */
export function calculateDetailedBoxPlotStats(values) {
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    let sum = 0;
    for (let i = 0; i < n; i++) sum += sorted[i];
    const mean = sum / n;

    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
        const diff = sorted[i] - mean;
        varianceSum += diff * diff;
    }
    const standardDeviation = Math.sqrt(varianceSum / n);

    const min = sorted[0];
    const max = sorted[n - 1];
    const median = calculatePercentile(sorted, 50);
    const q1 = calculatePercentile(sorted, 25);
    const q3 = calculatePercentile(sorted, 75);
    const iqr = q3 - q1;

    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);

    // The whiskers end at the most extreme values that are *not* outliers — actual
    // observations, never the fence positions. That is what lets a tooltip call them the
    // minimum and maximum honestly, and what leaves each outlier visibly outside the cap
    // rather than sitting on it.
    const inliers = sorted.filter((v) => v >= lowerFence && v <= upperFence);
    const whiskerMin = inliers.length > 0 ? inliers[0] : min;
    const whiskerMax = inliers.length > 0 ? inliers[inliers.length - 1] : max;

    return {
        min,
        max,
        median,
        q1,
        q3,
        iqr,
        mean,
        standardDeviation,
        lowerFence,
        upperFence,
        whiskerMin,
        whiskerMax,
        outliers,
        outlierCount: outliers.length,
    };
}
