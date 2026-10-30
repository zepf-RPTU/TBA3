/**
 * How the SL survey series paint: the rating bands and the two survey measures, each a
 * `var()` of its theme token, so a theme switch repaints through the cascade. Also the
 * bands as a chart's series vocabulary and the distribution as chart segments
 * (`RatingBucket`). The rating tokens are the competence-level ramp's arms
 * (`getRatingStops`), published like the band tokens (`paletteToken`).
 */

import { sum } from 'd3-array';
import { getRatingStops } from '../../common/services/colorRamp.js';
import { readActiveThemeId } from '../../common/services/competenceLevelColors.js';
import { paletteToken } from '../../common/services/paletteTokens.js';
import { formatRatingCategoryLabel, RATING_CATEGORIES } from './slRatingDistribution.js';
import {
    figureCell,
    shareCountCell,
    shareCountColumns,
} from '../../common/charts/dataTableCells.js';
import { TERM_CONSTANTS } from '../../common/domain/terms.js';
import { formatCount, formatDecimal } from '../../common/utils/numberFormat.js';

/**
 * A rating band as a chart segment: key, label, colour and headcount.
 * @typedef {object} RatingBucket
 * @property {string} key
 * @property {string} field - Band key again, as the renderers' field name.
 * @property {string} label - Range label.
 * @property {string} color - A `var()` of the band's token.
 * @property {number} count - Students in the band.
 * @property {number} value - Students in the band, as the renderers' value.
 * @property {number} percentage - Share of students, 0–100.
 * @property {number} total - Students overall.
 */

/** The rating band keys, low → excellent, in the order `getRatingStops` returns them. */
const RATING_KEYS = Object.freeze(['low', 'medium', 'good', 'excellent']);

/**
 * A rating band's colour. Registers its token on first use rather than at import, so
 * the first write sees the theme and scheme the page has settled on.
 * @param {string} key - A band key (`low`, `medium`, `good`, `excellent`).
 * @returns {string} Its colour's `var()`.
 */
export function ratingColor(key) {
    const index = RATING_KEYS.indexOf(key);
    return paletteToken(
        `--sl-rating-${key}`,
        (scheme) => getRatingStops(readActiveThemeId(), scheme)[index] ?? null,
    );
}

/** The survey measures' colours, by their data key. */
export const SL_SERIES_COLORS = Object.freeze({
    teachingQuality: 'var(--sl-teaching-quality)',
    selfEfficacy: 'var(--sl-self-efficacy)',
});

/** The rating bands as a chart's series vocabulary: colour, label and draw order by band key. */
export const RATING_SERIES = Object.freeze({
    colorOf: ratingColor,
    categoryLabels: Object.freeze(
        Object.fromEntries(
            RATING_CATEGORIES.map((category) => [
                category.key,
                formatRatingCategoryLabel(category),
            ]),
        ),
    ),
    categoryOrder: Object.freeze(RATING_CATEGORIES.map((category) => category.key)),
});

/**
 * A data table's columns for a rating summary, after its row head: the students rated,
 * a share-and-count column per band in scale order (headed as the legend names it,
 * `1-2 (niedrig)`), and the mean rating with the two decimals it shows.
 * @type {ReadonlyArray<import('../../common/charts/host/chartDataTable.js').ChartDataColumn>}
 */
export const RATING_STATS_COLUMNS = Object.freeze([
    ...shareCountColumns(RATING_CATEGORIES.map(formatRatingCategoryLabel)),
    { label: TERM_CONSTANTS.MEAN, digits: 2 },
]);

/**
 * A rating summary as data table cells, in `RATING_STATS_COLUMNS` order. Nobody rated
 * has no shares, and so empty cells.
 * @param {{count: number|null|undefined, distribution: import('./slRatingDistribution.js').RatingDistributionEntry[], mean: number|null|undefined}} summary
 * @returns {import('../../common/charts/host/chartDataTable.js').ChartDataCell[]}
 */
export function ratingStatsCells({ count, distribution, mean }) {
    const rated = sum(distribution, (bucket) => bucket.count) > 0;
    return [
        figureCell(count, formatCount),
        ...RATING_CATEGORIES.map(({ key }) => {
            const bucket = distribution.find((entry) => entry.key === key);
            return shareCountCell(rated ? bucket?.percentage : null, bucket?.count);
        }),
        figureCell(mean, formatDecimal),
    ];
}

/**
 * The rating distribution as chart segments, one per band.
 * @param {import('./slRatingDistribution.js').RatingDistributionEntry[]} buckets - The bands with their headcounts (`calculateRatingDistribution`, or a survey aggregate's `distribution`).
 * @param {object} [options]
 * @param {boolean} [options.reverse] - List the best band first, for charts that stack downwards.
 * @returns {RatingBucket[]}
 */
export function buildRatingBuckets(buckets, { reverse = false } = {}) {
    const orderedBuckets = reverse ? [...buckets].reverse() : buckets;
    const total = sum(buckets, (bucket) => bucket.count);

    return orderedBuckets.map((bucket) => ({
        key: bucket.key,
        field: bucket.key,
        label: bucket.label,
        color: ratingColor(bucket.key),
        count: bucket.count,
        value: bucket.count,
        percentage: bucket.percentage,
        total,
    }));
}
