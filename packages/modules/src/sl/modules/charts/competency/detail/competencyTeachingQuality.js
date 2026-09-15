/**
 * Teaching-quality (Unterrichtsqualität) visualization layer for the competency
 * detail chart.
 *
 * Draws the teaching-quality overlay — box-plots (default) or stacked bars —
 * alongside the competency bars,
 * its right-hand rating axis, tooltips, and the bar redistribution layout update.
 *
 * Drawing functions take the renderer so they can reuse its tooltip wiring
 * (`wireTooltipEvents`), tooltip HTML builder (`buildTooltipHTML`), axis-title
 * renderer (`renderAxisTitle`), reactive state (`_state`), and `compact` flag —
 * the same instance the rest of the pipeline draws into.
 */

import { BOX_FIGURE_COMPACT, drawBoxPlotFigure } from '../../shared/boxPlotFigure.js';
import { buildRatingSegments } from '../../../../utils/slRatingDistribution.js';
import { createRatingAxis } from '../../../../../common/charts/chartAxisUtils.js';

/** A rating column's bar width as a share of its slot: narrower than the KS bars beside it. */
const TQ_BAR_WIDTH_RATIO = 0.5;
import { createSVGStackedBar } from '../../../../../common/charts/renderers/barChartRenderer.js';
import { getThemeColors } from '../../../../../common/services/themeService.js';
import { motionDuration } from '../../../../../common/charts/motionPreference.js';
import { CHART_CONFIG, COMPETENCY_TOOLTIP_ID } from '../shared/competencyChartConstants.js';
import * as d3 from 'd3';

/** Frequently-used CSS class strings */
const CSS_CLASSES = Object.freeze({
    Y_AXIS_QUALITY: 'y-axis-quality',
    Y_AXIS_QUALITY_LABEL: 'y-axis-quality-label',
    TQ_BOXPLOTS: 'teaching-quality-boxplots',
    TQ_STACKED_BARS: 'teaching-quality-stacked-bars',
    TQ_LABEL: 'teaching-quality-label',
});

/**
 * Format tooltip content for teaching quality visualizations.
 * @param {object} renderer - The chart renderer, used for its shared tooltip builder.
 * @param {object} data - The row hovered, read for its Unterrichtsqualität statistics.
 * @param {object} [context] - Extra hover context, e.g. which mark was hovered.
 * @returns {string} The tooltip HTML.
 */
function formatTeachingQualityTooltipContent(renderer, data, context = {}) {
    const tq = data.teachingQuality;
    const { mode = 'boxplot', segment = null, totalCount = null } = context;

    if (mode === 'stacked_bar' && segment) {
        return renderer.buildTooltipHTML({
            title: data.name,
            subtitle: 'Unterrichtsqualität (kogn. Aktivierung)',
            rows: [
                { label: 'Bewertung', value: segment.label },
                { label: 'Anzahl', value: `${segment.count} von ${totalCount}` },
                { label: 'Anteil', value: `${segment.percentage.toFixed(1)}%` },
            ],
            footer: `Mittelwert: <strong>${tq.mean.toFixed(2)}</strong>`,
        });
    }

    return renderer.buildTooltipHTML({
        title: data.name,
        subtitle: 'Unterrichtsqualität (kogn. Aktivierung)',
        rows: [
            { label: 'Mittelwert', value: tq.mean.toFixed(2) },
            { label: 'Std.-Abw.', value: tq.standardDeviation.toFixed(2) },
            { label: 'Anzahl', value: tq.count },
        ],
    });
}

/**
 * Draw priority of one row's Unterrichtsqualität mark, so a class mark is painted over
 * the school's and the school's over a Landesschnitt.
 * @param {object|null} data - The row.
 * @returns {number} Its priority; `0` for a type this client does not rank.
 */
function getTeachingQualityPriority(data) {
    const typePriority = {
        class: 3,
        school: 2,
        landesschnitt: 1,
    };

    return typePriority[data?.type] || 0;
}

/**
 * One Unterrichtsqualität entry per slot: several rows can share a slot, and the
 * highest-priority row wins it rather than the last one drawn.
 * @param {Array<object>} chartData - The prepared rows.
 * @param {object} groupingConfig - How the bars group, which decides what a slot is.
 * @returns {Array<object>} The winning entries, one per slot.
 */
function resolveTeachingQualityEntries(chartData, groupingConfig) {
    const entriesBySlot = new Map();

    chartData.forEach((data) => {
        if (!data?.teachingQuality || data.type === 'landesschnitt') {
            return;
        }

        const slotKey = `${groupingConfig.getGroupKey(data)}|teachingQuality`;
        const current = entriesBySlot.get(slotKey);
        if (!current || getTeachingQualityPriority(data) > getTeachingQualityPriority(current)) {
            entriesBySlot.set(slotKey, data);
        }
    });

    return Array.from(entriesBySlot.values());
}

