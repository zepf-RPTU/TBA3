import { isFiniteNumber } from '../../common/utils/numberFormat.js';
import { calculateDetailedBoxPlotStats } from './slBoxPlotStats.js';
import { calculateRatingDistribution } from './slRatingDistribution.js';

/**
 * A set of student ratings reduced to its summary figures.
 * @typedef {object} RatingSummary
 * @property {number} count - Usable values.
 * @property {number|null} mean
 * @property {number|null} median
 * @property {number|null} standardDeviation
 * @property {number|null} min
 * @property {number|null} max
 * @property {number|null} excellentShare - Share in the `excellent` band, as a fraction.
 * @property {number|null} lowOrMediumShare - Share in the `low` and `medium` bands.
 * @property {number|null} goodOrExcellentShare - Share in the `good` and `excellent` bands.
 */

/**
 * One band's share as a fraction.
 * @param {Map<string, import('./slRatingDistribution.js').RatingDistributionEntry>} distributionMap
 * @param {string} key
 * @returns {number|null} `null` when the band has no usable percentage.
 */
function getDistributionShare(distributionMap, key) {
    const percentage = distributionMap.get(key)?.percentage;
    return isFiniteNumber(percentage) ? percentage / 100 : null;
}

/**
 * Reduce a set of student ratings to its summary figures.
 * @param {number[]} values - One mean per student; non-finite entries are dropped.
 * @param {object} [options]
 * @param {import('./slBoxPlotStats.js').BoxPlotStats|null} [options.stats] - The aggregate's statistics (`SurveyAggregate.statistics`), so they are not recomputed.
 * @returns {RatingSummary|null} `null` when no value was usable.
 */
export function summarizeRatingValues(values, { stats = null } = {}) {
    const normalizedValues = values.filter(isFiniteNumber);

    if (normalizedValues.length === 0) {
        return null;
    }

    const resolvedStats = stats ?? calculateDetailedBoxPlotStats(normalizedValues);
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
        excellentShare,
        lowOrMediumShare: lowShare === null || mediumShare === null ? null : lowShare + mediumShare,
        goodOrExcellentShare:
            goodShare === null || excellentShare === null ? null : goodShare + excellentShare,
    };
}
