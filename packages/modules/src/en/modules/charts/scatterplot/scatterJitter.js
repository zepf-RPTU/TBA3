/**
 * Scatterplot jitter — spreads overlapping points with a D3 force simulation, keeping
 * each close to its true position and inside its threshold cell. Deterministic for a
 * given (data, scales, config), so the chart caches the result per scale state.
 */

import * as d3 from 'd3';
import { PERCENT_RANGE } from './scatterplotConstants.js';

/**
 * Where the simulation put a point (`x`/`y`) and where it belongs (`trueX`/`trueY`), in px.
 * @typedef {{x: number, y: number, trueX: number, trueY: number}} JitterPosition
 */

/**
 * The px interval a point may be nudged within along one axis: its threshold cell, the
 * band between the thresholds either side of its value, inset by the point radius. It
 * always contains the true position, so a point on a threshold stays on it.
 * @param {number} value - In percent.
 * @param {number} truePx
 * @param {d3.ScaleLinear<number, number>} scale
 * @param {number[]} thresholds - In percent.
 * @param {number} radiusPx
 * @returns {[number, number]} Low end first.
 */
function cellInterval(value, truePx, scale, thresholds, radiusPx) {
    const [d0, d1] = scale.domain();
    const lower = Math.max(d0, ...thresholds.filter((t) => t <= value));
    const upper = Math.min(d1, ...thresholds.filter((t) => t > value));
    const [a, b] = [scale(lower), scale(upper)].sort((p, q) => p - q);
    return [Math.min(truePx, a + radiusPx), Math.max(truePx, b - radiusPx)];
}

/**
 * Place every point at its scaled position, then let a short force simulation push
 * overlapping points apart, never further than `MAX_DISPLACEMENT_PX` from where they
 * belong and never across a threshold: a point nudged into the next band would claim a
 * level the student did not reach.
 * @template {{xPercentage: number, yPercentage: number}} TPoint
 * @param {TPoint[]} data
 * @param {{xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>, jitter: {COLLISION_PADDING_PX: number, SIMULATION_ITERATIONS: number, POSITION_STRENGTH: number, POSITION_STRENGTH_ZOOMED: number, MAX_DISPLACEMENT_PX: number}, pointRadiusPx: number, thresholds: {x: number[], y: number[]}}} options - `thresholds` in percent.
 * @returns {Array<TPoint & JitterPosition>} Copies; `data` is left untouched.
 */
export function simulateJitter(data, { xScale, yScale, jitter, pointRadiusPx, thresholds }) {
    // Copies: the simulation mutates `x`/`y`.
    /** @type {Array<TPoint & JitterPosition>} */
    const dataWithPositions = data.map((d) => ({
        ...d,
        x: xScale(d.xPercentage),
        y: yScale(d.yPercentage),
        trueX: xScale(d.xPercentage),
        trueY: yScale(d.yPercentage),
    }));

    const xDomain = xScale.domain();
    const isZoomed = xDomain[1] - xDomain[0] < PERCENT_RANGE[1] - PERCENT_RANGE[0];
    const strength = isZoomed ? jitter.POSITION_STRENGTH_ZOOMED : jitter.POSITION_STRENGTH;

    const simulation = d3
        .forceSimulation(dataWithPositions)
        .force(
            'x',
            d3.forceX((/** @type {TPoint & JitterPosition} */ d) => d.trueX).strength(strength),
        )
        .force(
            'y',
            d3.forceY((/** @type {TPoint & JitterPosition} */ d) => d.trueY).strength(strength),
        )
        .force('collide', d3.forceCollide(pointRadiusPx + jitter.COLLISION_PADDING_PX))
        .stop();

    for (let i = 0; i < jitter.SIMULATION_ITERATIONS; i++) {
        simulation.tick();
    }

    const maxDispPx = jitter.MAX_DISPLACEMENT_PX;
    dataWithPositions.forEach((d) => {
        const dx = d.x - d.trueX;
        const dy = d.y - d.trueY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDispPx) {
            const scale = maxDispPx / dist;
            d.x = d.trueX + dx * scale;
            d.y = d.trueY + dy * scale;
        }
        const [x0, x1] = cellInterval(d.xPercentage, d.trueX, xScale, thresholds.x, pointRadiusPx);
        const [y0, y1] = cellInterval(d.yPercentage, d.trueY, yScale, thresholds.y, pointRadiusPx);
        d.x = Math.min(x1, Math.max(x0, d.x));
        d.y = Math.min(y1, Math.max(y0, d.y));
    });

    return dataWithPositions;
}
