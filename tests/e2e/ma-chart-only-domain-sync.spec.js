/**
 * E2E test: the Leitidee focused in one MA chart-only layout is the one the other shows.
 *
 * The item and student views share the chart-only Leitidee through the
 * `chartOnlyDomainId` app-state key (docs/architecture.md §4): a ring
 * click writes it, the other view seeds its grid from it when its chart-only layout
 * is built and follows later writes on resume. The selected ring and the focus
 * host's title (the domain label) are the oracles in both views.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const UPDATE_TIMEOUT = 5_000;

const VIEWS = {
    item: {
        button: '#itemViewButton',
        content: '.item-view-content',
        grid: '#ma-item-taskRing-chartOnly',
        focus: '#ma-item-focus',
    },
    student: {
        button: '#studentViewButton',
        content: '.student-view-content',
        grid: '#student-taskRing-chart-only',
        focus: '#student-taskRingFocus',
    },
};

const selectedRing = (page, view) =>
    page.locator(`${view.grid} .task-ring-chart-item--selectable.selected`);

const focusTitle = (page, view) =>
    page
        .locator('.module-container', { has: page.locator(view.focus) })
        .locator('.content-module-title');

async function openView(page, view) {
    await page.locator(view.button).click();
    await expect(page.locator(view.content)).toBeVisible({ timeout: LOAD_TIMEOUT });
}

async function expectFocusedDomain(page, view, domain, title) {
    await expect(selectedRing(page, view)).toHaveCount(1, { timeout: LOAD_TIMEOUT });
    await expect(selectedRing(page, view)).toHaveAttribute('data-domain', domain, {
        timeout: UPDATE_TIMEOUT,
    });
    await expect
        .poll(async () => (await focusTitle(page, view).textContent())?.trim(), {
            timeout: UPDATE_TIMEOUT,
        })
        .toBe(title);
}

describe('MA chart-only Leitidee is shared between the item and student views', () => {
    test('a ring picked in one view is the ring the other view shows', async ({ page }) => {
        await gotoApp(page, '/ma/');
        await openView(page, VIEWS.item);

        const chartOnlyBtn = page.locator(
            '[data-mode-switch-button="true"][data-mode="chart-only"]',
        );
        await chartOnlyBtn.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await chartOnlyBtn.click();
        await expect(selectedRing(page, VIEWS.item)).toHaveCount(1, { timeout: LOAD_TIMEOUT });

        const originalDomain = await selectedRing(page, VIEWS.item).getAttribute('data-domain');
        const originalTitle = (await focusTitle(page, VIEWS.item).textContent())?.trim();
        expect(originalTitle).toBeTruthy();

        // Pick another Leitidee in the item view.
        const otherRing = page
            .locator(
                `${VIEWS.item.grid} .task-ring-chart-item--selectable[data-domain]:not(.selected):not([data-domain="overall"])`,
            )
            .first();
        const targetDomain = await otherRing.getAttribute('data-domain');
        await otherRing.click();
        await expect(selectedRing(page, VIEWS.item)).toHaveAttribute('data-domain', targetDomain, {
            timeout: UPDATE_TIMEOUT,
        });
        await expect
            .poll(async () => (await focusTitle(page, VIEWS.item).textContent())?.trim(), {
                timeout: UPDATE_TIMEOUT,
            })
            .not.toBe(originalTitle);
        const targetTitle = (await focusTitle(page, VIEWS.item).textContent())?.trim();

        // The student view (layout mode is shared, so it opens chart-only too) shows it.
        await openView(page, VIEWS.student);
        await expectFocusedDomain(page, VIEWS.student, targetDomain, targetTitle);

        // And the way back: pick the original ring here, the item view follows on resume.
        await page
            .locator(
                `${VIEWS.student.grid} .task-ring-chart-item--selectable[data-domain="${originalDomain}"]`,
            )
            .click();
        await expectFocusedDomain(page, VIEWS.student, originalDomain, originalTitle);

        await openView(page, VIEWS.item);
        await expectFocusedDomain(page, VIEWS.item, originalDomain, originalTitle);
    });
});
