// @vitest-browser

/**
 * A lollipop item is a stem, a head and its comparison markers, and all of them
 * say one thing: the item's tooltip, which lists the comparison values. Wired one by
 * one, an item would be 2 + N hover targets and 1 + N tab stops, with a tooltip that
 * flickers as the pointer crosses from stem to marker to head. The item's hit band is its
 * one target, and hovering it grows the item's stem and head. The band is also the hover
 * tint, so it is centred on its item: halfway to the nearer neighbour on both sides, so
 * an edge item or one beside a wider gap is not tinted lopsided.
 */
import { describe, expect, it } from 'vitest';

import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { joinLollipops } from '../../../../src/common/charts/renderers/lollipopMarks.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';

/** @typedef {{id: string, x: number, y: number}} ItemDatum */

/** @type {ItemDatum[]} */
const DATA = [
    { id: 'a', x: 50, y: 40 },
    { id: 'b', x: 100, y: 80 },
    { id: 'c', x: 200, y: 20 },
];

/**
 * A lollipop renderer with the three items joined into a 300×200 plot.
 * @returns {{renderer: ChartRenderer, lines: import('d3').Selection<SVGLineElement, ItemDatum, SVGGElement, unknown>, circles: import('d3').Selection<SVGCircleElement, ItemDatum, SVGGElement, unknown>, hits: import('d3').Selection<SVGRectElement, ItemDatum, any, any>}}
 */
function drawn() {
    const container = makeVisibleChartContainer(`hits-${Math.random().toString(36).slice(2)}`);
    const renderer = new ChartRenderer(container, {
        context: createTestContext(),
        autoResize: false,
    });
    renderer.createSVGElement(300, 200);
    renderer.layout = /** @type {any} */ ({ chart: { x: 0, y: 0, width: 300, height: 200 } });
    const g = required(renderer.svg).append('g');
    const marks = g.append('g');
    const hitLayer = g.append('g');
    const joined = joinLollipops(renderer, marks, DATA, {
        key: (d) => d.id,
        x: (d) => d.x,
        y: (d) => d.y,
        baselineY: 200,
        color: () => '#336699',
        stemWidthPx: 2,
        headRadiusPx: 5,
        durationMs: 0,
        hitLayer,
        tooltip: { getTooltipContent: (d) => ({ title: d.id }) },
    });
    return { renderer, ...joined };
}

describe('joinLollipops hit bands', () => {
    it('gives each item one band, centred on it and halfway to its nearer neighbour', () => {
        const { hits } = drawn();

        const spans = hits
            .nodes()
            .map((rect) => [Number(rect.getAttribute('x')), Number(rect.getAttribute('width'))]);
        expect(spans).toEqual([
            [25, 50],
            [75, 50],
            [150, 100],
        ]);
        expect(hits.attr('height')).toBe('200');
    });

    it('makes the band, not the stem or head, the one tab stop per item', () => {
        const { lines, circles, hits } = drawn();

        expect(hits.nodes().every((rect) => rect.hasAttribute('tabindex'))).toBe(true);
        expect([...lines.nodes(), ...circles.nodes()].some((m) => m.hasAttribute('tabindex'))).toBe(
            false,
        );
        expect(required(hits.node()).getAttribute('aria-label')).toBe('a');
    });

    it('lies over the marks, so they take no pointer of their own', () => {
        const { hits } = drawn();
        const svg = required(required(hits.node()).ownerSVGElement);

        // The bands' layer follows the stems' and heads' in paint order.
        const plot = required(svg.querySelector('g'));
        const lastMark = required(required(plot.lastElementChild).lastElementChild);
        expect(lastMark.classList.contains('lollipop-hit')).toBe(true);
        expect(required(plot.firstElementChild).querySelector('.lollipop-circle')).not.toBeNull();
    });
});
