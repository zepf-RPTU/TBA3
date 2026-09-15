/**
 * German prose summary of the current group comparison.
 *
 * The Vergleich's info box narrates what the chart shows: which measure, and each of the
 * two groups' headline figures. This module turns the chart's selection plus the rows it
 * drew into that display-shaped object, which the templates in
 * `infoBoxSummaryNamespaces.js` render.
 *
 * It deliberately owns no filtering. `groupComparisonDataUtils.js` filters and prepares
 * for the chart, and the chart caches the result - this module reads that cache, so the
 * sentence and the picture cannot disagree.
 * @module groupComparisonSummary
 */

import { scaleHasStandardRanks } from '../../../../common/services/competenceLevelPalette.js';
import { calculateDetailedBoxPlotStats } from '../../../utils/slBoxPlotStats.js';
import {
    isAtOrAboveRegularStandard,
    resolveStandardBandsForAlias,
} from '../../../utils/slCompetenceLevels.js';
import { summarizeRatingValues } from '../../../utils/slRatingSummary.js';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';
import { filterByCategory, getPointMetric } from './groupComparisonDataUtils.js';

/**
 * Build a DOM-free summary of the currently selected group comparison.
 *
 * The returned object is shaped for display logic, not chart rendering.
 *
 * `filteredData` is the chart's own `cachedFilteredData` - the rows left after the
 * chart applied its subject/Fach filter and its scope filter. Taking them rather than
 * the raw payloads is what keeps this a *summary*: this module used to re-derive that
 * filter pipeline from `domainResults`/`comparisonSP`/`comparisonTQ`/`comparisonPoints`,
 * a second implementation that could disagree with the drawn chart and that nothing
 * tested. Only the group split (`filterByCategory`, shared with the preparers) and the
 * formatting happen here.
 * @param {object} options - The chart's visible selection plus the rows it drew.
 * @param {'ks'|'points'|'selfEfficacy'|'teachingQuality'} [options.chartType='ks'] - Which measure is being compared; decides which of the data arrays below is used.
 * @param {'gender'|'class'|'fach'} [options.category='gender'] - What the two groups are split by.
 * @param {string|null} [options.group1Value=null] - The first group's value; `null` auto-selects.
 * @param {string|null} [options.group2Value=null] - The second group's value; `null` auto-selects.
 * @param {Array|null} [options.filteredData=[]] - The rows the chart drew, already subject- and scope-filtered.
 * @returns {object} A display-shaped summary of what the chart currently shows, for the info box to read.
 */
export function buildGroupComparisonSummary({
    chartType = 'ks',
    category = 'gender',
    group1Value = null,
    group2Value = null,
    filteredData = [],
} = /** @type {any} */ ({})) {
    const rows = Array.isArray(filteredData) ? filteredData : [];
    const { dataType, metricMode, summarizeGroup } = SUMMARY_BUILDERS[chartType];

    const baseSummary = {
        shareLabel: getShareLabel(chartType),
        metricMode,
        group1: createEmptyGroupSummary(),
        group2: createEmptyGroupSummary(),
    };

    const { group1Data, group2Data, group1Label, group2Label } = filterByCategory(
        rows,
        category,
        group1Value,
        group2Value,
        dataType,
    );

    if (!group1Data || !group2Data) {
        return baseSummary;
    }

    return {
        ...baseSummary,
        group1: summarizeGroup(group1Data, formatGroupLabel(group1Label)),
        group2: summarizeGroup(group2Data, formatGroupLabel(group2Label)),
    };
}

/**
 * What sets the four measures apart once the rows are in hand: which `filterByCategory`
 * split to run, which measure family the info box words its sentence for, and how one
 * group's figures are summarised. Everything else — the split, the labels — is one path
 * in `buildGroupComparisonSummary`.
 * @type {Record<string, {dataType: string, metricMode: 'competency'|'rating'|'points', summarizeGroup: (rows: Array<object>, label: string) => object}>}
 */
const SUMMARY_BUILDERS = Object.freeze({
    ks: {
        dataType: 'competency',
        metricMode: 'competency',
        summarizeGroup: createCompetencyGroupSummary,
    },
    points: {
        dataType: 'points',
        metricMode: 'points',
        summarizeGroup: createPointGroupSummary,
    },
    selfEfficacy: {
        dataType: 'rating',
        metricMode: 'rating',
        summarizeGroup: createRatingGroupSummary,
    },
    teachingQuality: {
        dataType: 'rating',
        metricMode: 'rating',
        summarizeGroup: createRatingGroupSummary,
    },
});

/**
 * A group summary with every figure `null` rather than zero — a group with no data has
 * no mean, and reporting `0` would read as a measurement.
 * @param {string} [label] - The group's label.
 * @returns {object} The empty summary.
 */
