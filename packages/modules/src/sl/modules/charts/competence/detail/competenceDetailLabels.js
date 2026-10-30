/**
 * Label geometry for the competence detail chart: the top group/domain labels,
 * the per-bar/per-domain label layout and the two-line Domäne labels.
 * The bottom (x-axis) labels live in `competenceDetailAxes.js`.
 *
 * Measurement functions take the renderer for its cached text measurement and its
 * glossary stamping.
 */

import * as d3 from 'd3';
import {
    animate,
    fadeOutAndRemove,
    takeBack,
} from '../../../../../common/charts/motionPreference.js';
import {
    LABEL_LINE_HEIGHT_EM,
    appendLabelLines,
    splitLabelLines,
} from '../../../../../common/charts/chartLabelFit.js';
import { fontWeightToken } from '../../../../../common/utils/fontTokens.js';
import { subjectDomainKey } from '../../../../utils/slLevelDefinitions.js';
import { TEACHING_QUALITY_TAG } from './competenceTeachingQuality.js';
import { barTopLabelReserve } from '../shared/competenceBar.js';

const DETAIL_TOP_GROUP_LABEL_OFFSET_PX = 25;
const DETAIL_TOP_GROUP_LABEL_BUFFER_PX = 6;
/** The transition a Fach label leaves on, so its return can cancel it. */
const SUBJECT_LABEL_EXIT = 'subject-label-exit';

/**
 * One Domäne label as it will be drawn: its wrapped lines and their measured extent, in px.
 * @typedef {object} DomainLabelLayout
 * @property {string[]} lines - Top to bottom.
 * @property {number} width - Of the widest line.
 * @property {number} height - Of all lines together.
 */

/**
 * Height reserved above the bars for the group labels and the per-bar labels.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer
 * @param {import('./competenceDetailRenderer.js').DetailModel} model
 * @param {Map<string, DomainLabelLayout>} domainLabels
 * @param {number} barLabelFontSize - Font size the per-bar labels are measured at.
 * @returns {number} Reserved height in px.
 */
export function measureDetailTopAxisSpace(renderer, model, domainLabels, barLabelFontSize) {
    const { chartData, groupingConfig, hasTeachingQuality, showBarLabels } = model;
    const reserves = [
        measureDetailTopGroupLabelSpace(renderer, model, domainLabels, barLabelFontSize),
    ];

    // The `Q` tag above a Unterrichtsqualität slot is drawn even where the bars are not
    // labelled, so it needs the reserve too.
    const labelTexts = [
        ...(showBarLabels
            ? chartData.map((d) => groupingConfig.getLabelText(d)).filter(Boolean)
            : []),
        ...(hasTeachingQuality ? [TEACHING_QUALITY_TAG] : []),
    ];
    // Free-text group names wrap over up to two lines; the lines drawn are measured.
    reserves.push(barTopLabelReserve(renderer, labelTexts, { fontSizePx: barLabelFontSize }));

    return Math.max(0, ...reserves);
}

/**
 * Whether the per-bar labels are drawn at all. A group holding one bar is already named
 * by its group label, so labelling the bar too would just repeat it. Grouped by Fach a
 * group always holds several.
 * @param {import('./competenceDetailData.js').CompetenceChartRow[]} chartData
 * @param {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @returns {boolean}
 */
export function showsMultiDomainBarLabels(chartData, groupingConfig) {
    if (groupingConfig.groupBySubject) return true;
    /** @type {Map<string, number>} */
    const countByGroup = new Map();
    for (const d of chartData) {
        if (d.type === 'comparison') continue;
        const key = groupingConfig.getGroupKey(d);
        const count = (countByGroup.get(key) ?? 0) + 1;
        if (count > 1) return true;
        countByGroup.set(key, count);
    }
    return false;
}

/**
 * Measure every Domäne label drawn above the bars once: grouped by Fach, the label over
 * each Domäne of a Fach with several.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer - Measures the text.
 * @param {Pick<import('./competenceDetailRenderer.js').DetailModel, 'chartData'|'groupingConfig'>} model
 * @param {number} barLabelFontSize - Font size the labels are drawn at.
 * @returns {Map<string, DomainLabelLayout>} Each label by `subject|domain`.
 */
