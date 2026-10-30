/**
 * The Unterrichtsqualität layer of the competence detail chart: box plots or stacked bars
 * beside the competence bars, the right-hand rating axis and the tooltips. Every draw
 * brings the marks drawn into a slot last pass to the slot's width and the current
 * `vizMode`, so a legend toggle or a mode switch redraws in place.
 */

import { BOX_FIGURE_COMPACT, boxWidthFor, drawBoxPlotFigure } from '../../shared/boxPlotFigure.js';
import { boxPlotTooltip, ratingBandTooltip } from '../../../../utils/slBoxPlotStats.js';
import { SL_SERIES_COLORS, buildRatingBuckets } from '../../../../utils/slRatingAppearance.js';
import { appendAxisGroup, createRatingAxis } from '../../../../../common/charts/chartAxisUtils.js';
import { drawBarTopLabel } from '../shared/competenceBar.js';
import { VIZ_MODES } from '../../../../slVizModes.js';
import { createSVGStackedBar } from '../../../../../common/charts/renderers/stackedBarBuilder.js';
import { animate } from '../../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../../common/charts/selectOrAppend.js';
import { rowHasTeachingQuality } from './competenceDetailData.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { asDataMark } from '../../../../../common/services/dataMark.js';

/** A rating column's bar width as a share of its slot: narrower than the competence-level bars beside it. */
const TQ_BAR_WIDTH_RATIO = 0.5;

/**
 * @typedef {import('./competenceDetailData.js').CompetenceChartRow & {teachingQuality: import('./competenceDetailData.js').TeachingQualityStats}} RowWithTeachingQuality
 */

/**
 * @typedef {object} TeachingQualityOverlay
 * @property {d3.ScaleLinear<number, number>} yScale - The rating bars' percentage scale.
 * @property {d3.ScaleLinear<number, number>} yScaleQuality - The box plots' Unterrichtsqualität scale.
 * @property {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig - Decides what a slot is.
 * @property {number} barWidth - Width of a slot, the same as every bar's.
 * @property {boolean} labels - Whether the `Q` tags are drawn; the watermark draws none.
 * @property {number} durationMs - How long the drawn marks move (`ChartRenderer.drawDurationMs`).
 */

const CSS_CLASSES = Object.freeze({
    Y_AXIS_QUALITY: 'y-axis-quality',
    TQ_LABEL: 'teaching-quality-label',
});

/** Title of the right-hand rating axis, measured by the renderer and drawn here. */
export const TEACHING_QUALITY_AXIS_TITLE = TERM_CONSTANTS.TEACHING_QUALITY;

/** The tag above a Unterrichtsqualität mark, which the legend spells out. */
export const TEACHING_QUALITY_TAG = 'Q';

/**
 * @param {RowWithTeachingQuality} data - The row hovered.
 * @param {import('../../../../utils/slRatingAppearance.js').RatingBucket|null} [segment] - The hovered rating band; none for the box plot.
 * @returns {import('../../../../../common/services/cursorTooltip.js').TooltipContent}
 */
function formatTeachingQualityTooltipContent(data, segment = null) {
    const tq = data.teachingQuality;
    const subtitle = TERM_CONSTANTS.TEACHING_QUALITY_MEASURE;

    if (segment) {
        return ratingBandTooltip(segment, { title: data.name, subtitle, mean: tq.mean });
    }

    // The tooltip every SL box plot shows, plus the number of students rated.
    return boxPlotTooltip(tq, { title: data.name, subtitle, count: tq.count });
}

/**
 * The rows whose Unterrichtsqualität each group's slot shows: the first carrying one.
 * The rows are sorted group → school, so a group's mark wins over the school's.
 * @param {import('./competenceDetailData.js').CompetenceChartRow[]} chartData
 * @param {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @returns {Map<string, RowWithTeachingQuality>} One row per group key.
 */
export function resolveTeachingQualityEntries(chartData, groupingConfig) {
    /** @type {Map<string, RowWithTeachingQuality>} */
    const entries = new Map();
    for (const row of chartData) {
        const key = groupingConfig.getGroupKey(row);
        if (rowHasTeachingQuality(row) && !entries.has(key)) {
            entries.set(key, /** @type {RowWithTeachingQuality} */ (row));
        }
    }
    return entries;
}

/**
 * The `Q` tag above a Unterrichtsqualität mark.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} slot
 * @param {number} centerX - Horizontal centre in px.
 * @param {number} durationMs - How long a drawn tag moves.
 */
function drawQualityLabel(slot, centerX, durationMs) {
    drawBarTopLabel(slot, {
        className: CSS_CLASSES.TQ_LABEL,
        x: centerX,
        lines: [TEACHING_QUALITY_TAG],
        durationMs,
    });
}

/**
 * The group of `className` the slot's marks are drawn into: the one drawn last pass, or
 * a new one ahead of the `Q` tag, which stays on top. The other mode's group leaves.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} slot
 * @param {string} className - `box-figure` or `tq-bars`.
 * @param {string} otherClassName - The other mode's group.
 * @returns {{group: d3.Selection<SVGGElement, unknown, any, any>, isNew: boolean}}
 */
