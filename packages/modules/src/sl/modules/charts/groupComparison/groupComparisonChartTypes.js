/**
 * The group-comparison chart's registry: its layout/colour constants and, per chart
 * type (ks | points | selfEfficacy | teachingQuality), where the data comes from, how
 * it is filtered and prepared, and which item list the rows are drawn from. Shared by
 * the chart class (which drives it) and the pyramid renderer (which reads `itemKey`).
 */

import { getThemeColors } from '../../../../common/services/themeService.js';
import { buildCompetencyLevelRows } from './competencyLevelRows.js';
import {
    filterSelectedDomainData,
    prepareCompetencyGroupData,
    filterPointData,
    preparePointGroupData,
    filterRatingData,
    prepareRatingGroupData,
    extractLevelOrder,
    CHART_TYPE_LABELS,
} from './groupComparisonDataUtils.js';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Centralized chart configuration constants
 * @constant {object}
 */
export const CHART_CONFIG = {
    // Layout
    margins: { top: 80, right: 80, bottom: 80, left: 80 },
    barMargin: 40,

    // Visual styling
    opacity: {
        group1: 0.8,
        group2: 0.6,
        hoverActive: 1.0,
        dividerLine: 0.6,
    },

    // Colors — all use lazy getters so theme switches update correctly
    colors: {
        get pointsGroup1() {
            return getThemeColors().sl.group1;
        },
        get pointsGroup2() {
            return getThemeColors().sl.group2;
        },
        get divider() {
            return getThemeColors().chrome.textDisabled;
        },
        get text() {
            return getThemeColors().chrome.text;
        },
        get descriptionText() {
            return getThemeColors().chrome.textSecondary;
        },
    },

    // Animation duration uses BarChartRenderer.TRANSITION_DURATION.
};

/**
 * Chart type configuration mapping
 * Centralizes behavior and data processing for each chart type
 * @constant {object}
 */
export const CHART_TYPE_CONFIG = {
    ks: {
        displayName: CHART_TYPE_LABELS.ks,
        dataFilter: filterSelectedDomainData,
        dataPreparer: prepareCompetencyGroupData,
        itemKey: 'levels',
        getDataSource(chart) {
            return chart._domainResults;
        },
        getFilterArgs(chart) {
            const sd = chart._subjectDomainList[chart.state.subjectIndex];
            return [{ subjectName: sd.subjectName, domainId: sd.domainId }];
        },
        getPreparerExtraArgs(chart) {
            const levelOrder = extractLevelOrder(
                chart._domainResults,
                chart._subjectDomainList[chart.state.subjectIndex],
            ) ?? { order: [] };
            return [buildCompetencyLevelRows([levelOrder])];
        },
        get noDataMessage() {
            return glossaryAnnotator.getRequiredEntryText('general.messages.no-data');
        },
    },
    points: {
        displayName: CHART_TYPE_LABELS.points,
        dataFilter: filterPointData,
        dataPreparer: preparePointGroupData,
        itemKey: 'points',
        getDataSource(chart) {
            return chart.comparisonPoints;
        },
        getFilterArgs(chart) {
            const sd = chart._subjectDomainList[chart.state.subjectIndex];
            return [{ subjectName: sd.subjectName, domainId: sd.domainId }];
        },
        getPreparerExtraArgs() {
            return [];
        },
        get noDataMessage() {
            return glossaryAnnotator.getRequiredEntryText(
                'sl.comparison.comparison-plot.messages.no-success-rates',
            );
        },
    },
    selfEfficacy: {
        displayName: CHART_TYPE_LABELS.selfEfficacy,
        dataFilter: filterRatingData,
        dataPreparer: prepareRatingGroupData,
        itemKey: 'buckets',
        dataType: 'Selbstwirksamkeit',
        ratingValueField: 'wert_Selbstwahrn',
        getDataSource(chart) {
            return chart.comparisonSP;
        },
        getFilterArgs() {
            return [];
        },
        getPreparerExtraArgs() {
            return [this.dataType];
        },
        get noDataMessage() {
            return glossaryAnnotator.getRequiredEntryText(
                'sl.comparison.comparison-plot.messages.no-self-efficacy',
            );
        },
    },
    teachingQuality: {
        displayName: CHART_TYPE_LABELS.teachingQuality,
        dataFilter: filterRatingData,
        dataPreparer: prepareRatingGroupData,
        itemKey: 'buckets',
        dataType: 'Unterrichtsqualität',
        ratingValueField: 'wert_kog_Akt',
        getDataSource(chart) {
            return chart.comparisonTQ;
        },
        getFilterArgs(chart) {
            const subject = chart.domainArray[chart.state.subjectIndex]?.[0]?.fach || null;
            return [subject];
        },
        getPreparerExtraArgs() {
            return [this.dataType];
        },
        get noDataMessage() {
            return glossaryAnnotator.getRequiredEntryText(
                'sl.comparison.comparison-plot.messages.no-teaching-quality',
            );
        },
    },
};