/**
 * Resolve (or lazily create) the teaching-quality sub-bar group within a domain
 * group, returning it plus the sub-scale bar width.
 * @param {d3.Selection} domainGroup - The group the sub-bar belongs to.
 * @param {object} d - The row the sub-bar stands for.
 * @param {any} xScale - Band scale over the x-axis ticks.
 * @param {object} groupingConfig - How the bars group.
 * @returns {{ tqSubBarGroup: *, barWidth: number }} The sub-bar group and the width it may occupy.
 */
function resolveTQBarGroup(domainGroup, d, xScale, groupingConfig) {
    let tqSubBarGroup = domainGroup.select('.sub-bar-group.sub-bar-teachingQuality');

    let barWidth;
    if (!tqSubBarGroup.empty()) {
        const storedWidth = tqSubBarGroup.attr('data-bar-width');
        if (storedWidth) barWidth = parseFloat(storedWidth);
    }

    if (!barWidth) {
        let xSubScale;
        if (groupingConfig.groupBySubject) {
            const subjectDomainCount = groupingConfig.subjectDomainCounts[d.subject].size;
            let localSubScaleDomain;
            if (subjectDomainCount === 1) {
                localSubScaleDomain = groupingConfig.subScaleDomain.filter(
                    (k) =>
                        k === 'teachingQuality' ||
                        k.endsWith('_d0') ||
                        (!k.includes('_d') &&
                            (k === 'landesschnitt' || k === 'school' || k === 'class')),
                );
            } else {
                localSubScaleDomain = groupingConfig.subScaleDomain;
            }
            xSubScale = d3
                .scaleBand()
                .domain(localSubScaleDomain)
                .range([0, xScale.bandwidth()])
                .padding(0.1);
        } else {
            xSubScale = d3
                .scaleBand()
                .domain(groupingConfig.subScaleDomain)
                .range([0, xScale.bandwidth()])
                .padding(0.1);
        }

        if (tqSubBarGroup.empty()) {
            tqSubBarGroup = domainGroup
                .append('g')
                .attr('class', 'sub-bar-group sub-bar-teachingQuality')
                .attr('data-sub-key', 'teachingQuality')
                .attr('transform', `translate(${xSubScale('teachingQuality')}, 0)`);
        }
        barWidth = xSubScale.bandwidth();
    }

    return { tqSubBarGroup, barWidth };
}

/**
 * Draw TQ box-plot overlays on each domain group.
 * @param {object} renderer - The chart renderer, used for tooltips and theme colours.
 * @param {d3.Selection} g - The plot group the overlays are drawn into.
 * @param {Array<object>} chartData - The prepared rows.
 * @param {any} xScale - Band scale over the x-axis ticks.
 * @param {d3.ScaleLinear<number, number>} yScaleQuality - The Unterrichtsqualität scale, separate from the percentage scale the bars use.
 * @param {object} groupingConfig - How the bars group.
 */
export function drawTeachingQualityBoxPlots(
    renderer,
    g,
    chartData,
    xScale,
    yScaleQuality,
    groupingConfig,
) {
    const { BOX_WIDTH_RATIO, WHISKER_CAP_WIDTH } = CHART_CONFIG.TEACHING_QUALITY;
    const BOX_COLOR = getThemeColors().sl.teachingQuality;

    const dataWithQuality = resolveTeachingQualityEntries(chartData, groupingConfig);

    if (dataWithQuality.length === 0) return;

    g.append('g').attr('class', CSS_CLASSES.TQ_BOXPLOTS);

    dataWithQuality.forEach((d) => {
        // Real order statistics of this group's ratings. These used to be synthesised
        // from mean ± z·SD — a normal-distribution stand-in for quartiles the payload
        // had already produced.
        const tq = d.teachingQuality;
        const { whiskerMin: min, whiskerMax: max } = tq;

        const groupKey = groupingConfig.getGroupKey(d);
        const domainGroup = g.select(`.domain-group[data-group-key="${groupKey}"]`);

        if (domainGroup.empty()) return;

        const { tqSubBarGroup, barWidth } = resolveTQBarGroup(
            domainGroup,
            d,
            xScale,
            groupingConfig,
        );

        const boxWidth = barWidth * BOX_WIDTH_RATIO;
        const centerX = barWidth / 2;

        // The same figure the two full-size SL box plots draw, at overlay weight: the
        // line inside the box is the median in all three now. It used to be the mean
        // here — same position, different statistic, no cue — with the mean spanning the
        // whole bar and no median drawn at all.
        drawBoxPlotFigure(tqSubBarGroup, tq, {
            centerX,
            boxWidth,
            capWidth: WHISKER_CAP_WIDTH,
            yScale: yScaleQuality,
            color: BOX_COLOR,
            fill: BOX_COLOR,
            style: BOX_FIGURE_COMPACT,
        });

        tqSubBarGroup
            .append('text')
            .attr('class', CSS_CLASSES.TQ_LABEL)
            .attr('x', centerX)
            .attr('y', -5)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'auto')
            .style('font-weight', 'bold')
            .style('fill', getThemeColors().chrome.textSecondary)
            .style('pointer-events', 'none')
            .text('Q');

        // Over the whole figure, not just the whiskers: the outliers are drawn beyond
        // the caps and would otherwise sit outside the only hover target, and a group
        // whose inliers are all one value has a zero-height whisker span — which used
        // to be impossible when the whiskers were mean ± 1.5·SD, and left no tooltip.
        const drawn = [min, max, ...(tq.outliers ?? [])].filter(Number.isFinite);
        const top = yScaleQuality(Math.max(...drawn));
        const bottom = yScaleQuality(Math.min(...drawn));

        const hoverArea = tqSubBarGroup
            .append('rect')
            .attr('x', centerX - boxWidth / 2 - 4)
            .attr('y', top - 4)
            .attr('width', boxWidth + 8)
            .attr('height', bottom - top + 8)
            .attr('fill', 'transparent');

        renderer.wireTooltipEvents(hoverArea, {
            getTooltipContent: () =>
                formatTeachingQualityTooltipContent(renderer, d, { mode: 'boxplot' }),
            tooltipId: COMPETENCY_TOOLTIP_ID,
        });
    });
}