export function measureDomainLabels(renderer, { chartData, groupingConfig }, barLabelFontSize) {
    /** @type {Map<string, DomainLabelLayout>} */
    const labels = new Map();
    if (!groupingConfig.groupBySubject) return labels;
    for (const d of chartData) {
        const key = subjectDomainKey(d.subject, d.domain);
        if (groupingConfig.subjectDomainOrder[d.subject].length < 2 || labels.has(key)) continue;
        const layout = measureDomainLabelLayout(renderer, d.displayDomainLabel, barLabelFontSize);
        if (layout) labels.set(key, layout);
    }
    return labels;
}

/**
 * Measure one Domäne label as it will be drawn — broken over at most two lines by the
 * shared label policy (`splitLabelLines`), at the segment-label size. The layout widens the
 * gap between the Domänen to fit the label, so there is no slot to shorten it to.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer
 * @param {string} label
 * @param {number} barLabelFontSize - Font size the label is drawn at.
 * @returns {DomainLabelLayout|null} Its lines and their measured extent, or `null` for a label with no words.
 */
function measureDomainLabelLayout(renderer, label, barLabelFontSize) {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
        return null;
    }

    const lines = splitLabelLines(normalizedLabel);

    const measured = renderer.measureTexts(lines, {
        fontSizePx: barLabelFontSize,
        fontWeight: fontWeightToken('bold'),
    });
    // Drawn one `LABEL_LINE_HEIGHT_EM` apart, like every other wrapped chart label.
    return {
        lines,
        width: measured.maxWidth,
        height:
            (measured.maxHeight || barLabelFontSize) +
            (lines.length - 1) * barLabelFontSize * LABEL_LINE_HEIGHT_EM,
    };
}

/**
 * Draw one measured Domäne label, growing upwards from `y` so a two-line label stays
 * clear of the bars rather than pushing into them, ahead of the group's bars.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer - The chart renderer, used for glossary stamping.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} domainGroup - The group the label is appended to.
 * @param {DomainLabelLayout} labelLayout
 * @param {number} x - Label centre in px.
 * @param {number} y - Baseline of the label's *last* line.
 * @param {string} domainSuffix - `d<index>`, the Domäne's place in its Fach, stamped as a data attribute so the label can be found again.
 * @param {string|null} [glossaryKey] - Glossary entry the label links to, when it has one.
 * @returns {d3.Selection<SVGTextElement, unknown, any, any>}
 */
function appendDomainLabelText(
    renderer,
    domainGroup,
    labelLayout,
    x,
    y,
    domainSuffix,
    glossaryKey = null,
) {
    // Before the group's bars, which a label drawn after them would otherwise follow.
    const label = domainGroup
        .insert('text', '.sub-bar-group')
        .attr('class', 'domain-label')
        .attr('data-domain', domainSuffix)
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .style('font-weight', fontWeightToken('bold'))
        .style('fill', 'var(--text-secondary)');
    appendLabelLines(label, labelLayout.lines, { x, y, stack: 'up' });
    // The whole label is the term: one tab stop however many lines it wraps to.
    renderer.context.glossary.stampGlossaryAttr(label, glossaryKey);

    return label;
}

/**
 * Height the group labels above the bars need: grouped by Fach the tallest Domäne label,
 * so every group reserves the same and the bars stay aligned; grouped by group with
 * several Fächer the rotated Fach names over a Fach's Domänen.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer - Measures the text.
 * @param {Pick<import('./competenceDetailRenderer.js').DetailModel, 'chartData'|'groupingConfig'>} model
 * @param {Map<string, DomainLabelLayout>} domainLabels
 * @param {number} barLabelFontSize - Font size the labels are measured at.
 * @returns {number} Reserved height in px.
 */
