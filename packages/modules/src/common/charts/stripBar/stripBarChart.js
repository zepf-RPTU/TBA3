/**
 * StripBarChart — one distribution as a single lying 0–100 % stacked bar with no axes
 * or legend: each segment names itself and its share where it has room, and carries its
 * own tooltip. A segment click and the highlight are optional: each acts only when
 * passed.
 */

import { createState } from '@tba3/module-base';
import * as d3 from 'd3';
import { ChartRenderer } from '../renderers/chartRenderer.js';
import { createSVGStackedBar } from '../renderers/stackedBarBuilder.js';
import { bandBar } from '../chartDefaults.js';
import { paddedBandScale } from '../bandChartFrame.js';
import { selectOrAppend } from '../selectOrAppend.js';
import { levelShareLabelFormatter } from '../../utils/stackedBarUtils.js';
import { TERM_CONSTANTS } from '../../domain/terms.js';
import { shareCountCell, shareCountColumn } from '../dataTableCells.js';
import { formatCount } from '../../utils/numberFormat.js';

/**
 * One segment of the strip: a stacked segment with its tooltip, and the headcount its
 * label shows when it has one.
 * @typedef {import('../../utils/stackedBarUtils.js').StackedSegment & {
 *     count?: number,
 *     tooltip: import('../../services/cursorTooltip.js').TooltipContent,
 * }} StripSegment
 */

/**
 * What a StripBarChart is built with besides its segments.
 * @typedef {object} StripBarChartOptions
 * @property {string} rowLabel - Whose distribution the strip is (the group, the school): its data table's row head.
 * @property {(field: string) => void} [onSegmentClick] - Called with a clicked segment's field; without it the segments are not clickable.
 * @property {string[]|import('@preact/signals-core').Signal<string[]>} [highlightedKeys] - The fields drawn highlighted; a host's signal is shared, so a write to it redraws the strip.
 */

/**
 * `III · 36 % (9)` when the segment holds it, the label alone otherwise; the count only
 * when the segment carries one.
 * @param {StripSegment} segment
 * @param {{withShare: boolean, lines?: boolean}} [tier] - The label tier that fits.
 * @returns {string|string[]} The label, one string per line.
 */
function stripLabel(segment, tier) {
    const label = levelShareLabelFormatter(segment, tier);
    if (!tier?.withShare || segment.count === undefined) return label;
    const count = `(${formatCount(segment.count)})`;
    return Array.isArray(label) ? [label[0], `${label[1]} ${count}`] : `${label} ${count}`;
}

export class StripBarChart extends ChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {StripSegment[]} segments - In stacking order.
     * @param {import('../renderers/chartRenderer.js').ChartRendererOptions & StripBarChartOptions} options
     */
    constructor(container, segments, options) {
        super(container, {
            ...options,
            layout: options.thumbnail ? {} : { padding: { top: 10, bottom: 6 } },
        });

        /** @type {StripSegment[]} */
        this.segments = segments;

        /** @type {import('@tba3/module-base').State<{highlightedKeys: string[]}>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<{highlightedKeys: string[]}>} */ ({
                highlightedKeys: options.highlightedKeys ?? [],
            }),
        );
    }

    /**
     * A strip whose segments are all empty (no headcount) draws nothing.
     * @override
     */
    validateData() {
        return this.segments.some((segment) => segment.percentage > 0);
    }

    /**
     * The strip as a one-row table: per segment its share with its headcount. Segments
     * that carry no headcount show their shares alone.
     * @override
     * @returns {import('../host/chartDataTable.js').ChartDataTable|null} `null` while the strip draws nothing.
     */
    dataTable() {
        if (!this.validateData()) return null;
        return {
            columns: [
                { label: TERM_CONSTANTS.VALUE_GROUP },
                ...this.segments.map((segment) => shareCountColumn(segment.label)),
            ],
            rows: [
                [
                    { text: this.options.rowLabel },
                    ...this.segments.map((segment) =>
                        shareCountCell(segment.percentage, segment.count),
                    ),
                ],
            ],
        };
    }

    /**
     * @override
     * @param {StripSegment} segment
     * @returns {import('../../services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent(segment) {
        return segment.tooltip;
    }

    /** @override */
    renderChart() {
        const { g, layout } = this.initializeSVG();
        const { width, height } = layout.chart;
        const { onSegmentClick } = this.options;
        const { size: barSizePx, offset } = bandBar(paddedBandScale(['strip'], height, 0));
        const bar = selectOrAppend(g, 'g', 'strip-bar').attr('transform', `translate(0,${offset})`);

        createSVGStackedBar(
            bar,
            this.segments,
            {
                isHorizontal: true,
                xScale: d3.scaleLinear().domain([0, 100]).range([0, width]),
                barSizePx,
                highlightedKeys: this.state.highlightedKeys.value,
                showLabels: !this.options.thumbnail,
                labelFormatter: stripLabel,
                tooltip: {
                    getTooltipContent: (segment) => this.formatTooltipContent(segment),
                    onClick: onSegmentClick ? (segment) => onSegmentClick(segment.field) : null,
                },
                durationMs: this.drawDurationMs,
            },
            this,
        );
    }
}
