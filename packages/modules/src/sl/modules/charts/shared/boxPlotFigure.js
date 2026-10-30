/**
 * The one box-plot figure the SL dashboards draw, so the same position inside the box
 * means the same statistic wherever it is drawn.
 *
 * The figure owns geometry and styling — the box is a tint of the stroke colour, the caps
 * a share of the box width. Callers own everything around it: which scale and colour,
 * tooltips and hover effects, group labels, connectors between boxes.
 *
 * Statistics come from `calculateDetailedBoxPlotStats`, which is also where the whisker
 * rule lives — the ends are the furthest values inside the Tukey fences, so anything
 * `outliers` holds lies beyond the caps and is drawn as its own point.
 *
 * A figure is a data mark (`DATA_MARK_CLASS`): it keeps its colours under forced colours
 * and in print.
 */

import { markerPath } from '../../../../common/charts/markerSymbols.js';
import { animate, fadeOutAndRemove, takeBack } from '../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { DATA_MARK_CLASS } from '../../../../common/services/dataMark.js';

/**
 * Half-width of the mean diamond per unit of `meanSize`. A rotated square of half-width
 * `s` covers `2s²`, so `s = meanSize · √1.25` gives the diamond an area of `2.5 · meanSize²`.
 */
const MEAN_DIAMOND_SCALE = Math.sqrt(1.25);

/** How far the hit area reaches past the drawn figure on every side. */
const HIT_PADDING_PX = 4;

/**
 * The hit area's extent across the band: the wider of the box and the caps, padded.
 * @param {number} center
 * @param {number} boxWidth
 * @param {BoxPlotFigureStyle} style
 * @returns {{start: number, size: number}} Its near edge and extent.
 */
function hitAreaSpan(center, boxWidth, style) {
    const half = (boxWidth * Math.max(1, style.capRatio)) / 2 + HIT_PADDING_PX;
    return { start: center - half, size: 2 * half };
}

/**
 * The SVG attribute names for each direction of a figure: `band` runs across the box,
 * `value` along the statistics.
 * @param {boolean} horizontal - Whether the values run along x.
 * @returns {{band: string, value: string, bandSize: string, valueSize: string}}
 */
function axesOf(horizontal) {
    return horizontal
        ? { band: 'y', value: 'x', bandSize: 'height', valueSize: 'width' }
        : { band: 'x', value: 'y', bandSize: 'width', valueSize: 'height' };
}

/**
 * A point given along the value axis and across the band, as `x,y`.
 * @param {boolean} horizontal
 * @param {number} along - Position along the value axis.
 * @param {number} across - Position across the band.
 * @returns {string} The point, for a `translate`.
 */
function pointAt(horizontal, along, across) {
    return horizontal ? `${along},${across}` : `${across},${along}`;
}

/** The box's width as a share of the slot it is centred in, for every figure style. */
const BOX_WIDTH_RATIO = 0.6;

/**
 * The full-size figure: for a chart whose box plots are the chart.
 * @type {BoxPlotFigureStyle}
 */
const BOX_FIGURE_STANDARD = Object.freeze({
    maxWidthPx: 64,
    whiskerStrokeWidth: 2,
    whiskerOpacity: 0.8,
    boxStrokeWidth: 2.5,
    boxRadius: 4,
    boxOpacity: 1,
    fillOpacity: 0.4,
    capRatio: 0.6,
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
    // The slot is already a narrow sub-bar, so the box takes no cap of its own.
    maxWidthPx: Infinity,
    whiskerStrokeWidth: 1.5,
    whiskerOpacity: 0.7,
    boxStrokeWidth: 1.5,
    boxRadius: 2,
    // The whole box fades, so its fill is the colour itself; its caps stay short
    // beside the narrow box, about 6 px.
    boxOpacity: 0.7,
    fillOpacity: 1,
    capRatio: 0.3,
    medianStrokeWidth: 2,
    meanSize: 4,
    outlierRadius: 2.5,
    outlierStrokeWidth: 1.5,
});

/**
 * How heavily the figure is drawn. Both presets above are frozen; pass one of them.
 * @typedef {object} BoxPlotFigureStyle
 * @property {number} maxWidthPx - The box's widest.
 * @property {number} whiskerStrokeWidth - Stroke width of the whisker line and its caps.
 * @property {number} whiskerOpacity - Opacity of the whisker line; the caps stay opaque.
 * @property {number} boxStrokeWidth - Stroke width of the box outline and the mean diamond.
 * @property {number} boxRadius
 * @property {number} boxOpacity - Opacity of the whole box.
 * @property {number} fillOpacity - Opacity of the box's fill, a tint of the stroke colour, so the median and mean stay legible over it.
 * @property {number} capRatio - Width of the whisker caps, as a share of the box width.
 * @property {number} medianStrokeWidth
 * @property {number} meanSize - Size of the mean diamond; see `MEAN_DIAMOND_SCALE`.
 * @property {number} outlierRadius
 * @property {number} outlierStrokeWidth
 */

