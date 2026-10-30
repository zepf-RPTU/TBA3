// @vitest-browser
// (transitive: chartAxisUtils.js -> chartTypography reads computed styles)

import { describe, it, expect } from 'vitest';
import * as d3 from 'd3';

import { percentAxisMax, percentTickValues } from '../../../src/common/charts/chartAxisUtils.js';

describe('percentAxisMax', () => {
    // The axis top is where the eye reads the scale. Rounded to a 10 % grid while the
    // axis draws 20 % ticks, a maximum of 70 leaves the top between two labels.
    it.each([
        [73, 400],
        [73, 120],
        [70, 120],
        [41, 60],
        // Steps 20 and 50 do not divide each other: rounding up to one lands off the next.
        [41, 90],
        [12, 40],
    ])('puts the top of a %s %% axis %s px tall on a labelled tick', (value, length) => {
        const top = percentAxisMax(value, length, 'left');
        const ticks = percentTickValues(
            d3.scaleLinear().domain([0, top]).range([length, 0]),
            'left',
        );

        expect(top).toBeGreaterThanOrEqual(value);
        expect(ticks.at(-1)).toBe(top);
    });

    it('keeps the 10 % grid where the axis has room for it', () => {
        expect(percentAxisMax(73, 400, 'left')).toBe(80);
    });

    it('is 100 when there is nothing to show', () => {
        expect(percentAxisMax(0, 300, 'left')).toBe(100);
    });
});
