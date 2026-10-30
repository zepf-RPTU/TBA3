/**
 * The bars of the competence detail chart: one group per x-axis tick, holding a stacked
 * bar per row, the labels above them and the group's Unterrichtsqualität slot. Every
 * draw lays the bars the legend leaves on out (`competenceDetailBarLayout.js`) and joins
 * the marks drawn last pass by group and bar key, so a toggle or a resize moves them; a
 * bar the legend hides fades where it stands. Free functions over the renderer; `chart`
 * supplies tooltips, text measurement and data.
 */

import * as d3 from 'd3';
import { animate } from '../../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../../common/charts/selectOrAppend.js';
import { BAND_LABEL_GAP_PX } from '../../../../../common/charts/chartLabelFit.js';
import { barTopLabelFitter, drawBarTopLabel, drawCompetenceBar } from '../shared/competenceBar.js';
import { populationLabel } from '../shared/competenceChartData.js';
import { renderDomainLabels } from './competenceDetailLabels.js';
import { ALL_VISIBLE, computeBarLayout } from './competenceDetailBarLayout.js';

/** @typedef {import('./competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */
/** @typedef {import('./competenceDetailBarLayout.js').BarVisibility} BarVisibility */
/** @typedef {import('./competenceDetailBarLayout.js').PlacedBar} PlacedBar */

/** A group's row bars: every sub-bar group but the Unterrichtsqualität slot. */
const ROW_BARS = 'g.sub-bar-group:not(.sub-bar-teachingQuality)';

/**
 * @typedef {object} DetailBars
 * @property {number} barWidth - Bar width of the shown bars, in px.
 * @property {Map<string, d3.Selection<SVGGElement, unknown, any, any>>} qualitySlots - The Unterrichtsqualität slot of every group with one that is shown, by group key.
 * @property {(key: string) => {center: number, slot: number, shown: boolean}} bottomLabelPlace - Where a tick's label below the axis centres, the width a free-text one may take, and whether its group is shown.
 * @property {boolean} empty - Whether the legend hides every group, so no bar is shown.
 */

/**
 * Show or hide a drawn mark (`setElementVisibility`), leaving one that was never hidden
 * as drawn: its first paint carries no visibility styles. The mark's move chains on the
 * motion returned, so it never interrupts the fade.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} chart - The renderer that owns the marks' visibility.
 * @param {d3.Selection<SVGGElement, any, any, any>} mark
 * @param {boolean} visible
 * @param {number} durationMs - Fade and move length.
 * @returns {d3.Selection<SVGGElement, any, any, any>} The fade, or a transition (or, instant, the mark) to move it in.
 */
function showMark(chart, mark, visible, durationMs) {
    if (!visible || mark.attr('aria-hidden') === 'true') {
        return chart.setElementVisibility(mark, visible, { durationMs });
    }
    return animate(mark, { durationMs });
}

/**
 * The Unterrichtsqualität slot's left edge among a group's placed bars.
 * @param {PlacedBar[]|undefined} bars - The group's visible bars.
 * @returns {number|undefined} Its x, or `undefined` when the group shows no slot.
 */
function teachingQualityX(bars) {
    return bars?.find((bar) => bar.row === null)?.x;
}

/**
 * Draw the bars, or bring the drawn ones to a legend state: one group per x-axis tick,
 * holding a stacked bar per row and, where the group has one, its Unterrichtsqualität
 * slot. A group or bar the legend hides keeps its place and fades.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The plot group the bars are drawn into.
 * @param {object} spec
 * @param {import('./competenceDetailRenderer.js').DetailModel} spec.model
 * @param {import('./competenceDetailBarLayout.js').LabelSpace|null} spec.labelSpace - What the labels need; `null` draws none (the watermark).
 * @param {d3.ScaleLinear<number, number>} spec.yScale - Percentage scale.
 * @param {number} spec.width - Plot width in px.
 * @param {number} spec.barLabelFontSize
 * @param {BarVisibility} spec.visibility - Which bars the legend leaves on.
 * @param {(level: string) => boolean} spec.isLevelShown - Which Kompetenzstufen the bars stack.
 * @param {number} spec.durationMs - How long the drawn marks move (`ChartRenderer.drawDurationMs`).
 * @returns {DetailBars}
 */
