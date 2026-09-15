import { describe, it, expect } from 'vitest';
import {
    generateJitterDataHash,
    buildJitterCacheKey,
    isJitterCacheValid,
    simulateJitter,
} from '@tba3/modules/en/modules/charts/scatterplot/scatterJitter.js';

/**
 * A minimal stand-in for a d3 linear scale: callable for value→pixel mapping and
 * exposing the `.domain()`/`.range()` the jitter cache key reads. Lets us exercise
 * the pure cache logic without pulling in the vendored d3 global.
 */
function stubScale({ domain = [0, 100], range = [0, 500], map = (v) => v } = {}) {
    const scale = (v) => map(v);
    scale.domain = () => domain;
    scale.range = () => range;
    return scale;
}

const SAMPLE = [
    { studentId: 's1', d0Percentage: 40, d1Percentage: 60 },
    { studentId: 's2', d0Percentage: 55, d1Percentage: 20 },
];

describe('generateJitterDataHash', () => {
    it('is stable for identical data', () => {
        // WHY: the hash is the invalidation key. If the same data produced a
        // different hash, the cache would miss on every render and points would
        // re-jitter (jump) even though nothing changed.
        expect(generateJitterDataHash(SAMPLE)).toBe(generateJitterDataHash([...SAMPLE]));
    });

    it('changes when any tracked field changes', () => {
        const base = generateJitterDataHash(SAMPLE);
        expect(generateJitterDataHash([{ ...SAMPLE[0], studentId: 'x' }, SAMPLE[1]])).not.toBe(
            base,
        );
        expect(generateJitterDataHash([{ ...SAMPLE[0], d0Percentage: 41 }, SAMPLE[1]])).not.toBe(
            base,
        );
        expect(generateJitterDataHash([{ ...SAMPLE[0], d1Percentage: 61 }, SAMPLE[1]])).not.toBe(
            base,
        );
    });

    it('is order-sensitive (reordered points are a different layout)', () => {
        expect(generateJitterDataHash([SAMPLE[1], SAMPLE[0]])).not.toBe(
            generateJitterDataHash(SAMPLE),
        );
    });

    it('returns an empty string for no points', () => {
        expect(generateJitterDataHash([])).toBe('');
    });
});

describe('buildJitterCacheKey', () => {
    it('captures both scale domains, ranges, and the data hash', () => {
        const xScale = stubScale({ domain: [0, 100], range: [0, 500] });
        const yScale = stubScale({ domain: [10, 90], range: [400, 0] });
        expect(buildJitterCacheKey(xScale, yScale, SAMPLE)).toEqual({
            xDomain: '0,100',
            yDomain: '10,90',
            xRange: '0,500',
            yRange: '400,0',
            dataHash: generateJitterDataHash(SAMPLE),
        });
    });
});

describe('isJitterCacheValid', () => {
    const xScale = stubScale({ domain: [0, 100], range: [0, 500] });
    const yScale = stubScale({ domain: [0, 100], range: [500, 0] });
    const key = buildJitterCacheKey(xScale, yScale, SAMPLE);
    const validCache = { data: [{}], ...key };

    it('is invalid when there is no cache or no cached data', () => {
        // WHY: a freshly-constructed cache holds `data: null`; treating it as valid
        // would return `null`/`[]` instead of computing the first real layout.
        expect(isJitterCacheValid(null, key)).toBe(false);
        expect(isJitterCacheValid(undefined, key)).toBe(false);
        expect(isJitterCacheValid({ data: null, ...key }, key)).toBe(false);
    });

    it('is valid when data, domains, and ranges all match', () => {
        expect(isJitterCacheValid(validCache, key)).toBe(true);
    });

    it('invalidates when the data changes', () => {
        // WHY: adding/removing/editing a point must recompute — stale positions
        // would map the wrong students to jittered slots.
        const changedKey = buildJitterCacheKey(xScale, yScale, [
            { studentId: 's3', d0Percentage: 1, d1Percentage: 2 },
        ]);
        expect(isJitterCacheValid(validCache, changedKey)).toBe(false);
    });

    it('invalidates when a domain changes (zoom)', () => {
        const zoomedKey = buildJitterCacheKey(
            stubScale({ domain: [20, 60], range: [0, 500] }),
            yScale,
            SAMPLE,
        );
        expect(isJitterCacheValid(validCache, zoomedKey)).toBe(false);
    });

    it('invalidates when a range changes (resize)', () => {
        // WHY: the range encodes chart pixel size — a resize moves every point, so
        // cached pixel positions from the old size must not be reused.
        const resizedKey = buildJitterCacheKey(
            xScale,
            stubScale({ domain: [0, 100], range: [300, 0] }),
            SAMPLE,
        );
        expect(isJitterCacheValid(validCache, resizedKey)).toBe(false);
    });
});

describe('simulateJitter (disabled path)', () => {
    it('places points at their scaled positions without running the force sim', () => {
        // WHY: when JITTER.ENABLED is false the helper must not touch d3 — it just
        // maps each point through the scales. (The enabled force-sim path needs a
        // live d3 and is covered by the SVG-diff + e2e, not here.)
        const result = simulateJitter(SAMPLE, {
            xScale: stubScale({ map: (v) => v * 2 }),
            yScale: stubScale({ map: (v) => v + 10 }),
            jitter: { ENABLED: false },
            pointRadius: 4,
        });
        expect(result).toEqual([
            { ...SAMPLE[0], x: 80, y: 70 },
            { ...SAMPLE[1], x: 110, y: 30 },
        ]);
    });

    it('returns an empty array for no points regardless of enabled flag', () => {
        expect(
            simulateJitter([], {
                xScale: stubScale(),
                yScale: stubScale(),
                jitter: { ENABLED: true },
                pointRadius: 4,
            }),
        ).toEqual([]);
    });
});
