/**
 * The competence detail chart's bottom (x-axis) labels, plus the height they need. The
 * axis group and its baseline are the ones both competence charts share
 * (`../shared/competenceAxes.js`).
 *
 * Measurement and drawing read one label model (`buildDetailBottomAxisLabels`),
 * so the space reserved below the plot is the space the labels take. This module reads
 * the label geometry from `competenceDetailLabels.js`, never the other way round.
 */

import {
    appendLabelLines,
    fitLabelLines,
    measureLabelBlockHeight,
    splitLabelLines,
} from '../../../../../common/charts/chartLabelFit.js';
import { formatChartSubjectDomainLabel } from '../../../../../common/charts/domainLabelFormatter.js';
import { moveCenteredLabel } from './competenceDetailLabels.js';
import { appendCategoryAxis, categoryAxisReserve } from '../shared/competenceAxes.js';
import { categoryLabelBaseline } from '../../../../../common/charts/chartAxisUtils.js';
import * as d3 from 'd3';
import { fontWeightToken } from '../../../../../common/utils/fontTokens.js';

/**
 * @typedef {object} DetailBottomAxisLabel
 * @property {string} key - The x-axis tick the label belongs to.
 * @property {string} text
 * @property {string} fontWeight - `bold` marks an aggregate row apart from a group row.
 * @property {boolean} slotted - True for a free-text group name: split over lines and ellipsed to the tick's width.
 */

/**
 * What the bottom axis prints per tick — aggregate rows their own name, group rows their
 * group name — as the one model both the measurement and the drawing read.
 * @param {import('./competenceDetailData.js').CompetenceChartRow[]} chartData
 * @param {string[]} xDomain - The x-axis ticks in draw order.
 * @param {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @returns {DetailBottomAxisLabel[]} One entry per tick that has data, in tick order.
 */
export function buildDetailBottomAxisLabels(chartData, xDomain, groupingConfig) {
    if (groupingConfig.groupBySubject) {
        const subjects = new Set(chartData.map((d) => d.subject));
        return xDomain
            .filter((subject) => subjects.has(subject))
            .map((subject) => ({
                key: subject,
                text: subject,
                fontWeight: 'normal',
                slotted: false,
            }));
    }

    if (groupingConfig.groupByDomain) {
        /** @type {Map<string, string>} group key → its Fach: Domäne label */
        const textByKey = new Map();
        chartData.forEach((d) => {
            const key = groupingConfig.getGroupKey(d);
            if (!textByKey.has(key)) {
                textByKey.set(
                    key,
                    formatChartSubjectDomainLabel(d.subject, d.displayDomainLabel, {
                        abbreviate: false,
                    }),
                );
            }
        });

        return xDomain
            .filter((key) => textByKey.has(key))
            .map((key) => ({
                key,
                text: /** @type {string} */ (textByKey.get(key)),
                fontWeight: 'normal',
                slotted: false,
            }));
    }

    /** @type {Map<string, string>} group name → the type of its first row */
    const typeByName = new Map();
    chartData.forEach((d) => {
        if (!typeByName.has(d.name)) typeByName.set(d.name, d.type);
    });

    return xDomain
        .filter((groupName) => typeByName.has(groupName))
        .map((groupName) => ({
            key: groupName,
            text: groupName,
            fontWeight: typeByName.get(groupName) !== 'group' ? fontWeightToken('bold') : 'normal',
            slotted: true,
        }));
}

/**
 * Height the bottom axis needs for its labels, measured rather than assumed so a long
 * group or Domäne name is not clipped. Free-text group names wrap over up to two lines,
 * so their block is measured; the controlled Fach/Domäne names draw on one line.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer
 * @param {DetailBottomAxisLabel[]} labels
 * @returns {number} Reserved height in px; `0` when there is nothing to label.
 */
export function measureDetailBottomAxisSpace(renderer, labels) {
    const texts = labels.map((label) => label.text).filter(Boolean);
    if (texts.length === 0) return 0;
    // One model yields either only free-text labels or only controlled ones.
    const blockHeight = labels[0].slotted
        ? measureLabelBlockHeight(renderer, texts)
        : renderer.measureTexts(texts).maxHeight;
    return categoryAxisReserve(blockHeight);
}

/**
 * How wide each label below the axis is drawn: a free-text group name its longest line,
 * any other label its whole text. The layout keeps neighbouring groups this far apart.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer
 * @param {DetailBottomAxisLabel[]} labels
 * @returns {{[key: string]: number}} Width in px, by tick.
 */
export function measureDetailBottomLabelWidths(renderer, labels) {
    return Object.fromEntries(
        labels.map((label) => [
            label.key,
            renderer.measureTexts(label.slotted ? splitLabelLines(label.text) : [label.text], {
                fontWeight: label.fontWeight,
            }).maxWidth,
        ]),
    );
}

/**
 * Draw the x-axis baseline and one label per tick under it, or bring the drawn ones to
 * the ticks the legend leaves on: a label is joined by its tick, moves to its new
 * centre (written afresh where its fitted lines changed), and fades where its group is
 * hidden.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} chart - The renderer: text measurement and sizes.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The plot group the axis is drawn into.
 * @param {number} width - Plot width in px, the baseline's length.
 * @param {number} height - Plot height in px, where the x-axis sits.
 * @param {DetailBottomAxisLabel[]} labels
 * @param {(key: string) => {center: number, slot: number, shown: boolean}} placeOf - Where a tick's label centres, the width each line of a free-text one may take, in px, and whether its group is shown.
 * @param {number} durationMs - How long a drawn label moves.
 */
export function drawDetailBottomAxis(chart, g, width, height, labels, placeOf, durationMs) {
    const xAxisGroup = appendCategoryAxis(g, width, height);
    const y = categoryLabelBaseline(chart);
    /** @type {d3.Selection<SVGTextElement, DetailBottomAxisLabel, SVGGElement, unknown>} */
    const drawn = xAxisGroup.selectChildren('text.axis-tick-label');
    drawn
        .data(labels, (label) => label.key)
        .join((enter) => enter.append('text').attr('class', 'axis-tick-label'))
        .each(function (label) {
            const { center, slot, shown } = placeOf(label.key);
            const text = d3.select(this);
            const lines = label.slotted
                ? fitLabelLines(chart, label.text, slot, { fontWeight: label.fontWeight })
                : [label.text];
            const drawnLines = text
                .selectChildren('tspan')
                .nodes()
                .map((tspan) => /** @type {Element} */ (tspan).textContent);
            const isNew = text.attr('x') === null;
            if (
                !isNew &&
                lines.join('\n') === (label.slotted ? drawnLines : [text.text()]).join('\n')
            ) {
                text.attr('y', y);
                moveCenteredLabel(text, shown ? center : undefined, durationMs);
                return;
            }
            // A fade or move still running from the last toggle would write over this.
            text.interrupt()
                .attr('x', center)
                .attr('y', y)
                .attr('text-anchor', 'middle')
                .style('font-weight', label.fontWeight);
            if (label.slotted) {
                appendLabelLines(text.text(null), lines, { x: center, y, stack: 'down' });
            } else {
                text.text(label.text);
            }
            if (!shown) text.style('opacity', 0);
            else if (!isNew) text.style('opacity', 1);
        });
}
