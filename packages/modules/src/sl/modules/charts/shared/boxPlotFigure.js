/**
 * The one box-plot figure the SL dashboards draw.
 *
 * Three charts show box plots — Selbstwirksamkeit, Unterrichtsqualität and the
 * longitudinal pair — and before this module each drew its own. Two of the three were
 * the same figure written twice, down to the stroke widths; the third put the *mean*
 * on the centre line where the others put the median, so the same position inside the
 * box meant different statistics depending on the view.
 *
 * The figure owns geometry and styling. Callers own everything around it: which scale
 * and colour, the fill, tooltips and hover effects, group labels, connectors between
 * boxes. `drawBoxPlotFigure` returns the selections it created so a caller can wire
 * those without the figure knowing about them.
 *
 * Statistics come from `calculateDetailedBoxPlotStats`, which is also where the whisker
 * rule lives — the ends are the furthest values inside the Tukey fences, so anything
 * `outliers` holds genuinely lies beyond the caps and is drawn as its own point.
 * @module boxPlotFigure
 */

import { getThemeColors } from '../../../../common/services/themeService.js';
import { getDiamondPath } from '../../../../common/charts/markerSymbols.js';

/**
 * Half-width of the mean diamond per unit of `meanSize`. The figure used to draw the
 * diamond with `d3.symbol()`, whose `size` is an area of `2.5 · meanSize²`; a rotated
 * square of half-width `s` covers `2s²`, so `s = meanSize · √1.25` keeps that area.
 */
const MEAN_DIAMOND_SCALE = Math.sqrt(1.25);

/**
 * The full-size figure: for a chart whose box plots are the chart.
 * @type {BoxPlotFigureStyle}
 */
export const BOX_FIGURE_STANDARD = Object.freeze({
    whiskerStrokeWidth: 2,
    whiskerOpacity: 0.8,
    boxStrokeWidth: 2.5,
    boxRadius: 4,
    boxOpacity: null,
    medianStrokeWidth: 3,
    meanSize: 6,
    outlierRadius: 3.5,
    outlierStrokeWidth: 2,
});

/**
 * The compact figure: for box plots drawn as an overlay beside other marks, where the
 * slot is a fraction of a grouped bar and full-weight strokes would read as a bar.
 * @type {BoxPlotFigureStyle}
 */
export const BOX_FIGURE_COMPACT = Object.freeze({
    whiskerStrokeWidth: 1.5,
    whiskerOpacity: 0.7,
    boxStrokeWidth: 1.5,
    boxRadius: 2,
    boxOpacity: 0.7,
    medianStrokeWidth: 2,
    meanSize: 4,
    outlierRadius: 2.5,
    outlierStrokeWidth: 1.5,
});

/**
 * How heavily the figure is drawn. Both presets above are frozen; pass one of them
 * rather than assembling a third unless a genuinely new context appears.
 * @typedef {object} BoxPlotFigureStyle
 * @property {number} whiskerStrokeWidth - Stroke width of the whisker line and its caps.
 * @property {number} whiskerOpacity - Opacity of the whisker line.
 * @property {number} boxStrokeWidth - Stroke width of the box outline.
 * @property {number} boxRadius - Corner radius of the box.
 * @property {number|null} boxOpacity - Opacity of the whole box, or `null` to leave it unset.
 * @property {number} medianStrokeWidth - Stroke width of the median line.
 * @property {number} meanSize - Size of the mean diamond; see `MEAN_DIAMOND_SCALE`.
 * @property {number} outlierRadius - Radius of an outlier point.
 * @property {number} outlierStrokeWidth - Stroke width of an outlier point.
 */

/**
 * Draw one box plot.
 *
 * Marks are appended in back-to-front order — whisker, caps, box, median, mean, then
 * the outliers on top — because the box overlaps the whisker and the mean overlaps the
 * median.
 * @param {object} selection - The D3 selection the marks are appended to.
 * @param {{q1: number, q3: number, median: number, mean: number, whiskerMin: number, whiskerMax: number, outliers?: number[]}} stats - Statistics from `calculateDetailedBoxPlotStats`.
 * @param {object} geometry - Where and how big the figure is drawn.
 * @param {number} geometry.centerX - Horizontal centre of the figure.
 * @param {number} geometry.boxWidth - Width of the box and the median line.
 * @param {number} geometry.capWidth - Width of the two whisker caps.
 * @param {Function} geometry.yScale - Maps a value to a y position.
 * @param {string} geometry.color - Stroke colour for every mark.
 * @param {string} [geometry.fill] - Box fill; defaults to the theme surface.
 * @param {BoxPlotFigureStyle} [geometry.style] - Weight of the marks; the standard figure by default.
 * @param {*} [geometry.datum] - Bound to every mark, for callers that wire per-element tooltips.
 * @returns {{whisker: object, caps: object[], box: object, median: object, mean: object, outliers: object|null}} The selections created, for tooltip and hover wiring.
 */
