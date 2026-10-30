// @vitest-browser

/**
 * A chart is a picture to a screen reader and a dead end to a keyboard unless it is
 * named and its marks can be reached. The SVG takes its card's title as its name, every
 * wired mark its tooltip text, and the chart is one tab stop whose arrow keys walk the
 * marks (the Highcharts pattern, on the WAI-ARIA roving tab stop). A mark that clicks —
 * a competence-level segment, a scatter point — must click from the keyboard too (WCAG 2.1.1).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as d3 from 'd3';

import { ContentModule } from '@tba3/module-base';
import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';

class Card extends ContentModule {
    /** @override */
    async _renderBody() {}
}
customElements.define('tba-a11y-test-card', Card);

/** A chart whose pass draws only its SVG root: the test draws the marks. */
class BlankChart extends ChartRenderer {
    /** @override */
    renderChart() {
        this.createSVGElement(300, 200);
    }
}

/**
 * A renderer in a module card's body, created: its SVG drawn and its arrow keys wired.
 * @param {{title?: string|null, subtitle?: string|null, options?: object}} [card] - A null title hides the card title.
 * @returns {Promise<{renderer: ChartRenderer, container: HTMLElement, card: Card}>} Once the card's shell is built.
 */
async function makeChart({ title = 'Kompetenzstufen', subtitle = null, options = {} } = {}) {
    const card = Card.create(`a11y-${Math.random().toString(36).slice(2)}`, {
        showModuleTitle: title !== null,
        ...(title ? { title } : {}),
        ...(subtitle ? { subtitle, showSubtitle: true } : {}),
    });
    document.body.appendChild(card);
    await card.updateComplete;
    const container = card.contentContainer;
    const renderer = new BlankChart(container, {
        context: createTestContext(),
        autoResize: false,
        ...options,
    });
    renderer.create();
    return { renderer, container, card };
}

/**
 * The chart's SVG, drawn by `makeChart`.
 * @param {ChartRenderer} renderer
 * @returns {SVGSVGElement}
 */
const svgOf = (renderer) => required(required(renderer.svg).node());

/**
 * Draw and wire one circle per datum.
 * @param {ChartRenderer} renderer
 * @param {number[]} data - One mark per value.
 * @param {Partial<import('../../../../src/common/charts/renderers/internal/chartInteractionUtils.js').TooltipWiringOptions<number>>} [options]
 * @returns {SVGCircleElement[]} In DOM order.
 */
function wireMarks(renderer, data, options = {}) {
    const marks = required(renderer.svg)
        .selectAll('circle')
        .data(data)
        .join('circle')
        .attr('cx', (d, i) => 20 + i * 30)
        .attr('cy', 50)
        .attr('r', 5);
    renderer.wireTooltipEvents(marks, {
        getTooltipContent: (d) => ({ title: `Wert ${d}`, rows: [{ label: 'Anteil', value: d }] }),
        hoverEffect: 'area',
        ...options,
    });
    return /** @type {SVGCircleElement[]} */ (marks.nodes());
}

/**
 * @param {Element} target - Where the key goes.
 * @param {string} key
 */
const press = (target, key) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

const tabStops = (/** @type {ChartRenderer} */ renderer) =>
    svgOf(renderer).querySelectorAll('[tabindex="0"]');

afterEach(() => {
    d3.selectAll('.tooltip').remove();
});

describe('chart accessible name', () => {
    it('names the SVG after the card title and describes it by the subtitle', async () => {
        const { renderer, card } = await makeChart({ subtitle: 'Anteile je Stufe' });
        const svg = svgOf(renderer);
        const title = card.titleElement;
        const subtitle = card.subtitleElement;

        expect(svg.getAttribute('role')).toBe('img');
        expect(svg.getAttribute('aria-labelledby')).toBe(title?.id);
        expect(svg.getAttribute('aria-describedby')).toBe(subtitle?.id);
        expect(svg.querySelector('title')).toBeNull();
    });

    it('stays a plain SVG without any name, never an unnamed img', async () => {
        const { renderer } = await makeChart({ title: null });

        expect(svgOf(renderer).hasAttribute('role')).toBe(false);
    });
});

