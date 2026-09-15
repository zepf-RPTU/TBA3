/**
 * The scatterplot's average markers: the class's own point and one marker per
 * delivered comparison group, each in its role's shape and shade, with the ordinal
 * tag that tells several Landesschnitte apart. Free functions over the renderer's
 * scales, visibility state and tooltip wiring; the zoom update reuses the shape and
 * tag geometry so a marker never changes shape or loses its tag on zoom.
 */

import {
    getDiamondPath,
    getTrianglePath,
    getCrossPath,
    appendMarkerDot,
} from '../../../../common/charts/markerSymbols.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import {
    comparisonSeriesPaint,
    comparisonSeriesVisual,
} from '../../../../common/charts/comparisonSeries.js';
import {
    CHART_CONFIG,
    CLASS_VISUAL,
    MARKER_TAG_GAP,
    SCATTERPLOT_TOOLTIP_ID,
} from './scatterplotConstants.js';

/**
 * Render the class marker plus one marker per delivered comparison group.
 * @param {import('./scatterplot.js').Scatterplot} chart - The renderer.
 * @param {d3.Selection} g - The plot group the markers are appended to.
 * @param {import('../../../../common/services/themeService.js').ThemeColors} theme - Resolved theme colours; each role's marker fill is read from `theme.chart`.
 */
export function renderAveragePoints(chart, g, theme) {
    const [d0, d1] = chart.enConfig.domainIds;

    // Comparison groups first, in payload order, so the class marker — the subject
    // of the chart — is painted last and never disappears under a comparison it
    // happens to coincide with. Same order the spider chart draws its series in.
    for (const group of chart.comparisons) {
        const visual = comparisonSeriesVisual(group);
        // A group whose domain values are missing draws nothing — the marker would
        // otherwise land at 0/0 and read as a real measurement.
        if (
            !Number.isFinite(group.domainAverages[d0]) ||
            !Number.isFinite(group.domainAverages[d1])
        )
            continue;

        renderAverageMarker(chart, g, {
            className: 'comparison-average-point',
            groupId: group.id,
            visibilityKey: group.id,
            tooltipContext: { groupId: group.id },
            paint: comparisonSeriesPaint(group, theme),
            shortLabel: group.shortLabel,
            anchor: [group.domainAverages[d0], group.domainAverages[d1]],
            symbol: visual.symbol,
            shapeFn: (sel) =>
                appendMarkerShape(
                    chart,
                    sel,
                    visual.symbol,
                    group.domainAverages[d0],
                    group.domainAverages[d1],
                ),
        });
    }

    if (hasDrawableClassAverage(chart, d0, d1)) {
        renderAverageMarker(chart, g, {
            className: 'class-average-point',
            visibilityKey: 'class',
            tooltipContext: { type: 'class' },
            fill: theme.chart[CLASS_VISUAL.colorKey],
            shapeFn: (sel) =>
                appendMarkerShape(
                    chart,
                    sel,
                    CLASS_VISUAL.symbol,
                    chart.classAverages[d0],
                    chart.classAverages[d1],
                ),
        });
    }
}

/**
 * Append the marker shape for a symbol at data coordinates (d0 → x, d1 → y).
 * @param {import('./scatterplot.js').Scatterplot} chart - The renderer.
 * @param {d3.Selection} sel - The group the shape is appended to.
 * @param {string} symbol - Marker role shape: `square`, `triangle`, `cross` or `diamond`.
 * @param {number} d0Value - Value on the first domain, placed via the x scale.
 * @param {number} d1Value - Value on the second domain, placed via the y scale.
 * @returns {d3.Selection} The appended shape, so the caller can go on styling it.
 */
function appendMarkerShape(chart, sel, symbol, d0Value, d1Value) {
    const x = chart.xScale(d0Value);
    const y = chart.yScale(d1Value);
    if (symbol === 'square') {
        const squareSize = CHART_CONFIG.AVERAGES.SQUARE_SIZE;
        return sel
            .append('rect')
            .attr('x', x - squareSize / 2)
            .attr('y', y - squareSize / 2)
            .attr('width', squareSize)
            .attr('height', squareSize);
    }
    return sel.append('path').attr('d', markerPath(chart, symbol, x, y));
}

/**
 * Path for a non-square marker at pixel coordinates. Shared by the initial render
 * and the zoom update: the zoom used to redraw every non-square marker as a
 * diamond, which was invisible while school was the only non-square role but
 * would silently reshape a class triangle or a catch-all cross on first zoom.
 * @param {import('./scatterplot.js').Scatterplot} chart - The renderer.
 * @param {string} symbol - Marker role shape; anything but `triangle`/`cross` draws the diamond.
 * @param {number} x - Marker centre in pixels.
 * @param {number} y - Marker centre in pixels.
 * @returns {string} An SVG path `d` string centred on those coordinates.
 */
export function markerPath(chart, symbol, x, y) {
    const size = CHART_CONFIG.AVERAGES.SIZE;
    if (symbol === 'triangle') return getTrianglePath(x, y, size);
    if (symbol === 'cross') return getCrossPath(x, y, size);
    return getDiamondPath(x, y, size);
}

