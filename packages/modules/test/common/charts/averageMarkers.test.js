// @vitest-browser
// (draws into a live <svg>; themeService reads getComputedStyle at import)

import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import { ChartRenderer } from '../../../src/common/charts/renderers/chartRenderer.js';
import { joinAverageMarkers } from '../../../src/common/charts/averageMarkers.js';
import { AVERAGE_MARKER } from '../../../src/common/charts/chartDefaults.js';
import { markerHalfExtent, markerPath } from '../../../src/common/charts/markerSymbols.js';
import { makeVisibleChartContainer } from '../../support/chartHarness.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';

class ProbeChart extends ChartRenderer {
    /** @override */
    validateData() {
        return true;
    }
    /** @override */
    renderChart() {}
}

function setup() {
    const container = makeVisibleChartContainer('average-marker-probe');
    const chart = new ProbeChart(container, { context: createTestContext(), autoResize: false });
    const g = d3.select(document.body).append('svg').append('g');
    return { chart, g };
}

/** @typedef {{id: string, v: number}} ProbeDatum */

/** @type {ProbeDatum[]} */
const DATA = [
    { id: 'a', v: 10 },
    { id: 'b', v: 30 },
];

const OPTIONS = {
    selector: 'probe-marker',
    classFn: () => 'probe-marker',
    shape: 'diamond',
    key: (/** @type {ProbeDatum} */ d) => d.id,
    getX: (/** @type {ProbeDatum} */ d) => d.v,
    getY: () => 50,
    paint: { fill: '#ffffff', stroke: '#336699', strokeWidth: 2, dotFill: null },
    visible: () => true,
    durationMs: 0,
    transitionName: 'avg',
};

describe('joinAverageMarkers', () => {
    it('enters one <g> per datum at its point, the shape painted and sized by the shared token', () => {
        const { chart, g } = setup();
        const markers = joinAverageMarkers(chart, g, DATA, OPTIONS);

        expect(markers.size()).toBe(2);
        const marker = /** @type {SVGGElement} */ (markers.node());
        expect(marker.tagName).toBe('g');
        expect(marker.getAttribute('class')).toBe('probe-marker data-mark');
        expect(marker.getAttribute('transform')).toBe('translate(10, 50)');
        const shape = /** @type {SVGPathElement} */ (marker.querySelector('.marker-shape'));
        expect(shape.tagName).toBe('path');
        expect(shape.getAttribute('d')).toBe(markerPath('diamond', AVERAGE_MARKER.sizePx));
        expect(shape.style.fill).toBe('rgb(255, 255, 255)');
        expect(shape.style.stroke).toBe('rgb(51, 102, 153)');
        expect(shape.getAttribute('stroke-width')).toBe('2');
        expect(shape.getBBox().width).toBeCloseTo(2 * AVERAGE_MARKER.sizePx);
        // Opacity is a style on the marker, as the visibility pass writes it.
        expect(marker.style.opacity).toBe('1');
        expect(marker.style.pointerEvents).toBe('auto');
    });

    it('draws a square at the equal-area half-extent, centred on the origin', () => {
        const { chart, g } = setup();
        const markers = joinAverageMarkers(chart, g, DATA, { ...OPTIONS, shape: 'square' });
        const half = markerHalfExtent('square', AVERAGE_MARKER.sizePx);
        const box = /** @type {SVGPathElement} */ (
            markers.select('.marker-shape').node()
        ).getBBox();
        expect(box.width).toBeCloseTo(2 * half, 2);
        expect(box.x).toBeCloseTo(-half, 2);
    });

    it('hides the markers from sight and pointer while not visible', () => {
        const { chart, g } = setup();
        const markers = joinAverageMarkers(chart, g, DATA, {
            ...OPTIONS,
            visible: () => false,
        });
        const marker = /** @type {SVGGElement} */ (required(markers.node()));
        expect(marker.style.opacity).toBe('0');
        expect(marker.style.pointerEvents).toBe('none');
    });

    it('puts an inert dot in each marker when the paint asks for one, and removes it when it stops', () => {
        const { chart, g } = setup();
        const withDot = { ...OPTIONS, paint: { ...OPTIONS.paint, dotFill: '#336699' } };
        joinAverageMarkers(chart, g, DATA, withDot);

        const dots = g.selectAll('.probe-marker > circle.marker-dot');
        expect(dots.size()).toBe(2);
        expect(dots.nodes().map((n) => /** @type {Element} */ (n).getAttribute('cx'))).toEqual([
            '0',
            '0',
        ]);
        expect(parseFloat(dots.attr('r'))).toBeCloseTo(AVERAGE_MARKER.sizePx * 0.35);
        expect(/** @type {Element} */ (required(dots.node())).getAttribute('pointer-events')).toBe(
            'none',
        );

        joinAverageMarkers(chart, g, DATA, OPTIONS);
        expect(g.selectAll('circle.marker-dot').size()).toBe(0);
        expect(g.selectAll('.probe-marker').size()).toBe(2);
    });

    it('gives a kept marker the shape and size of the latest join', () => {
        const { chart, g } = setup();
        const withDot = { ...OPTIONS, paint: { ...OPTIONS.paint, dotFill: '#336699' } };
        joinAverageMarkers(chart, g, DATA, withDot);

        const markers = joinAverageMarkers(chart, g, DATA, {
            ...withDot,
            shape: 'square',
            sizePx: 12,
        });

        expect(markers.select('.marker-shape').attr('d')).toBe(markerPath('square', 12));
        const dots = g.selectAll('circle.marker-dot');
        expect(dots.size()).toBe(2);
        expect(parseFloat(dots.attr('r'))).toBeCloseTo(markerHalfExtent('square', 12) * 0.35);
    });
});
