// @vitest-browser
// Real layout: the placement is made from the mark's and the tooltip's measured boxes.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cursorTooltip } from '../../../src/common/services/cursorTooltip.js';
import '../../../src/common/services/cursorTooltip.css';

/**
 * A mark tooltip stands beside its mark and takes the pointer, so a magnifier user can
 * pan across it (WCAG 1.4.13): it must not follow the pointer away, nor vanish the
 * instant the pointer leaves the mark for it.
 */

afterEach(() => {
    cursorTooltip.hide();
    document.body.querySelector('.mark')?.remove();
    document.body.querySelector('.scroller')?.remove();
    vi.useRealTimers();
});

/**
 * @param {number} left
 * @param {number} top
 * @returns {HTMLDivElement} A 20 px mark at that viewport position.
 */
function mark(left, top) {
    const element = document.createElement('div');
    element.className = 'mark';
    element.style.cssText = `position: fixed; left: ${left}px; top: ${top}px; width: 20px; height: 20px;`;
    document.body.append(element);
    return element;
}

/** Floating UI places within microtasks after the frame it observes; two frames later the tooltip stands. */
const placed = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const tooltipBox = () =>
    /** @type {HTMLDivElement} */ (
        document.getElementById('cursor-tooltip')
    ).getBoundingClientRect();

describe('mark tooltip', () => {
    it('stands above its mark, clear of the row, and below it at the top edge', async () => {
        // Beside the mark it would cover the next segment of a strip and take its click.
        const owner = mark(100, 100);
        cursorTooltip.show(owner, { title: 'Mark' });
        await placed();
        expect(tooltipBox().bottom).toBeLessThanOrEqual(100);

        cursorTooltip.hide();
        owner.style.top = '0px';
        cursorTooltip.show(owner, { title: 'Mark' });
        await placed();
        expect(tooltipBox().top).toBeGreaterThanOrEqual(20);
    });

    it('follows its mark when a scroll area moves it', async () => {
        const scroller = document.createElement('div');
        scroller.className = 'scroller';
        scroller.style.cssText =
            'position: fixed; left: 100px; top: 200px; width: 100px; height: 100px; overflow: auto;';
        const content = document.createElement('div');
        content.style.cssText = 'height: 400px; padding-top: 60px;';
        const owner = document.createElement('div');
        owner.style.cssText = 'width: 20px; height: 20px;';
        content.append(owner);
        scroller.append(content);
        document.body.append(scroller);

        cursorTooltip.show(owner, { title: 'Mark' });
        await placed();
        const before = tooltipBox().bottom;

        scroller.scrollTop = 40;
        await vi.waitFor(() => expect(tooltipBox().bottom).toBeCloseTo(before - 40, 0));
    });

    it('stays while the pointer moves onto it, and goes after it left', async () => {
        const owner = mark(100, 100);
        cursorTooltip.show(owner, { title: 'Mark' });
        await placed();
        const tooltip = /** @type {HTMLDivElement} */ (document.getElementById('cursor-tooltip'));
        expect(getComputedStyle(tooltip).pointerEvents).toBe('auto');

        vi.useFakeTimers();
        cursorTooltip.leave(owner);
        tooltip.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(1000);
        expect(cursorTooltip.isShown()).toBe(true);

        tooltip.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }));
        vi.advanceTimersByTime(1000);
        expect(cursorTooltip.isShown()).toBe(false);
    });

    it('stays dismissed after Escape until the pointer leaves its mark', () => {
        const owner = mark(100, 100);
        cursorTooltip.show(owner, { title: 'Mark' });

        expect(cursorTooltip.dismiss()).toBe(true);
        cursorTooltip.show(owner, { title: 'Mark' });
        expect(cursorTooltip.isShown()).toBe(false);

        cursorTooltip.leave(owner);
        cursorTooltip.show(owner, { title: 'Mark' });
        expect(cursorTooltip.isShown()).toBe(true);
    });
});
