/**
 * E2E: the sidebar nav button of the current view is the one marked active.
 *
 * Guards SidebarModule.setActiveView(), which owns this state for the whole
 * session — the sidebar renders the buttons and stamps the default view's
 * initial state, and the coordinator only tells it which view won.
 *
 * Worth an e2e rather than a unit test: the failure this catches is a silent
 * no-op (an empty or stale viewType->button map still lets navigation work
 * perfectly, it just stops moving the highlight), so it is only observable
 * against the real rendered sidebar.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp } from './support/app.js';

const DASHBOARDS = [
    { name: 'EN', path: '/en/' },
    { name: 'MA', path: '/ma/' },
    { name: 'SL', path: '/sl/' },
];

for (const dashboard of DASHBOARDS) {
    describe(`${dashboard.name} sidebar active state`, () => {
        test('marks exactly the current view button active', async ({ page }) => {
            await gotoApp(page, dashboard.path);

            const buttonIds = await page.$$eval('.sidebar-nav-button', (buttons) =>
                buttons.map((b) => b.id),
            );
            expect(buttonIds.length).toBeGreaterThan(1);

            // The default view arrives pre-stamped from the sidebar's own markup.
            await expect(page.locator('.sidebar-nav-button.is-active')).toHaveCount(1);

            for (const id of buttonIds) {
                await page.locator(`#${id}`).click();

                // Exactly one active button, and it is the one just clicked.
                await expect(page.locator('.sidebar-nav-button.is-active')).toHaveCount(1);
                await expect(page.locator(`#${id}`)).toHaveClass(/\bis-active\b/);

                // aria-current must track the class, or the highlight is
                // decorative and screen readers never learn which view is open.
                await expect(page.locator(`#${id}`)).toHaveAttribute('aria-current', 'page');
                await expect(page.locator('.sidebar-nav-button[aria-current="page"]')).toHaveCount(
                    1,
                );
            }
        });
    });
}