/**
 * The box width a style gives a slot: one rule for every SL box plot, so boxes of one
 * style come out the same width wherever their slots allow it.
 * @param {number} slot - The extent across the band the box is centred in, in px.
 * @param {BoxPlotFigureStyle} [style]
 * @returns {number} In px.
 */
export function boxWidthFor(slot, style = BOX_FIGURE_STANDARD) {
    return Math.min(slot * BOX_WIDTH_RATIO, style.maxWidthPx);
}

/** The transition a redraw moves a figure's marks in, and retires a figure or an outlier in. */
const FIGURE_TRANSITION = 'box-figure';

/**
 * The statistics one figure draws, from `calculateDetailedBoxPlotStats`.
 * @typedef {{q1: number, q3: number, median: number, mean: number, whiskerMin: number, whiskerMax: number, outliers?: number[]}} BoxPlotFigureStats
 */

/**
 * One group per figure in `layer`, joined by `key`: a figure that stays keeps its group
 * (and its hit area the keyboard focus), one that leaves fades out off the pointer and
 * the keyboard, a new one is appended. Draw each with `drawBoxPlotFigure`.
 * @template D
 * @param {import('d3').Selection<SVGGElement, unknown, any, any>} layer - The group holding the figures, and nothing else.
 * @param {D[]} data - One datum per figure, in paint order.
 * @param {(datum: D) => string} key - The figure's stable domain key.
 * @param {number} durationMs - How long a leaving figure fades (`ChartRenderer.drawDurationMs`).
 * @returns {import('d3').Selection<SVGGElement, D, SVGGElement, unknown>} The figures' groups, in data order.
 */
export function joinBoxPlotFigures(layer, data, key, durationMs) {
    /** @type {import('d3').Selection<SVGGElement, D, SVGGElement, unknown>} */
    const existing = layer.selectChildren('g.box-figure');
    return existing
        .data(data, key)
        .join(
            (enter) => enter.append('g').attr('class', `box-figure ${DATA_MARK_CLASS}`),
            (update) =>
                // A figure caught leaving stays, and takes the pointer and the keyboard again.
                takeBack(update, FIGURE_TRANSITION).style('opacity', null),
            (exit) => fadeOutAndRemove(exit, FIGURE_TRANSITION, durationMs),
        )
        .order();
}

/**
 * Draw one box plot into `figure`, upright, or lying with `horizontal`, or bring the one
 * drawn there last pass up to date: every mark is found again by its class and moved,
 * so the hit area keeps its node (and its keyboard focus) across a redraw. A figure
 * drawn for the first time takes its geometry at once; a drawn one moves there over
 * `durationMs`.
 *
 * The marks are `figure`'s children in back-to-front order — whisker, caps, box, median,
 * mean, then the outliers on top — because the box overlaps the whisker and the mean
 * overlaps the median. The hit area goes over all of them.
 * @param {import('d3').Selection<SVGGElement, any, any, any>} figure - The figure's own group, holding nothing else (`joinBoxPlotFigures`).
 * @param {BoxPlotFigureStats} stats - Statistics from `calculateDetailedBoxPlotStats`.
 * @param {object} geometry - Where and how big the figure is drawn.
 * @param {number} geometry.center - Centre of the figure across its band.
 * @param {number} geometry.boxWidth - Width of the box and the median line, across the band.
 * @param {(value: number) => number} geometry.valueScale - Maps a value to its position along the value axis.
 * @param {string} geometry.color - Colour of every mark, and the box's tint.
 * @param {boolean} [geometry.horizontal] - The values run along x and the band along y.
 * @param {BoxPlotFigureStyle} [geometry.style] - Weight of the marks.
 * @param {number} [geometry.durationMs] - How long a drawn figure moves (`ChartRenderer.drawDurationMs`); 0 by default.
 * @returns {import('d3').Selection<SVGRectElement, any, any, any>} The hit area: a transparent rect over the whole drawn figure, outliers included, and the one element a caller wires the figure's tooltip on (hover `band`), so the pointer crossing from whisker to box stays on one target.
 */