describe('focusable marks', () => {
    it('names each mark by its tooltip text and makes the chart one tab stop', async () => {
        const { renderer } = await makeChart();
        const marks = wireMarks(renderer, [1, 2, 3]);
        // The tab stop settles in a microtask, once however many selections were wired.
        await Promise.resolve();

        expect(svgOf(renderer).getAttribute('role')).toBe('group');
        expect(marks[1].getAttribute('aria-label')).toBe('Wert 2. Anteil: 2');
        expect(marks[1].getAttribute('role')).toBe('img');
        expect([...tabStops(renderer)]).toEqual([marks[0]]);
        expect(marks.slice(1).every((mark) => mark.getAttribute('tabindex') === '-1')).toBe(true);
    });

    it('arrows, Home and End move focus and the tab stop, stopping at the ends', async () => {
        const { renderer } = await makeChart();
        const marks = wireMarks(renderer, [1, 2, 3]);
        marks[0].focus();

        press(marks[0], 'ArrowRight');
        expect(document.activeElement).toBe(marks[1]);
        press(marks[1], 'End');
        expect(document.activeElement).toBe(marks[2]);
        press(marks[2], 'ArrowDown');
        expect(document.activeElement).toBe(marks[2]);
        press(marks[2], 'Home');
        expect(document.activeElement).toBe(marks[0]);
        press(marks[0], 'ArrowLeft');
        expect(document.activeElement).toBe(marks[0]);

        expect([...tabStops(renderer)]).toEqual([marks[0]]);
    });

    it('skips a hidden mark, and a hidden tab stop hands focus on', async () => {
        const { renderer } = await makeChart();
        let hideSecond = false;
        const marks = wireMarks(renderer, [1, 2, 3], {
            isVisible: (d) => !(hideSecond && d === 2),
        });
        marks[0].focus();
        hideSecond = true;

        press(marks[0], 'ArrowRight');
        expect(document.activeElement).toBe(marks[2]);

        // The tab stop now sits on a mark a legend toggle hides; Tab comes back to it.
        hideSecond = false;
        press(marks[2], 'ArrowLeft');
        marks[1].blur();
        hideSecond = true;
        marks[1].focus();
        expect(document.activeElement).toBe(marks[2]);
        expect([...tabStops(renderer)]).toEqual([marks[2]]);
    });

    it('keeps the tab stop where it is when the marks are wired again', async () => {
        const { renderer } = await makeChart();
        const marks = wireMarks(renderer, [1, 2, 3]);
        marks[0].focus();
        press(marks[0], 'ArrowRight');

        wireMarks(renderer, [4, 5, 6]);

        expect([...tabStops(renderer)]).toEqual([marks[1]]);
        expect(marks[1].getAttribute('aria-label')).toBe('Wert 5. Anteil: 5');
    });

    it('moves the tab stop off a mark hidden since, when the marks are wired again', async () => {
        const { renderer } = await makeChart();
        let hideFirst = false;
        const options = { isVisible: (/** @type {number} */ d) => !(hideFirst && d === 1) };
        const marks = wireMarks(renderer, [1, 2, 3], options);

        hideFirst = true;
        wireMarks(renderer, [1, 2, 3], options);
        await Promise.resolve();

        expect([...tabStops(renderer)]).toEqual([marks[1]]);
    });

    it('Enter and Space click a mark that clicks, which is then a button', async () => {
        const { renderer } = await makeChart();
        const onClick = vi.fn();
        const marks = wireMarks(renderer, [1, 2], { onClick });

        press(marks[1], 'Enter');
        press(marks[1], ' ');

        expect(onClick).toHaveBeenCalledTimes(2);
        expect(onClick.mock.calls[0][0]).toBe(2);
        expect(marks[1].getAttribute('role')).toBe('button');
    });

    it('keyboard focus shows the hover look and the tooltip; blur and Escape undo them', async () => {
        const { renderer } = await makeChart();
        const marks = wireMarks(renderer, [1, 2]);
        const tooltip = () => document.getElementById('cursor-tooltip');

        marks[0].focus();
        expect(marks[0].style.opacity).toBe('0.8');
        expect(tooltip()?.matches(':popover-open')).toBe(true);
        expect(tooltip()?.textContent).toContain('Wert 1');

        press(marks[0], 'Escape');
        expect(tooltip()?.matches(':popover-open')).toBe(false);

        press(marks[0], 'ArrowRight');
        expect(marks[0].style.opacity).toBe('');
        expect(marks[1].style.opacity).toBe('0.8');
    });

    it('a chart inside a control keeps its marks out of the tab order', async () => {
        const { renderer } = await makeChart({ options: { focusableMarks: false } });
        const marks = wireMarks(renderer, [1, 2]);

        expect(marks.some((mark) => mark.hasAttribute('tabindex'))).toBe(false);
    });
});

describe('setElementVisibility', () => {
    /**
     * Wrap each mark in its own group, as a chart draws one bar group per row.
     * @param {ChartRenderer} renderer
     * @returns {{groups: SVGGElement[], marks: SVGCircleElement[]}}
     */
    function wireGroupedMarks(renderer) {
        const groups = required(renderer.svg)
            .selectAll('g.row')
            .data([1, 2, 3])
            .join('g')
            .attr('class', 'row');
        const marks = groups.append('circle').attr('r', 5);
        renderer.wireTooltipEvents(marks, {
            getTooltipContent: (d) => ({ title: `Wert ${d}`, rows: [] }),
        });
        return {
            groups: /** @type {SVGGElement[]} */ (groups.nodes()),
            marks: marks.nodes(),
        };
    }

    it('moves the tab stop off a collapsing group within the task, before its fade ends', async () => {
        const { renderer } = await makeChart();
        const { groups, marks } = wireGroupedMarks(renderer);

        renderer.setElementVisibility(d3.select(groups[0]), false, {
            durationMs: 300,
            collapse: true,
        });

        expect(groups[0].getAttribute('aria-hidden')).toBe('true');
        await Promise.resolve();
        expect([...tabStops(renderer)]).toEqual([marks[1]]);
    });

    it('takes a collapsed group out of the layout and brings it back', async () => {
        const { renderer } = await makeChart();
        const { groups } = wireGroupedMarks(renderer);
        const first = d3.select(groups[0]);

        renderer.setElementVisibility(first, false, { collapse: true });
        expect(groups[0].style.display).toBe('none');

        renderer.setElementVisibility(first, true, { collapse: true });
        expect(groups[0].style.display).toBe('');
        expect(groups[0].hasAttribute('aria-hidden')).toBe(false);
        expect(groups[0].style.pointerEvents).toBe('');
    });

    it('keeps a group shown again when the fade that hid it ends after the show', async () => {
        // The show's own transition starts a frame later, while the hide's fade, already
        // due, ends in that frame: its end must not take the shown group out again.
        const { renderer } = await makeChart();
        const { groups } = wireGroupedMarks(renderer);
        const first = d3.select(groups[0]);
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

        renderer.setElementVisibility(first, false, { durationMs: 20, collapse: true });
        await nextFrame();
        const dueAt = performance.now() + 40;
        while (performance.now() < dueAt);
        renderer.setElementVisibility(first, true, { durationMs: 20, collapse: true });
        await nextFrame();
        await nextFrame();

        expect(groups[0].style.display).toBe('');
    });
});
