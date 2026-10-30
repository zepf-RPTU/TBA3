/**
 * The marks of the competence overview chart: per Fach/Domäne a `.domain-group`, and in
 * it one `.bar-slot` per bar — each comparison track, the Schulschnitt and every group —
 * labelled above; a group without results gets a rotated no-participation note. Both
 * levels join by key, so a redraw updates the marks drawn last pass; where the groups
 * and slots sit is `layoutOverview`'s job.
 */

import * as d3 from 'd3';
import { animate } from '../../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../../common/charts/selectOrAppend.js';
import { barTopLabelFitter, drawBarTopLabel, drawCompetenceBar } from '../shared/competenceBar.js';

/** @typedef {import('./competenceOverviewData.js').CompetenceOverviewRow} CompetenceOverviewRow */
/** @typedef {import('./competenceOverviewData.js').OverviewBar} OverviewBar */

/**
 * Label every bar above its top. A group name is free text: split over up to two lines
 * and each line middle-ellipsed to the slot as a last resort. The other labels are
 * short fixed tags (`L1`, `S`) and are drawn as-is.
 * @param {import('./competenceOverviewRenderer.js').CompetenceOverviewRenderer} chart - The renderer that measures.
 * @param {d3.Selection<SVGGElement, OverviewBar, any, any>} bars - The bar slots, each a `g`.
 * @param {number} labelSlot - Width a group name's line may take, in px.
 * @param {number} barWidth - The bars' width, whose centre the label sits on.
 * @param {number} durationMs - How long a drawn label moves.
 */
function drawBarLabels(chart, bars, labelSlot, barWidth, durationMs) {
    // Every Fach draws each group in a slot of the same width.
    const fit = barTopLabelFitter(chart, labelSlot);
    bars.each(function (bar) {
        drawBarTopLabel(d3.select(this), {
            className: 'bar-category-label',
            x: barWidth / 2,
            lines: bar.kind === 'group' ? fit(bar.label) : [bar.label],
            durationMs,
        });
    });
}

/**
 * Draw the overview's groups and bars, or update the ones drawn last pass.
 * @param {import('./competenceOverviewRenderer.js').CompetenceOverviewRenderer} chart - The renderer: tooltips, text measurement.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The plot group the bars are drawn into.
 * @param {CompetenceOverviewRow[]} rows
 * @param {object} options
 * @param {string[]} options.levels - The scale's bands, in stack order.
 * @param {(level: string) => boolean} options.isLevelShown - Whether the Kompetenzstufen legend shows a band.
 * @param {d3.ScaleLinear<number, number>} options.yScale - Percentage scale.
 * @param {number} options.barWidth - Bar width of the shown slots, in px.
 * @param {number} options.labelSlot - Width a group name's line may take, in px.
 * @param {number} options.durationMs - How long the drawn marks move (`ChartRenderer.drawDurationMs`).
 */
export function createOverviewBars(
    chart,
    g,
    rows,
    { levels, isLevelShown, yScale, barWidth, labelSlot, durationMs },
) {
    /** @type {d3.Selection<SVGGElement, CompetenceOverviewRow, SVGGElement, unknown>} */
    const drawnGroups = g.selectChildren('g.domain-group');
    /** @type {d3.Selection<SVGGElement, OverviewBar, SVGGElement, CompetenceOverviewRow>} */
    const drawnBars = drawnGroups
        .data(rows, (row) => row.domain)
        .join((enter) => enter.append('g').attr('class', 'domain-group').style('cursor', 'default'))
        .selectChildren('g.bar-slot');
    const bars = drawnBars
        .data(
            (row) => row.bars,
            (bar) => bar.key,
        )
        .join((enter) => enter.append('g'))
        .attr('class', (bar) => `bar-slot bar-slot-${bar.kind}`);

    drawBarLabels(chart, bars, labelSlot, barWidth, durationMs);

    const noParticipation = chart.context.glossary.getRequiredEntryText(
        'general.messages.no-participation',
    );
    const midY = yScale.range()[0] / 2;
    bars.each(function (bar) {
        const slot = d3.select(this);
        if (bar.row) {
            drawCompetenceBar(
                slot,
                bar.row,
                {
                    levels,
                    yScale,
                    barWidth,
                    context: { type: bar.subtitle },
                    segmentLabels: true,
                    isLevelShown,
                    durationMs,
                },
                chart,
            );
            return;
        }
        const note = selectOrAppend(slot, 'text', 'no-participation-label')
            .attr('y', midY)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .style('fill', 'var(--text-secondary)')
            .text(noParticipation);
        animate(note, { durationMs })
            .attr('x', barWidth / 2)
            .attr('transform', `rotate(-90, ${barWidth / 2}, ${midY})`);
    });
}
