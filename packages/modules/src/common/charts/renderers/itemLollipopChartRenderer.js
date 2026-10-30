/**
 * Base of the item lollipops: each item's solution
 * rate as a lollipop coloured by its Aufgabenniveau on a 0–100 % axis, with every
 * comparison group's per-item mean as a marker on its stem.
 */

import * as d3 from 'd3';
import { ChartRenderer } from './chartRenderer.js';
import { joinLollipops } from './lollipopMarks.js';
import { appendPercentAxis, measurePercentAxisSpace } from '../chartAxisUtils.js';
import { compareLevelLabels } from '../../domain/levels.js';
import { getItemCompetenceLevelFill } from '../../services/itemCompetenceLevelAppearance.js';
import { SOLUTION_RATE_AXIS_TITLE, TERM_CONSTANTS } from '../../domain/terms.js';
import { selectOrAppend } from '../selectOrAppend.js';
import { joinComparisonMarkers } from '../averageMarkers.js';
import {
    comparisonMarkerLegendItem,
    comparisonSeriesLabel,
    comparisonTooltipRows,
    visibleComparisonGroups,
} from '../comparisonSeries.js';
import { mapItemComparisonAverageData } from '../../domain/itemComparisonGroups.js';
import { figureCell, percentColumn } from '../dataTableCells.js';

/** @typedef {import('../../domain/itemComparisonGroups.js').ItemComparisonGroup} ItemComparisonGroup */

/**
 * What an item lollipop reads of an item.
 * @typedef {{iqbId: string, meanPercentage: number, competenceLevel: string}} LollipopItem
 */

/**
 * The Aufgabenniveau key every item lollipop carries: one entry per colour drawn, in
 * item-scale order (`Ia < Ib < II`, not alphabetical). Levels sharing a colour share an
 * entry, its label listing them, each linked to its own glossary text. The glossary key
 * is resolved against the registered scale, so a level the payload describes no text
 * for gets no `cursor: help` label whose popup never opens.
 * @param {import('../../services/competenceLevelPalette.js').CompetenceLevelPalette} palette - Holds the registered scales.
 * @param {string[]} levels - The levels of the drawn items; repeats are fine.
 * @returns {import('../legend/htmlLegendPanel.js').ChartKeyBlock}
 */
function itemCompetenceLevelLegendBlock(palette, levels) {
    // Colour → its levels, in scale order.
    const byColor = d3.group(
        [...new Set(levels)].sort((a, b) => compareLevelLabels(palette, a, b)),
        (level) => getItemCompetenceLevelFill(palette, level),
    );
    return {
        title: TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL_SHORT,
        items: [...byColor].map(([color, shared]) => ({
            label: shared.join(', '),
            labelSegments: shared.flatMap((level, i) => [
                ...(i > 0 ? [{ text: ', ', glossaryKey: null }] : []),
                { text: level, glossaryKey: palette.getLevelGlossaryKey(level) },
            ]),
            color,
        })),
    };
}

