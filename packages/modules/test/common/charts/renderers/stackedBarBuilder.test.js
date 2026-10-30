// @vitest-browser

import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { createSVGStackedBar } from '../../../../src/common/charts/renderers/stackedBarBuilder.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';

describe('createSVGStackedBar', () => {
    it('takes the value labels away when a later pass draws without them', () => {
        const container = makeVisibleChartContainer('stacked-labels');
        const renderer = new ChartRenderer(container, {
            context: createTestContext(),
            autoResize: false,
        });
        const svg = renderer.createSVGElement(300, 200);
        const g = svg.append('g');
        const yScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);
        const segments = [
            {
                field: 'low',
                label: 'low',
                value: 40,
                percentage: 40,
                color: 'var(--test-segment-color)',
            },
            {
                field: 'high',
                label: 'high',
                value: 60,
                percentage: 60,
                color: 'var(--test-segment-color)',
            },
        ];
        const config = {
            yScale,
            barSizePx: 60,
            labelFormatter: (/** @type {{percentage: number}} */ d) => `${d.percentage}`,
        };

        createSVGStackedBar(g, segments, { ...config, showLabels: true }, renderer);
        expect(g.selectAll('text.value-label').size()).toBe(2);

        createSVGStackedBar(g, segments, { ...config, showLabels: false }, renderer);
        expect(g.selectAll('text.value-label').size()).toBe(0);
        expect(g.selectAll('rect.bar-segment').size()).toBe(2);
    });
});
