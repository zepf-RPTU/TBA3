// @vitest-browser

import { describe, expect, it, vi } from 'vitest';
import * as d3 from 'd3';
import { wireNearestPointer } from '../../../../../src/common/charts/renderers/internal/chartInteractionUtils.js';

// Packed points take the pointer through one nearest-point lookup instead of a
// hit shape each. The lookup must hand the pointer to the nearest point, to none past
// the reach, and to none while another wired mark (an average marker over the cloud)
// is under the pointer, or hovering that marker would also hover a student.

/** @returns {{svg: SVGSVGElement, circles: d3.Selection<SVGCircleElement, {id: string, x: number, y: number}, any, any>, marker: SVGRectElement, enter: import('vitest').Mock, leave: import('vitest').Mock, click: import('vitest').Mock}} A wired chart. */
function setup() {
    // The app root around every chart is focusable (tabindex -1), as in the dashboards.
    document.body.innerHTML = `
        <div tabindex="-1">
        <svg width="200" height="200" style="position: fixed; left: 0; top: 0">
            <g class="points">
                <circle cx="50" cy="50" r="5" style="pointer-events: none"></circle>
                <circle cx="58" cy="50" r="5" style="pointer-events: none"></circle>
                <circle cx="150" cy="150" r="5" style="pointer-events: none"></circle>
            </g>
            <rect class="marker" x="140" y="140" width="20" height="20" tabindex="-1"></rect>
        </svg>
        </div>`;
    const svg = /** @type {SVGSVGElement} */ (document.querySelector('svg'));
    const data = [
        { id: 'a', x: 50, y: 50 },
        { id: 'b', x: 58, y: 50 },
        { id: 'c', x: 150, y: 150 },
    ];
    const enter = vi.fn();
    const leave = vi.fn();
    const click = vi.fn();
    const points = d3.select(svg).selectAll('.points circle').data(data);
    /** @type {d3.Selection<SVGCircleElement, (typeof data)[number], any, any>} */
    const circles = /** @type {any} */ (points);
    wireNearestPointer(
        d3.select(svg),
        circles,
        { enter, leave, click, cursor: 'pointer' },
        { position: (d) => [d.x, d.y] },
    );
    return {
        svg,
        circles,
        marker: /** @type {SVGRectElement} */ (document.querySelector('.marker')),
        enter,
        leave,
        click,
    };
}

/**
 * @param {Element} target - Where the pointer event lands.
 * @param {string} type
 * @param {number} x - Viewport x.
 * @param {number} y - Viewport y.
 */
function point(target, type, x, y) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y }));
}

describe('wireNearestPointer', () => {
    it('hands the pointer to the nearest point, and to none past the reach', () => {
        const { svg, enter, leave } = setup();

        point(svg, 'pointermove', 51, 50);
        expect(enter).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ id: 'a' }),
        );
        point(svg, 'pointermove', 57, 50);
        expect(enter).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ id: 'b' }),
        );
        expect(leave).toHaveBeenCalledTimes(1);

        point(svg, 'pointermove', 100, 100);
        expect(leave).toHaveBeenCalledTimes(2);
        expect(enter).toHaveBeenCalledTimes(2);
    });

    it('leaves the points alone while another wired mark is under the pointer', () => {
        const { marker, enter, click } = setup();

        // The marker sits on point c: without the guard, c would take the hover.
        point(marker, 'pointermove', 150, 150);
        point(marker, 'pointerdown', 150, 150);
        marker.dispatchEvent(
            new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 150 }),
        );

        expect(enter).not.toHaveBeenCalled();
        expect(click).not.toHaveBeenCalled();
    });

    it('hovers on a press only for a pointer that did not hover on its way there', () => {
        // A mouse already hovered the point through pointermove, so its press
        // must not run the hover again; a finger or pen arrives with the press.
        const { svg, enter } = setup();

        svg.dispatchEvent(
            new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: 51,
                clientY: 50,
                pointerType: 'mouse',
            }),
        );
        expect(enter).not.toHaveBeenCalled();
        svg.dispatchEvent(
            new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: 51,
                clientY: 50,
                pointerType: 'touch',
            }),
        );
        expect(enter).toHaveBeenCalledOnce();
    });

    it('lets go of the hovered point when a redraw wires the chart again', () => {
        // The new wiring starts with nothing hovered, so the point the old one
        // hovered would keep its hover look and tooltip.
        const { svg, circles, leave } = setup();

        point(svg, 'pointermove', 51, 50);
        wireNearestPointer(
            d3.select(svg),
            circles,
            { enter: () => {}, leave: () => {}, click: null, cursor: null },
            { position: (d) => [d.x, d.y] },
        );

        expect(leave).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'a' }));
        expect(svg.style.cursor).toBe('');
    });

    it('picks nothing on a click that ends a drag', () => {
        const { svg, click } = setup();

        point(svg, 'pointerdown', 20, 20);
        svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 51, clientY: 50 }));

        expect(click).not.toHaveBeenCalled();
    });
});
