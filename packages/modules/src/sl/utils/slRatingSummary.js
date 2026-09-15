import { calculateDetailedBoxPlotStats } from './slBoxPlotStats.js';
import { calculateRatingDistribution } from './slRatingDistribution.js';

/**
 * One band's share as a fraction.
 * @param {Map<string, any>} distributionMap - The rating distribution by band key.
 * @param {string} key - The band to read.
 * @returns {number|null} The share, or `null` when the band has no usable percentage.
 */
function getDistributionShare(distributionMap, key) {
    const percentage = distributionMap.get(key)?.percentage;
    return Number.isFinite(percentage) ? percentage / 100 : null;
}

/**
 * Reduce a set of student ratings to the figures the info boxes and comparisons report.
 * @param {Array<number>} [values] - One mean per student; non-numeric entries are dropped.
 * @param {object} [options] - Pre-computed statistics to reuse.
 * @param {object|null} [options.stats] - Box-plot statistics the payload already carries, so they are not recomputed.
 * @returns {object|null} The count, mean, spread and band shares, or `null` when no value was usable.
 */
export function summarizeRatingValues(values = [], { stats = null } = {}) {
    const normalizedValues = Array.isArray(values)
        ? values.filter((value) => Number.isFinite(value))
        : [];

    if (normalizedValues.length === 0) {
        return null;
    }

    const resolvedStats =
        stats && typeof stats === 'object'
            ? stats
            : calculateDetailedBoxPlotStats(normalizedValues);
    const distribution = calculateRatingDistribution(normalizedValues);
    const distributionMap = new Map(distribution.map((category) => [category.key, category]));
    const lowShare = getDistributionShare(distributionMap, 'low');
    const mediumShare = getDistributionShare(distributionMap, 'medium');
    const goodShare = getDistributionShare(distributionMap, 'good');
    const excellentShare = getDistributionShare(distributionMap, 'excellent');

    return {
        count: normalizedValues.length,
        mean: resolvedStats?.mean ?? null,
        median: resolvedStats?.median ?? null,
        standardDeviation: resolvedStats?.standardDeviation ?? null,
        min: resolvedStats?.min ?? null,
        max: resolvedStats?.max ?? null,
        lowShare,
        mediumShare,
        goodShare,
        excellentShare,
        lowOrMediumShare: lowShare === null || mediumShare === null ? null : lowShare + mediumShare,
        goodOrExcellentShare:
            goodShare === null || excellentShare === null ? null : goodShare + excellentShare,
    };
}
