// @vitest-browser
// (measures path area and extent on a live <svg>)

import { describe, it, expect } from 'vitest';
import * as d3 from 'd3';
import {
    legendSymbolBox,
    markerHalfExtent,
    markerPath,
    renderLegendSymbol,
} from '../../../src/common/charts/markerSymbols.js';

/**
 * d3-path writes three decimals, so extents compare to 2 digits.
 *
 * The marker shape is the only channel that says which reference population a mark
 * stands for. Groups of one role differ only by a shade step, so two roles under a similar
 * silhouette would read as one population drawn twice, and a shape covering more area than
 * its neighbours reads as the weightier value. The cases pin equal area, centring and
 * distinct silhouettes, not the path strings.
 */

const SIZE_PX = 8;
const SHAPES = ['diamond', 'square', 'triangle', 'cross'];

/**
 * A path of the shape, drawn into a live SVG so it can be measured.
 * @param {string} shape
 * @returns {SVGPathElement}
 */
function drawn(shape) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', markerPath(shape, SIZE_PX));
    svg.appendChild(path);
    document.body.appendChild(svg);
    return path;
}

/**
 * The filled area of a closed polygon path, by sampling along it (shoelace).
 * @param {SVGPathElement} path - Attached to a live SVG.
 * @returns {number} The area in px².
 */
function area(path) {
    const length = path.getTotalLength();
    const steps = 2000;
    let sum = 0;
    let prev = path.getPointAtLength(0);
    for (let i = 1; i <= steps; i++) {
        const next = path.getPointAtLength((length * i) / steps);
        sum += prev.x * next.y - next.x * prev.y;
        prev = next;
    }
    return Math.abs(sum) / 2;
}

describe('markerPath', () => {
    it('gives every shape of one size the area of the diamond (2·size²)', () => {
        for (const shape of SHAPES) {
            expect(area(drawn(shape)), shape).toBeCloseTo(2 * SIZE_PX * SIZE_PX, 0);
        }
    });

    it('centres the diamond, square and cross on the data point, and the triangle on its centroid', () => {
        // The marker stands for a value, so an off-centre shape misreports it.
        for (const shape of ['diamond', 'square', 'cross']) {
            const box = drawn(shape).getBBox();
            expect(box.x + box.width / 2, shape).toBeCloseTo(0, 2);
            expect(box.y + box.height / 2, shape).toBeCloseTo(0, 2);
        }
        const box = drawn('triangle').getBBox();
        expect(box.x + box.width / 2).toBeCloseTo(0, 2);
        expect(box.y + (box.height * 2) / 3).toBeCloseTo(0, 2);
    });

    it('draws the Schulschnitt diamond as a square rhombus, not d3’s narrow one', () => {
        const box = drawn('diamond').getBBox();
        expect(box.width).toBeCloseTo(2 * SIZE_PX, 2);
        expect(box.height).toBeCloseTo(2 * SIZE_PX, 2);
    });

    it('keeps the cross’s arms narrow enough to read as a cross rather than a square', () => {
        // The catch-all mark's whole job is to be unmistakable against the square
        // (state) and the diamond (school). A cross covering its whole box would be one.
        const box = drawn('cross').getBBox();
        expect(area(drawn('cross'))).toBeLessThan(0.6 * box.width * box.height);
    });

    it('draws an unknown shape as the diamond', () => {
        expect(markerPath('hexagon', SIZE_PX)).toBe(markerPath('diamond', SIZE_PX));
    });
});

describe('markerHalfExtent', () => {
    it('is how far each shape reaches sideways from its centre', () => {
        for (const shape of SHAPES) {
            expect(drawn(shape).getBBox().width / 2, shape).toBeCloseTo(
                markerHalfExtent(shape, SIZE_PX),
                2,
            );
        }
    });

    it('is the nominal size for a circle', () => {
        expect(markerHalfExtent('circle', SIZE_PX)).toBe(SIZE_PX);
    });
});

describe('legend marker symbols', () => {
    it('draws each marker inside the row height its box reserves, centred on the anchor', () => {
        // The legend centres a row on the symbol's anchor and reserves only
        // `legendSymbolBox().height` for it. d3 centres the triangle on its centroid, so
        // drawn as on the chart its apex would overshoot the row into the one above.
        for (const shape of ['square', 'triangle', 'cross']) {
            const svg = d3.select(document.body).append('svg');
            renderLegendSymbol(svg.append('g'), shape, { sizePx: SIZE_PX });
            const box = /** @type {SVGGElement} */ (svg.select('g').node()).getBBox();
            const { height } = legendSymbolBox(shape, SIZE_PX);
            expect(box.y, shape).toBeGreaterThanOrEqual(-height / 2 - 0.01);
            expect(box.y + box.height, shape).toBeLessThanOrEqual(height / 2 + 0.01);
            expect(box.y + box.height / 2, shape).toBeCloseTo(0, 2);
        }
    });
});
