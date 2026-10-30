// @vitest-browser

import { describe, expect, it } from 'vitest';

import {
    createAnchoredPopupElement,
    hideAnchoredPopup,
    removePopupAfterTransition,
    showAnchoredPopup,
} from '../../../src/common/services/anchoredPopup.js';

/**
 * A shown popup with the given opacity transition, hidden (the fade just started).
 * @param {string} transition
 * @returns {HTMLDivElement}
 */
function hiddenPopup(transition) {
    const popup = document.createElement('div');
    popup.style.transition = transition;
    popup.style.opacity = '1';
    document.body.appendChild(popup);
    // Commit the shown state, so the change below animates.
    popup.getBoundingClientRect();
    popup.style.opacity = '0';
    return popup;
}

describe('removePopupAfterTransition', () => {
    it('keeps the popup while it fades and removes it when the fade ends', async () => {
        // A fixed removal timer cuts the fade short whenever it disagrees with the
        // CSS duration.
        // The fade is long enough that a busy runner cannot finish it before the check,
        // and the test ends it by hand rather than waiting it out.
        const popup = hiddenPopup('opacity 10s linear');

        removePopupAfterTransition(popup);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(popup.isConnected).toBe(true);

        for (const animation of popup.getAnimations()) animation.finish();
        await expect.poll(() => popup.isConnected, { timeout: 1000 }).toBe(false);
    });

    it('removes it at once when no fade runs (reduced motion)', async () => {
        const popup = hiddenPopup('none');

        removePopupAfterTransition(popup);
        await Promise.resolve();
        await Promise.resolve();

        expect(popup.isConnected).toBe(false);
    });
});

describe('showAnchoredPopup', () => {
    it('opens at a term inside an SVG chart label', () => {
        // A popover's `source` takes no SVG element: passing one throws, and no popup opens.
        document.body.insertAdjacentHTML(
            'beforeend',
            '<svg><text><tspan>Selektiv</tspan></text></svg>',
        );
        const svg = /** @type {SVGSVGElement} */ (document.body.lastElementChild);
        const anchor = /** @type {SVGTSpanElement} */ (svg.querySelector('tspan'));
        const popup = createAnchoredPopupElement({ className: 'test-popup', popover: 'manual' });

        showAnchoredPopup(popup, anchor, 'Erklärung');

        expect(popup.matches(':popover-open')).toBe(true);
        hideAnchoredPopup(popup);
        popup.remove();
        svg.remove();
    });
});
