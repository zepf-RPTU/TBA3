/**
 * The school-summary metrics, one entry each: an id, the label and caption the
 * glossary-aware phrasing produces from the loaded scales, whether higher is better, and
 * how the metric is resolved against the share and Lösungsquote queries.
 * The calculations over the registry live in `slSchoolSummaryMetrics.js`.
 */

import { MEDIUM_OR_ABOVE_ALIAS, formatStandardBands } from './slCompetenceLevels.js';

/** @typedef {import('../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} CompetenceLevelPalette */

/**
 * Why a subject×domain has no card under the current metric.
 *
 * The causes differ in kind: a scale that cannot express the requested band (a GER
 * ladder stopping at B1 has no `high` band) is correct and permanent; a subject the
 * export ships a Landesschnitt for but no groups is a gap in the export, and so is a
 * payload whose groups arrive without the school's own value group.
 *
 * Each value is also the key of the reason's sentence among the `messages` of
 * `groupDeviation.glossary.json`; `METRIC_UNSUPPORTED` defers to the metric's `unsupportedMessage`.
 * @enum {string}
 */
export const ABSENCE_REASONS = Object.freeze({
    /** The export has no group value groups for this subject×domain at all. */
    NO_GROUP_DATA: 'no-group-data',
    /** Groups exist but the payload has no school value group for this subject×domain, so no school value resolves. */
    NO_SCHOOL: 'no-school',
    /** Groups and the school value group exist, but this metric cannot be answered here — see `unsupportedMessage`. */
    METRIC_UNSUPPORTED: 'metric-unsupported',
    /** The school resolved but no individual group did. */
    NO_GROUP_VALUES: 'no-group-values',
    /** The Lösungsquote of a Fach × Domäne sat in several booklets, which cannot be compared. */
    MIXED_BOOKLETS: 'mixed-booklets',
});

/**
 * @typedef {object} SummaryMetric
 * @property {string} id - Stable key the selection is stored under; a share metric's is its band alias.
 * @property {(palette: CompetenceLevelPalette) => string} label - Dropdown label, resolved per call against the app palette's loaded scales.
 * @property {(palette: CompetenceLevelPalette) => string} caption - Follows the school value inside the chart's value box; resolved per call.
 * @property {boolean} higherIsBetter - Drives bar color; false for the lowest-band metric
 * @property {string} unsupportedMessage - Key of the sentence, among the `messages` of
 *   `groupDeviation.glossary.json`, that says why this metric can be unanswerable for a subject×domain
 *   that does have groups; each metric fails for its own reason.
 * @property {(queries: SummaryQueries, target: import('./slQueryPrimitives.js').QueryTarget, subjectName: string, domainId: string|null) => number|null} resolve - Reads the metric for one target; `null` when this scale cannot answer it.
 * @property {(queries: SummaryQueries, subjectName: string, domainId: string|null) => string|null} [absence] - The `ABSENCE_REASONS` cause this metric withholds a Fach × Domäne for, checked before any value is read; `null` to read it.
 */

/**
 * The two query helpers a metric may read: competence shares and Lösungsquoten.
 * @typedef {object} SummaryQueries
 * @property {Pick<import('./slCompetenceShares.js').CompetenceShareQueries, 'getCompetenceLevelShare'>} shares
 * @property {Pick<import('./slSolutionRates.js').SolutionRateQueries, 'getSolutionRate' | 'hasMixedBooklets'>} rates
 */

/**
 * Build a metric that reports the share of students on the levels a band alias picks out.
 *
 * The metric names the Kompetenzstufe, never the KMK standard: which Kompetenzstufe
 * counts as the Regelstandard depends on the Schulabschluss a student is working toward,
 * which the payload does not carry, and a GER ladder has no standard names. The band
 * alias selects the levels; the Kompetenzstufe it resolves to goes on screen.
 *
 * Everything is resolved per call: `SUMMARY_METRICS` is built at import time, before the
 * competence-levels document has populated the app's palette.
 * @param {object} spec
 * @param {string} spec.levelAlias - The band alias, e.g. `ge_medium`, expanded per call against the
 *   loaded scales; also the metric's id.
 * @param {boolean} spec.higherIsBetter - Drives bar color.
 * @param {(bands: string) => string} spec.label - Dropdown label, given the resolved bands.
 * @param {(bands: string) => string} spec.caption - Value-box caption, given the resolved bands.
 * @param {string} spec.fallbackLabel - Label for a payload whose scales tag no level with that band.
 * @param {string} spec.fallbackCaption - Caption for that same case.
 * @returns {SummaryMetric}
 */