function measureDetailTopGroupLabelSpace(
    renderer,
    { chartData, groupingConfig },
    domainLabels,
    barLabelFontSize,
) {
    if (groupingConfig.groupBySubject) {
        const heights = [...domainLabels.values()].map((layout) => layout.height);
        return heights.length > 0
            ? DETAIL_TOP_GROUP_LABEL_OFFSET_PX +
                  Math.ceil(Math.max(...heights)) +
                  DETAIL_TOP_GROUP_LABEL_BUFFER_PX
            : 0;
    }
    const rotatedSubjectLabels = groupSubjectLabels(chartData, groupingConfig);
    if (rotatedSubjectLabels.length === 0) return 0;
    const measured = renderer.measureTexts(rotatedSubjectLabels, {
        fontSizePx: barLabelFontSize,
        fontWeight: fontWeightToken('bold'),
        rotationDeg: -45,
    });
    return (
        DETAIL_TOP_GROUP_LABEL_OFFSET_PX +
        Math.ceil(measured.maxHeight) +
        DETAIL_TOP_GROUP_LABEL_BUFFER_PX
    );
}

/**
 * The Fächer named above their Domänen' bars when grouped by group: with several Fächer
 * on the chart, each one split into Domänen.
 * @param {import('./competenceDetailData.js').CompetenceChartRow[]} chartData
 * @param {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @returns {string[]} Those Fächer; none in any other grouping.
 */
function groupSubjectLabels(chartData, groupingConfig) {
    if (groupingConfig.groupBySubject || groupingConfig.groupByDomain) return [];
    const subjects = new Set(chartData.map((d) => d.subject));
    if (subjects.size < 2) return [];
    return [...new Set(chartData.filter((d) => d.subjectDomainCount > 1).map((d) => d.subject))];
}

/**
 * The horizontal centre of the visible bars a predicate picks.
 * @param {import('./competenceDetailBarLayout.js').PlacedBar[]} bars - A group's placed bars.
 * @param {number} barWidth - Bar width in px.
 * @param {(row: import('./competenceDetailData.js').CompetenceChartRow) => boolean} picks - Which rows' bars the span covers; the Unterrichtsqualität slot never counts.
 * @returns {number|undefined} The span's centre, or `undefined` when no such bar is visible.
 */
export function barSpanCenter(bars, barWidth, picks) {
    const xs = bars.filter((bar) => bar.row !== null && picks(bar.row)).map((bar) => bar.x);
    return xs.length === 0 ? undefined : (Math.min(...xs) + Math.max(...xs) + barWidth) / 2;
}

/**
 * Whether a row belongs to a given Domäne of its Fach.
 * @param {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @param {number} index - The Domäne's place in its Fach, in payload order.
 * @returns {(row: import('./competenceDetailData.js').CompetenceChartRow) => boolean}
 */
export function inDomain(groupingConfig, index) {
    return (row) =>
        groupingConfig.groupBySubject &&
        groupingConfig.subjectDomainOrder[row.subject]?.[index] === row.domain;
}

/**
 * Whether a label was faded by a toggle, and so carries an opacity to bring back. One
 * never faded carries none, and keeps it that way: a redraw leaves its markup as drawn.
 * @param {d3.Selection<any, any, any, any>} label - The text node.
 * @returns {boolean} True when it carries an inline opacity.
 */
function wasFaded(label) {
    return /** @type {SVGElement|null} */ (label.node())?.style.opacity !== '';
}

/**
 * Move a centred label — the text node and every line in it, which carry their own `x` —
 * or fade it out when nothing under it is visible.
 * @template {d3.BaseType} E
 * @template D
 * @param {d3.Selection<E, D, any, any>} label - The text node.
 * @param {number|undefined} x - The new centre; `undefined` hides the label.
 * @param {number} durationMs - Transition length.
 */
export function moveCenteredLabel(label, x, durationMs) {
    // A fade still running from the last toggle gives way to this one.
    const move = animate(label.interrupt(), { durationMs });
    if (x === undefined) {
        move.style('opacity', 0);
        return;
    }
    if (wasFaded(label)) move.style('opacity', 1);
    move.attr('x', x);
    animate(label.selectAll('tspan'), { durationMs }).attr('x', x);
}

