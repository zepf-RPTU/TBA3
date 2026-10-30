/**
 * The fixed-shell invariant: at or above the shell minimum (1024×600) the viewport
 * itself never scrolls; every scrollable region is an inner container.
 */

import { expect } from './test.js';

/**
 * Try to scroll the viewport, then assert it did not move and that nothing sticks
 * out below the fold.
 * @param {import('@playwright/test').Page} page
 * @param {string} label - What was just done, for the failure message
 */
export async function expectViewportCannotScroll(page, label) {
    const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        // Name the culprits before scrolling — a scroll moves them back into view.
        const offenders = Array.from(document.body.children)
            // 2px of slack: `height: 100%` chrome (the sidebar) ends exactly at the
            // fold and can land a subpixel past it.
            .filter((el) => el.getBoundingClientRect().bottom > window.innerHeight + 2)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className || '(no class)'}`);

        window.scrollTo(0, 10_000);
        return {
            offenders,
            scrollY: window.scrollY,
            overflow: root.scrollHeight - root.clientHeight,
        };
    });

    const detail =
        `after ${label} — body children below the fold: ` +
        (metrics.offenders.join(', ') || 'none');

    expect(metrics.scrollY, `viewport scrolled ${detail}`).toBe(0);
    expect(metrics.overflow, `page is taller than the viewport ${detail}`).toBeLessThanOrEqual(0);
}
