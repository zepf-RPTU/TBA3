// @vitest-browser
/**
 * The marquee's pointer handling and its touch arming gate, against a real SVG:
 * `d3.pointer` reads live geometry off `getScreenCTM()`, and `PointerEvent` carries the
 * `pointerType` the gate keys off. The e2e marquee assertion covers the mouse path's
 * output; this file covers the branches e2e cannot reach.
 */

import { signal } from '@preact/signals-core';
import { describe, it, expect, beforeEach } from 'vitest';
import * as d3 from 'd3';

import { ScatterSelectionController } from '../../../../../src/en/modules/charts/scatterplot/scatterSelectionController.js';
import { mountMainContent } from '../../../../support/domShell.js';

/** @typedef {{studentId: string, x: number, y: number}} GridStudent */

/**
 * Four students on a 400×400 grid; the first three sit inside a 0,0–250,250 drag.
 * @type {GridStudent[]}
 */
const STUDENTS = [
    { studentId: 'a', x: 50, y: 50 },
    { studentId: 'b', x: 120, y: 120 },
    { studentId: 'c', x: 200, y: 200 },
    { studentId: 'd', x: 350, y: 350 },
];

/** @type {ScatterSelectionController} */
let controller;
/** @type {import('@preact/signals-core').Signal<ReadonlySet<string>>} */
let selection;
/** @type {import('@preact/signals-core').Signal<boolean>} */
let armed;
/** @type {any} */
let svg;
/** @type {any} */
let g;
/** @type {any} */
let points;

/** @type {HTMLElement} */
let main;

/** Throw the chart away and draw a new one, the way a re-render does. */
function rebuildChart() {
    main.innerHTML = '';
    svg = d3.select(main).append('svg').attr('width', 400).attr('height', 400);
    g = svg.append('g');
    points = g
        .selectAll('circle')
        .data(STUDENTS)
        .join('circle')
        .attr('class', 'student-point')
        .attr('cx', (/** @type {GridStudent} */ d) => d.x)
        .attr('cy', (/** @type {GridStudent} */ d) => d.y)
        .attr('r', 5);
}

beforeEach(() => {
    main = mountMainContent();
    rebuildChart();

    selection = signal(new Set());
    armed = signal(false);
    controller = new ScatterSelectionController({
        selectedIds: selection,
        touchSelectionArmed: armed,
        hideTooltip: () => {},
    });
    controller.wireRectangleSelection(svg, g, points);
});

/**
 * Drag from (x1,y1) to (x2,y2) in SVG coordinates. The svg is at the document
 * origin here, so client coordinates and SVG coordinates coincide.
 * @param {{from: [number, number], to: [number, number], pointerType?: string, cancel?: boolean}} options
 */
function drag({ from, to, pointerType = 'mouse', cancel = false }) {
    const node = svg.node();
    const rect = node.getBoundingClientRect();
    const at = (/** @type {[number, number]} */ [x, y]) => ({
        clientX: rect.left + x,
        clientY: rect.top + y,
        pointerId: 1,
        pointerType,
        isPrimary: true,
        button: 0,
        bubbles: true,
    });
    node.dispatchEvent(new PointerEvent('pointerdown', at(from)));
    node.dispatchEvent(new PointerEvent('pointermove', at(to)));
    node.dispatchEvent(new PointerEvent(cancel ? 'pointercancel' : 'pointerup', at(to)));
}

const selectedIds = () => [...selection.value].sort();
const rectangle = () => g.select('rect.selection-rectangle');

describe('mouse marquee', () => {
    it('selects every point inside the rectangle', () => {
        drag({ from: [10, 10], to: [250, 250] });

        expect(selectedIds()).toEqual(['a', 'b', 'c']);
        expect(points.filter('.selected').size()).toBe(3);
    });

    it('adds to the existing selection rather than replacing it', () => {
        selection.value = new Set(['d']);

        drag({ from: [10, 10], to: [250, 250] });

        // Additive on purpose — "Auswahl aufheben" is the way to start fresh.
        expect(selectedIds()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('treats a drag under the 5px threshold as a click, not a marquee', () => {
        const before = selection.value;

        drag({ from: [40, 40], to: [43, 43] });

        expect(selection.value).toBe(before);
    });

    it('applies nothing when the browser cancels the gesture', () => {
        drag({ from: [10, 10], to: [250, 250], cancel: true });

        expect(selectedIds()).toEqual([]);
        expect(rectangle().style('display')).toBe('none');
    });
});

describe('touch marquee', () => {
    it('keeps the armed flag across a re-render onto a fresh svg', () => {
        armed.value = true;

        // Every render builds new nodes and re-points the controller at them. The flag
        // lives on the controller, the group that expresses it to CSS on the svg, so a
        // fresh svg starts without it.
        rebuildChart();
        controller.wireRectangleSelection(svg, g, points);

        expect(svg.classed('selection-armed')).toBe(true);
        drag({ from: [10, 10], to: [250, 250], pointerType: 'touch' });
        expect(selectedIds()).toEqual(['a', 'b', 'c']);
    });
});

describe('host writes', () => {
    it('repaints the points when the selection is written from outside the chart', () => {
        // The host's verbs (select all, clear) write the shared signal, not the chart.
        selection.value = new Set(['a', 'd']);

        expect(
            points
                .filter('.selected')
                .data()
                .map((/** @type {GridStudent} */ d) => d.studentId),
        ).toEqual(['a', 'd']);
    });
});

describe('resting look', () => {
    /** @returns {string[]} Each point's opacity, as painted. */
    const opacities = () =>
        points.nodes().map((/** @type {SVGElement} */ node) => node.style.opacity);

    it('dims nothing before a selection, and the points left out once there is one', () => {
        // Dimmed from the start, the points the user picks from fall under 3:1 and no
        // longer match their key entry.
        controller.paintResting(points);
        expect(opacities().map(Number)).toEqual([1, 1, 1, 1]);

        selection.value = new Set(['a']);

        const [picked, ...others] = opacities();
        expect(Number(picked)).toBe(1);
        expect(others.every((value) => Number(value) < 1)).toBe(true);
    });
});

describe('re-wiring', () => {
    it('reuses the one selection rectangle instead of stacking a new one', () => {
        controller.wireRectangleSelection(svg, g, points);
        controller.wireRectangleSelection(svg, g, points);

        expect(g.selectAll('rect.selection-rectangle').size()).toBe(1);
    });

    it('drops a drag a re-render cut off, so the points take the pointer again', async () => {
        // A resize mid-drag re-wires; the new handlers never saw the press, so its
        // release went unheard and the marquee state stood for good.
        const node = svg.node();
        node.dispatchEvent(
            new PointerEvent('pointerdown', {
                clientX: 10,
                clientY: 10,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                button: 0,
                bubbles: true,
            }),
        );
        expect(controller.isRectangleSelecting).toBe(true);

        controller.wireRectangleSelection(svg, g, points);
        node.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(resolve));

        expect(controller.isRectangleSelecting).toBe(false);
        expect(svg.classed('marquee-active')).toBe(false);
    });
});