function createEmptyGroupSummary(
    label = glossaryAnnotator.getRequiredEntryText('general.messages.no-data-short'),
) {
    return {
        label,
        n: 0,
        shareGe3: null,
        goodOrExcellentShare: null,
        mean: null,
        standardDeviation: null,
        min: null,
        max: null,
    };
}

/**
 * One group's competency figures.
 * @param {Array<object>|any} groupData - The group's rows.
 * @param {string} label - The group's display label.
 * @returns {object} The summary; `shareGe3` stays `null` for a scale that names no standards.
 */
function createCompetencyGroupSummary(groupData, label) {
    return {
        ...createEmptyGroupSummary(label),
        n: Array.isArray(groupData) ? groupData.length : 0,
        shareGe3: getRegularStandardShare(groupData),
    };
}

/**
 * One group's rating figures, computed over the entries that carry a finite mean.
 * @param {Array<object>|any} groupData - The group's rows.
 * @param {string} label - The group's display label.
 * @returns {object} The summary; every figure stays `null` when no entry had a usable value.
 */
function createRatingGroupSummary(groupData, label) {
    const values = Array.isArray(groupData)
        ? groupData.map((entry) => entry?.mean).filter((value) => Number.isFinite(value))
        : [];
    const ratingSummary = summarizeRatingValues(values);

    return {
        ...createEmptyGroupSummary(label),
        n: ratingSummary?.count ?? 0,
        goodOrExcellentShare: ratingSummary?.goodOrExcellentShare ?? null,
        mean: ratingSummary?.mean ?? null,
        standardDeviation: ratingSummary?.standardDeviation ?? null,
        min: ratingSummary?.min ?? null,
        max: ratingSummary?.max ?? null,
    };
}

/**
 * One group's point figures, computed over the entries that carry a Lösungsquote.
 * @param {Array<object>|any} groupData - The group's rows.
 * @param {string} label - The group's display label.
 * @returns {object} The summary; every figure stays `null` when no entry had a usable value.
 */
function createPointGroupSummary(groupData, label) {
    const values = Array.isArray(groupData)
        ? groupData.map(getPointMetric).filter((value) => value !== null)
        : [];
    const stats = calculateDetailedBoxPlotStats(values);

    return {
        ...createEmptyGroupSummary(label),
        n: values.length,
        mean: stats?.mean ?? null,
        standardDeviation: stats?.standardDeviation ?? null,
        min: stats?.min ?? null,
        max: stats?.max ?? null,
    };
}

/**
 * Share of a group at or above Regelstandard.
 *
 * Returns null when the group's scale never named its standards — a share the scale
 * cannot express is unknown, not zero.
 * @param {Array<object>|any} groupData - The group's rows.
 * @returns {number|null} The share as a fraction, or `null` when the scale names no standards or the group is empty.
 */
function getRegularStandardShare(groupData) {
    if (!Array.isArray(groupData) || groupData.length === 0) {
        return null;
    }

    const rankedScale = groupData.some((entry) =>
        scaleHasStandardRanks(entry?.competencyLevel, entry?.competencyScaleId),
    );
    if (!rankedScale) {
        return null;
    }

    const matchingCount = groupData.filter((entry) =>
        isAtOrAboveRegularStandard(entry?.competencyLevel, entry?.competencyScaleId),
    ).length;

    return matchingCount / groupData.length;
}

/**
 * What this chart type's share figure means, spelled out for the reader.
 * @param {string} chartType - The chart type key.
 * @returns {string|null} The label, or `null` for a chart type that reports no share.
 */
function getShareLabel(chartType) {
    if (chartType === 'ks') {
        // The band is the scale's to say — `III`, `KS 3`, `ReStd bzw. B1` — and it is what
        // the label names: the KMK standard behind the rank cannot be printed, because which
        // Kompetenzstufe it falls on depends on the Schulabschluss the payload does not
        // carry.
        const bands = resolveStandardBandsForAlias('ge_3') ?? [];
        // Phrased as the info boxes on this same view phrase it, so the summary and the
        // Kasten beside it do not say the same thing two ways.
        return bands.length > 0
            ? `Anteil auf oder oberhalb von Kompetenzstufe ${bands.join(' bzw. ')}`
            : 'Anteil obere Kompetenzstufen';
    }

    if (chartType === 'selfEfficacy' || chartType === 'teachingQuality') {
        return 'Anteil mit gutem oder sehr gutem Rating';
    }

    return null;
}

/**
 * A group's label as it should be shown.
 * @param {any} label - The raw label.
 * @returns {string} The display label, or `Keine Daten` when there is no label at all.
 */
function formatGroupLabel(label) {
    if (typeof label !== 'string') {
        return glossaryAnnotator.getRequiredEntryText('general.messages.no-data-short');
    }

    return label;
}
