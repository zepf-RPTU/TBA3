/**
 * E2E test: the ring focused in one MA chart-only layout is the one the other shows.
 *
 * The item and student views share the chart-only ring through the `chartOnlyRingId`
 * app-state key: a ring click writes it, the other view seeds its grid from it when its
 * chart-only layout is built and follows later writes on resume. The selected ring and
 * the focus host's title (the ring's title) are the oracles in both views.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { selectMode } from './support/modes.js';
import { openView } from './support/nav.js';
import { required } from '../../packages/modules/test/support/required.js';

const VIEWS = {
    item: {
        button: '#itemViewButton',
        content: '.item-view-content',
        grid: '#ma-item-itemRing-chartOnly',
        focus: '#ma-item-focus',
    },
    student: {
        button: '#studentViewButton',
        content: '.student-view-content',
        grid: '#ma-student-itemRing-chartOnly',
        focus: '#ma-student-focus',
    },
};

/**
 * @typedef {object} ChartOnlyView
 * @property {string} button - Its nav button.
 * @property {string} content - Its split-view content wrapper.
 * @property {string} grid - Its chart-only ring grid.
 * @property {string} focus - Its focus chart.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {ChartOnlyView} view
 * @returns {import('@playwright/test').Locator} The selected ring in its grid.
 */
const selectedRing = (page, view) =>
    page.locator(`${view.grid} .item-ring-card--selectable.selected`);

/**
 * @param {import('@playwright/test').Page} page
 * @param {ChartOnlyView} view
 * @returns {import('@playwright/test').Locator} The title of its focus module.
 */
const focusTitle = (page, view) => page.locator(`${view.focus} .content-module-title`);

/**
 * @param {import('@playwright/test').Page} page
 * @param {ChartOnlyView} view - The open view.
 * @param {string} domain - The key its selected ring must carry.
 * @param {string | undefined} title - The focus module's expected title.
 */
async function expectFocusedRing(page, view, domain, title) {
    await expect(selectedRing(page, view)).toHaveCount(1, { timeout: LOAD_TIMEOUT_MS });
    await expect(selectedRing(page, view)).toHaveAttribute('data-ring', domain);
    await expect.poll(async () => (await focusTitle(page, view).textContent())?.trim()).toBe(title);
    // The focus card names the item count where the grid does: under the ring's name.
    const ringCount = await selectedRing(page, view).locator('.item-ring-svg-count').textContent();
    await expect
        .poll(async () =>
            (await page.locator(`${view.focus} .content-module-subtitle`).textContent())?.trim(),
        )
        .toBe(ringCount);
}

test.describe('MA chart-only ring is shared between the item and student views', () => {
    test('a ring picked in one view is the ring the other view shows', async ({ page }) => {
        await gotoApp(page, '/ma/#item');
        await selectMode(page, 'chart-only');
        await expect(selectedRing(page, VIEWS.item)).toHaveCount(1, { timeout: LOAD_TIMEOUT_MS });

        const originalDomain = required(
            await selectedRing(page, VIEWS.item).getAttribute('data-ring'),
        );
        const originalTitle = (await focusTitle(page, VIEWS.item).textContent())?.trim();
        expect(originalTitle).toBeTruthy();

        const otherRing = page
            .locator(
                `${VIEWS.item.grid} .item-ring-card--selectable[data-ring]:not(.selected):not([data-ring="all"])`,
            )
            .first();
        const targetDomain = required(await otherRing.getAttribute('data-ring'));
        await otherRing.click();
        await expect(selectedRing(page, VIEWS.item)).toHaveAttribute('data-ring', targetDomain);
        await expect
            .poll(async () => (await focusTitle(page, VIEWS.item).textContent())?.trim())
            .not.toBe(originalTitle);
        const targetTitle = (await focusTitle(page, VIEWS.item).textContent())?.trim();

        // The layout mode is shared, so the student view opens chart-only too.
        await openView(page, VIEWS.student);
        await expectFocusedRing(page, VIEWS.student, targetDomain, targetTitle);

        // The way back: the item view, suspended meanwhile, follows on resume.
        await page
            .locator(
                `${VIEWS.student.grid} .item-ring-card--selectable[data-ring="${originalDomain}"]`,
            )
            .click();
        await expectFocusedRing(page, VIEWS.student, originalDomain, originalTitle);

        await openView(page, VIEWS.item);
        await expectFocusedRing(page, VIEWS.item, originalDomain, originalTitle);
    });
});

test.describe('MA split panel hydrates on first entry', () => {
    test('a view opened chart-only fills its split panel only when it is first shown', async ({
        page,
    }) => {
        await gotoApp(page, '/ma/#item');
        await selectMode(page, 'chart-only');
        await expect(selectedRing(page, VIEWS.item)).toHaveCount(1, { timeout: LOAD_TIMEOUT_MS });

        // Opened chart-only, the student view's split panel is built and mounted, but its
        // table and rings are not drawn yet.
        await openView(page, VIEWS.student);
        await expect(selectedRing(page, VIEWS.student)).toHaveCount(1, {
            timeout: LOAD_TIMEOUT_MS,
        });
        await expect(page.locator('#student-view-module .tabulator')).toHaveCount(0);
        await expect(page.locator('#ma-student-itemRing svg.chart-root')).toHaveCount(0);

        await selectMode(page, 'both');
        await expect(page.locator('#student-view-module .tabulator-row').first()).toBeVisible({
            timeout: LOAD_TIMEOUT_MS,
        });
        await expect(
            page.locator('#ma-student-itemRing .selected-student-tick').first(),
        ).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
        await expect(page.locator('#student-view-module .tabulator')).toHaveCount(1);
    });
});
