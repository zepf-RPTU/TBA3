/**
 * Self-Efficacy Box Plot — the distribution of per-student Selbstwirksamkeit means
 * per group as a box plot, one lying box per group; as a thumbnail, boxes only.
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { boxWidthFor, drawBoxPlotFigure, joinBoxPlotFigures } from '../shared/boxPlotFigure.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { boxPlotKey } from '../shared/boxPlotKey.js';
import { BOX_STATS_COLUMNS, boxPlotTooltip, boxStatsCells } from '../../../utils/slBoxPlotStats.js';
import { surveyRowKey } from '../../../utils/slSurveyDerivation.js';
import { RATING_DOMAIN } from '../../../../common/domain/apiValueMaps.js';
import {
    appendAxisGroup,
    appendGridLines,
    createRatingAxis,
    measureRatingAxisSpace,
    measureRatingEdgeTickReserve,
} from '../../../../common/charts/chartAxisUtils.js';
import * as d3 from 'd3';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { SL_SERIES_COLORS } from '../../../utils/slRatingAppearance.js';
import { GROUP_ROW_PADDING_RATIO, groupNameOf } from './selfEfficacyRows.js';
import {
    drawNameAxis,
    measureBandFrame,
    paddedBandScale,
} from '../../../../common/charts/bandChartFrame.js';

/** @typedef {import('./selfEfficacyConfig.js').SelfEfficacyRow} SelfEfficacyRow */
/** @typedef {import('../../../utils/slBoxPlotStats.js').BoxPlotStats} BoxPlotStats */

/** The value axis reads each student's mean Selbstwirksamkeit rating. */
const SELF_EFFICACY_AXIS_TITLE = TERM_CONSTANTS.SELF_EFFICACY;

export class SelfEfficacyBoxPlot extends ChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {SelfEfficacyRow[]} rows
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions} options
     */
    constructor(container, rows, options) {
        super(container, {
            legend: 'side',
            ...options,
            layout: options.thumbnail
                ? {}
                : { padding: { top: 10, right: 10, bottom: 10, left: 10 } },
        });

        /** @type {SelfEfficacyRow[]} */
        this.rows = rows;
    }

    /** @override */
    validateData() {
        return this.rows.length > 0;
    }

    /**
     * The side panel: how to read the box plot.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
     */
    chartKey() {
        return boxPlotKey();
    }

    /**
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` without a row.
     */
    dataTable() {
        if (this.rows.length === 0) return null;
        return {
            columns: [{ label: TERM_CONSTANTS.VALUE_GROUP }, ...BOX_STATS_COLUMNS],
            rows: this.rows.map((row) => [
                { text: row.groupName },
                ...boxStatsCells(row.statistics, row.count),
            ]),
        };
    }

    /**
     * @param {{boxData: SelfEfficacyRow, stats: BoxPlotStats}} segment
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     * @override
     */
    formatTooltipContent(segment) {
        const { boxData, stats } = segment;
        return boxPlotTooltip(stats, { title: boxData.groupName, count: boxData.count });
    }

    /**
     * Draw the scales and grid, and one lying box per group in its row — the rows the
     * stacked bar draws, so a mode switch keeps the groups where they were. A redraw
     * moves the boxes already drawn, joined by group.
     * @override
     */
    renderChart() {
        const rows = this.rows;
        const durationMs = this.drawDurationMs;

        const { g, layout } = this.initializeSVG(this.#measureAxes());
        const { width, height } = layout.chart;
        const bandScale = paddedBandScale(rows.map(surveyRowKey), height, GROUP_ROW_PADDING_RATIO);
        const valueScale = d3.scaleLinear().domain(RATING_DOMAIN).range([0, width]);
        const boxWidth = boxWidthFor(bandScale.bandwidth());
        const color = SL_SERIES_COLORS.selfEfficacy;

        if (!this.options.thumbnail) {
            this.#drawAxes(g, { bandScale, valueScale, height });
        }

        const chart = this;
        joinBoxPlotFigures(
            selectOrAppend(g, 'g', 'box-figures'),
            rows,
            surveyRowKey,
            durationMs,
        ).each(function (boxData) {
            const stats = boxData.statistics;
            const hitArea = drawBoxPlotFigure(d3.select(this), stats, {
                center:
                    /** @type {number} */ (bandScale(surveyRowKey(boxData))) +
                    bandScale.bandwidth() / 2,
                boxWidth,
                valueScale,
                color,
                horizontal: true,
                durationMs,
            });
            chart.wireTooltipEvents(hitArea, {
                getTooltipContent: () => chart.formatTooltipContent({ boxData, stats }),
                hoverEffect: 'band',
            });
        });
    }

    /**
     * Axis space: the titled rating axis, and the group names wrapped over up to two
     * lines beside the rows. A thumbnail draws no axes.
     * @returns {{[side: string]: number}} The axis overrides `initializeSVG` takes.
     */
    #measureAxes() {
        if (this.options.thumbnail) return { left: 0, bottom: 0 };
        const ratingOptions = {
            min: RATING_DOMAIN[0],
            max: RATING_DOMAIN[1],
            axisTitleText: SELF_EFFICACY_AXIS_TITLE,
        };
        return measureBandFrame(this, true, {
            names: this.rows.map((row) => row.groupName),
            valueAxis: (side) => measureRatingAxisSpace(this, side, ratingOptions),
            // The last rating label overhangs the plot's right edge.
            edgeReserve: () => measureRatingEdgeTickReserve(this, RATING_DOMAIN[1]),
        });
    }

    /**
     * Draw the rating axis with its gridlines and title, and the group axis with its
     * names wrapped and fitted; the tooltip carries a name in full. Drawn before the
     * boxes: the grid sits behind them.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} g
     * @param {{bandScale: d3.ScaleBand<string>, valueScale: d3.ScaleLinear<number, number>, height: number}} geometry
     */
    #drawAxes(g, { bandScale, valueScale, height }) {
        const ratingAxis = createRatingAxis('bottom', valueScale);
        appendGridLines(g, 'bottom', ratingAxis, height);
        appendAxisGroup(g, 'x-axis').attr('transform', `translate(0, ${height})`).call(ratingAxis);
        this.renderAxisTitle(g, 'bottom', SELF_EFFICACY_AXIS_TITLE);

        const nameGroup = appendAxisGroup(g, 'y-axis', { baseline: true });
        drawNameAxis(this, nameGroup, bandScale, {
            horizontal: true,
            nameOf: groupNameOf(this.rows),
        });
    }
}
