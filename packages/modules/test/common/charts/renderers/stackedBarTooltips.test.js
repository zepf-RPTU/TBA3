// @vitest-browser

/**
 * Each stacked bar wires its own segment tooltips, handed its bar's context, so a
 * chart of many bars names every segment after its own bar — and still keeps one tab
 * stop, because the tab stop settles once per task however many bars wired.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { createSVGStackedBar } from '../../../../src/common/charts/renderers/stackedBarBuilder.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';

afterEach(() => {
    d3.selectAll('.tooltip').remove();
});

describe('stacked-bar tooltips', () => {
    it('names each segment after its own bar, with one tab stop for the chart', async () => {
        const container = makeVisibleChartContainer('stacked-tooltips');
        const renderer = new ChartRenderer(container, {
            context: createTestContext(),
            autoResize: false,
        });
        const svg = renderer.createSVGElement(300, 200);
        const yScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);
        /** @type {import('../../../../src/common/charts/renderers/stackedBarBuilder.js').StackedBarTooltip} */
        const tooltip = {
            getTooltipContent: (d, bar) => ({ title: `${bar.name} ${d.field}`, rows: [] }),
        };

        for (const name of ['8a', '8b']) {
            createSVGStackedBar(
                svg.append('g'),
                [
                    { field: 'low', label: 'low', value: 40, percentage: 40, color: '#888' },
                    { field: 'high', label: 'high', value: 60, percentage: 60, color: '#444' },
                ],
                { yScale, barSizePx: 20, context: { name }, tooltip },
                renderer,
            );
        }

        const svgNode = required(svg.node());
        const labels = [...svgNode.querySelectorAll('rect.bar-segment')].map((rect) =>
            rect.getAttribute('aria-label'),
        );
        expect(labels).toEqual(['8a low', '8a high', '8b low', '8b high']);
        // The tab stop settles once, in a microtask after the wiring.
        await Promise.resolve();
        expect(svgNode.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    });

    it('makes a segment whose click toggles its highlight a pressed or unpressed toggle', () => {
        // MA overview: Enter on a level filters the item rings and rings the segment.
        const container = makeVisibleChartContainer('stacked-toggle');
        const renderer = new ChartRenderer(container, {
            context: createTestContext(),
            autoResize: false,
        });
        const svg = renderer.createSVGElement(300, 200);
        const yScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);
        createSVGStackedBar(
            svg.append('g'),
            [
                { field: 'low', label: 'low', value: 40, percentage: 40, color: '#888' },
                { field: 'high', label: 'high', value: 60, percentage: 60, color: '#444' },
            ],
            {
                yScale,
                barSizePx: 20,
                highlightedKeys: ['high'],
                tooltip: {
                    getTooltipContent: (d) => ({ title: d.field, rows: [] }),
                    onClick: () => {},
                },
            },
            renderer,
        );

        const rects = [...required(svg.node()).querySelectorAll('rect.bar-segment')];
        expect(rects.map((rect) => rect.getAttribute('role'))).toEqual(['button', 'button']);
        expect(rects.map((rect) => rect.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    });
});
