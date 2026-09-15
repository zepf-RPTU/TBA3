/**
 * The item lollipop's legend as the renderer sees it: the Niveau and average entries
 * built from its state, and the plan/stack layout resolved through the pure planner
 * (`itemLollipopLegendPlanner.js`) with the renderer's own measurer.
 */

import { HIDDEN_LEGEND_OPACITY } from '../../../../common/charts/markerSymbols.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import { getLevelGlossaryKey } from '../../../../common/services/competenceLevelPalette.js';
import { getItemLevelColor, getItemLevelOrdinal } from '../../../../common/domain/levels.js';
import {
    buildLegendStackConfig,
    resolveLegendPlan as planLegend,
} from './itemLollipopLegendPlanner.js';
import {
    comparisonLegendEntry,
    comparisonMarkerLegendPaint,
    comparisonSeriesVisual,
} from '../../../../common/charts/comparisonSeries.js';

/** @typedef {import('./itemLollipopChart.js').ItemData} ItemData */

/**
 * Color for an item's Aufgabenniveau. Item levels are on the fixed `A1.1 … C1.2` scale
 * and the reporting scale is whatever the state published; `getItemLevelColor` resolves
 * the item's own level, its band, or the reporting level of the same KMK standard.
 *
 * For task rows with a competenceLevelsRaw array, uses the highest level for coloring.
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 * @param {string|number} competenceLevel - Item level as sent (e.g. 'B1.2')
 * @param {object} [item] - Full item/task data object (optional, for task row detection)
 * @returns {string} CSS color value
 */
export function getNiveauColor(chart, competenceLevel, item) {
    return (
        getItemLevelColor(resolveNiveauLevel(competenceLevel, item)) ??
        getThemeColors().chrome.primaryBrand
    );
}

/**
 * The level a mark stands for: a task row takes the highest of its items' levels.
 * @param {string|number} competenceLevel - Item level as sent (e.g. 'B1.2')
 * @param {object} [item] - Full item/task data object (optional, for task row detection)
 * @returns {string|number} The level to resolve the colour from.
 */
function resolveNiveauLevel(competenceLevel, item) {
    if (item?.isTaskRow && item.competenceLevelsRaw?.length > 0) {
        return item.competenceLevelsRaw[item.competenceLevelsRaw.length - 1]; // sorted ascending
    }
    return competenceLevel;
}

/**
 * Build niveau legend item descriptors from current items (shared between measurement and rendering)
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 * @param {ItemData[]} items - Items with competenceLevel values
 * @returns {Array} Legend item descriptors
 */
function buildNiveauLegendItems(chart, items) {
    // Cache on first call so the legend always shows every level visible at
    // initialisation, even when a domain switch reduces the visible item set.
    if (chart.chartState.stableNiveauLegendItems) {
        return chart.chartState.stableNiveauLegendItems;
    }

    const allNiveaus = new Set();
    for (const item of items) {
        if (item.isTaskRow && (item.competenceLevelsRaw?.length ?? 0) > 0) {
            for (const n of item.competenceLevelsRaw ?? []) allNiveaus.add(String(n));
        } else if (item.competenceLevel && item.competenceLevel !== 'N/A') {
            allNiveaus.add(String(item.competenceLevel));
        }
    }
    const uniqueNiveaus = [...allNiveaus].sort(
        (a, b) => getItemLevelOrdinal(a) - getItemLevelOrdinal(b),
    );

    const result = uniqueNiveaus.map((niveau) => {
        return {
            label: niveau,
            // Resolved against the registered scale rather than lowercased by hand:
            // the per-level texts come from the payload now, so a hand-built key is
            // stamped whether or not anything answers to it and leaves a `cursor:help`
            // label whose popup never opens. Null when the payload described nothing.
            glossaryKey: getLevelGlossaryKey(niveau),
            color: getNiveauColor(chart, niveau),
            symbol: 'lollipop',
        };
    });
    chart.chartState.stableNiveauLegendItems = result;
    return result;
}

/**
 * Build average legend item descriptors (shared between measurement and rendering)
 * @returns {Array} Legend item descriptors
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 */
function buildAverageLegendItems(chart) {
    const theme = getThemeColors(true);
    // One marker per item leaves no room for a per-mark tag here, so the shade is
    // what separates several Landesschnitte in the plot and the ordinal in the
    // legend names which shade is which.
    return chart.comparisonGroups.map((group) => ({
        ...comparisonLegendEntry(group, theme),
        ...comparisonMarkerLegendPaint(group, theme),
        symbol: comparisonSeriesVisual(group).symbol,
        className: group.legendClass,
        opacity: chart.visibilityState[group.id] ? 1 : HIDDEN_LEGEND_OPACITY,
    }));
}

/**
 * Build the current legend plan (right vs. bottom + its stack config). The pure
 * fit-to-slot decision lives in the planner; this adapts it to renderer state —
 * the item descriptors, layout padding, and the LegendRenderer measurer.
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 * @param {any[]} items - The drawn items, which decide how many Niveau entries the legend needs.
 * @param {{containerWidth: number, containerHeight: number, axisLeftSpace: number, axisBottomSpace: number}} measurements - The space the chart actually has, measured after the axes.
 * @param {'right'|'bottom'|null} [forcedPosition] - Overrides the fit decision, for callers that already know where the legend must go.
 * @returns {{position: 'right'|'bottom', legendStackConfig: any, stackAlign: 'start'|'center'}} Where the legend goes and the stack config to render it with.
 */
export function resolveLegendPlanForChart(chart, items, measurements, forcedPosition = null) {
    return planLegend({
        niveauItems: buildNiveauLegendItems(chart, items),
        averageItems: buildAverageLegendItems(chart),
        measurements,
        layoutPadding: chart.options.layout?.padding,
        measureStackLayout: (stacked, stackOptions) =>
            chart.legend.resolveStackedLegendLayout(stacked, stackOptions),
        forcedPosition,
    });
}

/**
 * Measure the stacked legend for the current items through the renderer's legend measurer.
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 * @param {Array<object>} items - The drawn items.
 * @param {object} [options] - Stack options: position and the slot's max width/height.
 * @returns {object} The measured stack layout.
 */
function resolveLegendStackLayout(chart, items, options = {}) {
    const legendStackConfig = buildLegendStackConfig(
        buildNiveauLegendItems(chart, items),
        buildAverageLegendItems(chart),
        options,
    );
    return chart.legend.resolveStackedLegendLayout(
        legendStackConfig.stacked,
        legendStackConfig.stackOptions,
    );
}

/**
 * Update the current stacked legend when item-level legend entries change.
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 * @param {ItemData[]} items - Items with competenceLevel values
 * @param {object | null} [stackLayout] - A layout already measured by the caller; omitted, it is measured here.
 */
export function updateLegendStack(chart, items, stackLayout = null) {
    chart.svg.select('.niveau-legend').remove();
    chart.svg.select('.average-legend').remove();

    const slot = chart.layout?.legends?.[0];
    const resolvedStackLayout =
        stackLayout ??
        resolveLegendStackLayout(chart, items, {
            position: slot?.position,
            maxHeight: slot?.position === 'right' ? slot?.height : undefined,
            maxWidth: slot?.position === 'bottom' ? slot?.width : undefined,
        });
    chart.legend.createLegendStack({
        svg: chart.svg,
        stackLayout: resolvedStackLayout,
        slot,
        align: slot?.position === 'bottom' ? 'center' : 'start',
    });
}
