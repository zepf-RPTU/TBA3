// @vitest-browser

/**
 * A wired mark's `aria-label` is its tooltip text. A resize-only pass (`relabel` false)
 * keeps the labels it finds and names only the marks that have none.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { wireTooltipEvents } from '../../../../../src/common/charts/renderers/internal/chartInteractionUtils.js';

afterEach(() => {
    d3.selectAll('svg.interaction-utils-test, .tooltip').remove();
});

describe('wireTooltipEvents aria-label', () => {
    it('renews every label by default, and on a resize pass names only unlabelled marks', () => {
        const svg = d3.select(document.body).append('svg').attr('class', 'interaction-utils-test');
        const marks = svg.selectAll('circle').data([1, 2]).enter().append('circle');
        let prefix = 'A';
        const options = {
            getTooltipContent: (/** @type {number} */ d) => ({ title: `${prefix}${d}`, rows: [] }),
        };
        const labels = () => marks.nodes().map((mark) => mark.getAttribute('aria-label'));

        wireTooltipEvents(marks, options, true, true);
        expect(labels()).toEqual(['A1', 'A2']);

        prefix = 'B';
        marks.nodes()[1].removeAttribute('aria-label');
        wireTooltipEvents(marks, options, true, false);
        expect(labels()).toEqual(['A1', 'B2']);

        wireTooltipEvents(marks, options, true, true);
        expect(labels()).toEqual(['B1', 'B2']);
    });
});