export function drawBoxPlotFigure(figure, stats, geometry) {
    const {
        center,
        boxWidth,
        valueScale,
        color,
        horizontal = false,
        style = BOX_FIGURE_STANDARD,
    } = geometry;
    const { band, value, bandSize, valueSize } = axesOf(horizontal);
    const capWidth = boxWidth * style.capRatio;
    const surface = 'var(--color-card-background)';
    // A new figure has nothing to move from.
    const durationMs = figure.selectChild('rect.box-hit-area').empty()
        ? 0
        : (geometry.durationMs ?? 0);
    /**
     * The mark itself, or a transition on it that moves it from where it is drawn.
     * @template {import('d3').Selection<any, any, any, any>} S
     * @param {S} mark
     * @returns {S} What its geometry is written to.
     */
    const move = (mark) =>
        animate(mark.interrupt(FIGURE_TRANSITION), { durationMs, name: FIGURE_TRANSITION });

    const whisker = selectOrAppend(figure, 'line', 'whisker-line');
    move(whisker)
        .attr(`${band}1`, center)
        .attr(`${band}2`, center)
        .attr(`${value}1`, valueScale(stats.whiskerMin))
        .attr(`${value}2`, valueScale(stats.whiskerMax));
    whisker
        .style('stroke', color)
        .attr('stroke-width', style.whiskerStrokeWidth)
        .style('opacity', style.whiskerOpacity);

    /** @type {import('d3').Selection<SVGLineElement, {end: string, at: number}, any, any>} */
    const drawnCaps = figure.selectChildren('line.whisker-cap');
    const caps = drawnCaps
        .data(
            [
                { end: 'min', at: valueScale(stats.whiskerMin) },
                { end: 'max', at: valueScale(stats.whiskerMax) },
            ],
            (cap) => cap.end,
        )
        .join((enter) => enter.append('line').attr('class', 'whisker-cap'));
    move(caps)
        .attr(`${band}1`, center - capWidth / 2)
        .attr(`${band}2`, center + capWidth / 2)
        .attr(`${value}1`, (cap) => cap.at)
        .attr(`${value}2`, (cap) => cap.at);
    caps.style('stroke', color)
        .attr('stroke-width', style.whiskerStrokeWidth)
        .attr('stroke-linecap', 'round');

    const box = selectOrAppend(figure, 'rect', 'box');
    move(box)
        .attr(band, center - boxWidth / 2)
        .attr(value, Math.min(valueScale(stats.q1), valueScale(stats.q3)))
        .attr(bandSize, boxWidth)
        .attr(valueSize, Math.abs(valueScale(stats.q1) - valueScale(stats.q3)));
    box.style('fill', color)
        .attr('fill-opacity', style.fillOpacity)
        .style('stroke', color)
        .attr('stroke-width', style.boxStrokeWidth)
        .attr('rx', style.boxRadius)
        .attr('ry', style.boxRadius)
        .attr('opacity', style.boxOpacity);

    const median = selectOrAppend(figure, 'line', 'median-line');
    move(median)
        .attr(`${band}1`, center - boxWidth / 2)
        .attr(`${band}2`, center + boxWidth / 2)
        .attr(`${value}1`, valueScale(stats.median))
        .attr(`${value}2`, valueScale(stats.median));
    median
        .style('stroke', color)
        .attr('stroke-width', style.medianStrokeWidth)
        .attr('stroke-linecap', 'round');

    // A diamond, never a line: the median already owns the line across the box, and
    // two lines there would be indistinguishable.
    const mean = selectOrAppend(figure, 'path', 'mean-point').attr(
        'd',
        markerPath('diamond', style.meanSize * MEAN_DIAMOND_SCALE),
    );
    move(mean).attr(
        'transform',
        `translate(${pointAt(horizontal, valueScale(stats.mean), center)})`,
    );
    mean.style('fill', surface).style('stroke', color).attr('stroke-width', style.boxStrokeWidth);

    // Outliers are values, not ids: two equal ones are told apart by their count.
    const outlierValues = stats.outliers ?? [];
    /** @type {Map<number, number>} */
    const seen = new Map();
    const outlierData = outlierValues.map((outlier) => {
        const n = (seen.get(outlier) ?? 0) + 1;
        seen.set(outlier, n);
        return { key: `${outlier}#${n}`, at: valueScale(outlier) };
    });
    /** @type {import('d3').Selection<SVGCircleElement, {key: string, at: number}, any, any>} */
    const drawnOutliers = figure.selectChildren('circle.outlier');
    drawnOutliers
        .data(outlierData, (outlier) => outlier.key)
        .join(
            (enter) =>
                // Below the hit area, which stays on top.
                enter
                    .insert('circle', 'rect.box-hit-area')
                    .attr('class', 'outlier')
                    .attr(`c${band}`, center)
                    .attr(`c${value}`, (outlier) => outlier.at),
            (update) => {
                takeBack(update, FIGURE_TRANSITION).style('opacity', null);
                move(update)
                    .attr(`c${band}`, center)
                    .attr(`c${value}`, (outlier) => outlier.at);
                return update;
            },
            (exit) => fadeOutAndRemove(exit, FIGURE_TRANSITION, durationMs),
        )
        .attr('r', style.outlierRadius)
        .style('fill', surface)
        .style('stroke', color)
        .attr('stroke-width', style.outlierStrokeWidth);

    // Over the whole figure, not just the whiskers: the outliers are drawn beyond the
    // caps, and a group whose inliers are all one value has a zero-length whisker span.
    const drawn = [stats.whiskerMin, stats.whiskerMax, ...outlierValues].map(valueScale);
    const near = Math.min(...drawn) - HIT_PADDING_PX;
    const hit = hitAreaSpan(center, boxWidth, style);
    const hitArea = selectOrAppend(figure, 'rect', 'box-hit-area', (created) =>
        created.classed('chart-hit', true),
    );
    move(hitArea)
        .attr(value, near)
        .attr(valueSize, Math.max(...drawn) + HIT_PADDING_PX - near)
        .attr(band, hit.start)
        .attr(bandSize, hit.size);

    return hitArea;
}