function createCompetenceShareMetric({
    levelAlias,
    higherIsBetter,
    label,
    caption,
    fallbackLabel,
    fallbackCaption,
}) {
    // Without resolved bands the metric is null and every card shows `unsupportedMessage`,
    // so the fallback text only has to be non-misleading.
    /**
     * @param {(bands: string) => string} template - The text, given the resolved bands.
     * @param {string} fallback - The text when no loaded scale resolves the alias.
     * @returns {(palette: CompetenceLevelPalette) => string} The text, resolved per call.
     */
    const phrase = (template, fallback) => (palette) => {
        const bands = formatStandardBands(palette, levelAlias);
        return bands ? template(bands) : fallback;
    };

    /** @type {SummaryMetric} */
    const metric = {
        id: levelAlias,
        label: phrase(label, fallbackLabel),
        caption: phrase(caption, fallbackCaption),
        higherIsBetter,
        unsupportedMessage: 'metric-unsupported-competence-levels',
        resolve: (queries, target, subjectName, domainId) =>
            queries.shares.getCompetenceLevelShare({
                target,
                levelAlias,
                subjectName,
                domainId,
            }),
    };
    return Object.freeze(metric);
}

/** @type {ReadonlyArray<SummaryMetric>} */
export const SUMMARY_METRICS = Object.freeze([
    createCompetenceShareMetric({
        levelAlias: MEDIUM_OR_ABOVE_ALIAS,
        higherIsBetter: true,
        label: (bands) => `Anteil ab Kompetenzstufe ${bands}`,
        caption: (bands) => `erreichen mindestens Kompetenzstufe ${bands}`,
        fallbackLabel: 'Anteil obere Kompetenzstufen',
        fallbackCaption: 'erreichen die oberen Kompetenzstufen',
    }),
    Object.freeze(
        /** @satisfies {SummaryMetric} */ ({
            id: 'solution_rate',
            label: () => 'Lösungsquote',
            caption: () => 'der Teilaufgaben korrekt gelöst',
            higherIsBetter: true,
            unsupportedMessage: 'metric-unsupported-solution-rate',
            resolve: (queries, target, subjectName, domainId) =>
                queries.rates.getSolutionRate({
                    target,
                    subjectName,
                    domainId,
                }),
            absence: (queries, subjectName, domainId) =>
                queries.rates.hasMixedBooklets(subjectName, domainId)
                    ? ABSENCE_REASONS.MIXED_BOOKLETS
                    : null,
        }),
    ),
    createCompetenceShareMetric({
        levelAlias: 'le_low',
        higherIsBetter: false,
        label: (bands) => `Anteil höchstens Kompetenzstufe ${bands}`,
        caption: (bands) => `liegen höchstens auf Kompetenzstufe ${bands}`,
        fallbackLabel: 'Anteil unterste Kompetenzstufe',
        fallbackCaption: 'liegen auf der untersten Kompetenzstufe',
    }),
    createCompetenceShareMetric({
        levelAlias: 'e_high',
        higherIsBetter: true,
        label: (bands) => `Anteil Kompetenzstufe ${bands}`,
        caption: (bands) => `erreichen Kompetenzstufe ${bands}`,
        fallbackLabel: 'Anteil höchste Kompetenzstufe',
        fallbackCaption: 'erreichen die höchste Kompetenzstufe',
    }),
]);

export const DEFAULT_SUMMARY_METRIC_ID = SUMMARY_METRICS[0].id;

/**
 * Resolve a metric descriptor, falling back to the default for unknown ids.
 * @param {string} [metricId] - The stored selection, which may name a metric this build no longer has.
 * @returns {SummaryMetric}
 */
export function getSummaryMetric(metricId) {
    return SUMMARY_METRICS.find((metric) => metric.id === metricId) ?? SUMMARY_METRICS[0];
}