export function createDetailBars(
    chart,
    g,
    { model, labelSpace, yScale, width, barLabelFontSize, visibility, isLevelShown, durationMs },
) {
    const { groups, groupingConfig, levels, showBarLabels } = model;
    /** @type {import('./competenceDetailBarLayout.js').BarLayoutInput} */
    const input = {
        xDomain: model.xDomain,
        width,
        groups,
        groupingConfig,
        hasTeachingQuality: model.hasTeachingQuality,
        barLabelFontSize,
        labelSpace,
    };
    // Every bar shown: what a mark the legend hides from the start is drawn at, and the
    // pitch the bar labels are fitted to, so a toggle never refits them.
    const full = computeBarLayout(input, ALL_VISIBLE);
    const layout = visibility === ALL_VISIBLE ? full : computeBarLayout(input, visibility);
    const { uniformBarWidth } = layout;
    const labels = labelSpace !== null;

    const fitLabel = barTopLabelFitter(
        chart,
        Math.max(0, full.barWidthWithPadding - BAND_LABEL_GAP_PX),
    );

    /** @type {Map<string, d3.Selection<SVGGElement, unknown, any, any>>} */
    const qualitySlots = new Map();

    /** @type {d3.Selection<SVGGElement, string, SVGGElement, unknown>} */
    const drawnGroups = g.selectChildren('g.domain-group');
    drawnGroups
        .data(full.groupKeys, (key) => key)
        .join((enter) =>
            enter
                .append('g')
                .attr('class', 'domain-group')
                .attr('transform', (key) => `translate(${full.groupPositions[key].x}, 0)`),
        )
        .each(function (key) {
            const domainGroup = d3.select(this);
            const position = layout.groupPositions[key];
            const move = showMark(chart, domainGroup, !!position, durationMs);
            // A hidden group fades where it stands; its marks wait for it to come back.
            if (!position) return;
            move.attr('transform', `translate(${position.x}, 0)`);
            const bars = layout.groupBars[key];

            if (labelSpace) {
                renderDomainLabels(chart, domainGroup, groups[key], bars, uniformBarWidth, {
                    chartData: model.chartData,
                    groupingConfig,
                    domainLabels: labelSpace.domainLabels,
                    durationMs,
                });
            }

            // The row is the bar's datum, so the layout asks the row whether the bar shows
            // rather than decoding it from the bar's key.
            /** @type {d3.Selection<SVGGElement, CompetenceChartRow, SVGGElement, string>} */
            const drawnRows = domainGroup.selectChildren(ROW_BARS);
            drawnRows
                .data(groups[key], groupingConfig.getSubScaleKey)
                .join((enter) =>
                    enter
                        .append('g')
                        .attr('class', 'sub-bar-group')
                        .attr('transform', (row) => `translate(${full.rowX.get(row)}, 0)`),
                )
                .each(function (row) {
                    const subBarGroup = d3.select(this);
                    const x = layout.rowX.get(row);
                    const moveBar = showMark(chart, subBarGroup, x !== undefined, durationMs);
                    // A new bar the legend hides is drawn where every bar shown puts it.
                    const drawnHidden =
                        x === undefined && !subBarGroup.select('.bar-group').empty();
                    if (drawnHidden) return;
                    if (x !== undefined) moveBar.attr('transform', `translate(${x}, 0)`);
                    drawCompetenceBar(
                        subBarGroup,
                        row,
                        {
                            levels: levels.competenceLevelNames,
                            yScale,
                            barWidth: x === undefined ? full.uniformBarWidth : uniformBarWidth,
                            context: { type: populationLabel(row.type, row.name) },
                            segmentLabels: labels,
                            isLevelShown,
                            durationMs,
                        },
                        chart,
                    );
                    if (labels && showBarLabels) {
                        drawBarTopLabel(subBarGroup, {
                            className: 'domain-label',
                            x: (x === undefined ? full.uniformBarWidth : uniformBarWidth) / 2,
                            lines: fitLabel(groupingConfig.getLabelText(row)),
                            durationMs,
                        });
                    }
                });

            // The slot exists where every bar shown has one; the legend may hide it.
            const fullQualityX = teachingQualityX(full.groupBars[key]);
            if (fullQualityX === undefined) return;
            const qualitySlot = selectOrAppend(
                domainGroup,
                'g',
                'sub-bar-teachingQuality',
                (created) =>
                    created
                        .classed('sub-bar-group', true)
                        .attr('transform', `translate(${fullQualityX}, 0)`),
            );
            const qualityX = teachingQualityX(bars);
            const moveSlot = showMark(chart, qualitySlot, qualityX !== undefined, durationMs);
            if (qualityX === undefined) return;
            moveSlot.attr('transform', `translate(${qualityX}, 0)`);
            qualitySlots.set(key, qualitySlot);
        });

    return {
        barWidth: uniformBarWidth,
        qualitySlots,
        empty: layout.groupKeys.length === 0,
        bottomLabelPlace(key) {
            const position = layout.groupPositions[key];
            const { x, width: groupWidth } = position ?? full.groupPositions[key];
            const gap = position ? layout.groupGap : full.groupGap;
            // The layout kept the neighbours' labels apart, so a label may take its own
            // width even where that is wider than its group and the gap.
            return {
                center: x + groupWidth / 2,
                slot: Math.max(
                    groupWidth + gap - BAND_LABEL_GAP_PX,
                    labelSpace?.bottomLabelWidths[key] ?? 0,
                ),
                shown: !!position,
            };
        },
    };
}
