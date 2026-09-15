/**
 * The metrics the Überblick and its header selector offer, one entry each: an id, the
 * label and caption the glossary-aware phrasing produces from the loaded scales, whether
 * higher is better, and how the metric is resolved against the info-box query layer.
 * The calculations over the registry live in `slSchoolSummaryMetrics.js`.
 */

import { formatStandardBands, resolveCompetenceLevelRankAlias } from './slCompetenceLevels.js';

/**
 * @typedef {object} SummaryMetric
 * @property {string} id - Stable key the selection is stored under.
 * @property {() => string} label - Dropdown label, resolved per call against the loaded scales.
 * @property {() => string} caption - Follows the school value inside the chart's value box; resolved per call.
 * @property {boolean} higherIsBetter - Drives bar color; false for the lowest-rank metric
 * @property {string} unsupportedMessage - Key of the sentence, among the Überblick card's
 *   glossary `messages`, that says why this metric can be unanswerable for a subject×domain
 *   that does have classes. Each metric fails for its own reason and they have different
 *   remedies, so the card says which one applies rather than a single "keine Daten".
 * @property {(queries: SummaryQueries, target: string, subjectName: string, domainId: string|null) => number|null} resolve - Reads the metric for one target; `null` when this scale cannot answer it.
 */

/**
 * The two query helpers a metric may read: competence shares and Lösungsquoten.
 * @typedef {object} SummaryQueries
 * @property {{getCompetenceLevelShare: (params: object) => number|null}} shares - A `CompetenceShareQueries`.
 * @property {{getSolutionRate: (params: object) => number|null}} rates - A `SolutionRateQueries`.
 */

/**
 * Build a metric that reports the share of students on the levels a rank alias picks out.
 *
 * **The metric names the Kompetenzstufe, never the KMK standard.** Which Kompetenzstufe
 * counts as the Regelstandard depends on the Schulabschluss a student is working toward,
 * which the payload does not carry, and a GER ladder has no direct correspondence to a
 * standard name at all — so any label that writes a standard's name into the string is wrong
 * on most of the scales SL loads. The rank still selects the levels; the band the alias
 * resolves to is what goes on screen.
 *
 * Everything is resolved per call, not captured here: `SUMMARY_METRICS` below is a
 * module-level constant built at import time, and the scale registry is not populated
 * until `fetchSlData` has run.
 * @param {object} spec - The metric's declaration.
 * @param {string} spec.id - Stable key the selection is stored under.
 * @param {string} spec.levelAlias - The rank alias, e.g. `ge_3`, expanded per call against the loaded scales.
 * @param {boolean} spec.higherIsBetter - Drives bar color.
 * @param {(bands: string) => string} spec.label - Dropdown label, given the resolved bands.
 * @param {(bands: string) => string} spec.caption - Value-box caption, given the resolved bands.
 * @param {string} spec.fallbackLabel - Label for a payload whose scales name no level of that rank.
 * @param {string} spec.fallbackCaption - Caption for that same case.
 * @returns {SummaryMetric} The declared metric.
 */
function createCompetenceShareMetric({
    id,
    levelAlias,
    higherIsBetter,
    label,
    caption,
    fallbackLabel,
    fallbackCaption,
}) {
    // `[]` covers both "not an alias" and "no loaded scale has a level of that rank"; the
    // metric resolves to null in either case and every card shows `unsupportedMessage`, so the
    // fallback text only has to be non-misleading, not informative.
    const phrase = (template, fallback) => () => {
        const bands = formatStandardBands(levelAlias);
        return bands ? template(bands) : fallback;
    };

    return Object.freeze({
        id,
        label: phrase(label, fallbackLabel),
        caption: phrase(caption, fallbackCaption),
        higherIsBetter,
        unsupportedMessage: 'metric-unsupported-competence-levels',
        resolve: (queries, target, subjectName, domainId) =>
            queries.shares.getCompetenceLevelShare({
                target,
                levelNames: resolveCompetenceLevelRankAlias(levelAlias) ?? [],
                subjectName,
                domainId,
            }),
    });
}

/** @type {ReadonlyArray<SummaryMetric>} */
export const SUMMARY_METRICS = Object.freeze([
    createCompetenceShareMetric({
        id: 'regular_standard',
        levelAlias: 'ge_3',
        higherIsBetter: true,
        label: (bands) => `Anteil ab Kompetenzstufe ${bands}`,
        caption: (bands) => `erreichen mindestens Kompetenzstufe ${bands}`,
        fallbackLabel: 'Anteil obere Kompetenzstufen',
        fallbackCaption: 'erreichen die oberen Kompetenzstufen',
    }),
    Object.freeze({
        id: 'solution_rate',
        label: () => 'Lösungsquote',
        caption: () => 'der Aufgaben korrekt gelöst',
        higherIsBetter: true,
        unsupportedMessage: 'metric-unsupported-solution-rate',
        resolve: (queries, target, subjectName, domainId) =>
            queries.rates.getSolutionRate({
                target,
                subjectName,
                domainId,
            }),
    }),
    createCompetenceShareMetric({
        id: 'below_minimum',
        levelAlias: 'le_1',
        higherIsBetter: false,
        label: (bands) => `Anteil höchstens Kompetenzstufe ${bands}`,
        caption: (bands) => `liegen höchstens auf Kompetenzstufe ${bands}`,
        fallbackLabel: 'Anteil unterste Kompetenzstufe',
        fallbackCaption: 'liegen auf der untersten Kompetenzstufe',
    }),
    createCompetenceShareMetric({
        id: 'optimal_standard',
        levelAlias: 'e_5',
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
 * @returns {SummaryMetric} The descriptor, or the first metric as the default.
 */
export function getSummaryMetric(metricId) {
    return SUMMARY_METRICS.find((metric) => metric.id === metricId) ?? SUMMARY_METRICS[0];
}
