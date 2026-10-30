/**
 * One stacked Kompetenzstufen bar of the SL competence charts, drawn from the row it
 * stands for: its segments are the row's own shares, and its tooltip counts the row's own
 * students. Also the label above a bar or an Unterrichtsqualität slot: its lines, the
 * height it needs and its drawing.
 */

import {
    buildStackedSegments,
    levelShareLabelFormatter,
} from '../../../../../common/utils/stackedBarUtils.js';
import { createSVGStackedBar } from '../../../../../common/charts/renderers/stackedBarBuilder.js';
import {
    BAR_TOP_LABEL_OFFSET_PX,
    appendBarTopLabel,
    appendLabelLines,
    fitLabelLines,
    measureLabelBlockHeight,
} from '../../../../../common/charts/chartLabelFit.js';
import { fontWeightToken } from '../../../../../common/utils/fontTokens.js';
import { animate } from '../../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../../common/charts/selectOrAppend.js';

/**
 * The figures one bar draws: its share, count and headcount per band, on its ladder.
 * @typedef {object} CompetenceBarRow
 * @property {import('./competenceChartData.js').LevelFigures} percentages - Share per band in percent.
 * @property {import('./competenceChartData.js').LevelFigures|null} counts - Headcount per band; `null` where none was delivered.
 * @property {number|null} total - Headcount the shares are of.
 * @property {string|undefined} scaleId - The ladder the bands sit on.
 * @property {string} [type] - The row's kind (`group`, `school`, `comparison`), which names the bar's class.
 */

/**
 * Draw the stacked bar for `row` into `g`, which holds this one bar, or bring the one
 * drawn there last pass up to date: its segments join by level, so a level the
 * Kompetenzstufen legend hides leaves its bar (the levels above close the gap), and one
 * shown again comes back in its place. The bar's group is bound to the row.
 * @template {import('d3').BaseType} E
 * @template D
 * @param {import('d3').Selection<E, D, any, any>} g - The group the bar is drawn into.
 * @param {CompetenceBarRow} row
 * @param {object} options
 * @param {string[]} options.levels - The scale's bands, in stack order.
 * @param {import('d3').ScaleLinear<number, number>} options.yScale - Percentage scale.
 * @param {number} options.barWidth - Bar width in px.
 * @param {import('../../../../../common/charts/renderers/chartRenderer.js').ChartCallbackContext} options.context - Handed to the chart's `formatTooltipContent` beside `{row, level}`.
 * @param {boolean} options.segmentLabels - Draw `III · 24 %` inside each segment one of its tiers fits.
 * @param {(level: string) => boolean} options.isLevelShown - Whether the Kompetenzstufen legend shows a level.
 * @param {number} options.durationMs - How long a drawn bar's segments move (`ChartRenderer.drawDurationMs`).
 * @param {import('../../../../../common/charts/renderers/chartRenderer.js').ChartRenderer & {formatTooltipContent(segment: {row: CompetenceBarRow, level: string}, context?: import('../../../../../common/charts/renderers/chartRenderer.js').ChartCallbackContext): import('../../../../../common/services/cursorTooltip.js').TooltipContent}} chart - The chart that measures the labels and shows the tooltips with the bar's context.
 * @returns {import('d3').Selection<SVGGElement, CompetenceBarRow, any, any>} The bar's group.
 */
export function drawCompetenceBar(
    g,
    row,
    { levels, yScale, barWidth, context, segmentLabels, isLevelShown, durationMs },
    chart,
) {
    const segments = buildStackedSegments(
        chart.context.palette,
        {
            ...row.percentages,
            scaleId: row.scaleId,
        },
        levels,
    ).filter((segment) => isLevelShown(segment.field));

    const barGroup = selectOrAppend(g, 'g', 'bar-group', (created) =>
        created.classed(`${row.type}-bar`, Boolean(row.type)).attr('transform', 'translate(0, 0)'),
    ).datum(row);

    createSVGStackedBar(
        barGroup,
        segments,
        {
            isHorizontal: false,
            yScale,
            barSizePx: barWidth,
            barGroupClass: 'stacked-bar-inner',
            showLabels: segmentLabels,
            labelFormatter: levelShareLabelFormatter,
            tooltip: {
                getTooltipContent: (d) =>
                    chart.formatTooltipContent({ row, level: d.field }, context),
            },
            durationMs,
        },
        chart,
    );

    return barGroup;
}

