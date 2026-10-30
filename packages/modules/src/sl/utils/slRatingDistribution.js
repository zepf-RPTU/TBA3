/**
 * The rating bands every SL survey measure is answered in, and how students' mean
 * ratings fall across them. How a band paints is the chart layer's
 * (`slRatingAppearance.js`).
 */
import { RATING_DOMAIN } from '../../common/domain/apiValueMaps.js';
import { percentOf } from '../../common/domain/itemResultCounts.js';

/**
 * @typedef {object} RatingCategory
 * @property {'low'|'medium'|'good'|'excellent'} key
 * @property {string} label - Range label, e.g. `3-4`.
 * @property {number} min - Inclusive lower bound.
 * @property {number} max - Exclusive upper bound (the top band also takes 5.0).
 */

/**
 * A rating band with its headcount and its share in percent (0–100).
 * @typedef {RatingCategory & {count: number, percentage: number}} RatingDistributionEntry
 */

/** @type {Readonly<Record<string, string>>} */
const RATING_CATEGORY_DESCRIPTIONS = Object.freeze({
    low: 'niedrig',
    medium: 'mittel',
    good: 'gut',
    excellent: 'sehr gut',
});

/** @type {ReadonlyArray<RatingCategory>} */
export const RATING_CATEGORIES = Object.freeze([
    {
        key: 'low',
        label: '1-2',
        min: 1.0,
        max: 2.0,
    },
    {
        key: 'medium',
        label: '2-3',
        min: 2.0,
        max: 3.0,
    },
    {
        key: 'good',
        label: '3-4',
        min: 3.0,
        max: 4.0,
    },
    {
        key: 'excellent',
        label: '4-5',
        min: 4.0,
        max: 5.0,
    },
]);

/**
 * The wording that spells out what one rating band means, e.g. `gut` for `3-4`.
 * @param {string} key
 * @returns {string} Empty for a key with none.
 */
export function getRatingCategoryDescription(key) {
    return RATING_CATEGORY_DESCRIPTIONS[key] ?? '';
}

/**
 * The label one rating band is shown under, with its description in brackets.
 * @param {{key: string, label: string}} category
 * @returns {string}
 */
export function formatRatingCategoryLabel(category) {
    const description = getRatingCategoryDescription(category.key);
    return description ? `${category.label} (${description})` : category.label;
}

/**
 * How the students' mean ratings fall across the four bands.
 * @param {Array<number>|null} studentMeans - On the rating scale, as the document schema guarantees.
 * @returns {RatingDistributionEntry[]} One entry per band with its headcount and share; all zero without values, so the bands still render.
 */
export function calculateRatingDistribution(studentMeans) {
    const max = RATING_DOMAIN[1];
    const values = studentMeans ?? [];
    const total = values.length;
    return RATING_CATEGORIES.map((category) => {
        // The top band also takes 5.0, the scale's closed end.
        const count = values.filter(
            (value) =>
                (value >= category.min && value < category.max) ||
                (category.key === 'excellent' && value === max),
        ).length;

        return {
            ...category,
            count,
            percentage: percentOf(count, total) ?? 0,
        };
    });
}
