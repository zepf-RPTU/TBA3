/**
 * E2E test: one ⌀ toggle moves every MA chart.
 *
 * MA keeps a single comparison state on the app module (BaseAppModule's
 * `comparisonState`), keyed by the comparison-group ids the payload ships — `school`,
 * `state` — which the KS distribution's groups and the item lollipop's averages share.
 * The ⌀ dropdown in either chart's header writes that state; each view observes it
 * (observeActiveComparisons) and pushes it to its charts, and a view that was suspended
 * at the time receives the latest value on resume.
 *
 * This spec crosses views on purpose: the KS chart lives on the overview, the lollipop
 * on the item view, so the only way a toggle on one reaches the other is through the
 * app state plus the resume catch-up. Dropping the item view's observer fails the
 * item-view assertions; dropping the overview's fails the last.
 *
 * Oracles: the KS chart draws one `g.bar-group` per *visible* group (a hidden group is
 * filtered out of the data, not faded), so its count moves; the lollipop draws
 * `.average-marker-<id>` only for a visible average.
 */

import { test, expect } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './support/app.js';

const RENDER_TIMEOUT = 10_000;

const KS_CHART = '#ma-overview-ksDistribution';
const LOLLIPOP = '#ma-item-lollipop';
const STATE_ID = 'state';

/** Open a module's ⌀ menu and return the locator of one of its rows. */
async function openComparisonRow(module, id) {
    await module.locator('[data-header-action-button="comparison"]').click();
    return module.locator(`button.header-action-checkbox-option[data-menu-item-id="${id}"]`);
}

test('hiding the Landesschnitt on the overview KS chart hides it on the item lollipop, and back', async ({
    page,
}) => {
    await gotoApp(page, '/ma/');
    await page.locator('#overviewViewButton').click();

    const ksModule = page.locator('.module-container', { has: page.locator(KS_CHART) });
    const ksBarGroups = page.locator(`${KS_CHART} svg g.bar-group`);
    await expect(ksBarGroups).toHaveCount(3, { timeout: RENDER_TIMEOUT });

    // Every delivered comparison group starts visible.
    const ksStateRow = await openComparisonRow(ksModule, STATE_ID);
    await expect(ksStateRow).toHaveAttribute('aria-checked', 'true');

    await ksStateRow.click();
    await expect(ksBarGroups).toHaveCount(2, { timeout: RENDER_TIMEOUT });

    // The item view was never shown, so its lollipop is built against the state as it
    // is now; the lollipop section only shows in the table-only layout mode.
    await clickNav(page, '#itemViewButton');
    const tableOnlyBtn = page.locator('[data-mode-switch-button][data-mode="table-only"]').first();
    await tableOnlyBtn.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await tableOnlyBtn.click();

    const lollipopModule = page.locator('.module-container', { has: page.locator(LOLLIPOP) });
    await lollipopModule
        .locator('.content-module-header.collapsible .content-module-title')
        .click();
    const stateMarkers = page.locator(`${LOLLIPOP} svg .average-marker-${STATE_ID}`);
    await expect(stateMarkers).toHaveCount(0, { timeout: RENDER_TIMEOUT });

    const lollipopStateRow = await openComparisonRow(lollipopModule, STATE_ID);
    await expect(lollipopStateRow).toHaveAttribute('aria-checked', 'false');

    // Toggle it back on from *this* chart's header…
    await lollipopStateRow.click();
    await expect(lollipopStateRow).toHaveAttribute('aria-checked', 'true');
    await expect(stateMarkers).not.toHaveCount(0, { timeout: RENDER_TIMEOUT });

    // …and the overview, suspended meanwhile, catches up on resume.
    await page.locator('#overviewViewButton').click();
    await expect(ksBarGroups).toHaveCount(3, { timeout: RENDER_TIMEOUT });
});
