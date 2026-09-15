// @vitest-browser
// (transitive: stackedBarUtils.js -> themeService.js reads getComputedStyle at import time)

import { describe, it, expect } from 'vitest';
import {
    insetStackedSegment,
    SVG_BAR_CONFIG,
} from '@tba3/modules/common/charts/stackedBarUtils.js';

/**
 * WHY: this inset is the one rule every code path that positions a stacked
 * segment has to agree on. It used to live only inside barChartRenderer's
 * initial-render closure, so the SL competency legend-toggle path re-stacked
 * segments without it — a hide/show round-trip left every segment `segmentGap`
 * px taller than first drawn and the surface gaps between fills vanished for the
 * rest of the session. `tests/e2e/sl-competency.spec.js` guards that end to end;
 * these lock the contract itself, in particular the branch that is easy to get
 * wrong when reimplementing it.
 */

describe('insetStackedSegment', () => {
    it('shrinks the segment by the full gap and shifts it by half, keeping the centre fixed', () => {
        const base = 100;
        const size = 40;
        const { pos, size: inset } = insetStackedSegment(base, size, 2);

        expect(inset).toBe(38);
        expect(pos).toBe(101);
        // The centre must not move — labels are positioned from it.
        expect(pos + inset / 2).toBe(base + size / 2);
    });

    it('leaves a segment no larger than the gap untouched so it cannot vanish', () => {
        // At or below the gap, insetting would zero the segment out (or invert it).
        expect(insetStackedSegment(10, 2, 2)).toEqual({ pos: 10, size: 2 });
        expect(insetStackedSegment(10, 1, 2)).toEqual({ pos: 10, size: 1 });
        expect(insetStackedSegment(10, 0, 2)).toEqual({ pos: 10, size: 0 });
    });

    it('defaults to the shared bar config gap so both call sites inset identically', () => {
        // The default is what makes the toggle path agree with the initial render
        // without every caller having to thread the value through.
        expect(insetStackedSegment(0, 50)).toEqual(
            insetStackedSegment(0, 50, SVG_BAR_CONFIG.segmentGap),
        );
    });

    it('treats a missing or negative gap as no gap rather than growing the segment', () => {
        expect(insetStackedSegment(10, 50, 0)).toEqual({ pos: 10, size: 50 });
        expect(insetStackedSegment(10, 50, -4)).toEqual({ pos: 10, size: 50 });
    });
});
