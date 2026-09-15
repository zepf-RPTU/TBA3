// @vitest-browser
// (jsdom because stackedBarUtils' DOM_BAR_CONFIG reads theme colors at import.)

/**
 * computeStackedBarRects — the single geometry authority for stacked bars.
 *
 * Pins the rules that used to live in two parallel positioning systems
 * (createSVGStackedBar's fallback closures and the SL legend-toggle re-stack):
 * scale application, orientation flip, the value-derived `end` fallback, and
 * the surface-gap inset applied only along the stacking axis. The hide/show
 * round-trip idempotence test encodes the recorded regression: a legend
 * toggle once re-stacked segments without the inset, leaving every segment
 * `gap` px larger than it was first drawn.
 */
import { describe, expect, it } from 'vitest';
import {
    buildStackedSegments,
    computeStackedBarRects,
    SVG_BAR_CONFIG,
} from '@tba3/modules/common/charts/stackedBarUtils.js';

/** Three segments at 25% / 50% / 25%. */
function makeSegments() {
    return buildStackedSegments({ I: 25, II: 50, III: 25 }, ['I', 'II', 'III'], () => '#000');
}

describe('computeStackedBarRects', () => {
    it('lays out horizontal bars along an ascending scale, insetting only x/width', () => {
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => v * 4, // 0..100% → 0..400px
            bandSize: 24,
            isHorizontal: true,
            gap: 2,
        });

        expect(rects[0]).toMatchObject({ x: 1, y: 0, width: 98, height: 24 });
        expect(rects[1]).toMatchObject({ x: 101, y: 0, width: 198, height: 24 });
        expect(rects[2]).toMatchObject({ x: 301, y: 0, width: 98, height: 24 });
        expect(rects[0].preInset).toEqual({ pos: 0, size: 100 });
    });

    it('lays out vertical bars along an inverted scale, insetting only y/height', () => {
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => 400 - v * 4, // d3 linear with range [400, 0]
            bandSize: 24,
            isHorizontal: false,
            gap: 2,
        });

        // First segment (0–25%) sits at the bottom of the 400px axis.
        expect(rects[0]).toMatchObject({ x: 0, y: 301, width: 24, height: 98 });
        expect(rects[1]).toMatchObject({ x: 0, y: 101, width: 24, height: 198 });
        expect(rects[2]).toMatchObject({ x: 0, y: 1, width: 24, height: 98 });
        expect(rects[2].preInset).toEqual({ pos: 0, size: 100 });
    });

    it('reproduces the percent-of-extent fallback of the old renderer closures when no scale is given', () => {
        const horizontal = computeStackedBarRects(makeSegments(), {
            extent: 200,
            bandSize: 10,
            isHorizontal: true,
            gap: 0,
        });
        expect(horizontal[1]).toMatchObject({ x: 50, width: 100 });

        const vertical = computeStackedBarRects(makeSegments(), {
            extent: 200,
            bandSize: 10,
            isHorizontal: false,
            gap: 0,
        });
        // ((100 - end)/100) * extent, exactly like the old baseY closure.
        expect(vertical[1]).toMatchObject({ y: 50, height: 100 });
    });

    it('derives a missing end from the segment value', () => {
        const rects = computeStackedBarRects([{ start: 10, value: 30 }], {
            positionScale: (v) => v,
            bandSize: 5,
            isHorizontal: true,
            gap: 0,
        });

        expect(rects[0]).toMatchObject({ x: 10, width: 30 });
    });

    it('defaults the gap to the shared bar config so all call paths inset identically', () => {
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => v * 4,
            bandSize: 24,
            isHorizontal: true,
        });

        const gap = SVG_BAR_CONFIG.segmentGap;
        expect(rects[0].x).toBe(0 + gap / 2);
        expect(rects[0].width).toBe(100 - gap);
    });

    it('applies the crossOffset on the non-stacking axis', () => {
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => v,
            bandSize: 24,
            crossOffset: 7,
            isHorizontal: true,
            gap: 0,
        });

        expect(rects[0].y).toBe(7);
    });

    describe('isVisible re-stack mode', () => {
        const yScale = (v) => 400 - v * 4;
        const options = { positionScale: yScale, bandSize: 24, isHorizontal: false, gap: 2 };

        it('collapses hidden segments to the baseline and re-stacks the rest contiguously', () => {
            const rects = computeStackedBarRects(makeSegments(), {
                ...options,
                isVisible: (segment) => segment.field !== 'II',
            });

            // Hidden middle segment: zero height at the baseline.
            expect(rects[1]).toMatchObject({ y: yScale(0), height: 0 });
            // III re-stacks directly on top of I (25%..50%), no hole where II was.
            expect(rects[0]).toMatchObject({ y: yScale(25) + 1, height: 98 });
            expect(rects[2]).toMatchObject({ y: yScale(50) + 1, height: 98 });
        });

        it('collapses zero-value segments even when visible', () => {
            const segments = buildStackedSegments({ I: 0, II: 100 }, ['I', 'II'], () => '#000');
            const rects = computeStackedBarRects(segments, { ...options, isVisible: () => true });

            expect(rects[0]).toMatchObject({ y: yScale(0), height: 0 });
            expect(rects[1].height).toBe(398);
        });

        it('a hide/show round-trip reproduces the initial geometry exactly', () => {
            const segments = makeSegments();
            const initial = computeStackedBarRects(segments, { ...options, isVisible: () => true });
            computeStackedBarRects(segments, { ...options, isVisible: (s) => s.field !== 'II' });
            const restored = computeStackedBarRects(segments, {
                ...options,
                isVisible: () => true,
            });

            expect(restored).toEqual(initial);
            // And the all-visible re-stack matches the trust-the-segments mode,
            // pinning that both entry points share one geometry.
            const direct = computeStackedBarRects(segments, options);
            expect(restored.map((r) => ({ y: r.y, height: r.height }))).toEqual(
                direct.map((r) => ({ y: r.y, height: r.height })),
            );
        });
    });
});
