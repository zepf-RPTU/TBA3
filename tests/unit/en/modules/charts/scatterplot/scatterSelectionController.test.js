// @vitest-browser
/**
 * The marquee's pointer-event port and its touch arming gate.
 *
 * Runs in real Chromium against a real SVG: `d3.pointer` reads live geometry off
 * `getScreenCTM()`, which no fake DOM provides, and `PointerEvent` carries the
 * `pointerType` the gate keys off.
 *
 * What is guarded: a mouse drag is never gated (it has no other meaning over a
 * chart), a touch drag is inert until armed (a finger's default gesture is
 * scrolling the page), and the click threshold and additive apply survive the
 * port. The mouse path's *output* is guarded end-to-end by the e2e marquee
 * assertion; this file guards the branch logic that e2e cannot reach.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as d3 from 'd3';

import { ScatterSelectionController } from '@tba3/modules/en/modules/charts/scatterplot/scatterSelectionController.js';
import { mountMainContent } from '../../../../support/domShell.js';

const SELECTION_CONFIG = {
    COLOR: '#3b82f6',
    STROKE_WIDTH: 3,
    UNSELECTED_OPACITY: 0.6,
    RECT_FILL: 'rgba(59, 130, 246, 0.1)',
    RECT_STROKE_DASHARRAY: '4,2',
};

/** Four students on a 400×400 grid; the first three sit inside a 0,0–250,250 drag. */
const STUDENTS = [
    { studentId: 'a', x: 50, y: 50 },
    { studentId: 'b', x: 120, y: 120 },
    { studentId: 'c', x: 200, y: 200 },
    { studentId: 'd', x: 350, y: 350 },
];

/** @type {ScatterSelectionController} */
let controller;
/** @type {any} */
let svg;
/** @type {any} */
let g;
/** @type {any} */
let points;
/** @type {Array<Set<any>>} */
let notified;

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
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', 5);
}

beforeEach(() => {
    main = mountMainContent();
    notified = [];
    rebuildChart();

    controller = new ScatterSelectionController({
        onSelectionChanged: (ids) => notified.push(new Set(ids)),
        createTooltip: () => null,
        hideTooltip: () => {},
        selectionConfig: SELECTION_CONFIG,
        tooltipId: 'test-tooltip',
    });
    controller.wireRectangleSelection(svg, g, points);
});

/**
 * Drag from (x1,y1) to (x2,y2) in SVG coordinates. The svg is at the document
 * origin here, so client coordinates and SVG coordinates coincide.
 * @param {object} options - Drag description.
 */
function drag({ from, to, pointerType = 'mouse', cancel = false }) {
    const node = svg.node();
    const rect = node.getBoundingClientRect();
    const at = ([x, y]) => ({
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

const selectedIds = () => [...controller.getSelectedIds()].sort();
const rectangle = () => g.select('rect.selection-rectangle');

describe('mouse marquee', () => {
    it('selects every point inside the rectangle', () => {
        drag({ from: [10, 10], to: [250, 250] });

        expect(selectedIds()).toEqual(['a', 'b', 'c']);
        expect(notified).toHaveLength(1);
    });

    it('adds to the existing selection rather than replacing it', () => {
        controller.setSelectedIds(['d']);

        drag({ from: [10, 10], to: [250, 250] });

        // Additive on purpose — "Auswahl aufheben" is the way to start fresh.
        expect(selectedIds()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('treats a drag under the 5px threshold as a click, not a marquee', () => {
        drag({ from: [40, 40], to: [43, 43] });

        expect(selectedIds()).toEqual([]);
        expect(notified).toHaveLength(0);
    });

    it('applies nothing when the browser cancels the gesture', () => {
        drag({ from: [10, 10], to: [250, 250], cancel: true });

        expect(selectedIds()).toEqual([]);
        expect(rectangle().style('display')).toBe('none');
    });

    it('is never gated by the touch arming flag', () => {
        // Unarmed is the starting state, read off the class the flag is mirrored to.
        expect(svg.classed('selection-armed')).toBe(false);

        drag({ from: [10, 10], to: [250, 250] });

        expect(selectedIds()).toEqual(['a', 'b', 'c']);
    });
});

describe('touch marquee', () => {
    it('does nothing while unarmed, so the page can still scroll', () => {
        drag({ from: [10, 10], to: [250, 250], pointerType: 'touch' });

        expect(selectedIds()).toEqual([]);
        expect(rectangle().style('display')).toBe('none');
    });

    it('selects once armed', () => {
        controller.setTouchSelectionArmed(true);

        drag({ from: [10, 10], to: [250, 250], pointerType: 'touch' });

        expect(selectedIds()).toEqual(['a', 'b', 'c']);
    });

    it('marks the svg only while armed, which is what CSS gates touch-action on', () => {
        expect(svg.classed('selection-armed')).toBe(false);

        controller.setTouchSelectionArmed(true);
        expect(svg.classed('selection-armed')).toBe(true);

        controller.setTouchSelectionArmed(false);
        expect(svg.classed('selection-armed')).toBe(false);
    });

    it('keeps the armed flag across a re-render onto a fresh svg', () => {
        controller.setTouchSelectionArmed(true);

        // Every render builds new nodes and re-points the controller at them
        // (scatterplot.js). The flag lives on the controller, but the class that
        // expresses it to CSS lives on the svg — so a fresh svg starts without it.
        rebuildChart();
        controller.wireRectangleSelection(svg, g, points);

        expect(svg.classed('selection-armed')).toBe(true);
        drag({ from: [10, 10], to: [250, 250], pointerType: 'touch' });
        expect(selectedIds()).toEqual(['a', 'b', 'c']);
    });
});

describe('re-wiring', () => {
    it('reuses the one selection rectangle instead of stacking a new one', () => {
        controller.wireRectangleSelection(svg, g, points);
        controller.wireRectangleSelection(svg, g, points);

        expect(g.selectAll('rect.selection-rectangle').size()).toBe(1);
    });
});
