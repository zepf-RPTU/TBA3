/**
 * Accessibility: the surfaces that only exist after an interaction.
 *
 * The two view sweeps navigate to a hash and scan what renders. Six surfaces are invisible
 * to both, because they have to be opened first — and four of them are DOM axe has never
 * seen at all. Four are also touch-only: the rename pencil, the arming toggle and the popup
 * close button are `display: none` or unrendered under `@media (hover: hover)`, and the
 * report card toolbar is only reachable without hovering. So this file runs on the touch
 * context too.
 *
 * Every scan is scoped with `include`. Each of these opens over a fully rendered view, and
 * an unscoped scan would re-report that view's findings once per surface, burying the thing
 * under test — and re-litigating findings the sweeps already own.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';
import { runAxe } from './support/axe.js';
import {
    expandSidebar,
    openDashboard,
    openNotes,
    openReportWithTwoCards,
    openScatterplotFilter,
} from './support/nav.js';

test.override('touchDevice', true);
test.override('viewport', { width: 1180, height: 820 });

/**
 * Scan one subtree and fail on anything serious or critical.
 * @param {import('playwright').Page} page - The page.
 * @param {string} selector - The subtree to scan.
 * @param {string} label - What to call it in the failure message.
 */
async function expectClean(page, selector, label) {
    await expect(page.locator(selector).first()).toBeVisible();

    const { blocking, advisory } = await runAxe(page, { include: selector });
    if (advisory.length) {
        console.log(`[axe surface] ${label} advisory:\n  ${advisory.join('\n  ')}`);
    }
    expect(blocking, label).toEqual([]);
}

describe('interaction-gated surfaces', () => {
    test('the expanded sidebar rail', async ({ page }) => {
        await openDashboard(page);
        await expandSidebar(page);

        // Expanded is the only state in which the nav labels, the page's one <h1>
        // and the theme picker are readable on a touch device.
        await expectClean(page, '.sidebar', 'expanded sidebar');
    });

    test('the notes drawer', async ({ page }) => {
        await openDashboard(page);
        await openNotes(page);

        // Carries the touch-only rename pencil, the tab strip and the link control.
        await expect(page.locator('.notes-drawer-tab-rename')).toBeVisible();
        await expectClean(page, '.notes-drawer', 'notes drawer');
    });

    test('the scatterplot filter modal', async ({ page }) => {
        await openDashboard(page);
        await openScatterplotFilter(page);

        // Carries the touch-only "Auswahlmodus" toggle.
        await expect(
            page.locator('[data-scatterplot-filter-action="arm-selection"]'),
        ).toBeVisible();
        await expectClean(page, '.scatterplot-filter-modal', 'scatterplot filter modal');
    });

    test('a tapped-open glossary popup', async ({ page }) => {
        // SL's welcome view is the only landing view whose copy carries marked-up terms.
        await gotoApp(page, '/sl/');
        const term = page.locator('.glossary-term').first();
        await term.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await term.tap();

        // The close button exists only on this path, and it is the focusable
        // control inside `role="tooltip"`, the one place a focusable sits inside one.
        await expect(page.locator('.glossary-popup-close')).toBeVisible();
        await expectClean(page, '.glossary-popup', 'glossary popup');
    });

    test("SL's tables, which only exist in Tabellen mode", async ({ page }) => {
        await gotoApp(page, '/sl/#overview');
        await page
            .locator('.view-base')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await page.locator('#app-skeleton').waitFor({ state: 'detached', timeout: LOAD_TIMEOUT });

        // The view sweep only ever sees this view's charts. Its tables are the only
        // ones in the app with grouped rows and grouped columns, and both of those are
        // markup tabulatorAria.js corrects.
        await page.getByRole('button', { name: 'Tabellen', exact: true }).click();
        await page
            .locator('#overview-domain-table-wrapper .tabulator-row')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        await expectClean(page, '#overview-domain-table-wrapper', 'SL domain table');
    });

    test('the report view with cards in it', async ({ page }) => {
        await openReportWithTwoCards(page);

        // Every earlier pass scanned #report with an empty cart, so the card
        // toolbars — nine controls each, permanently visible on touch — have
        // never been scanned.
        await expectClean(page, '.report-pages', 'report cards');
    });
});