function markGroup(slot, className, otherClassName) {
    slot.selectChildren(`g.${otherClassName}`).interrupt().remove();
    let isNew = false;
    const group = selectOrAppend(slot, 'g', className, (created) => {
        isNew = true;
        asDataMark(created.lower());
    });
    return { group, isNew };
}

/**
 * Draw one Unterrichtsqualität box plot into its slot.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer
 * @param {d3.Selection<SVGGElement, unknown, any, any>} slot
 * @param {RowWithTeachingQuality} d
 * @param {TeachingQualityOverlay} overlay
 */
function drawTeachingQualityBoxPlot(
    renderer,
    slot,
    d,
    { yScaleQuality, barWidth, labels, durationMs },
) {
    const tq = d.teachingQuality;
    const centerX = barWidth / 2;

    // The shared box-plot figure at overlay weight: the line inside the box is the
    // median wherever it is drawn.
    const hitArea = drawBoxPlotFigure(markGroup(slot, 'box-figure', 'tq-bars').group, tq, {
        center: centerX,
        boxWidth: boxWidthFor(barWidth, BOX_FIGURE_COMPACT),
        valueScale: yScaleQuality,
        color: SL_SERIES_COLORS.teachingQuality,
        style: BOX_FIGURE_COMPACT,
        durationMs,
    });

    if (labels) drawQualityLabel(slot, centerX, durationMs);

    renderer.wireTooltipEvents(hitArea, {
        getTooltipContent: () => formatTeachingQualityTooltipContent(d),
        hoverEffect: 'band',
    });
}

/**
 * Draw one Unterrichtsqualität rating column into its slot, as an alternative to the box
 * plot. A row carries teaching quality only with statistics, so with a rated student.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer
 * @param {d3.Selection<SVGGElement, unknown, any, any>} slot
 * @param {RowWithTeachingQuality} d
 * @param {TeachingQualityOverlay} overlay
 */
function drawTeachingQualityStackedBar(
    renderer,
    slot,
    d,
    { yScale, barWidth, labels, durationMs },
) {
    const distribution = buildRatingBuckets(d.teachingQuality.distribution);

    // The shared stacked-bar helper, so the rating buckets get the same surface gap as
    // the competence bars beside them — at half their width and centred in the slot, so
    // a rating column is visibly a different object from the 0–100 % bars.
    const tqBarWidth = barWidth * TQ_BAR_WIDTH_RATIO;
    const { group: column, isNew } = markGroup(slot, 'tq-bars', 'box-figure');
    animate(column, { durationMs: isNew ? 0 : durationMs }).attr(
        'transform',
        `translate(${(barWidth - tqBarWidth) / 2}, 0)`,
    );
    createSVGStackedBar(
        column,
        distribution,
        {
            isHorizontal: false,
            yScale,
            barSizePx: tqBarWidth,
            context: d,
            tooltip: {
                getTooltipContent: (segment, bar) =>
                    formatTeachingQualityTooltipContent(bar, segment),
            },
            durationMs,
        },
        renderer,
    );

    if (labels) drawQualityLabel(slot, barWidth / 2, durationMs);
}

/**
 * Draw the active Unterrichtsqualität overlay into each shown slot, or bring the marks
 * drawn there to it: box plots on the rating scale, or rating bars on the percentage
 * scale, per the renderer's `vizMode`.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer
 * @param {Map<string, d3.Selection<SVGGElement, unknown, any, any>>} slots - The shown slots, by group key.
 * @param {TeachingQualityOverlay} overlay
 */
export function drawTeachingQualityOverlay(renderer, slots, overlay) {
    const draw =
        renderer.state.vizMode.value === VIZ_MODES.BOXPLOT
            ? drawTeachingQualityBoxPlot
            : drawTeachingQualityStackedBar;
    resolveTeachingQualityEntries(renderer.chartData, overlay.groupingConfig).forEach(
        (row, key) => {
            const slot = slots.get(key);
            if (slot) draw(renderer, slot, row, overlay);
        },
    );
}

/**
 * Render the TQ right-hand rating axis and its title, in box-plot mode only (the
 * caller decides): the box plots are the one overlay on the rating scale. The axis's
 * ticks are standard; its title carries the box plots' colour, naming which marks the
 * second scale belongs to.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer - The chart renderer, for the axis title.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The plot group the axis is drawn into.
 * @param {d3.ScaleLinear<number, number>} yScaleQuality - The Unterrichtsqualität scale.
 * @param {number} chartWidth - Where the right-hand axis sits.
 */
export function renderTeachingQualityAxis(renderer, g, yScaleQuality, chartWidth) {
    appendAxisGroup(g, CSS_CLASSES.Y_AXIS_QUALITY)
        .attr('transform', `translate(${chartWidth}, 0)`)
        .call(createRatingAxis('right', yScaleQuality));

    renderer.renderAxisTitle(g, 'right', TEACHING_QUALITY_AXIS_TITLE, {
        accent: SL_SERIES_COLORS.teachingQuality,
    });
}

/**
 * Take the TQ right-hand rating axis and its title away: the rating bars sit on the
 * percentage scale, so a switch to them leaves the second scale nothing to measure.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The plot group the axis was drawn into.
 */
export function removeTeachingQualityAxis(g) {
    g.selectChildren(`g.${CSS_CLASSES.Y_AXIS_QUALITY}`).remove();
    g.selectChildren('text.axis-label[data-axis-title="right"]').remove();
}
