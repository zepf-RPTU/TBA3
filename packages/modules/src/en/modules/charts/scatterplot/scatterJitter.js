/**
 * Scatterplot jitter helper — pure, cacheable point-spreading for the EN scatterplot.
 *
 * `generateJitterDataHash` / `buildJitterCacheKey` / `isJitterCacheValid` are pure and
 * unit-testable (they touch only data + a scale's `.domain()`/`.range()`); `simulateJitter`
 * runs a D3 force simulation and is exercised by the SVG-diff + e2e, not unit tests.
 * The caller owns the cache object — these functions never mutate shared state.
 */

import * as d3 from 'd3';

/**
 * Stable content hash of the plotted points, used to invalidate the jitter cache
 * when the underlying data changes (the same data must yield the same jitter so
 * points don't jump across re-renders).
 * @param {Array<{studentId: any, d0Percentage: number, d1Percentage: number}>} data - The points as they will be plotted.
 * @returns {string} A hash covering every point's id and both values, in array order.
 */
export function generateJitterDataHash(data) {
    return data.map((d) => `${d.studentId}:${d.d0Percentage}:${d.d1Percentage}`).join('|');
}

/**
 * Build the cache key describing the state the jitter positions were computed for:
 * the two scale domains + ranges (chart size / zoom) and the data hash.
 * @param {any} xScale - The x scale, read for its domain (zoom) and range (chart size).
 * @param {any} yScale - The y scale, read for its domain (zoom) and range (chart size).
 * @param {Array<{studentId: any, d0Percentage: number, d1Percentage: number}>} data - The points as they will be plotted.
 * @returns {{xDomain: string, yDomain: string, xRange: string, yRange: string, dataHash: string}} Everything the jitter result depends on, in comparable form.
 */
export function buildJitterCacheKey(xScale, yScale, data) {
    return {
        xDomain: xScale.domain().join(','),
        yDomain: yScale.domain().join(','),
        xRange: xScale.range().join(','),
        yRange: yScale.range().join(','),
        dataHash: generateJitterDataHash(data),
    };
}

/**
 * True when the cached jitter still matches the current state (data + domains + ranges).
 * A cache with no `data` is always invalid.
 * @param {{data: any[]|null, xDomain: string|null, yDomain: string|null, xRange: string|null, yRange: string|null, dataHash: string|null}|null|undefined} cache - The caller's cache entry, if it has one.
 * @param {{xDomain: string, yDomain: string, xRange: string, yRange: string, dataHash: string}} key - The key describing the state a fresh run would be computed for.
 * @returns {boolean} True when the cached positions can be reused unchanged.
 */
export function isJitterCacheValid(cache, key) {
    if (!cache || !cache.data) return false;

    return (
        cache.xDomain === key.xDomain &&
        cache.yDomain === key.yDomain &&
        cache.xRange === key.xRange &&
        cache.yRange === key.yRange &&
        cache.dataHash === key.dataHash
    );
}

/**
 * Apply force-based jitter to prevent overlapping points, keeping each point close to its
 * true scaled position. When jitter is disabled (or there is no data) the points are simply
 * placed at their scaled positions. Deterministic for a given (data, scales, config), so the
 * caller can cache the result via {@link buildJitterCacheKey} / {@link isJitterCacheValid}.
 * @param {Array<{studentId: any, d0Percentage: number, d1Percentage: number}>} data - The points to place.
 * @param {{xScale: any, yScale: any, jitter: {ENABLED: boolean, COLLISION_PADDING: number, SIMULATION_ITERATIONS: number, POSITION_STRENGTH: number, POSITION_STRENGTH_ZOOMED: number, MAX_DISPLACEMENT: number}, pointRadius: number}} options - The scales that place a point, the force-simulation tuning, and the point radius collisions are measured against.
 * @returns {any[]} Data with `x`/`y` positions added.
 */
export function simulateJitter(data, { xScale, yScale, jitter, pointRadius }) {
    if (!jitter.ENABLED || data.length === 0) {
        return data.map((d) => ({
            ...d,
            x: xScale(d.d0Percentage),
            y: yScale(d.d1Percentage),
        }));
    }

    // Initialize positions at their true scaled locations (fresh copy to avoid mutation issues)
    const dataWithPositions = data.map((d) => ({
        ...d,
        x: xScale(d.d0Percentage),
        y: yScale(d.d1Percentage),
        // Store true positions for max displacement check
        trueX: xScale(d.d0Percentage),
        trueY: yScale(d.d1Percentage),
    }));

    // Determine if zoomed in (simplified: check if domain is less than full range)
    const xDomain = xScale.domain();
    const isZoomed = xDomain[1] - xDomain[0] < 100;
    const strength = isZoomed ? jitter.POSITION_STRENGTH_ZOOMED : jitter.POSITION_STRENGTH;

    // Create force simulation
    const simulation = d3
        .forceSimulation(dataWithPositions)
        .force('x', d3.forceX((d) => /** @type {any} */ (d).trueX).strength(strength))
        .force('y', d3.forceY((d) => /** @type {any} */ (d).trueY).strength(strength))
        .force('collide', d3.forceCollide(pointRadius + jitter.COLLISION_PADDING))
        .stop();

    // Run simulation synchronously
    for (let i = 0; i < jitter.SIMULATION_ITERATIONS; i++) {
        simulation.tick();
    }

    // Enforce max displacement constraint
    const maxDisp = jitter.MAX_DISPLACEMENT;
    dataWithPositions.forEach((d) => {
        const dx = d.x - d.trueX;
        const dy = d.y - d.trueY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDisp) {
            // Scale back to max displacement
            const scale = maxDisp / dist;
            d.x = d.trueX + dx * scale;
            d.y = d.trueY + dy * scale;
        }
    });

    return dataWithPositions;
}