export class ItemLollipopChartRenderer extends ChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {import('./chartRenderer.js').ChartRendererOptions & {comparisonGroups: ItemComparisonGroup[], [key: string]: any}} options - `comparisonGroups`: the groups items.json carries means for.
     */
    constructor(container, options) {
        super(container, options);
        /** @type {ItemComparisonGroup[]} */
        this.comparisonGroups = options.comparisonGroups;
        this.setComparisonModes(this.comparisonGroups);
    }

    /**
     * The item lollipops' legend: the Niveau block, then one entry per comparison group.
     * One marker per item leaves no room for a per-mark tag, so the shade is what
     * separates several groups of one role in the plot, and the legend names which shade
     * is which.
     * @param {string[]} levels - The levels the Niveau block lists; repeats are fine.
     * @returns {import('../legend/htmlLegendPanel.js').ChartKey}
     */
    itemLollipopLegend(levels) {
        return [
            itemCompetenceLevelLegendBlock(this.context.palette, levels),
            { items: this.comparisonGroups.map((group) => comparisonMarkerLegendItem(group)) },
        ];
    }

    /**
     * The left axis reserve the solution-rate axis and its title take, px.
     * @returns {number}
     */
    measureSolutionRateAxis() {
        return measurePercentAxisSpace(this, 'left', { axisTitleText: SOLUTION_RATE_AXIS_TITLE });
    }

    /**
     * The 0–100 % solution-rate axis on the left, its gridlines behind the plot. The x
     * baseline is the chart's own.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g - The group the axis spans, from its top.
     * @param {object} options
     * @param {number} options.width - Plot width, px.
     * @param {number} options.height - Height the axis spans, px.
     * @returns {import('d3').ScaleLinear<number, number>} Percentage → y; 0 % is the baseline.
     */
    drawSolutionRateAxis(g, { width, height }) {
        const yScale = d3.scaleLinear().domain([0, 100]).range([height, 0]);
        appendPercentAxis(g, 'left', yScale, width);
        return yScale;
    }

    /**
     * The solution-rate axis title, centred on the plot's left edge.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g - The plot group.
     * @param {string} [glossaryKey] - The glossary entry the title opens.
     */
    drawSolutionRateTitle(g, glossaryKey) {
        this.renderAxisTitle(g, 'left', SOLUTION_RATE_AXIS_TITLE, { glossaryKey });
    }

    /**
     * Join the items as vertical lollipops on a 0–100 % scale, each coloured by its
     * Aufgabenniveau, with every comparison group's per-item mean as a marker on the
     * item's stem, keyed by item id so a redraw moves the marks already drawn.
     *
     * Stacking, in layers the first draw makes in this order: the stems and heads, the
     * comparison markers over the heads (never smaller, so a benchmark equal to the item
     * value still shows), and the items' hit bands over every mark, which carry the
     * tooltip (`itemComparisonRows` lists the markers' values in it). Every update
     * re-applies a group's visibility, so a re-entering marker follows the comparison
     * toggle.
     * @template {LollipopItem} TItem
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g - The plot group.
     * @param {TItem[]} items - The items, in draw order.
     * @param {object} options
     * @param {(d: {iqbId: string}) => number} options.x
     * @param {import('d3').ScaleLinear<number, number>} options.yScale - Percentage → y; 0 % is the baseline.
     * @param {number} options.stemWidthPx
     * @param {number} options.headRadiusPx
     * @param {number} options.durationMs - `0` applies at once.
     */
    joinItemLollipops(g, items, { x, yScale, stemWidthPx, headRadiusPx, durationMs }) {
        const { palette } = this.context;
        // Each level resolved once, not once per item.
        const fillByLevel = new Map(
            [...new Set(items.map((d) => d.competenceLevel))].map((level) => [
                level,
                getItemCompetenceLevelFill(palette, level),
            ]),
        );
        const lollipops = selectOrAppend(g, 'g', 'lollipops');
        const markerLayer = selectOrAppend(g, 'g', 'average-markers');
        const hitLayer = selectOrAppend(g, 'g', 'lollipop-hits');
        joinLollipops(this, lollipops, items, {
            key: (d) => d.iqbId,
            x,
            y: (d) => yScale(d.meanPercentage),
            baselineY: yScale(0),
            color: (d) => /** @type {string} */ (fillByLevel.get(d.competenceLevel)),
            stemWidthPx,
            headRadiusPx,
            durationMs,
            hitLayer,
            tooltip: { getTooltipContent: (d) => this.formatTooltipContent(d) },
        });
        joinComparisonMarkers(this, markerLayer, this.comparisonGroups, {
            baseClass: 'average-marker comparison-average-marker',
            dataFor: (group) => mapItemComparisonAverageData(group, items),
            key: (d) => d.iqbId,
            getX: x,
            getY: (d) => yScale(d.percentage),
            durationMs,
            transitionName: 'avg',
            fade: true,
        });
    }

    /**
     * The items drawn as a table: one row per item, in draw order, headed by the chart's
     * own item columns, then its solution rate and each shown comparison group's mean
     * for it.
     * @template {LollipopItem} TItem
     * @param {TItem[]} items - In draw order.
     * @param {object} head - What heads an item's row.
     * @param {import('../host/chartDataTable.js').ChartDataColumn[]} head.columns
     * @param {(item: TItem) => import('../host/chartDataTable.js').ChartDataCell[]} head.cells - An item's cells under them.
     * @returns {import('../host/chartDataTable.js').ChartDataTable|null} `null` with no item drawn.
     */
    itemDataTable(items, head) {
        if (items.length === 0) return null;
        const comparisons = visibleComparisonGroups(this.comparisonGroups, this.visibilityState);
        return {
            columns: [
                ...head.columns,
                percentColumn(TERM_CONSTANTS.SOLUTION_RATE),
                ...comparisons.map((group) => percentColumn(comparisonSeriesLabel(group))),
            ],
            rows: items.map((item) => [
                ...head.cells(item),
                figureCell(item.meanPercentage),
                ...comparisons.map((group) => figureCell(group.meanMap.get(item.iqbId))),
            ]),
        };
    }

    /**
     * The tooltip rows of an item's comparison markers: each shown group's mean for the
     * item. A group without a mean for it has no row.
     * @param {{iqbId: string}} item - The hovered item.
     * @returns {import('../../services/cursorTooltip.js').TooltipRow[]}
     */
    itemComparisonRows(item) {
        return comparisonTooltipRows(this.comparisonGroups, this.visibilityState, (group) =>
            group.meanMap.get(item.iqbId),
        );
    }
}
