// @vitest-browser
import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { wrapBandAxisTickLabels } from '../../../src/common/charts/chartLabelFit.js';

/**
 * Group names show as the data names them. A band scale may be keyed on an internal
 * row key (`group:8a`) and print the name through `tickFormat`; the wrap pass must fit
 * the printed name, never the key.
 */

const CHAR_PX = 6;
/** @type {Parameters<typeof wrapBandAxisTickLabels>[0]} */
const chart = {
    resolveChartTextSize: () => 14,
    measureTexts: (texts) => {
        const sizes = texts.map((t) => ({ width: t.length * CHAR_PX }));
        return { maxWidth: Math.max(...sizes.map((size) => size.width)), sizes };
    },
};

/**
 * Draw a left band axis keyed on `group:<name>` that prints the bare name.
 * @param {string[]} names
 */
function drawAxis(names) {
    const scale = d3
        .scaleBand()
        .domain(names.map((name) => `group:${name}`))
        .range([0, 200]);
    return d3
        .select(document.body)
        .append('svg')
        .append('g')
        .call(d3.axisLeft(scale).tickFormat((key) => key.slice('group:'.length)));
}

afterEach(() => {
    d3.selectAll('body > svg').remove();
});

describe('wrapBandAxisTickLabels', () => {
    it("prints the axis's formatted name, not the band key", () => {
        // Wrapping the datum would print the group `8a` as `gr…8a`.
        const axis = drawAxis(['8a']);
        wrapBandAxisTickLabels(chart, axis, 4 * CHAR_PX, { stack: 'center' });

        expect(axis.select('.tick text').text()).toBe('8a');
    });

    it('wraps a long formatted name from its own words', () => {
        const axis = drawAxis(['Lerngruppe Englisch']);
        wrapBandAxisTickLabels(chart, axis, 12 * CHAR_PX, { stack: 'center' });

        const lines = axis
            .selectAll('.tick text tspan')
            .nodes()
            .map((node) => /** @type {Element} */ (node).textContent);
        expect(lines).toEqual(['Lerngruppe', 'Englisch']);
    });
});
