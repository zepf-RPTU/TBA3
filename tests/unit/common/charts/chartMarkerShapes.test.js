import { describe, it, expect } from 'vitest';
import {
    getDiamondPath,
    getTrianglePath,
    getCrossPath,
} from '@tba3/modules/common/charts/markerSymbols.js';

/**
 * WHY: the average markers are the only channel that says *which reference population*
 * a mark stands for. Several groups of one role share a base colour and are separated
 * only by a shade step, so if two roles ever resolved to a similar silhouette the plot
 * would read as one population drawn twice — "cardinality without identity".
 *
 * These cases pin the geometric properties that keep the four shapes distinguishable,
 * rather than the exact path strings, which are a rendering detail.
 */

/** Pull the coordinate pairs out of an SVG path built from M/L commands. */
function points(path) {
    return [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => [
        parseFloat(x),
        parseFloat(y),
    ]);
}

const CX = 100;
const CY = 50;
const SIZE = 8;

describe('getCrossPath', () => {
    it('draws a closed 12-point cross centred on its data point', () => {
        // WHY: the marker stands for a value, so an off-centre shape misreports it. The
        // square is positioned by its top-left corner and the cross by its centre — the
        // two conventions live side by side in every chart that draws both.
        const path = getCrossPath(CX, CY, SIZE);
        const pts = points(path);

        expect(pts).toHaveLength(12);
        expect(path.trimEnd().endsWith('Z')).toBe(true);

        const xs = pts.map(([x]) => x);
        const ys = pts.map(([, y]) => y);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(CX, 10);
        expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(CY, 10);
    });

    it('spans the same box as the diamond and triangle it sits beside', () => {
        // WHY: `size` means "centre to tip" for all three generators. A cross that read
        // it as a half-width would render at half the visual weight of the school
        // diamond next to it and look like a lesser kind of value.
        const pts = points(getCrossPath(CX, CY, SIZE));
        const xs = pts.map(([x]) => x);
        const ys = pts.map(([, y]) => y);

        expect(Math.min(...xs)).toBeCloseTo(CX - SIZE, 10);
        expect(Math.max(...xs)).toBeCloseTo(CX + SIZE, 10);
        expect(Math.min(...ys)).toBeCloseTo(CY - SIZE, 10);
        expect(Math.max(...ys)).toBeCloseTo(CY + SIZE, 10);
    });

    it('keeps arms narrow enough to read as a cross rather than a square', () => {
        // WHY: the catch-all mark's whole job is to be unmistakable against the square
        // (state) and the diamond (school). Arms approaching the full extent would fill
        // the bounding box and collapse that distinction.
        const pts = points(getCrossPath(CX, CY, SIZE));
        const armHalfWidth = Math.max(...pts.map(([x]) => x).filter((x) => x < CX + SIZE)) - CX;

        expect(armHalfWidth).toBeGreaterThan(0);
        expect(armHalfWidth).toBeLessThan(SIZE / 2);
    });

    it('produces a different silhouette from every other marker generator', () => {
        // WHY: a copy-paste that pointed the cross at getDiamondPath would still render
        // a valid marker, and nothing else in the suite would notice.
        const cross = getCrossPath(CX, CY, SIZE);

        expect(cross).not.toBe(getDiamondPath(CX, CY, SIZE));
        expect(cross).not.toBe(getTrianglePath(CX, CY, SIZE));
        expect(points(cross).length).toBeGreaterThan(points(getDiamondPath(CX, CY, SIZE)).length);
    });
});
