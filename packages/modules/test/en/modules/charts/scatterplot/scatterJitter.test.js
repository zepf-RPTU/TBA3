import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { simulateJitter } from '../../../../../src/en/modules/charts/scatterplot/scatterJitter.js';

const JITTER = {
    COLLISION_PADDING_PX: 1,
    SIMULATION_ITERATIONS: 120,
    POSITION_STRENGTH: 0.1,
    POSITION_STRENGTH_ZOOMED: 0.9,
    MAX_DISPLACEMENT_PX: 15,
};
const RADIUS_PX = 5;

describe('simulateJitter', () => {
    it('never pushes a point across a threshold', () => {
        // Forty students just below 50 % on both axes collide; spread freely, half
        // of them land in the next band and read as a level they did not reach.
        const xScale = d3.scaleLinear().domain([0, 100]).range([0, 500]);
        const yScale = d3.scaleLinear().domain([0, 100]).range([500, 0]);
        const data = Array.from({ length: 40 }, () => ({ xPercentage: 49.5, yPercentage: 49.5 }));

        const placed = simulateJitter(data, {
            xScale,
            yScale,
            jitter: JITTER,
            pointRadiusPx: RADIUS_PX,
            thresholds: { x: [50], y: [50] },
        });

        for (const point of placed) {
            expect(point.x).toBeLessThanOrEqual(Math.max(point.trueX, xScale(50) - RADIUS_PX));
            expect(point.y).toBeGreaterThanOrEqual(Math.min(point.trueY, yScale(50) + RADIUS_PX));
        }
        // They still spread: the cell leaves room on the far side.
        expect(new Set(placed.map((point) => Math.round(point.x))).size).toBeGreaterThan(1);
    });
});
