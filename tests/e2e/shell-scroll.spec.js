/**
 * E2E test: the app shell is a fixed, non-scrolling viewport that routes to exactly one
 * view at a time.
 *
 * At or above the shell minimum (1024×600) the shell has no scrollbar: `body` is sized
 * to the viewport and clipped (src/styles/view-layout.css), and every
 * scrollable region is an inner container (`.view-base`, `.content-module-body`). A
 * viewport that scrolls there takes the view header above the fold, and the browser
 * restores that offset on reload. Below the minimum the page scrolls with real
 * scrollbars.
 *
 * Anything appended to `<body>` beside the shell box and left in the flow is laid out
 * below the 100vh body box and makes the page taller than the viewport;
 * `scrollIntoView({ block: 'center' })` (the guided tour, the notes module-link chips)
 * then scrolls into that gap. Tooltips and glossary popups are popovers, out of the
 * flow, so the offenders named are the body children that are not.
 */

import { test, expect } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { assertNoPageErrors, collectErrors } from './support/pageErrors.js';
import { expectViewportCannotScroll } from './support/viewport.js';

const DASHBOARDS = [
    { name: 'EN', path: '/en/' },
    { name: 'MA', path: '/ma/' },
    { name: 'SL', path: '/sl/' },
];

/**
 * Exactly one routed view root is displayed.
 * @param {import('@playwright/test').Page} page
 * @param {string} label - The view, for the failure message.
 */
async function expectOneVisibleRoutedView(page, label) {
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        Array.from(
                            document.querySelectorAll('.main-content > .view-shell > .view-base'),
                        ).filter((element) => {
                            const style = window.getComputedStyle(element);
                            const rect = element.getBoundingClientRect();
                            return (
                                style.display !== 'none' &&
                                style.visibility !== 'hidden' &&
                                rect.width > 0 &&
                                rect.height > 0
                            );
                        }).length,
                ),
            {
                timeout: LOAD_TIMEOUT_MS,
                message: `Expected one visible routed view after ${label}`,
            },
        )
        .toBe(1);
}

for (const dashboard of DASHBOARDS) {
    test.describe(`${dashboard.name} shell`, () => {
        test('routes to one view at a time, stays unscrollable and error-free through every view', async ({
            page,
        }) => {
            const { consoleErrors, pageErrors } = collectErrors(page);
            await gotoApp(page, dashboard.path);

            await expectOneVisibleRoutedView(page, 'load');
            await expectViewportCannotScroll(page, 'load');

            const buttonIds = await page.$$eval('.sidebar-nav-button[data-view-type]', (els) =>
                els.map((el) => el.id),
            );
            expect(buttonIds.length).toBeGreaterThan(1);

            for (const id of buttonIds) {
                // Measure the view as shown: current, and no longer covered for rendering.
                await clickNav(page, `#${id}`);
                await expect(page.locator(`#${id}`)).toHaveAttribute('aria-current', 'page');
                await expectOneVisibleRoutedView(page, `#${id}`);
                await expectViewportCannotScroll(page, `switching to #${id}`);
            }

            assertNoPageErrors(pageErrors);
            // No dashboard file is optional, so every failed sub-resource is a real defect.
            expect(
                consoleErrors,
                `Unexpected console errors:\n${consoleErrors.join('\n')}`,
            ).toEqual([]);
        });
    });
}

test.describe('below the shell minimum (1024×600) the page scrolls instead of squeezing', () => {
    test.use({ viewport: { width: 900, height: 500 } });

    // The floor is shared shell CSS, so one dashboard stands for all three.
    test('EN scrolls both ways and scrolls back to the header', async ({ page }) => {
        await gotoApp(page, '/en/');

        const extent = await page.evaluate(() => {
            const root = document.documentElement;
            window.scrollTo(10_000, 10_000);
            return {
                scrollWidth: root.scrollWidth,
                scrollHeight: root.scrollHeight,
                scrollX: window.scrollX,
                scrollY: window.scrollY,
            };
        });
        expect(extent.scrollWidth).toBeGreaterThanOrEqual(1024);
        expect(extent.scrollHeight).toBeGreaterThanOrEqual(600);
        expect(extent.scrollX).toBeGreaterThan(0);
        expect(extent.scrollY).toBeGreaterThan(0);

        await page.evaluate(() => window.scrollTo(0, 0));
        const headerTop = await page
            .locator('.header-module')
            .first()
            .evaluate((el) => el.getBoundingClientRect().top);
        expect(headerTop).toBeGreaterThanOrEqual(0);
    });
});
