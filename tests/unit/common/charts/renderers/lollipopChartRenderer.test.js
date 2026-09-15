// @vitest-browser
// (draws into a live <svg>; themeService reads getComputedStyle at import)

import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import { LollipopChartRenderer } from '@tba3/modules/common/charts/renderers/lollipopChartRenderer.js';
import { MARKER_DOT_RATIO, renderLegendSymbol } from '@tba3/modules/common/charts/markerSymbols.js';

class ProbeLollipop extends LollipopChartRenderer {
    validateData() {
        return true;
    }
    async renderChart() {}
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('joinAverageMarker — centre dot', () => {
    it('follows each marker with an inert dot when the paint asks for one, and removes it when it stops', () => {
        const container = document.createElement('div');
        container.id = 'marker-dot-probe';
        document.body.appendChild(container);
        const chart = new ProbeLollipop('marker-dot-probe', { autoResize: false });
        const g = d3.select(document.body).append('svg').append('g');
        const data = [
            { id: 'a', v: 10 },
            { id: 'b', v: 30 },
        ];
        const options = {
            selector: 'probe-marker',
            classFn: () => 'probe-marker',
            shape: 'diamond',
            key: (d) => d.id,
            getX: (d) => d.v,
            getY: () => 50,
            size: 6,
            fill: '#fff',
            stroke: '#369',
            strokeWidth: 2,
            dotFill: '#369',
            visible: () => true,
            duration: 0,
            transitionName: 'avg',
        };
        chart.joinAverageMarker(g, data, options);

        const dots = g.selectAll('circle.probe-marker-dot');
        expect(dots.size()).toBe(2);
        expect(dots.nodes().map((n) => n.getAttribute('cx'))).toEqual(['10', '30']);
        expect(parseFloat(dots.attr('r'))).toBeCloseTo(6 * MARKER_DOT_RATIO);
        expect(dots.node().style.pointerEvents).toBe('none');

        chart.joinAverageMarker(g, data, { ...options, dotFill: null });
        expect(g.selectAll('circle.probe-marker-dot').size()).toBe(0);
        expect(g.selectAll('.probe-marker').size()).toBe(2);
    });
});

describe('renderLegendSymbol({ dotFill })', () => {
    it('draws the dot over a centred symbol', () => {
        const g = d3.select(document.body).append('svg').append('g');
        renderLegendSymbol(g, 'square', { color: '#fff', stroke: '#369', dotFill: '#369' });
        const dot = g.select('circle.marker-dot');
        expect(dot.empty()).toBe(false);
        expect(dot.attr('cx')).toBe('0');
        expect(dot.attr('fill')).toBe('#369');
    });
});
