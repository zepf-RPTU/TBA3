/**
 * SimpleCompetenceLevelBarConfig — ChartHostModule descriptor for the MA competence-level bar: a horizontal
 * stacked bar of the Kompetenzstufen: a segment click reports its level, and the highlight
 * is what `updateHighlight` hands back.
 */

import { StripBarChart } from '../../../../common/charts/stripBar/stripBarChart.js';
import { findOwnValueGroup } from '../../../../common/domain/comparisonGroupLabels.js';
import {
    parseCompetenceLevels,
    toStackedChartData,
} from '../../../../common/domain/competenceLevelAdapter.js';
import { buildStackedSegments } from '../../../../common/utils/stackedBarUtils.js';
import { shareRows } from '../../../../common/charts/shareRows.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     onLevelToggled?: (level: string) => void,
 * }} SimpleCompetenceLevelBarOptions
 */

/** @typedef {{highlightedLevels: string[]}} SimpleCompetenceLevelBarState */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<StripBarChart, SimpleCompetenceLevelBarOptions, null, SimpleCompetenceLevelBarState>} SimpleCompetenceLevelBarChartHost */

/**
 * The group's own value group as a strip: its name, and one segment per Kompetenzstufe,
 * each with its headcount and a tooltip titled by the group. The comparison value groups
 * the document carries too, in no fixed order, are dropped.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../../../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} valueGroups - The competence-levels document.
 * @returns {{label: string, segments: import('../../../../common/charts/stripBar/stripBarChart.js').StripSegment[]}} No segments without a group value group.
 */
function competenceLevelStrip(palette, valueGroups) {
    const own = findOwnValueGroup(valueGroups);
    if (!own) return { label: '', segments: [] };
    const { levels, groups } = parseCompetenceLevels(palette, [own]);
    const [row] = toStackedChartData(groups, levels);
    if (!row) return { label: '', segments: [] };
    const segments = buildStackedSegments(palette, row, levels, {
        counts: row.counts,
        total: row.total,
    }).map((segment) => ({
        ...segment,
        tooltip: {
            title: row.label,
            rows: shareRows({
                label: TERM_CONSTANTS.COMP_LEVEL,
                value: segment.label,
                share: segment.percentage,
                count: segment.count,
                total: segment.total,
            }),
        },
    }));
    return { label: row.label, segments };
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The verbs `publicAPI` binds onto the host, as its callers see them.
 * @typedef {{
 *     updateHighlight(levels: string[]): void,
 * }} SimpleCompetenceLevelBarVerbs
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<StripBarChart, SimpleCompetenceLevelBarOptions, null, SimpleCompetenceLevelBarVerbs, SimpleCompetenceLevelBarState>} */
export const simpleCompetenceLevelBarConfig = {
    glossaryPath: 'ma.group.competence-level-distribution',

    documents: ['competence-levels.json'],

    defaultOptions: {
        showModuleTitle: true,
        collapsible: true,
    },

    /** @returns {SimpleCompetenceLevelBarState} No level highlighted. */
    initialState: () => ({ highlightedLevels: [] }),

    /**
     * @param {SimpleCompetenceLevelBarChartHost} host
     * @returns {StripBarChart}
     */
    createRenderer(host) {
        const { context } = host.options;
        const { label, segments } = competenceLevelStrip(
            context.palette,
            context.documents.get('competence-levels.json'),
        );
        return new StripBarChart(host.chartArea, segments, {
            ...host.rendererOptions,
            rowLabel: label,
            highlightedKeys: host.state.highlightedLevels,
            onSegmentClick: (level) => host.options.onLevelToggled?.(level),
        });
    },

    publicAPI: {
        /**
         * Highlight the given Kompetenzstufen: the value of the group table's
         * Kompetenzstufe filter, reported through its `onCompetenceLevelFilterChanged`.
         * @param {SimpleCompetenceLevelBarChartHost} host
         * @param {string[]} levels - Empty clears the highlight.
         */
        updateHighlight(host, levels) {
            host.state.highlightedLevels.value = levels;
        },
    },
};
