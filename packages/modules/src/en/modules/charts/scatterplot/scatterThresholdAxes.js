/**
 * The scatterplot's frame: both percent axes with the GER thresholds merged in as
 * accent guides, and the band labels with their colour swatches; both are joins that
 * draw on the first call and move on the next (the zoom). Free functions over the
 * renderer's scales and thresholds.
 */

import * as d3 from 'd3';
import { AXIS_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import {
    REFERENCE_LINE_CLASS,
    appendAxisGroup,
    createPercentAxis,
    measurePercentAxisSpace,
    measurePercentEdgeTickReserve,
    percentTickValues,
} from '../../../../common/charts/chartAxisUtils.js';
import { getCompetenceColor } from '../../../../common/services/themeService.js';
import { fontWeightToken } from '../../../../common/utils/fontTokens.js';
import { animate } from '../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { PERCENT_RANGE } from './scatterplotConstants.js';

/** @typedef {import('./scatterplot.js').Scatterplot} Scatterplot */

/** @typedef {d3.Selection<SVGGElement, unknown, any, any>} PlotGroup */

/**
 * One domain's bands: the level names and the cut scores between them, in percent.
 * @typedef {{competenceLevelNames: string[], competenceLevelPercentageThresholds: number[]}} GerBandTable
 */

/** The band swatch beside a level label on the frame. */
const BAND_SWATCH = Object.freeze({ SIZE_PX: 8, GAP_PX: 4, CORNER_RADIUS_PX: 2 });

/**
 * The threshold positions per axis, with the 0/100 edges dropped because a line on
 * the axis itself carries no information.
 * @param {import('./scatterplot.js').ScatterplotOptions['gerThresholds']} gerThresholds
 * @param {string[]} domainIds - The x-axis domain id, then the y-axis one.
 * @returns {{x: number[], y: number[]}} In percent.
 */
export function validThresholds(gerThresholds, [xDomain, yDomain]) {
    const [min, max] = PERCENT_RANGE;
    const inner = (/** @type {GerBandTable|null|undefined} */ table) =>
        table ? table.competenceLevelPercentageThresholds.filter((t) => t > min && t < max) : [];
    return { x: inner(gerThresholds?.[xDomain]), y: inner(gerThresholds?.[yDomain]) };
}

/**
 * The band-label row under the x tick labels and column left of the y tick labels,
 * measured over every level name so the frame does not change size on zoom.
 * @param {Scatterplot} chart
 * @returns {{rowHeight: number, columnWidth: number}} In px; 0 for an axis without bands.
 */
function measureBandLabels(chart) {
    const [xDomain, yDomain] = chart.axisDomainIds;
    const measure = (/** @type {GerBandTable|null|undefined} */ table) =>
        table
            ? chart.measureTexts(table.competenceLevelNames, {
                  fontWeight: fontWeightToken('semibold'),
              })
            : null;
    const x = measure(chart.gerThresholds[xDomain]);
    const y = measure(chart.gerThresholds[yDomain]);
    return {
        rowHeight: x ? x.maxHeight : 0,
        columnWidth: y ? y.maxWidth + BAND_SWATCH.SIZE_PX + BAND_SWATCH.GAP_PX : 0,
    };
}

/**
 * The axis space the frame needs per side. Bottom and left hold, from the plot outward,
 * the tick labels, the band labels and the axis title; top and right only keep the
 * outermost `100 %` tick from being clipped.
 * @param {Scatterplot} chart
 * @returns {{top: number, right: number, bottom: number, left: number}} In px.
 */
export function measureThresholdAxesSpace(chart) {
    const [xDomain, yDomain] = chart.axisDomainIds;
    const { rowHeight, columnWidth } = measureBandLabels(chart);
    const band = (/** @type {number} */ extent) =>
        extent > 0 ? AXIS_DEFAULTS.tickPaddingPx + extent : 0;
    return {
        top: measurePercentEdgeTickReserve(chart, { useHeight: true }),
        right: measurePercentEdgeTickReserve(chart),
        bottom:
            measurePercentAxisSpace(chart, 'bottom', {
                axisTitleText: chart.domainTitles[xDomain],
            }) + band(rowHeight),
        left:
            measurePercentAxisSpace(chart, 'left', {
                axisTitleText: chart.domainTitles[yDomain],
            }) + band(columnWidth),
    };
}

/**
 * Draw both axis titles, outside the band labels.
 * @param {Scatterplot} chart - After `initializeSVG()`.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g
 */
export function renderAxisTitles(chart, g) {
    const [xDomain, yDomain] = chart.axisDomainIds;
    // Each title links the entry that claims its domain's id.
    const { glossary } = chart.context;
    chart.renderAxisTitle(g, 'bottom', chart.domainTitles[xDomain], {
        glossaryKey: glossary.resolveDomainEntryKey(xDomain) ?? undefined,
    });
    chart.renderAxisTitle(g, 'left', chart.domainTitles[yDomain], {
        glossaryKey: glossary.resolveDomainEntryKey(yDomain) ?? undefined,
    });
}

/** The guide step of each domain's colour, by the domain's place in the EN config. */
const DOMAIN_GUIDES = ['var(--chart-domain0-guide)', 'var(--chart-domain1-guide)'];

/**
 * Draw both percent axes with their GER threshold guides, or move them to the scales'
 * current domain. Each axis takes the colour of the domain it plots.
 * @param {Scatterplot} chart - The renderer, its scales set to the domain to show.
 * @param {PlotGroup} g
 * @param {number} durationMs - `0` draws immediately.
 */
export function drawThresholdAxes(chart, g, durationMs) {
    const [xDomain, yDomain] = chart.axisDomainIds;
    /**
     * @param {string} domainId
     * @returns {string} The guide step of the domain's colour.
     */
    const guideOf = (domainId) => DOMAIN_GUIDES[chart.enConfig.domainIds.indexOf(domainId)];
    drawThresholdAxis(chart, g, 'bottom', guideOf(xDomain), durationMs);
    drawThresholdAxis(chart, g, 'left', guideOf(yDomain), durationMs);
}

/**
 * One percent axis: the regular ticks merged with the band thresholds, each threshold's
 * tick drawn as a dashed accent guide across the plot. A threshold prints no value: the
 * exact cut score lives in the tooltip and the Äquivalenztabelle.
 * @param {Scatterplot} chart
 * @param {PlotGroup} g
 * @param {'bottom'|'left'} side
 * @param {string} accentColor - Colour of the threshold guides, the guide step of the axis's domain colour.
 * @param {number} durationMs
 */
function drawThresholdAxis(chart, g, side, accentColor, durationMs) {
    const isX = side === 'bottom';
    const className = isX ? 'x-axis' : 'y-axis';
    const scale = isX ? chart.xScale : chart.yScale;
    const thresholds = chart.thresholds[isX ? 'x' : 'y'];
    const [min, max] = scale.domain();
    const regularTicks = new Set(percentTickValues(scale, side));
    const tickValues = [
        ...new Set([...regularTicks, ...thresholds.filter((t) => t >= min && t <= max)]),
    ].sort((a, b) => a - b);
    const axis = createPercentAxis(side, scale, { tickValues });

    const group = appendAxisGroup(g, className);
    if (isX) group.attr('transform', `translate(0, ${chart.plotHeightPx})`);
    animate(group, { durationMs }).call(axis);

    const guides = group.selectAll('.tick').filter((d) => thresholds.includes(d));
    // A cut score on a regular tick keeps that tick's value; a zoom changes which
    // ticks are regular, so every guide's label is set again.
    guides
        .select('text')
        .style('display', (d) => (regularTicks.has(/** @type {number} */ (d)) ? null : 'none'));
    const lines = guides
        .select('line')
        .attr('class', REFERENCE_LINE_CLASS.accent)
        .style('stroke', accentColor);
    const [attr, length] = isX ? ['y2', -chart.plotHeightPx] : ['x2', chart.plotWidthPx];
    animate(lines, { durationMs }).attr(attr, length);
}

/**
 * Join both axes' band labels at the scales' current domain: a label whose band comes
 * into view fades in, one whose band leaves fades out, and the rest slide with the axis.
 * @param {Scatterplot} chart - The renderer, its scales set to the domain to show.
 * @param {PlotGroup} g
 * @param {number} durationMs - `0` draws immediately.
 */
export function joinCompetenceLabels(chart, g, durationMs) {
    const [xDomain, yDomain] = chart.axisDomainIds;
    const { rowHeight, columnWidth } = measureBandLabels(chart);
    // Each sits one tick padding outside its axis's tick labels.
    const rowCenter =
        chart.plotHeightPx +
        measurePercentAxisSpace(chart, 'bottom') +
        AXIS_DEFAULTS.tickPaddingPx +
        rowHeight / 2;
    const columnCenter = -(
        measurePercentAxisSpace(chart, 'left') +
        AXIS_DEFAULTS.tickPaddingPx +
        columnWidth / 2
    );

    // Guarded per axis, not jointly: a domain whose payload ships no equivalence
    // table has no bands to label, but that must not silence the other domain's.
    // X axis: a band narrower than its own label (C1 spans 1–2 % of
    // the axis) would print over its neighbour, so it goes unnamed until a zoom
    // widens it enough to bring the label back.
    const xPlacements = bandLabelPlacements(chart.gerThresholds[xDomain], chart.xScale, {
        minExtent: (ger) =>
            chart.measureTexts([ger], { fontWeight: fontWeightToken('semibold') }).maxWidth +
            BAND_SWATCH.SIZE_PX +
            BAND_SWATCH.GAP_PX,
        place: (center) => [center, rowCenter],
    });
    // Y axis: a band shorter than the label's glyphs (one font size;
    // the measured text box adds line leading the glyphs never fill) is skipped the
    // same way.
    const yPlacements = bandLabelPlacements(chart.gerThresholds[yDomain], chart.yScale, {
        minExtent: () => chart.resolveChartTextSize('base'),
        place: (center) => [columnCenter, center],
    });
    // One layer for both axes' labels, so a label a zoom brings back keeps its place
    // under the points.
    const layer = selectOrAppend(g, 'g', 'ger-band-labels');
    joinBandLabels(chart.context, layer, 'x', xPlacements, durationMs);
    joinBandLabels(chart.context, layer, 'y', yPlacements, durationMs);
}

/**
 * Where one axis's band labels go, each centred within the visible part of its band.
 * @param {GerBandTable|null|undefined} table - None places nothing.
 * @param {d3.ScaleLinear<number, number>} scale - Its current domain is the visible range.
 * @param {{minExtent: (ger: string) => number, place: (center: number) => [number, number]}} spec - The smallest band extent in px that still takes a label, and where a label centred at that pixel goes.
 * @returns {BandLabelPlacement[]}
 */
function bandLabelPlacements(table, scale, { minExtent, place }) {
    if (!table) return [];
    const [visibleMin, visibleMax] = scale.domain();
    const [min, max] = PERCENT_RANGE;
    const bands = [min, ...table.competenceLevelPercentageThresholds, max];

    return table.competenceLevelNames.flatMap((ger, i) => {
        const lowerBound = bands[i];
        const upperBound = bands[i + 1];
        const centerPercentage = (lowerBound + upperBound) / 2;
        if (centerPercentage < visibleMin || centerPercentage > visibleMax) return [];

        // Clip to the visible domain and centre within the visible part.
        const a = scale(Math.max(lowerBound, visibleMin));
        const b = scale(Math.min(upperBound, visibleMax));
        const extent = Math.abs(b - a);
        if (extent < minExtent(ger)) return [];

        const [x, y] = place(Math.min(a, b) + extent / 2);
        return [{ ger, x, y }];
    });
}

/**
 * @typedef {{ger: string, x: number, y: number}} BandLabelPlacement
 */

/**
 * One axis's band labels, keyed by level: each the level name in tick-label ink with
 * the band's colour as a small swatch beside it. A label and its swatch share a `<g>`
 * at the label's centre, so they move as one.
 * @param {import('../../../../common/context/moduleContext.js').ModuleContext} context
 * @param {PlotGroup} g - The layer the labels join in.
 * @param {'x'|'y'} axis
 * @param {BandLabelPlacement[]} placements
 * @param {number} durationMs
 */
function joinBandLabels(context, g, axis, placements, durationMs) {
    // The label shifts right by half the swatch so swatch + text stay centred.
    const shift = (BAND_SWATCH.SIZE_PX + BAND_SWATCH.GAP_PX) / 2;
    // Whole pixels: under a fractional translate Chrome smears the glossary term's
    // dotted underline into a solid line.
    const at = (/** @type {BandLabelPlacement} */ d) =>
        `translate(${Math.round(d.x)}, ${Math.round(d.y)})`;

    /** @type {d3.Selection<SVGGElement, BandLabelPlacement, SVGGElement, unknown>} */ (
        g.selectChildren(`.ger-band-label-${axis}`)
    )
        .data(placements, (d) => d.ger)
        .join(
            (enter) => {
                const label = enter
                    .append('g')
                    .attr('class', `ger-band-label-${axis}`)
                    .attr('transform', at)
                    .style('opacity', 0);
                label
                    .append('text')
                    .attr('class', 'axis-tick-label')
                    .attr('x', shift)
                    .attr('dy', '0.35em')
                    .style('text-anchor', 'middle')
                    .style('font-weight', fontWeightToken('semibold'))
                    .text((d) => d.ger)
                    .each(function (d) {
                        context.glossary.stampGlossaryAttr(
                            d3.select(this),
                            context.palette.getLevelGlossaryKey(d.ger),
                        );
                    });
                // All labels are written before any is measured, so the measuring costs
                // one layout, not one per label.
                label.each(function (d) {
                    const text = /** @type {SVGTextElement} */ (this.querySelector('text'));
                    const textWidth = text.getComputedTextLength?.() ?? 0;
                    const box = text.getBBox?.() ?? {
                        y: -BAND_SWATCH.SIZE_PX / 2,
                        height: BAND_SWATCH.SIZE_PX,
                    };
                    d3.select(this)
                        .append('rect')
                        .attr('x', -textWidth / 2 - shift)
                        .attr('y', box.y + (box.height - BAND_SWATCH.SIZE_PX) / 2)
                        .attr('width', BAND_SWATCH.SIZE_PX)
                        .attr('height', BAND_SWATCH.SIZE_PX)
                        .attr('rx', BAND_SWATCH.CORNER_RADIUS_PX)
                        .style('fill', getCompetenceColor(context.palette, d.ger));
                });
                animate(label, { durationMs }).style('opacity', 1);
                return label;
            },
            (update) => {
                animate(update, { durationMs }).attr('transform', at).style('opacity', 1);
                return update;
            },
            (exit) => animate(exit, { durationMs }).style('opacity', 0).remove(),
        );
}
