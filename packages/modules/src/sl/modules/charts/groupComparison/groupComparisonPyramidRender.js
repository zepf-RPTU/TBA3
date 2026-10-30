/**
 * The population-pyramid drawing of the group comparison: the row labels in a centre
 * gutter, each group's bars growing outwards from it on its own 0–100 % wing, the share
 * at each wing's end, the percent axes below and the group names above. One keyed join
 * draws the first frame and animates a group swap, so bars, labels and headers move
 * from the old figures to the new ones.
 */

import * as d3 from 'd3';
import {
    getCompetenceAppearance,
    getCompetenceColor,
} from '../../../../common/services/themeService.js';
import {
    BAND_LABEL_GAP_PX,
    LABEL_LINE_HEIGHT_EM,
    appendLabelLines,
    fitLabelLine,
    fitLabelLines,
} from '../../../../common/charts/chartLabelFit.js';
import { computeStackedBarRects } from '../../../../common/utils/stackedBarUtils.js';
import {
    appendAxisGroup,
    callGridLines,
    createPercentAxis,
    measurePercentAxisSpace,
    measurePercentEdgeTickReserve,
} from '../../../../common/charts/chartAxisUtils.js';
import { AXIS_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { STUDENT_SHARE_AXIS_TITLE } from '../../../../common/domain/terms.js';
import { paintBarSegments } from '../../../../common/charts/renderers/stackedBarBuilder.js';
import {
    MOTION_EASE,
    animate,
    motionDuration,
} from '../../../../common/charts/motionPreference.js';
import { formatCount, formatPercent } from '../../../../common/utils/numberFormat.js';
import { fontWeightToken } from '../../../../common/utils/fontTokens.js';
import {
    VALUE_LABEL,
    styleValueLabels,
    valueLabelFont,
} from '../../../../common/charts/chartValueLabels.js';
import { ratingColor } from '../../../utils/slRatingAppearance.js';

/** @typedef {import('./groupComparisonDataUtils.js').GroupComparisonChartData} GroupComparisonChartData */
/** @typedef {import('./groupComparisonDataUtils.js').ComparisonGroup} ComparisonGroup */
/** @typedef {import('./groupComparisonDataUtils.js').ComparisonSegment} ComparisonSegment */
/** @typedef {import('./groupComparisonChart.js').GroupComparisonChart} GroupComparisonChart */
/** @typedef {import('d3').Selection<SVGGElement, string, any, any>} PyramidLayer */

/**
 * One drawn bar: a segment of one group's row. Its tooltip reads it.
 * @typedef {object} PyramidBar
 * @property {string} id - `group|row|segment`, the join key.
 * @property {ComparisonGroup} group
 * @property {string} label - What its tooltip names: the level, or the group's row label.
 * @property {ComparisonSegment & {start: number}} segment - The segment and where it starts, in percent.
 * @property {{x: number, y: number, width: number, height: number}} rect
 * @property {number} origin - Its inner end, where it grows from and shrinks to.
 */

/**
 * One row label in the gutter: group 1's or group 2's name for a row, or the row's one name.
 * @typedef {object} RowLabel
 * @property {string} id - Row key and label index, unique per label.
 * @property {string} rowKey
 * @property {string} label
 * @property {-1|0|1} side - -1 ends left of the centre, 1 starts right of it, 0 is centred on it.
 */

/**
 * Where a pyramid is drawn: the plot group and the plot's size.
 * @typedef {{g: import('d3').Selection<SVGGElement, unknown, any, any>, plot: {width: number, height: number}}} PyramidTarget
 */

/**
 * One wing's geometry: its percent scale, running from the gutter edge outward.
 * @typedef {object} Wing
 * @property {'group1'|'group2'} key - The group drawn on it.
 * @property {-1|1} direction - Left (-1) or right (1) of the gutter.
 * @property {d3.ScaleLinear<number, number>} scale - Percent → plot x.
 * @property {d3.Axis<number>} axis
 */

/** The most of the plot width the row-label gutter may take. */
const GUTTER_MAX_SHARE = 0.3;
/**
 * The group name's font: an axis title's weight.
 * @returns {{fontWeight: string}} The font override for measuring and drawing the name.
 */
function headerNameFont() {
    return { fontWeight: fontWeightToken('semibold') };
}

/**
 * Axis space around the plot: the wing headers above, the percent axes and their title
 * below, and each wing's end label beside. None of it depends on the data.
 * @param {GroupComparisonChart} chart - The renderer, for its text measurement.
 * @returns {{top: number, bottom: number, left: number, right: number}} Space per side, in px.
 */
export function measurePyramidMargins(chart) {
    const lineStep = chart.resolveChartTextSize('base') * LABEL_LINE_HEIGHT_EM;
    const nameHeight = chart.measureTexts(['Ag'], headerNameFont()).maxHeight;
    const wingEnd = Math.max(
        chart.measureTexts([formatPercent(100, 0)], valueLabelFont('outside')).maxWidth +
            VALUE_LABEL.gapPx,
        measurePercentEdgeTickReserve(chart),
    );
    return {
        top: nameHeight + lineStep + AXIS_DEFAULTS.titleGapPx,
        bottom: measurePercentAxisSpace(chart, 'bottom', {
            axisTitleText: STUDENT_SHARE_AXIS_TITLE,
        }),
        left: wingEnd,
        right: wingEnd,
    };
}

/**
 * The pyramid's geometry: the gutter sized to the widest row label (capped), the wings
 * filling the rest, and the row bands.
 * @param {GroupComparisonChart} chart
 * @param {GroupComparisonChartData} data
 * @param {{width: number, height: number}} plot - The plot area, px.
 * @returns {{centre: number, labelSlot: number, wingLength: number, lineStep: number, wings: Record<'group1'|'group2', Wing>, yScale: d3.ScaleBand<string>}} The gutter centre, each row label's width, the wings, a text line's step and the row bands.
 */
function layoutPyramid(chart, data, { width, height }) {
    const labels = data.rows.flatMap((row) => row.labels);
    const halves = data.rows.some((row) => row.labels.length > 1) ? 2 : 1;
    // A gap either side of the labels, and one between the halves of a pair.
    const gaps = (halves + 1) * BAND_LABEL_GAP_PX;
    const widest = chart.measureTexts(labels).maxWidth;
    const gutter = Math.min(halves * widest + gaps, width * GUTTER_MAX_SHARE);
    const centre = width / 2;
    const wingLength = Math.max(0, centre - gutter / 2);

    /** @type {Record<'group1'|'group2', Wing>} */
    const wings = {
        group1: buildWing('group1', -1, centre - gutter / 2, wingLength),
        group2: buildWing('group2', 1, centre + gutter / 2, wingLength),
    };
    return {
        centre,
        labelSlot: Math.max(0, (gutter - gaps) / halves),
        wingLength,
        lineStep: chart.resolveChartTextSize('base') * LABEL_LINE_HEIGHT_EM,
        wings,
        yScale: d3
            .scaleBand()
            .domain(data.rows.map((row) => row.key))
            .range([0, height])
            .padding(0.1),
    };
}

/**
 * @param {'group1'|'group2'} key
 * @param {-1|1} direction - Left (-1) or right (1) of the gutter.
 * @param {number} edge - The gutter edge the wing starts at, plot x.
 * @param {number} length
 * @returns {Wing}
 */
function buildWing(key, direction, edge, length) {
    const scale = d3
        .scaleLinear()
        .domain([0, 100])
        .range([edge, edge + direction * length]);
    return { key, direction, scale, axis: createPercentAxis('bottom', scale) };
}

/** The pyramid's layers, back to front. */
const LAYERS = ['grid', 'bars', 'value-labels', 'row-labels', 'axes', 'headers'];

/**
 * The pyramid's layers as one keyed join, so a redraw reuses them. The first draw also
 * adds the two wings' grid and axis groups; every draw puts the axes and their title at
 * the plot's current height, which a resize or a font-size change moves.
 * @param {GroupComparisonChart} chart - The renderer, for the axis title.
 * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g
 * @param {number} plotHeight - Where the axes sit.
 * @returns {Record<string, PyramidLayer>}
 */
function joinLayers(chart, g, plotHeight) {
    /** @type {PyramidLayer} */
    const existing = g.selectAll(':scope > g.pyramid-layer');
    const joined = existing.data(LAYERS, (d) => d);
    const entered = joined
        .enter()
        .append('g')
        .attr('class', (d) => `pyramid-layer pyramid-${d}`);
    /** @type {Record<string, PyramidLayer>} */
    const layers = Object.fromEntries(
        LAYERS.map((name) => [name, joined.merge(entered).filter((d) => d === name)]),
    );
    if (!entered.empty()) {
        for (const key of ['group1', 'group2']) {
            layers.grid.append('g').attr('class', `grid pyramid-grid--${key}`);
        }
    }
    for (const key of ['group1', 'group2']) {
        appendAxisGroup(layers.axes, `pyramid-axis--${key}`).attr(
            'transform',
            `translate(0, ${plotHeight})`,
        );
    }
    chart.renderAxisTitle(layers.axes, 'bottom', STUDENT_SHARE_AXIS_TITLE);
    return layers;
}

/**
 * A bar's paint: a competence level through the band contract, a rating band and a
 * point bar by colour. Resolved at draw time, so a theme switch repaints. Both wings'
 * point bars share the Lösungsquote hue: side and header already name the group.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {PyramidBar} bar
 * @returns {{appearance?: import('../../../../common/services/competenceLevelPaint.js').CompetenceAppearance, color?: string}} What `paintBarSegments` applies.
 */
function barPaint(palette, { segment: { paint } }) {
    if (paint.level) {
        const appearance = getCompetenceAppearance(palette, paint.level, paint.scaleId);
        return appearance
            ? { appearance }
            : { color: getCompetenceColor(palette, paint.level, paint.scaleId) };
    }
    if (paint.ratingKey) {
        return { color: ratingColor(paint.ratingKey) };
    }
    return { color: 'var(--result-correct)' };
}

/**
 * Each group's bars: one per segment, stacked outwards from the gutter edge through the
 * shared stacked-bar geometry (`computeStackedBarRects`, with its surface gap).
 * @param {GroupComparisonChartData} data
 * @param {ReturnType<typeof layoutPyramid>} layout
 * @returns {PyramidBar[]}
 */
function buildBars(data, { wings, yScale }) {
    return data.groups.flatMap((group, groupIndex) =>
        group.rows.flatMap((row, rowIndex) => {
            const { key: rowKey, labels } = data.rows[rowIndex];
            const wing = wings[group.key];
            // `start` is kept for the bar's `origin`; the rects stack by `percentage`.
            let start = 0;
            const segments = row.segments
                .map((segment) => {
                    const placed = { ...segment, percentage: segment.share, start };
                    start += segment.share;
                    return placed;
                })
                // An empty segment draws no bar: a zero-width mark would still take focus.
                .filter((segment) => segment.count > 0);
            return computeStackedBarRects(segments, {
                positionScale: wing.scale,
                isHorizontal: true,
                bandSizePx: yScale.bandwidth(),
                crossOffsetPx: /** @type {number} */ (yScale(rowKey)),
            }).map(({ segment, ...rect }) => ({
                id: `${group.key}|${rowKey}|${segment.key}`,
                group,
                // A level segment names its level; a whole-row bar its row.
                label: segment.paint.level ?? labels[groupIndex] ?? labels[0],
                segment,
                rect,
                origin: wing.scale(segment.start),
            }));
        }),
    );
}

/**
 * Draw the pyramid, or move a drawn one to new data. Every layer is a keyed join, so a
 * group swap animates bars, labels and headers from what is on screen; `durationMs: 0`
 * draws in place.
 * @param {GroupComparisonChart} chart - The renderer: measurement, tooltips, axis title.
 * @param {PyramidTarget} target
 * @param {GroupComparisonChartData} data - Has at least one row.
 * @param {{durationMs: number}} options - Transition length.
 */
export function drawPyramid(chart, { g, plot }, data, { durationMs }) {
    const layout = layoutPyramid(chart, data, plot);
    const { yScale, wings } = layout;
    const rowCentre = (/** @type {string} */ rowKey) =>
        /** @type {number} */ (yScale(rowKey)) + yScale.bandwidth() / 2;
    /**
     * @template {import('d3').BaseType} E
     * @template D
     * @param {import('d3').Selection<E, D, SVGGElement, string>} exit - A layer's leaving marks.
     */
    const fadeOut = (exit) => {
        animate(exit, { durationMs }).style('opacity', 0).remove();
    };
    const layers = joinLayers(chart, g, plot.height);

    // Behind the bars: each wing's gridlines at its own axis's ticks, moved with the axis.
    for (const wing of Object.values(wings)) {
        callGridLines(
            animate(layers.grid.select(`.pyramid-grid--${wing.key}`), { durationMs }),
            'bottom',
            wing.axis,
            plot.height,
        );
    }

    /** @type {import('d3').Selection<SVGRectElement, PyramidBar, SVGGElement, string>} */
    const drawnBars = layers.bars.selectAll('rect.pyramid-bar');
    const bars = drawnBars
        .data(buildBars(data, layout), (/** @type {PyramidBar} */ d) => d.id)
        .join(
            (enter) =>
                enter
                    .append('rect')
                    .attr('class', 'bar-segment pyramid-bar')
                    .attr('x', (d) => d.origin)
                    .attr('width', 0)
                    .attr('y', (d) => d.rect.y)
                    .attr('height', (d) => d.rect.height),
            undefined,
            // An exiting bar gives up hover and the tab stop (`isMarkShown` reads the
            // inline pointer-events), so the stop never leaves with it.
            (exit) =>
                animate(exit.style('pointer-events', 'none'), { durationMs })
                    .attr('x', (/** @type {PyramidBar} */ d) => d.origin)
                    .attr('width', 0)
                    .remove(),
        )
        // A bar caught mid-exit by the next swap is back.
        .style('pointer-events', null);
    paintBarSegments(bars, (bar) => barPaint(chart.context.palette, bar));
    animate(bars, { durationMs })
        .attr('x', (d) => d.rect.x)
        .attr('width', (d) => d.rect.width)
        .attr('y', (d) => d.rect.y)
        .attr('height', (d) => d.rect.height);
    chart.wireTooltipEvents(bars, {
        getTooltipContent: (d) =>
            chart.formatTooltipContent(d, { measureLabel: data.measureLabel }),
        hoverEffect: 'area',
    });

    // The share at each wing's end, so the two groups read without the axis. A row at
    // 0 % gets none: the empty row already says so.
    const valueData = data.groups.flatMap((group) =>
        group.rows
            .map((row, index) => ({
                id: `${group.key}|${data.rows[index].key}`,
                wing: wings[group.key],
                rowKey: data.rows[index].key,
                share: row.share ?? 0,
            }))
            .filter((d) => d.share > 0),
    );
    const valueLabels = layers['value-labels']
        .selectAll('text.value-label')
        .data(valueData, (/** @type {(typeof valueData)[number]} */ d) => d.id)
        .join(
            (enter) =>
                enter
                    .append('text')
                    .attr('class', 'value-label')
                    .attr('dominant-baseline', 'middle')
                    .attr('x', (d) => d.wing.scale(0) + d.wing.direction * VALUE_LABEL.gapPx)
                    .attr('y', (d) => rowCentre(d.rowKey))
                    .style('opacity', 0),
            undefined,
            fadeOut,
        )
        .attr('text-anchor', (d) => (d.wing.direction < 0 ? 'end' : 'start'))
        .text((d) => formatPercent(d.share, 0));
    styleValueLabels(valueLabels, { placement: 'outside' });
    animate(valueLabels, { durationMs })
        .attr('x', (d) => d.wing.scale(d.share) + d.wing.direction * VALUE_LABEL.gapPx)
        .attr('y', (d) => rowCentre(d.rowKey))
        .style('opacity', 1);

    drawRowLabels(chart, layers['row-labels'], data, layout, { durationMs, rowCentre, fadeOut });

    for (const wing of Object.values(wings)) {
        /** @type {PyramidLayer} The wing's axis group, which `joinLayers` appended. */
        const axisGroup = layers.axes.select(`.pyramid-axis--${wing.key}`);
        animate(axisGroup, { durationMs }).call(wing.axis);
    }

    drawWingHeaders(chart, layers.headers, data, layout, { durationMs });
}

/**
 * The row labels, centred in the gutter in tick ink. When the two ladders name a row
 * differently, group 1's name ends left of the centre and group 2's starts right of it.
 * A label wider than its slot is broken over two lines and fitted (`chartLabelFit`).
 * @param {GroupComparisonChart} chart
 * @param {PyramidLayer} parent
 * @param {GroupComparisonChartData} data
 * @param {ReturnType<typeof layoutPyramid>} layout
 * @param {{durationMs: number, rowCentre: (rowKey: string) => number, fadeOut: (exit: import('d3').Selection<import('d3').BaseType, RowLabel, SVGGElement, string>) => void}} motion - The transition and row positions.
 */
function drawRowLabels(chart, parent, data, layout, { durationMs, rowCentre, fadeOut }) {
    const { centre, labelSlot } = layout;
    /** @type {RowLabel[]} */
    const labelData = data.rows.flatMap((row) =>
        row.labels.map((label, index) => ({
            id: `${row.key}|${index}`,
            rowKey: row.key,
            label,
            side: row.labels.length === 1 ? 0 : index === 0 ? -1 : 1,
        })),
    );
    // A label that fits stays on one line; only a longer one is broken and fitted.
    const fitted = (/** @type {string} */ label) =>
        chart.measureTexts([label]).maxWidth <= labelSlot
            ? [label]
            : fitLabelLines(chart, label, labelSlot);
    const position = (/** @type {{rowKey: string, side: number}} */ d) =>
        `translate(${centre + (d.side * BAND_LABEL_GAP_PX) / 2}, ${rowCentre(d.rowKey)})`;

    const rowLabels = parent
        .selectAll('text.pyramid-row-label')
        .data(labelData, (/** @type {RowLabel} */ d) => d.id)
        .join(
            (enter) =>
                enter
                    .append('text')
                    .attr('class', 'pyramid-row-label axis-tick-label')
                    .attr('dominant-baseline', 'middle')
                    .attr('transform', position)
                    .style('opacity', 0),
            undefined,
            fadeOut,
        )
        .attr('text-anchor', (d) => (d.side < 0 ? 'end' : d.side > 0 ? 'start' : 'middle'));
    rowLabels.each(function (d) {
        appendLabelLines(d3.select(this).text(null), fitted(d.label), {
            x: 0,
            y: 0,
            stack: 'center',
        });
    });
    animate(rowLabels, { durationMs }).attr('transform', position).style('opacity', 1);
}

/**
 * Each wing's header above the plot: the group's name at title weight, fitted to the
 * wing, over its headcount in tick ink. A swap cross-fades the text.
 * @param {GroupComparisonChart} chart
 * @param {PyramidLayer} parent
 * @param {GroupComparisonChartData} data
 * @param {ReturnType<typeof layoutPyramid>} layout
 * @param {{durationMs: number}} options - Transition length.
 */
function drawWingHeaders(chart, parent, data, layout, { durationMs }) {
    const { wings, wingLength, lineStep } = layout;
    const nameSlot = Math.max(0, wingLength - BAND_LABEL_GAP_PX);

    const headers = parent
        .selectAll('g.wing-header')
        .data(data.groups, (/** @type {ComparisonGroup} */ d) => d.key)
        .join((enter) => {
            const header = enter.append('g').attr('class', 'wing-header');
            header
                .append('text')
                .attr('class', 'wing-header-name axis-label')
                .attr('text-anchor', 'middle')
                .style('font-weight', headerNameFont().fontWeight);
            header
                .append('text')
                .attr('class', 'wing-header-count axis-tick-label')
                .attr('text-anchor', 'middle')
                .attr('y', -AXIS_DEFAULTS.titleGapPx);
            return header;
        });
    // The line step follows the text size, which a font-size change moves.
    headers.select('.wing-header-name').attr('y', -(AXIS_DEFAULTS.titleGapPx + lineStep));

    // `select` hands each header's new datum down to its lines.
    const setText = (
        /** @type {import('d3').Selection<import('d3').BaseType, ComparisonGroup, any, any>} */ header,
    ) => {
        header
            .select('.wing-header-name')
            .text((d) => fitLabelLine(chart, d.label, nameSlot, headerNameFont()));
        header.select('.wing-header-count').text((d) => `n = ${formatCount(d.count)}`);
    };

    animate(headers, { durationMs }).attr(
        'transform',
        (d) => `translate(${wings[d.key].scale(50)}, 0)`,
    );
    const halfMs = motionDuration(durationMs / 2);
    if (halfMs === 0) {
        setText(headers);
        return;
    }
    // Fade out, swap the text at the low point, fade in.
    headers
        .transition('text')
        .duration(halfMs)
        .ease(MOTION_EASE)
        .style('opacity', 0)
        .on('end', function () {
            setText(d3.select(this));
        })
        .transition()
        .duration(halfMs)
        .style('opacity', 1);
}
