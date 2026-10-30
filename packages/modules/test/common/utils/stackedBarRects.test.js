// @vitest-browser
// (transitive: stackedBarUtils.js -> themeService.js reads getComputedStyle at import time)

/**
 * computeStackedBarRects — the single geometry authority for stacked bars.
 *
 * Pins its rules, shared by createSVGStackedBar and the SL group-comparison pyramid:
 * scale application, orientation flip, and the surface-gap inset applied only along
 * the stacking axis.
 */
import { describe, expect, it } from 'vitest';
import {
    buildStackedSegments,
    computeStackedBarRects,
    SEGMENT_GAP_PX,
} from '../../../src/common/utils/stackedBarUtils.js';
import { CompetenceLevelPalette } from '../../../src/common/context/index.js';

/** An empty palette: no field here is a registered level, so no segment takes a band. */
const palette = new CompetenceLevelPalette();

function makeSegments() {
    return buildStackedSegments(palette, { I: 25, II: 50, III: 25 }, ['I', 'II', 'III']);
}

describe('computeStackedBarRects', () => {
    it('lays out horizontal bars along an ascending scale, insetting only x/width', () => {
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => v * 4, // 0..100% → 0..400px
            bandSizePx: 24,
            isHorizontal: true,
        });

        expect(rects[0]).toMatchObject({ x: 1, y: 0, width: 98, height: 24 });
        expect(rects[1]).toMatchObject({ x: 101, y: 0, width: 198, height: 24 });
        expect(rects[2]).toMatchObject({ x: 301, y: 0, width: 98, height: 24 });
    });

    it('lays out vertical bars along an inverted scale, insetting only y/height', () => {
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => 400 - v * 4, // d3 linear with range [400, 0]
            bandSizePx: 24,
            isHorizontal: false,
        });

        // First segment (0–25%) sits at the bottom of the 400px axis.
        expect(rects[0]).toMatchObject({ x: 0, y: 301, width: 24, height: 98 });
        expect(rects[1]).toMatchObject({ x: 0, y: 101, width: 24, height: 198 });
        expect(rects[2]).toMatchObject({ x: 0, y: 1, width: 24, height: 98 });
    });

    it('grows a bar away from zero along a mirrored scale (the left wing of a pyramid)', () => {
        // A mirrored scale (range [0, -400]) must place each segment left of the
        // centre line, the first segment nearest it, with the same inset as every other bar.
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => -v * 4,
            bandSizePx: 24,
            isHorizontal: true,
        });

        expect(rects[0]).toMatchObject({ x: -99, y: 0, width: 98, height: 24 });
        expect(rects[1]).toMatchObject({ x: -299, y: 0, width: 198, height: 24 });
        expect(rects[2]).toMatchObject({ x: -399, y: 0, width: 98, height: 24 });
    });

    it('stacks by percentage alone, from zero, and collapses an empty segment at the baseline', () => {
        const rects = computeStackedBarRects(
            [{ percentage: 10 }, { percentage: 0 }, { percentage: 30 }],
            { positionScale: (v) => v, bandSizePx: 5, isHorizontal: true },
        );

        expect(rects[0]).toMatchObject({ x: 1, width: 8 });
        expect(rects[1]).toMatchObject({ x: 0, width: 0 });
        expect(rects[2]).toMatchObject({ x: 11, width: 28 });
    });

    it('insets by the shared segment gap so all call paths inset identically', () => {
        const rects = computeStackedBarRects(makeSegments(), {
            positionScale: (v) => v * 4,
            bandSizePx: 24,
            isHorizontal: true,
        });

        const gap = SEGMENT_GAP_PX;
        expect(rects[0].x).toBe(0 + gap / 2);
        expect(rects[0].width).toBe(100 - gap);
    });
});