/**
 * Draw TQ stacked-bar overlays as an alternative to box-plots.
 * @param {object} renderer - The chart renderer, used for tooltips and theme colours.
 * @param {d3.Selection} g - The plot group the overlays are drawn into.
 * @param {Array<object>} chartData - The prepared rows.
 * @param {any} xScale - Band scale over the x-axis ticks.
 * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale, shared with the competency bars.
 * @param {object} groupingConfig - How the bars group.
 */
export function drawTeachingQualityStackedBars(
    renderer,
    g,
    chartData,
    xScale,
    yScale,
    groupingConfig,
) {
    const dataWithQuality = resolveTeachingQualityEntries(chartData, groupingConfig);

    if (dataWithQuality.length === 0) return;

    g.append('g').attr('class', CSS_CLASSES.TQ_STACKED_BARS);

    dataWithQuality.forEach((d) => {
        const tq = d.teachingQuality;
        const studentMeans = Array.isArray(tq.values)
            ? tq.values.filter((value) => Number.isFinite(value))
            : [];

        if (studentMeans.length === 0) return;

        const totalCount = studentMeans.length;

        const distribution = buildRatingSegments(studentMeans, {
            meta: {
                parentData: d,
                totalCount,
            },
        });

        const groupKey = groupingConfig.getGroupKey(d);
        const domainGroup = g.select(`.domain-group[data-group-key="${groupKey}"]`);

        if (domainGroup.empty()) return;

        const { tqSubBarGroup, barWidth } = resolveTQBarGroup(
            domainGroup,
            d,
            xScale,
            groupingConfig,
        );

        // The shared stacked-bar helper, so the rating buckets get the same surface
        // gap as the competency bars beside them — at half their
        // width and centred in the slot, so a rating column is visibly a different
        // object from the two 0–100 % bars it stands next to.
        const tqBarWidth = barWidth * TQ_BAR_WIDTH_RATIO;
        createSVGStackedBar(
            tqSubBarGroup
                .append('g')
                .attr('class', 'tq-bars')
                .attr('transform', `translate(${(barWidth - tqBarWidth) / 2}, 0)`),
            distribution,
            {
                isHorizontal: false,
                yScale,
                barSize: tqBarWidth,
                fillOpacity: 0.85,
                getTooltipContent: (segment) =>
                    formatTeachingQualityTooltipContent(renderer, segment.parentData, {
                        mode: 'stacked_bar',
                        segment,
                        totalCount: segment.totalCount,
                    }),
                hoverEffect: {
                    enter: { filter: 'brightness(0.85)' },
                    leave: { filter: null },
                },
                tooltipId: COMPETENCY_TOOLTIP_ID,
            },
            renderer,
        );

        if (renderer.compact) return;

        tqSubBarGroup
            .append('text')
            .attr('class', CSS_CLASSES.TQ_LABEL)
            .attr('x', barWidth / 2)
            .attr('y', -5)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'auto')
            .style('font-weight', 'bold')
            .style('fill', getThemeColors().chrome.textSecondary)
            .style('pointer-events', 'none')
            .text('Q');
    });
}