/**
 * Draw the group labels above one group's bars, or move the drawn ones over the bars
 * the legend leaves on: grouped by Fach the labels over its Domänen, grouped by
 * group the rotated Fach names over a Fach's Domänen. A Domäne label whose bars are all
 * hidden fades where it stands; a Fach label whose bars are all hidden fades out and
 * goes, and comes back with them.
 * @param {import('./competenceDetailRenderer.js').CompetenceDetailRenderer} renderer - The chart renderer, used for glossary stamping.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} domainGroup - The group holding the labels.
 * @param {import('./competenceDetailData.js').CompetenceChartRow[]} rows - The rows in this group.
 * @param {import('./competenceDetailBarLayout.js').PlacedBar[]} bars - The group's visible bars, placed.
 * @param {number} barWidth - Bar width in px.
 * @param {object} options
 * @param {import('./competenceDetailData.js').CompetenceChartRow[]} options.chartData - Every row of the chart.
 * @param {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} options.groupingConfig
 * @param {Map<string, DomainLabelLayout>} options.domainLabels
 * @param {number} options.durationMs - How long a drawn label moves.
 */
export function renderDomainLabels(
    renderer,
    domainGroup,
    rows,
    bars,
    barWidth,
    { chartData, groupingConfig, domainLabels, durationMs },
) {
    if (groupingConfig.groupBySubject) {
        const { subject } = rows[0];
        groupingConfig.subjectDomainOrder[subject].forEach((domain, index) => {
            // Over every bar of the Domäne, the comparisons included.
            const centerX = barSpanCenter(bars, barWidth, inDomain(groupingConfig, index));
            const drawn = domainGroup.selectChild(`text.domain-label[data-domain="d${index}"]`);
            if (!drawn.empty()) {
                moveCenteredLabel(drawn, centerX, durationMs);
                return;
            }
            const labelLayout = domainLabels.get(subjectDomainKey(subject, domain));
            if (!labelLayout || centerX === undefined) return;
            appendDomainLabelText(
                renderer,
                domainGroup,
                labelLayout,
                centerX,
                -DETAIL_TOP_GROUP_LABEL_OFFSET_PX,
                `d${index}`,
                // The entry for this Domäne of this Fach: its name alone (`Lesen`)
                // names a Domäne of several Fächer.
                renderer.context.glossary.resolveDomainEntryKey(domain, subject),
            );
        });
        return;
    }

    /** @type {(subject: string) => number} */
    const centerOf = (subject) =>
        /** @type {number} */ (barSpanCenter(bars, barWidth, (row) => row.subject === subject));
    const labelled = new Set(groupSubjectLabels(chartData, groupingConfig));
    // The Fächer named over this group: labelled ones with a visible bar, in bar order.
    const shown = [...new Set(bars.flatMap((bar) => (bar.row ? [bar.row.subject] : [])))].filter(
        (subject) => labelled.has(subject),
    );
    domainGroup
        .selectChildren('text.subject-label')
        .data(shown, (d) => /** @type {string} */ (d))
        .join(
            (enter) => {
                const label = enter
                    .insert('text', '.sub-bar-group')
                    .attr('class', 'subject-label')
                    .attr('x', centerOf)
                    .attr('y', -DETAIL_TOP_GROUP_LABEL_OFFSET_PX)
                    .attr('text-anchor', 'start')
                    .attr('transform', (d) => subjectLabelRotation(centerOf(d)))
                    .style('font-weight', fontWeightToken('bold'))
                    .style('fill', 'var(--text-secondary)')
                    .text((d) => d);
                // A label back from a toggle fades in; a first draw has nothing to move.
                if (durationMs > 0)
                    animate(label.style('opacity', 0), { durationMs }).style('opacity', 1);
                return label;
            },
            (update) =>
                update.each(function (subject) {
                    // One leaving a moment ago stays: its fade and removal give way.
                    const label = takeBack(d3.select(this), SUBJECT_LABEL_EXIT);
                    const x = centerOf(subject);
                    const move = animate(label.interrupt(), { durationMs });
                    if (wasFaded(label)) move.style('opacity', 1);
                    move.attr('x', x).attr('transform', subjectLabelRotation(x));
                }),
            (exit) => fadeOutAndRemove(exit, SUBJECT_LABEL_EXIT, durationMs),
        );
}

/**
 * The rotation a Fach label is drawn at, pivoting on its own anchor.
 * @param {number} centerX - The label's anchor.
 * @returns {string} The `transform` attribute.
 */
function subjectLabelRotation(centerX) {
    return `rotate(-45, ${centerX}, ${-DETAIL_TOP_GROUP_LABEL_OFFSET_PX})`;
}