/**
 * Append an average marker (shape from shapeFn) with the shared average-point
 * styling and visibility-aware tooltip. `visibilityKey` indexes visibilityState;
 * `groupId` tags the element so the visibility config can select it.
 * @param {import('./scatterplot.js').Scatterplot} chart - The renderer.
 * @param {object} g - D3 selection to append into
 * @param {{className: string, groupId?: string | null, visibilityKey: string, tooltipContext: object, fill?: string | null, paint?: {fill: string, stroke: string, strokeWidth: number, dotFill?: string | null} | null, shapeFn: Function, shortLabel?: string | null, anchor?: number[] | null, symbol?: string}} spec - Everything that distinguishes this marker from the others: its shape function, its paint (a plain `fill`, or a full `paint` for a comparison group whose fill mode says which group it is), the key its visibility is tracked under, and — for a comparison group — the ordinal tag's label and anchor.
 * @returns {d3.Selection} The marker element, already wired for tooltips.
 */
function renderAverageMarker(
    chart,
    g,
    {
        className,
        groupId = null,
        visibilityKey,
        tooltipContext,
        fill = null,
        paint = null,
        shapeFn,
        shortLabel = null,
        anchor = null,
        symbol = '',
    },
) {
    const visible = chart.visibilityState[visibilityKey];
    const marker = shapeFn(g)
        .attr('class', className)
        .style('fill', paint ? paint.fill : fill)
        .style('stroke', paint ? paint.stroke : getThemeColors().chrome.chartStroke)
        .style('stroke-width', `${paint ? Math.max(paint.strokeWidth, 2) : 2}px`)
        .style('opacity', visible ? CHART_CONFIG.AVERAGES.OPACITY : 0)
        .style('pointer-events', visible ? 'auto' : 'none');

    if (groupId) marker.attr('data-group-id', groupId);
    if (paint?.dotFill && anchor) {
        const dot = appendMarkerDot(g, {
            cx: chart.xScale(anchor[0]),
            cy: chart.yScale(anchor[1]),
            size: CHART_CONFIG.AVERAGES.SIZE,
            fill: paint.dotFill,
            className: 'comparison-average-dot',
        }).style('opacity', visible ? CHART_CONFIG.AVERAGES.OPACITY : 0);
        if (groupId) dot.attr('data-group-id', groupId);
    }
    if (shortLabel && anchor)
        renderAverageMarkerTag(chart, g, { shortLabel, anchor, symbol, groupId, visible });

    chart.wireTooltipEvents(marker, {
        getTooltipContent: () => chart.formatTooltipContent(null, tooltipContext),
        isVisible: () => chart.visibilityState[visibilityKey],
        tooltipId: SCATTERPLOT_TOOLTIP_ID,
        interactive: true,
    });

    return marker;
}

/**
 * Tag a comparison marker with its ordinal (`L1`, `L2`, …).
 *
 * Only drawn when the payload delivers several groups of one type. Without it
 * the legend's `L1 = …` would decode nothing: several state markers share a
 * shape and differ only in shade, so the ordinal has to appear on the mark
 * itself for a reader to match the two.
 * @param {import('./scatterplot.js').Scatterplot} chart - The renderer.
 * @param {object} g - D3 selection to append into
 * @param {{shortLabel: string, anchor: number[], symbol: string, groupId: string|null, visible: boolean}} spec - The ordinal to print, the data coordinates and symbol of the marker it belongs to, and whether that marker is currently shown.
 * @returns {d3.Selection} The appended tag text element.
 */
function renderAverageMarkerTag(chart, g, { shortLabel, anchor, symbol, groupId, visible }) {
    const [d0Value, d1Value] = anchor;
    const { x, y } = averageMarkerTagPosition(
        chart,
        chart.xScale(d0Value),
        chart.yScale(d1Value),
        symbol,
    );

    const tag = g
        .append('text')
        .attr('class', 'comparison-average-tag')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'start')
        .style('fill', getThemeColors().chrome.text)
        .style('font-weight', 'bold')
        .style('pointer-events', 'none')
        .style('opacity', visible ? CHART_CONFIG.AVERAGES.OPACITY : 0)
        .text(shortLabel);

    if (groupId) tag.attr('data-group-id', groupId);
    chart.applyChartTextSize(tag, 'sm');

    return tag;
}

/**
 * Where an ordinal tag sits relative to its marker's centre. Shared by the
 * initial render and the zoom update so the tag never detaches from the mark
 * it names — a stranded `L2` would read as the ordinal of whichever marker it
 * ends up next to. The clearance is the marker's own half-width: a square and
 * a diamond of the same visual weight do not have the same one.
 * @param {import('./scatterplot.js').Scatterplot} chart - The renderer.
 * @param {number} markerX - Marker centre in pixels.
 * @param {number} markerY - Marker centre in pixels.
 * @param {string} symbol - Marker shape, which decides the clearance.
 * @returns {{x: number, y: number}} Where the tag's text anchor goes: clear of the marker's right edge, slightly above its centre.
 */
export function averageMarkerTagPosition(chart, markerX, markerY, symbol) {
    const halfWidth =
        symbol === 'square' ? CHART_CONFIG.AVERAGES.SQUARE_SIZE / 2 : CHART_CONFIG.AVERAGES.SIZE;
    return { x: markerX + halfWidth + MARKER_TAG_GAP, y: markerY - MARKER_TAG_GAP };
}

/**
 * Whether the class average is a drawable point: a 0 % on either domain reads as
 * "no class point" in this chart.
 * @param {import('./scatterplot.js').Scatterplot} chart - The renderer.
 * @param {string} d0 - The first domain id.
 * @param {string} d1 - The second domain id.
 * @returns {boolean} True when both averages are above zero.
 */
export function hasDrawableClassAverage(chart, d0, d1) {
    // In this scatterplot, a 0% class average is treated as no drawable class point.
    return chart.classAverages[d0] > 0 && chart.classAverages[d1] > 0;
}