/** Room left between the top of the tallest bar-top label and the top of the plot, in px. */
const BAR_TOP_LABEL_BUFFER_PX = 6;

/**
 * Height the labels above the bars need: their baseline offset above the bar, the
 * block of the most lines any of them wraps to, and a buffer. One reserve, so a label
 * sits the same distance from a bar in every competence chart.
 * @param {import('../../../../../common/charts/renderers/chartRenderer.js').ChartRenderer} chart - Measures the text.
 * @param {string[]} texts - Every label drawn above a bar.
 * @param {{fontSizePx?: number}} [options] - The size they are drawn at, if not the chart's.
 * @returns {number} Reserved height in px; none without labels.
 */
export function barTopLabelReserve(chart, texts, { fontSizePx } = {}) {
    if (texts.length === 0) return 0;
    const blockHeight = measureLabelBlockHeight(chart, texts, {
        ...(fontSizePx === undefined ? {} : { fontSizePx }),
        fontWeight: fontWeightToken('bold'),
    });
    return BAR_TOP_LABEL_OFFSET_PX + Math.ceil(blockHeight) + BAR_TOP_LABEL_BUFFER_PX;
}

/**
 * The lines of a bar-top label fitted to `slotPx`, each text fitted once: a chart draws
 * the same name above many bars of one width.
 * @param {import('../../../../../common/charts/chartLabelFit.js').LabelMeasurer} chart - Measures the text.
 * @param {number} slotPx - Width a line may take.
 * @returns {(text: string) => string[]}
 */
export function barTopLabelFitter(chart, slotPx) {
    /** @type {Map<string, string[]>} */
    const fitted = new Map();
    return (text) => {
        let lines = fitted.get(text);
        if (!lines) {
            lines = fitLabelLines(chart, text, slotPx, { fontWeight: fontWeightToken('bold') });
            fitted.set(text, lines);
        }
        return lines;
    };
}

/**
 * Draw the label above a bar (`appendBarTopLabel`) into `group`, or bring the one of
 * `className` drawn there last pass to `x` and `lines`: moved over `durationMs` while its
 * lines stay, written afresh at `x` when they changed.
 * @template {import('d3').BaseType} G
 * @template D
 * @param {import('d3').Selection<G, D, any, any>} group - The bar's group; it holds one label of `className`.
 * @param {object} label
 * @param {string} label.className
 * @param {number} label.x - Its centre in px.
 * @param {string[]} label.lines - Its lines, already fitted (`fitLabelLines`).
 * @param {number} label.durationMs - How long a drawn label moves.
 * @returns {import('d3').Selection<SVGTextElement, D, G, any>} The label.
 */
export function drawBarTopLabel(group, { className, x, lines, durationMs }) {
    /** @type {import('d3').Selection<SVGTextElement, D, G, any>} */
    const text = group.selectChild(`text.${className}`);
    if (text.empty()) return appendBarTopLabel(group, { className, x, lines });

    const drawnLines = text
        .selectChildren('tspan')
        .nodes()
        .map((tspan) => /** @type {Element} */ (tspan).textContent);
    if (drawnLines.join('\n') !== lines.join('\n')) {
        appendLabelLines(text.attr('x', x).text(null), lines, {
            x,
            y: -BAR_TOP_LABEL_OFFSET_PX,
            stack: 'up',
        });
        return text;
    }
    // Its lines carry their own `x`, so they move with it.
    animate(text, { durationMs }).attr('x', x);
    animate(text.selectChildren('tspan'), { durationMs }).attr('x', x);
    return text;
}
