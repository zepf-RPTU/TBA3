/**
 * LongitudinalDataService — Pure helper functions for longitudinal data
 * transformation. Shared by the three individual ChartHostModule configs
 * that make up the longitudinal view (teachingQualityConfig,
 * selfEfficacyLongConfig, ksDistributionConfig).
 */

import { getCompetencyColor } from '../../../../common/services/themeService.js';
import {
    RATING_CATEGORIES,
    calculateRatingDistribution,
    formatRatingCategoryLabel,
} from '../../../utils/slRatingDistribution.js';
import { buildKsHistory, buildSurveyHistory } from './historyAdapter.js';

/**
 * The key a rating band is tracked under across the longitudinal series.
 * @param {object} category - The rating band.
 * @returns {string} Its key.
 */
function getRatingBucketKey(category) {
    return `${category.min.toFixed(1)}-${category.max.toFixed(1)}`;
}

/**
 * Bucket range color scheme (shared between teaching quality and
 * self-efficacy parallel-coordinates charts).
 * Evaluated lazily because theme colours depend on the runtime theme.
 * @returns {{[bucketKey: string]: string}} Colour per rating band.
 */
export function getBucketColors() {
    return Object.fromEntries(
        RATING_CATEGORIES.map((category) => [getRatingBucketKey(category), category.color]),
    );
}

/**
 * Display labels for the rating buckets used by teaching-quality and
 * self-efficacy longitudinal charts.
 * @returns {{[bucketKey: string]: string}} Label per rating band.
 */
export function buildRatingBucketLabels() {
    return Object.fromEntries(
        RATING_CATEGORIES.map((category) => [
            getRatingBucketKey(category),
            formatRatingCategoryLabel(category),
        ]),
    );
}

// ── Utility functions ────────────────────────────────────────────────────────

/**
 * Creates a rating-bucket distribution for the 1-5 teaching-quality and
 * self-efficacy scales.
 * @param {number[]} values - Array of student average values
 * @returns {{[bucketKey: string]: number}} Bucket label → percentage
 */
function createBucketDistribution(values) {
    const ratingValues = (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
    if (ratingValues.length === 0) return {};

    return Object.fromEntries(
        calculateRatingDistribution(ratingValues).map((cat) => [
            getRatingBucketKey(cat),
            cat.percentage,
        ]),
    );
}

/**
 * Turn per-year raw survey values into the bucket timeline the parallel charts consume.
 *
 * A year whose values all fall outside the 1-5 scale buckets to nothing; it is dropped
 * rather than plotted as an empty column.
 * @param {Array<{year: string, measured: boolean, values: number[]}>} slices - Per-year values from `buildSurveyHistory`.
 * @returns {Array<{year: string, measured: boolean, categories: object}>} The timeline.
 */
function toBucketTimeline(slices) {
    return slices
        .map(({ year, measured, values }) => ({
            year,
            measured,
            categories: createBucketDistribution(values),
        }))
        .filter((entry) => Object.keys(entry.categories).length > 0);
}

// ── Domain-specific converters ───────────────────────────────────────────────

/**
 * Convert teaching-quality data for a specific domain group into parallel-
 * coordinates timeline data.
 *
 * Scoped to the students the domain group actually contains, so Unterrichtsqualitaet in
 * Deutsch reports the Deutsch cohort rather than the whole school. The ids come from the
 * measured year and are reused across years by construction (see `historyAdapter.js`).
 * @param {Array} domainGroup - Single domain group from domainArray
 * @param {Array} history     - Raw history.json from the DataStore
 * @returns {Array<{year: string, measured: boolean, categories: object}>} One entry per year; `measured` distinguishes real rows from generated ones.
 */
export function convertTeachingQualityToTimeline(domainGroup, history) {
    if (!history?.length || !domainGroup?.length) return [];

    const studentIds = new Set();
    domainGroup.forEach((r) => {
        r.summedResults?.forEach((s) => studentIds.add(s.studentId));
    });

    return toBucketTimeline(
        buildSurveyHistory(history, 'tq_mean', { subject: domainGroup[0].fach, studentIds }),
    );
}

/**
 * Convert self-efficacy data into parallel-coordinates timeline data.
 *
 * Whole school, unfiltered: Selbstwirksamkeit is asked once per student, not per Fach.
 * @param {Array} history - Raw history.json from the DataStore
 * @returns {Array<{year: string, measured: boolean, categories: object}>} One entry per year; `measured` distinguishes real rows from generated ones.
 */
export function convertSelfEfficacyToTimeline(history) {
    if (!history?.length) return [];

    return toBucketTimeline(buildSurveyHistory(history, 'sp_mean'));
}

/**
 * Convert competency (KS) distribution data for a domain group into
 * parallel-coordinates timeline data.
 *
 * The distribution comes from the history document's school-level rows, not from summing
 * `domainGroup`'s per-class counts: the two agree exactly (the school row *is* the sum of
 * its classes), and only the document carries the earlier years. `domainGroup` still says
 * which (Fach, Domaene) to read.
 * @param {Array} domainGroup - Single domain group from domainArray
 * @param {Array} history     - Raw history.json from the DataStore
 * @returns {Array<{year: string, measured: boolean, categories: object}>} One entry per year with data; empty for a domain no year placed a student in.
 */
export function convertDomainToTimeline(domainGroup, history) {
    if (!Array.isArray(domainGroup) || domainGroup.length === 0) return [];

    return buildKsHistory(history, domainGroup[0]?.fach ?? '', domainGroup[0]?.domaene ?? null);
}

/**
 * Category order for the KS timeline: the scale's own levels, lowest first, exactly
 * as the payload listed them.
 *
 * `stats.ksOrder` is captured in `buildDomainResultsFromJson` for this purpose —
 * `Object.keys` on `ksCounts` cannot be used instead, because it re-sorts
 * integer-like keys.
 * @param {Array} domainGroup - Single domain group from domainArray
 * @returns {string[]} The levels in scale order, deduplicated across the group's domains.
 */
export function buildKsCategoryOrder(domainGroup) {
    const order = [];
    for (const domain of domainGroup ?? []) {
        for (const level of domain?.stats?.ksOrder ?? []) {
            if (!order.includes(level)) order.push(level);
        }
    }
    return order;
}

/**
 * Build a color map for KS levels present in timeline data.
 * @param {Array<{year: string, categories: object}>} timelineData - The series the colours must cover.
 * @param {string} [scaleId] - The domain's ladder (`stats.scaleId`), so a level name another
 *   Fach on the page shares is painted with this Fach's ramp.
 * @returns {{[level: string]: string}} Colour per level present in the data.
 */
export function buildKsCategoryColors(timelineData, scaleId) {
    const colors = /** @type {{[level: string]: string}} */ ({});
    timelineData.forEach((yearData) => {
        for (const ks of Object.keys(yearData.categories)) {
            if (!colors[ks]) colors[ks] = getCompetencyColor(ks, scaleId);
        }
    });
    return colors;
}