export function drawBoxPlotFigure(selection, stats, geometry) {
    const {
        centerX,
        boxWidth,
        capWidth,
        yScale,
        color,
        fill,
        style = BOX_FIGURE_STANDARD,
        datum,
    } = geometry;
    const surface = getThemeColors().chrome.surface;
    const bind = (mark) => (datum === undefined ? mark : mark.datum(datum));

    const whisker = bind(selection.append('line'))
        .attr('class', 'whisker-line')
        .attr('x1', centerX)
        .attr('x2', centerX)
        .attr('y1', yScale(stats.whiskerMin))
        .attr('y2', yScale(stats.whiskerMax))
        .attr('stroke', color)
        .attr('stroke-width', style.whiskerStrokeWidth)
        .style('opacity', style.whiskerOpacity);

    const caps = [stats.whiskerMin, stats.whiskerMax].map((value) =>
        bind(selection.append('line'))
            .attr('class', 'whisker-cap')
            .attr('x1', centerX - capWidth / 2)
            .attr('x2', centerX + capWidth / 2)
            .attr('y1', yScale(value))
            .attr('y2', yScale(value))
            .attr('stroke', color)
            .attr('stroke-width', style.whiskerStrokeWidth)
            .attr('stroke-linecap', 'round'),
    );

    const box = bind(selection.append('rect'))
        .attr('class', 'box')
        .attr('x', centerX - boxWidth / 2)
        .attr('y', Math.min(yScale(stats.q1), yScale(stats.q3)))
        .attr('width', boxWidth)
        .attr('height', Math.abs(yScale(stats.q1) - yScale(stats.q3)))
        .attr('fill', fill ?? surface)
        .attr('stroke', color)
        .attr('stroke-width', style.boxStrokeWidth)
        .attr('rx', style.boxRadius)
        .attr('ry', style.boxRadius);
    if (style.boxOpacity != null) box.attr('opacity', style.boxOpacity);

    const median = bind(selection.append('line'))
        .attr('class', 'median-line')
        .attr('x1', centerX - boxWidth / 2)
        .attr('x2', centerX + boxWidth / 2)
        .attr('y1', yScale(stats.median))
        .attr('y2', yScale(stats.median))
        .attr('stroke', color)
        .attr('stroke-width', style.medianStrokeWidth)
        .attr('stroke-linecap', 'round');

    // A diamond, never a line: the median already owns the horizontal line inside the
    // box, and two lines there would be indistinguishable.
    const mean = bind(selection.append('path'))
        .attr('class', 'mean-point')
        .attr('d', getDiamondPath(0, 0, style.meanSize * MEAN_DIAMOND_SCALE))
        .attr('transform', `translate(${centerX},${yScale(stats.mean)})`)
        .attr('fill', surface)
        .attr('stroke', color)
        .attr('stroke-width', style.boxStrokeWidth);

    const outlierValues = stats.outliers ?? [];
    let outliers = null;
    if (outlierValues.length > 0) {
        outliers = selection
            .selectAll(null)
            .data(outlierValues)
            .enter()
            .append('circle')
            .attr('class', 'outlier')
            .attr('cx', centerX)
            .attr('cy', (value) => yScale(value))
            .attr('r', style.outlierRadius)
            .attr('fill', surface)
            .attr('stroke', color)
            .attr('stroke-width', style.outlierStrokeWidth);
        // Rebound last, never through `bind`: the join needs the outlier's own value as
        // datum to place it in y, but a caller wiring one tooltip over the whole figure
        // reads the same datum off every mark — an outlier still carrying a bare number
        // would hand that handler a number where it expects the figure's context.
        if (datum !== undefined) outliers.datum(datum);
    }

    return { whisker, caps, box, median, mean, outliers };
}

/**
 * The horizontal gradient a box is filled with — `url(#id)` — left to right from
 * `color` to `endColor`, faded so the median and mean stay legible over it.
 * @param {d3.Selection} defs - The `<defs>` the gradient is appended to; the caller owns its lifecycle.
 * @param {string} id - The gradient's element id, unique per chart instance.
 * @param {{color: string, endColor?: string, endOpacity?: number}} options - The two stop colours (`endColor` defaults to `color`) and the far stop's opacity (default 0.4, as at the near stop).
 */
export function appendBoxGradient(defs, id, { color, endColor = color, endOpacity = 0.4 }) {
    const gradient = defs
        .append('linearGradient')
        .attr('id', id)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%');
    gradient
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.4);
    gradient
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', endColor)
        .attr('stop-opacity', endOpacity);
}
