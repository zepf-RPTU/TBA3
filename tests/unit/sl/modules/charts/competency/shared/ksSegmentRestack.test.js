// @vitest-browser
// (jsdom because competencyKsGeometry transitively reads theme state at import.)

/**
 * SL competency legend-toggle re-stack — pins that computeKsSegmentPositions
 * routes through the same geometry authority as the initial render
 * (computeStackedBarRects), so a hide/show round-trip restores the exact
 * first-paint geometry. The recorded bug this guards: the re-stack path once
 * derived positions itself without the surface-gap inset, so every toggle
 * round-trip left segments `segmentGap` px taller than they were drawn.
 */
import { describe, expect, it } from 'vitest';
import { computeKsSegmentPositions } from '@tba3/modules/sl/modules/charts/competency/shared/competencyKsGeometry.js';
import {
    buildStackedSegments,
    computeStackedBarRects,
    SVG_BAR_CONFIG,
} from '@tba3/modules/common/charts/stackedBarUtils.js';

const ksLevelToGroup = new Map([
    ['I', 'unter Mindeststandard'],
    ['II', 'Mindeststandard'],
    ['III', 'Regelstandard'],
]);
const distribution = { I: 25, II: 50, III: 25 };
const yScale = (v) => 400 - v * 4; // d3 linear, domain [0,100], range [400, 0]

function visibility(hidden = []) {
    const groupVisibility = {};
    for (const group of ksLevelToGroup.values()) {
        groupVisibility[group] = !hidden.includes(group);
    }
    return groupVisibility;
}

describe('computeKsSegmentPositions', () => {
    it('matches the initial-render geometry when every level is visible', () => {
        const positions = computeKsSegmentPositions(
            ksLevelToGroup,
            visibility(),
            distribution,
            yScale,
        );

        // The exact same rects createSVGStackedBar computes on first paint.
        const segments = buildStackedSegments(
            distribution,
            [...ksLevelToGroup.keys()],
            () => '#000',
        );
        const renderRects = computeStackedBarRects(segments, {
            positionScale: yScale,
            bandSize: 24,
            isHorizontal: false,
            gap: SVG_BAR_CONFIG.segmentGap,
        });

        renderRects.forEach((rect) => {
            expect(positions.get(rect.segment.field)).toEqual({ y: rect.y, height: rect.height });
        });
    });

    it('collapses a hidden level to the baseline and re-stacks the rest contiguously', () => {
        const positions = computeKsSegmentPositions(
            ksLevelToGroup,
            visibility(['Mindeststandard']),
            distribution,
            yScale,
        );

        expect(positions.get('II')).toEqual({ y: yScale(0), height: 0 });
        // III re-stacks straight onto I (25%..50%) with the shared inset applied.
        const gap = SVG_BAR_CONFIG.segmentGap;
        expect(positions.get('III')).toEqual({ y: yScale(50) + gap / 2, height: 100 - gap });
    });

    it('a hide/show round-trip restores the exact initial geometry', () => {
        const initial = computeKsSegmentPositions(
            ksLevelToGroup,
            visibility(),
            distribution,
            yScale,
        );
        computeKsSegmentPositions(
            ksLevelToGroup,
            visibility(['Mindeststandard']),
            distribution,
            yScale,
        );
        const restored = computeKsSegmentPositions(
            ksLevelToGroup,
            visibility(),
            distribution,
            yScale,
        );

        expect(restored).toEqual(initial);
    });
});
