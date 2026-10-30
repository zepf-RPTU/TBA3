// @vitest-browser
// The figure is painted with inline styles, which only a browser computes.
import { afterEach, describe, it, expect } from 'vitest';
import * as d3 from 'd3';

import { drawBoxPlotFigure } from '../../../../../src/sl/modules/charts/shared/boxPlotFigure.js';
import { required } from '../../../../support/required.js';
import { statsOf } from '../../../../support/slValueGroupFactories.js';

/** @typedef {import('d3').Selection<SVGGElement, unknown, null, undefined>} FigureRoot */

/**
 * The three SL box plots draw their figure here, so the same mark means the same
 * statistic in each — a reader has no cue that would tell different meanings apart.
 *
 * These tests pin which mark stands for which statistic, read off the SVG the figure
 * draws.
 */

/** A fresh `<g>` in the document for one figure. */
const figureRoot = () => d3.select(document.body).append('svg').append('g');

afterEach(() => {
    d3.selectAll('body > svg').remove();
});

/**
 * @param {FigureRoot} root
 * @returns {SVGGElement}
 */
const rootNode = (root) => required(root.node(), 'figure root');

/**
 * @param {FigureRoot} root
 * @param {string} className - The mark's class.
 * @returns {Element}
 */
const markWith = (root, className) =>
    required(rootNode(root).querySelector(`:scope > .${className}`), className);

/**
 * @param {FigureRoot} root
 * @returns {Element[]}
 */
const outliersOf = (root) => [...rootNode(root).querySelectorAll(':scope > .outlier')];

/**
 * @param {Element} mark
 * @param {string} name
 * @returns {number}
 */
const num = (mark, name) => Number(mark.getAttribute(name));

/**
 * @param {number} value
 * @returns {number} The value, unscaled.
 */
const identityScale = (value) => value;

/**
 * @param {{center?: number, horizontal?: boolean, durationMs?: number}} [extra] - Overrides of the default geometry.
 * @returns {Parameters<typeof drawBoxPlotFigure>[2]}
 */
const geometry = (extra = {}) => ({
    center: 100,
    boxWidth: 40,
    valueScale: identityScale,
    color: '#123456',
    ...extra,
});

describe('drawBoxPlotFigure', () => {
    it('lays the same marks along x when horizontal', () => {
        // The self-efficacy rows lie; a lying figure that swapped only the box would
        // put the median and the whiskers across the band instead of along the values.
        const stats = statsOf([1, 2, 3, 4, 5]);
        const selection = figureRoot();
        drawBoxPlotFigure(selection, stats, geometry({ horizontal: true }));

        const median = markWith(selection, 'median-line');
        expect(num(median, 'x1')).toBe(stats.median);
        expect(num(median, 'x2')).toBe(stats.median);
        expect([num(median, 'y1'), num(median, 'y2')]).toEqual([80, 120]);
        const box = markWith(selection, 'box');
        expect([num(box, 'x'), num(box, 'width')]).toEqual([stats.q1, stats.q3 - stats.q1]);
        expect([num(box, 'y'), num(box, 'height')]).toEqual([80, 40]);
    });

    it('puts the median on the centre line and the mean on its own mark', () => {
        // One position must mean one statistic in every view — the median as the
        // line inside the box, the mean as a diamond.
        const stats = statsOf([1, 2, 3, 4, 100]);
        const selection = figureRoot();

        drawBoxPlotFigure(selection, stats, geometry());

        expect(num(markWith(selection, 'median-line'), 'y1')).toBe(stats.median);
        expect(markWith(selection, 'mean-point').getAttribute('transform')).toContain(
            `,${stats.mean}`,
        );
        expect(markWith(selection, 'mean-point').tagName).toBe('path');
        expect(stats.median).not.toBe(stats.mean);
    });

    it('covers the whole figure, outliers included, with one transparent hit area', () => {
        // The figure is one datum; one hover target keeps the tooltip from
        // flickering as the pointer crosses from whisker to box, and an outlier beyond
        // the caps still answers.
        const stats = statsOf([1, 2, 2, 3, 3, 3, 4, 4, 5, 20]);
        const selection = figureRoot();

        const hitArea = drawBoxPlotFigure(selection, stats, geometry());

        const hit = /** @type {SVGRectElement} */ (hitArea.node()).getBBox();
        for (const node of selection.selectAll('.outlier, .whisker-cap').nodes()) {
            const box = /** @type {SVGGraphicsElement} */ (node).getBBox();
            expect(box.y).toBeGreaterThanOrEqual(hit.y);
            expect(box.y + box.height).toBeLessThanOrEqual(hit.y + hit.height);
        }
        expect(hitArea.classed('chart-hit')).toBe(true);
    });

    it('draws one point per outlier, beyond the whisker caps', () => {
        // Without the outliers, a whisker end looks like the extreme of the data
        // when it is not.
        const stats = statsOf([1, 2, 3, 4, 100]);
        const selection = figureRoot();

        drawBoxPlotFigure(selection, stats, geometry());

        const outliers = outliersOf(selection);
        expect(outliers).toHaveLength(1);
        expect(num(outliers[0], 'cy')).toBe(100);
        expect(num(markWith(selection, 'whisker-line'), 'y2')).toBe(stats.whiskerMax);
        expect(stats.whiskerMax).toBeLessThan(100);
    });

    it('spans the box from q1 to q3 and the whisker between the whisker ends', () => {
        const stats = statsOf([1, 2, 3, 4, 5]);
        const selection = figureRoot();

        drawBoxPlotFigure(selection, stats, geometry());

        const box = markWith(selection, 'box');
        expect(num(box, 'y')).toBe(Math.min(stats.q1, stats.q3));
        expect(num(box, 'height')).toBe(Math.abs(stats.q1 - stats.q3));
        expect(num(box, 'x')).toBe(80);
        expect(num(box, 'width')).toBe(40);

        const whisker = markWith(selection, 'whisker-line');
        expect(num(whisker, 'y1')).toBe(stats.whiskerMin);
        expect(num(whisker, 'y2')).toBe(stats.whiskerMax);
    });

    it('changes nothing when it draws the same figure again', () => {
        // A redraw that appended a second set of marks would stack two figures and
        // drop the focused hit area.
        const stats = statsOf([1, 2, 2, 3, 3, 3, 4, 4, 5, 20, 20]);
        const selection = figureRoot();
        const hitArea = drawBoxPlotFigure(selection, stats, geometry()).node();
        const markup = rootNode(selection).outerHTML;

        const again = drawBoxPlotFigure(selection, stats, geometry({ durationMs: 300 })).node();

        expect(again).toBe(hitArea);
        expect(rootNode(selection).outerHTML).toBe(markup);
    });

    it('moves the drawn marks to new statistics and keeps the hit area on top', () => {
        const selection = figureRoot();
        const hitArea = drawBoxPlotFigure(selection, statsOf([1, 2, 3, 4, 5]), geometry()).node();
        const box = markWith(selection, 'box');

        const stats = statsOf([1, 2, 3, 4, 100]);
        drawBoxPlotFigure(selection, stats, geometry({ center: 60 }));

        expect(markWith(selection, 'box')).toBe(box);
        expect(num(box, 'x')).toBe(40);
        expect(outliersOf(selection)).toHaveLength(1);
        expect(rootNode(selection).lastElementChild).toBe(hitArea);
    });
});
