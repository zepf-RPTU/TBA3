/**
 * The frame of a chart whose groups sit on bands that either stand (names under the
 * bars) or lie (names beside the rows): how the name axis is measured, wrapped and drawn
 * in either orientation, and the band padding, so the scale a chart draws and the slot
 * its lie/stand rule judges come from the same numbers. The value axis and the marks
 * stay with the chart.
 */

import * as d3 from 'd3';
import {
    createCategoryAxis,
    measurePercentAxisSpace,
    measurePercentEdgeTickReserve,
} from './chartAxisUtils.js';
import { AXIS_DEFAULTS } from './chartDefaults.js';
import { STUDENT_SHARE_AXIS_TITLE } from '../domain/terms.js';
import {
    BAND_LABEL_GAP_PX,
    measureLabelBlockHeight,
    splitLabelLines,
    wrapBandAxisTickLabels,
} from './chartLabelFit.js';

/** @typedef {import('./renderers/chartRenderer.js').ChartRenderer} ChartRenderer */

/**
 * What a frame is measured from.
 * @typedef {object} BandFrameSpec
 * @property {ReadonlyArray<string>} names - Every name the name axis may show: all are measured, so a toggle never shifts the plot.
 * @property {(side: 'left'|'right'|'bottom') => number} valueAxis - The value axis's space on a side, title included.
 * @property {'left'|'right'} [valueSide='left'] - The value axis's side while the bands stand.
 * @property {() => number} [edgeReserve] - Lying: the room the value axis's last tick label overhangs the plot's right edge by.
 */

/**
 * The axis space a frame takes: lying, the names wrapped beside the rows, the value
 * axis below and its edge reserve on the right; standing, the value axis on its side
 * and the names (up to two lines) under the bands.
 * @param {ChartRenderer} chart
 * @param {boolean} horizontal - Whether the bands lie.
 * @param {BandFrameSpec} spec
 * @returns {{[side: string]: number}} The axis overrides `initializeSVG` takes.
 */
export function measureBandFrame(
    chart,
    horizontal,
    { names, valueAxis, valueSide = 'left', edgeReserve },
) {
    if (horizontal) {
        return {
            left: chart.measureAxisSpace(
                'left',
                names.flatMap((name) => splitLabelLines(name)),
            ),
            bottom: valueAxis('bottom'),
            ...(edgeReserve ? { right: edgeReserve() } : {}),
        };
    }
    return {
        [valueSide]: valueAxis(valueSide),
        bottom: measureLabelBlockHeight(chart, names) + AXIS_DEFAULTS.tickPaddingPx,
    };
}

/**
 * The titled percent axis of a share chart, as a frame's value axis: its space on a
 * side, and lying, the `100 %` label's overhang past the plot's right edge.
 * @param {ChartRenderer} chart
 * @returns {Pick<BandFrameSpec, 'valueAxis'|'edgeReserve'>}
 */
export function percentValueAxis(chart) {
    return {
        valueAxis: (side) =>
            measurePercentAxisSpace(chart, side, { axisTitleText: STUDENT_SHARE_AXIS_TITLE }),
        edgeReserve: () => measurePercentEdgeTickReserve(chart),
    };
}

/**
 * A band scale with the same padding inside and at both ends.
 * @param {ReadonlyArray<string>} domain
 * @param {number} lengthPx - The plot's extent along the bands.
 * @param {number} paddingRatio - The gap as a share of each step.
 * @returns {d3.ScaleBand<string>}
 */
export function paddedBandScale(domain, lengthPx, paddingRatio) {
    return d3.scaleBand().domain(domain).range([0, lengthPx]).padding(paddingRatio);
}

/**
 * The width a name may take under a standing band, as the standing chart would draw
 * it: its layout from the standing frame, its bands at `paddingRatio`. What a lie/stand
 * rule compares the names against.
 * @param {ChartRenderer} chart - The renderer, measured.
 * @param {BandFrameSpec} spec
 * @param {number} paddingRatio - The band padding the standing chart draws with.
 * @param {{[side: string]: number}} [axes] - The standing frame's axis space, when the caller already measured it.
 * @returns {number} In px.
 */
export function standingSlot(chart, spec, paddingRatio, axes) {
    return bandSlot(chart, spec, paddingRatio, false, axes);
}

/**
 * The height a name may take beside a lying band, as the lying chart would draw it: its
 * layout from the lying frame, its bands at `paddingRatio`. The other half of a lie/stand
 * rule: lying only helps while every name still fits its row.
 * @param {ChartRenderer} chart - The renderer, measured.
 * @param {BandFrameSpec} spec
 * @param {number} paddingRatio - The band padding the lying chart draws with.
 * @param {{[side: string]: number}} [axes] - The lying frame's axis space, when the caller already measured it.
 * @returns {number} In px.
 */
export function lyingSlot(chart, spec, paddingRatio, axes) {
    return bandSlot(chart, spec, paddingRatio, true, axes);
}

/**
 * The room a name gets along its band, less the gap to its neighbour.
 * @param {ChartRenderer} chart
 * @param {BandFrameSpec} spec
 * @param {number} paddingRatio
 * @param {boolean} lying
 * @param {{[side: string]: number}} [axes]
 * @returns {number} In px.
 */
function bandSlot(chart, spec, paddingRatio, lying, axes = measureBandFrame(chart, lying, spec)) {
    const { chart: plot } = chart.previewLayout(axes);
    const domain = spec.names.map((_, index) => String(index));
    const lengthPx = lying ? plot.height : plot.width;
    return paddedBandScale(domain, lengthPx, paddingRatio).step() - BAND_LABEL_GAP_PX;
}

/**
 * Draw the name axis: beside lying bands, the names wrapped into the column the frame
 * measured and centred on their row; under standing ones, wrapped into their band.
 * @template D
 * @param {ChartRenderer} chart - The renderer, laid out.
 * @param {d3.Selection<SVGGElement, D, any, any>} axisGroup - The axis group, new or drawn.
 * @param {d3.ScaleBand<string>} scale
 * @param {{horizontal: boolean, nameOf?: (key: string) => string}} options - `nameOf` gives the name a band key shows.
 */
export function drawNameAxis(chart, axisGroup, scale, { horizontal, nameOf = (key) => key }) {
    const side = horizontal ? 'left' : 'bottom';
    axisGroup.call(createCategoryAxis(side, scale).tickFormat(nameOf));
    if (horizontal) {
        const layout = /** @type {import('./renderers/chartRenderer.js').ComputedChartLayout} */ (
            chart.layout
        );
        wrapBandAxisTickLabels(chart, axisGroup, layout.axes.left - AXIS_DEFAULTS.tickPaddingPx, {
            stack: 'center',
        });
    } else {
        wrapBandAxisTickLabels(chart, axisGroup, Math.max(0, scale.step() - BAND_LABEL_GAP_PX));
    }
}
