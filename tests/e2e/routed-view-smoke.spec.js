/**
 * E2E smoke: every routed dashboard view reveals exactly one view root.
 *
 * This guards the shared routing/display ownership at the width bands that have
 * historically been sensitive during layout cleanup.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const VIEWPORT_HEIGHT = 900;
const WIDTHS = [1400, 1240, 1100];

const DASHBOARDS = [
    { name: 'EN', path: '/en/' },
    { name: 'MA', path: '/ma/' },
    { name: 'SL', path: '/sl/' },
];

function collectPageErrors(page) {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    return pageErrors;
}

async function visibleRoutedViews(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('.main-content > .view-base'))
            .filter((element) => {
                const style = window.getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    rect.width > 0 &&
                    rect.height > 0 &&
                    element.getAttribute('data-view-rendering') !== 'true'
                );
            })
            .map((element) => ({
                id: element.id,
                className: element.className,
            })),
    );
}

async function expectOneVisibleRoutedView(page, label) {
    await expect
        .poll(async () => visibleRoutedViews(page), {
            timeout: LOAD_TIMEOUT,
            message: `Expected one visible routed view after ${label}`,
        })
        .toHaveLength(1);
}

for (const dashboard of DASHBOARDS) {
    describe(`${dashboard.name} routed view smoke`, () => {
        test('reveals exactly one routed view at layout cleanup width bands', async ({ page }) => {
            const pageErrors = collectPageErrors(page);

            for (const width of WIDTHS) {
                await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
                await gotoApp(page, dashboard.path);
                await expect(page.locator('.dashboard-bootstrap-error')).toHaveCount(0);
                await expectOneVisibleRoutedView(page, `${dashboard.name} load at ${width}px`);

                const buttonIds = await page.$$eval('.sidebar-nav-button', (buttons) =>
                    buttons.map((button) => button.id),
                );
                expect(buttonIds.length).toBeGreaterThan(1);

                for (const id of buttonIds) {
                    await page.locator(`#${id}`).click();
                    await expect(page.locator('.dashboard-bootstrap-error')).toHaveCount(0);
                    await expectOneVisibleRoutedView(
                        page,
                        `${dashboard.name} #${id} at ${width}px`,
                    );
                }
            }

            expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
        });
    });
}
