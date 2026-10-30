/**
 * Self-Efficacy Stacked Bar — the Selbstwirksamkeit rating distribution per group as a
 * lying 0–100 % stack, the bands in rating order. One row per group with an HTML
 * legend panel, or a thumbnail (no legend, axes or tooltips).
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import {
    createSVGStackedBar,
    joinStackedBarRows,
} from '../../../../common/charts/renderers/stackedBarBuilder.js';
import { appendAxisGroup, appendPercentAxis } from '../../../../common/charts/chartAxisUtils.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { bandBar } from '../../../../common/charts/chartDefaults.js';
import { STUDENT_SHARE_AXIS_TITLE, TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { ratingBandTooltip } from '../../../utils/slBoxPlotStats.js';
import { surveyRowKey } from '../../../utils/slSurveyDerivation.js';
import { GROUP_ROW_PADDING_RATIO, groupNameOf } from './selfEfficacyRows.js';
import {
    drawNameAxis,
    measureBandFrame,
    paddedBandScale,
    percentValueAxis,
} from '../../../../common/charts/bandChartFrame.js';
import {
    buildRatingBuckets,
    RATING_STATS_COLUMNS,
    ratingStatsCells,
} from '../../../utils/slRatingAppearance.js';
import { buildRatingKeyBlock } from '../competence/shared/competenceLegend.js';
import { formatSegmentShare } from '../../../../common/utils/stackedBarUtils.js';
import * as d3 from 'd3';

/** @typedef {import('./selfEfficacyConfig.js').SelfEfficacyRow} SelfEfficacyRow */
/** @typedef {import('../../../utils/slRatingAppearance.js').RatingBucket & {groupName: string, mean: number}} RatingSegment */

/**
 * A group's rating bands as bar segments, each carrying the group for its tooltip.
 * @param {SelfEfficacyRow} groupData
 * @returns {RatingSegment[]}
 */
function ratingSegments(groupData) {
    return buildRatingBuckets(groupData.distribution).map((bucket) => ({
        ...bucket,
        groupName: groupData.groupName,
        mean: groupData.statistics.mean,
    }));
}

export class SelfEfficacyStackedBar extends ChartRenderer {
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
     * The side panel: a pill per row and the rating swatches.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
     */
    chartKey() {
        return [
            {
                title: TERM_CONSTANTS.GROUPS,
                group: 'row',
                items: this.rows.map((d) => ({ key: surveyRowKey(d), label: d.groupName })),
            },
            buildRatingKeyBlock(TERM_CONSTANTS.RATING),
        ];
    }

    /**
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` while no bar is drawn.
     */
    dataTable() {
        const rows = this.rows.filter((row) => this.isSeriesShown(surveyRowKey(row), 'row'));
        if (rows.length === 0) return null;
        return {
            columns: [{ label: TERM_CONSTANTS.VALUE_GROUP }, ...RATING_STATS_COLUMNS],
            rows: rows.map((row) => [
                { text: row.groupName },
                ...ratingStatsCells({
                    count: row.count,
                    distribution: row.distribution,
                    mean: row.statistics.mean,
                }),
            ]),
        };
    }

    /**
     * @param {RatingSegment} segment
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent} The band's rows, with the group mean under them.
     * @override
     */
    formatTooltipContent(segment) {
        return ratingBandTooltip(segment, { title: segment.groupName, mean: segment.mean });
    }

    /**
     * Draw the rating distribution, or move the drawn bars to the rows the legend leaves
     * on: the bars join by row, so a toggle moves the rows that stay, fits their labels
     * to the new height, and fades out the row it hides.
     * @override
     */
    renderChart() {
        const allValidData = this.rows;
        const durationMs = this.drawDurationMs;

        // The row pills (their state kept across re-renders) decide which rows are drawn.
        const validData = allValidData.filter((d) => this.isSeriesShown(surveyRowKey(d), 'row'));

        // A thumbnail draws no axes and keeps its preset's zero axis space.
        const axisOverrides = this.options.thumbnail
            ? undefined
            : measureBandFrame(this, true, {
                  names: allValidData.map((row) => row.groupName),
                  ...percentValueAxis(this),
              });

        const { g, layout } = this.initializeSVG(axisOverrides);

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        const xScale = d3.scaleLinear().domain([0, 100]).range([0, chartWidth]);
        const yScale = paddedBandScale(
            validData.map(surveyRowKey),
            chartHeight,
            GROUP_ROW_PADDING_RATIO,
        );

        if (!this.options.thumbnail) {
            appendPercentAxis(g, 'bottom', xScale, chartHeight).attr(
                'transform',
                `translate(0,${chartHeight})`,
            );

            this.renderAxisTitle(g, 'bottom', STUDENT_SHARE_AXIS_TITLE);

            drawNameAxis(this, appendAxisGroup(g, 'y-axis', { baseline: true }), yScale, {
                horizontal: true,
                nameOf: groupNameOf(this.rows),
            });
        }

        // A few rows in a tall card would make slabs: the bar is capped and centred in
        // its row.
        const { size: barSize, offset: inset } = bandBar(yScale);
        /** @type {import('../../../../common/charts/renderers/stackedBarBuilder.js').StackedBarTooltip<RatingSegment>} */
        const tooltip = { getTooltipContent: (segment) => this.formatTooltipContent(segment) };
        joinStackedBarRows(selectOrAppend(g, 'g', 'rating-bars'), validData, {
            key: surveyRowKey,
            place: (row) => `translate(0,${(yScale(surveyRowKey(row)) ?? 0) + inset})`,
            durationMs,
            draw: (bar, row) => {
                createSVGStackedBar(
                    bar,
                    ratingSegments(row),
                    {
                        isHorizontal: true,
                        xScale,
                        barSizePx: barSize,
                        showLabels: !this.options.thumbnail,
                        labelFormatter: formatSegmentShare,
                        tooltip,
                        durationMs,
                    },
                    this,
                );
            },
        });

        // Every row has data, so no row drawn means the viewer hid them all: the frame
        // stays (its space is measured over every row) and the last bar fades out under
        // the sentence.
        if (validData.length === 0) this.renderAllHiddenOverlay();
    }
}
