import { getThemeColors } from '../../common/services/themeService.js';

const RATING_CATEGORY_DESCRIPTIONS = Object.freeze({
    low: 'niedrig',
    medium: 'mittel',
    good: 'gut',
    excellent: 'sehr gut',
});

export const RATING_CATEGORIES = Object.freeze([
    {
        key: 'low',
        label: '1-2',
        min: 1.0,
        max: 2.0,
        get color() {
            return getThemeColors().rating.low;
        },
    },
    {
        key: 'medium',
        label: '2-3',
        min: 2.0,
        max: 3.0,
        get color() {
            return getThemeColors().rating.medium;
        },
    },
    {
        key: 'good',
        label: '3-4',
        min: 3.0,
        max: 4.0,
        get color() {
            return getThemeColors().rating.good;
        },
    },
    {
        key: 'excellent',
        label: '4-5',
        min: 4.0,
        max: 5.0,
        get color() {
            return getThemeColors().rating.excellent;
        },
    },
]);

/**
 * The wording that spells out what one rating band means, e.g. `gut` for `3-4`.
 * @param {any} key - The band key.
 * @returns {string} The description, empty for a key with none.
 */
export function getRatingCategoryDescription(key) {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    return RATING_CATEGORY_DESCRIPTIONS[normalizedKey] ?? '';
}

/**
 * The label one rating band is shown under, optionally with its description in brackets.
 * @param {string|{key: string, label?: string}} categoryOrKey - The band, or just its key.
 * @param {object} [options] - How much of the label to include.
 * @param {boolean} [options.includeDescription] - Append the description in brackets.
 * @returns {string} The label.
 */
export function formatRatingCategoryLabel(categoryOrKey, { includeDescription = true } = {}) {
    const key = typeof categoryOrKey === 'string' ? categoryOrKey.trim() : categoryOrKey?.key;
    const label =
        typeof categoryOrKey === 'string'
            ? (RATING_CATEGORIES.find((category) => category.key === key)?.label ?? '')
            : (categoryOrKey?.label ?? '');

    if (!includeDescription) {
        return label;
    }

    const description = getRatingCategoryDescription(key);
    return description ? `${label} (${description})` : label;
}

/**
 * How the students' mean ratings fall across the four bands.
 * @param {Array<number>|null} studentMeans - One mean per student.
 * @returns {Array<object>} One entry per band with its headcount and share; all zero for an empty set, so the bands still render.
 */
export function calculateRatingDistribution(studentMeans) {
    if (!studentMeans || studentMeans.length === 0) {
        return RATING_CATEGORIES.map((category) => ({
            ...category,
            count: 0,
            percentage: 0,
        }));
    }

    const total = studentMeans.length;
    return RATING_CATEGORIES.map((category) => {
        let count = studentMeans.filter(
            (value) => value >= category.min && value < category.max,
        ).length;
        if (category.key === 'excellent') {
            count += studentMeans.filter((value) => value === 5.0).length;
        }

        return {
            ...category,
            count,
            percentage: (count / total) * 100,
        };
    });
}

/**
 * The rating distribution in the shape the bar and legend renderers consume.
 * @param {Array<number>|null} studentMeans - One mean per student.
 * @param {object} [options] - Band ordering.
 * @param {boolean} [options.reverse] - List the best band first, for charts that stack downwards.
 * @returns {Array<object>} One bucket per band, in the requested order.
 */
export function buildRatingBuckets(studentMeans, { reverse = false } = {}) {
    const buckets = calculateRatingDistribution(studentMeans);
    const orderedBuckets = reverse ? [...buckets].reverse() : buckets;
    const total = Array.isArray(studentMeans) ? studentMeans.length : 0;

    return orderedBuckets.map((bucket) => ({
        key: bucket.key,
        field: bucket.key,
        label: bucket.label,
        color: bucket.color,
        count: bucket.count,
        value: bucket.count,
        percentage: bucket.percentage,
        total,
    }));
}

/**
 * The rating distribution as cumulative stacked-bar segments.
 * @param {any} studentMeans - One mean per student.
 * @param {{reverse?: boolean, meta?: Function | object | null}} [options] - Band ordering, plus extra per-segment metadata to merge in.
 * @returns {Array<object>} One segment per band, carrying its cumulative bounds.
 */
export function buildRatingSegments(studentMeans, { reverse = false, meta = null } = {}) {
    const buckets = buildRatingBuckets(studentMeans, { reverse });
    let cumulativePercent = 0;

    return buckets.map((bucket) => {
        const extra =
            typeof meta === 'function'
                ? meta(bucket)
                : meta && typeof meta === 'object'
                  ? meta
                  : null;
        const segment = {
            ...bucket,
            startPercent: cumulativePercent,
            endPercent: cumulativePercent + bucket.percentage,
        };
        cumulativePercent += bucket.percentage;

        return extra ? { ...segment, ...extra } : segment;
    });
}
