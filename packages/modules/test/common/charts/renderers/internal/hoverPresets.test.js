// @vitest-browser

/**
 * Every chart mark takes one of three hover looks, and `leave` must put back exactly
 * what the mark rested at — a dimmed bar that stays dimmed, or a dot that creeps larger
 * with every pass of the pointer, reads as a selection that is not there.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import {
    HOVER_PRESETS,
    STEM_HOVER,
    wireTooltipEvents,
} from '../../../../../src/common/charts/renderers/internal/chartInteractionUtils.js';
import { MARK_DEFAULTS } from '../../../../../src/common/charts/chartDefaults.js';
import { cursorTooltip } from '../../../../../src/common/services/cursorTooltip.js';
import { required } from '../../../../support/required.js';

/** @returns {d3.Selection<SVGSVGElement, unknown, null, undefined>} A live SVG. */
function makeSvg() {
    return d3.select(document.body).append('svg').attr('class', 'hover-preset-test');
}

/**
 * Wire a mark as a chart would, its effect applied at once rather than animated.
 * @param {Element} element
 * @param {import('../../../../../src/common/charts/renderers/internal/chartInteractionUtils.js').HoverEffect} effect
 * @param {Partial<import('../../../../../src/common/charts/renderers/internal/chartInteractionUtils.js').TooltipWiringOptions>} [options]
 * @returns {{enter: () => void, leave: () => void}} Pointer enter and leave on the mark.
 */
function wire(element, effect, options = {}) {
    wireTooltipEvents(
        d3.select(element).datum({}),
        {
            getTooltipContent: () => ({ title: 'Mark' }),
            hoverEffect: { ...effect, useTransition: false },
            ...options,
        },
        true,
        true,
    );
    return {
        enter: () => element.dispatchEvent(new MouseEvent('mouseenter')),
        leave: () => element.dispatchEvent(new MouseEvent('mouseleave')),
    };
}

afterEach(() => {
    document.querySelectorAll('.hover-preset-test').forEach((node) => node.remove());
    cursorTooltip.hide();
});

describe('HOVER_PRESETS', () => {
    it('area dims while hovered and leaves no opacity behind', () => {
        const rect = required(makeSvg().append('rect').node());

        const hover = wire(rect, HOVER_PRESETS.area);
        hover.enter();
        expect(rect.style.opacity).toBe('0.8');

        hover.leave();
        expect(rect.style.opacity).toBe('');
    });

    it('point grows a circle by the head scale and restores its own radius', () => {
        const circle = required(makeSvg().append('circle').attr('r', 5).node());

        const hover = wire(circle, HOVER_PRESETS.point);
        hover.enter();
        expect(Number(circle.getAttribute('r'))).toBeCloseTo(5 * MARK_DEFAULTS.hoverScale.head);

        hover.leave();
        expect(Number(circle.getAttribute('r'))).toBe(5);
    });

    it('point grows from the resting radius even when re-entered while grown', () => {
        // A re-enter before the leave lands must not compound the growth.
        const circle = required(makeSvg().append('circle').attr('r', 4).node());

        const hover = wire(circle, HOVER_PRESETS.point);
        hover.enter();
        hover.enter();
        expect(Number(circle.getAttribute('r'))).toBeCloseTo(4 * MARK_DEFAULTS.hoverScale.head);
    });

    it('the stem half grows the stroke width by the stem scale', () => {
        const line = required(makeSvg().append('line').attr('stroke-width', 2).node());

        const hover = wire(line, STEM_HOVER);
        hover.enter();
        expect(Number(line.getAttribute('stroke-width'))).toBe(2 * MARK_DEFAULTS.hoverScale.stem);

        hover.leave();
        expect(Number(line.getAttribute('stroke-width'))).toBe(2);
    });

    it('band tints a transparent hit rect and hands it back transparent', () => {
        const rect = required(makeSvg().append('rect').attr('fill', 'transparent').node());

        const hover = wire(rect, HOVER_PRESETS.band);
        hover.enter();
        expect(rect.style.fill).toBe('var(--chart-hover-band)');

        hover.leave();
        expect(rect.style.fill).toBe('');
        expect(rect.getAttribute('fill')).toBe('transparent');
    });

    it('a linked mark the hovered one stands for takes its own look, and only a matching one', () => {
        const svg = makeSvg();
        const band = required(svg.append('rect').attr('fill', 'transparent').node());
        const dots = svg
            .selectAll('circle')
            .data([{ year: 1 }, { year: 2 }])
            .join('circle')
            .attr('r', 5);
        const hover = wire(band, HOVER_PRESETS.band, {
            linked: [
                {
                    marks: dots,
                    match: (dot) => dot.year === 1,
                    effect: { ...HOVER_PRESETS.point, useTransition: false },
                },
            ],
        });

        hover.enter();
        const [first, second] = /** @type {SVGCircleElement[]} */ (dots.nodes());
        expect(Number(first.getAttribute('r'))).toBeCloseTo(5 * MARK_DEFAULTS.hoverScale.head);
        expect(Number(second.getAttribute('r'))).toBe(5);
    });
});