/**
 * Animate TQ box-plot or stacked-bar elements to a new bar width during redistribution.
 * @param {d3.Selection} group - The sub-bar group holding the overlay.
 * @param {number} newBarWidth - The width it must fit after the toggle.
 * @param {number} duration - Transition length in ms.
 */
export function updateTeachingQualityLayout(group, newBarWidth, duration) {
    duration = motionDuration(duration);
    const { BOX_WIDTH_RATIO, WHISKER_CAP_WIDTH } = CHART_CONFIG.TEACHING_QUALITY;
    const newCenterX = newBarWidth / 2;
    const newBoxWidth = newBarWidth * BOX_WIDTH_RATIO;

    const isStackedBarMode = group.selectAll('rect.bar-segment').size() > 0;

    if (isStackedBarMode) {
        group
            .selectAll('rect.bar-segment')
            .transition()
            .duration(duration)
            .attr('width', newBarWidth);
    } else {
        group
            .selectAll('line.whisker-line')
            .transition()
            .duration(duration)
            .attr('x1', newCenterX)
            .attr('x2', newCenterX);

        group
            .selectAll('line.whisker-cap')
            .transition()
            .duration(duration)
            .attr('x1', newCenterX - WHISKER_CAP_WIDTH / 2)
            .attr('x2', newCenterX + WHISKER_CAP_WIDTH / 2);

        group
            .selectAll('rect.box')
            .transition()
            .duration(duration)
            .attr('x', newCenterX - newBoxWidth / 2)
            .attr('width', newBoxWidth);

        group
            .selectAll('line.median-line')
            .transition()
            .duration(duration)
            .attr('x1', newCenterX - newBoxWidth / 2)
            .attr('x2', newCenterX + newBoxWidth / 2);

        // The mean diamond and the outliers carry their value in y; only the horizontal
        // placement moves, so the existing transform's y is kept rather than recomputed.
        group
            .selectAll('path.mean-point')
            .transition()
            .duration(duration)
            .attr('transform', function () {
                const y =
                    /translate\([^,]+,\s*([^)]+)\)/.exec(
                        d3.select(this).attr('transform') ?? '',
                    )?.[1] ?? '0';
                return `translate(${newCenterX},${y})`;
            });

        group.selectAll('circle.outlier').transition().duration(duration).attr('cx', newCenterX);

        group
            .selectAll('rect')
            .filter(function () {
                return d3.select(this).attr('fill') === 'transparent';
            })
            .transition()
            .duration(duration)
            .attr('x', newCenterX - newBoxWidth / 2 - 4)
            .attr('width', newBoxWidth + 8);
    }
}

/**
 * Render the TQ right-hand y-axis and its label, then draw the active TQ overlay.
 * @param {object} renderer - The chart renderer; its `vizMode` state picks box-plot or stacked-bar.
 * @param {any} g - The plot group the axis and overlay are drawn into. `any`, not `d3.Selection`: the axis is shown or hidden with `.style('display', shown ? null : 'none')`, and d3's typed overloads take either a string or `null`, not the union.
 * @param {any} xScale - Band scale over the x-axis ticks.
 * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale, used by the stacked-bar overlay.
 * @param {d3.ScaleLinear<number, number>} yScaleQuality - The Unterrichtsqualität scale, drawn only in box-plot mode.
 * @param {number} chartWidth - Where the right-hand axis sits.
 * @param {object} groupingConfig - How the bars group.
 */
export function renderTeachingQualityAxis(
    renderer,
    g,
    xScale,
    yScale,
    yScaleQuality,
    chartWidth,
    groupingConfig,
) {
    const showYAxis = renderer._state.vizMode === 'boxplot';
    const tqColor = getThemeColors().sl.teachingQuality;

    const yAxisQuality = g
        .append('g')
        .attr('class', CSS_CLASSES.Y_AXIS_QUALITY)
        .attr('transform', `translate(${chartWidth}, 0)`)
        .style('display', showYAxis ? null : 'none')
        .call(createRatingAxis('right', yScaleQuality));

    yAxisQuality.selectAll('text').style('fill', tqColor);

    yAxisQuality.selectAll('line, path').style('stroke', tqColor).style('opacity', 0.6);

    renderer
        .renderAxisTitle(g, 'right', 'Unterrichtsqualität', {
            fill: tqColor,
            fontWeight: 'var(--fw-semibold)',
            className: CSS_CLASSES.Y_AXIS_QUALITY_LABEL,
        })
        .style('display', showYAxis ? null : 'none');

    if (renderer._state.vizMode === 'stacked_bar') {
        drawTeachingQualityStackedBars(
            renderer,
            g,
            renderer.chartData,
            xScale,
            yScale,
            groupingConfig,
        );
    } else {
        drawTeachingQualityBoxPlots(
            renderer,
            g,
            renderer.chartData,
            xScale,
            yScaleQuality,
            groupingConfig,
        );
    }
}
