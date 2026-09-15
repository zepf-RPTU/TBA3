/**
 * E2E test: the MA item view's "Aufgabenerfolg" header carries the comparison-averages
 * dropdown.
 *
 * Regression guard for retiring the `chart.create` monkey-patch in
 * itemSuccessLollipopConfig in favour of ChartHostModule's `onRendered` hook. The hook
 * is now the only thing that builds this control, and it is the only way to toggle the
 * Landesschnitt on this chart: a hook that never fires — an `onRendered` dropped from
 * the config, or a render cycle that returns before reaching it — leaves the header
 * without the control, and nothing else in the suite would notice.
 *
 * The second half of the test opens the menu, because `ensureAveragesDropdown` removes
 * the control instead of showing it empty when the renderer has no registered averages:
 * a control wired to a chart whose `registerAverage` loop never ran would survive a bare
 * presence check but hand back an empty menu here.
 *
 * The third part toggles one average off and on again. The app's comparison state is the
 * only owner of "is this average drawn?" (every delivered average starts visible) and the
 * renderer asks it on every render, so a toggle must take the markers out of the SVG and
 * a second toggle must bring them back.
 * The module has to stay expanded through both clicks: the menu rebuilds itself on a
 * toggle, which detaches the clicked row before the click reaches the collapsible header
 * — its guard once used `closest()` on that detached row and collapsed the module.
 *
 * The module is shown only in the item view's table-only layout mode, and its header
 * actions stay hidden while it is collapsed — hence the mode switch and the expand.
 */

import { test, expect } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './support/app.js';

const RENDER_TIMEOUT = 10_000;

const LOLLIPOP = '#ma-item-lollipop';

test('the Aufgabenerfolg header offers the averages dropdown', async ({ page }) => {
    await gotoApp(page, '/ma/');
    await clickNav(page, '#itemViewButton');

    // The lollipop section is CSS-hidden outside table-only mode
    // (.item-view-content.layout-mode-table-only .lollipop-section).
    const tableOnlyBtn = page.locator('[data-mode-switch-button][data-mode="table-only"]').first();
    await tableOnlyBtn.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await tableOnlyBtn.click();

    // ContentModule transfers the container id onto its body div, so #ma-item-lollipop is
    // the *body* and the header is its sibling inside the .module-container.
    const module = page.locator('.module-container', { has: page.locator(LOLLIPOP) });
    const averagesControl = module.locator('[data-header-action-control="comparison"]');
    await expect(averagesControl).toHaveCount(1, { timeout: RENDER_TIMEOUT });

    // Click the title, not the header box: the actions cluster shares the header and a
    // click there would hit a button rather than the collapse toggle.
    await module.locator('.content-module-header.collapsible .content-module-title').click();

    // ...and that it lists something (see the empty-registry note in the file header).
    await averagesControl.locator('[data-header-action-button="comparison"]').click();
    await expect(averagesControl.locator('button.header-action-checkbox-option')).not.toHaveCount(
        0,
    );

    // Round-trip on the first average: on → off → on, module expanded throughout.
    // The menu re-renders its rows on each toggle; the locator re-resolves on every use.
    const firstOption = averagesControl.locator('button.header-action-checkbox-option').first();
    const optionId = await firstOption.getAttribute('data-menu-item-id');
    const markers = page.locator(`${LOLLIPOP} svg .average-marker-${optionId}`);
    await expect(firstOption).toHaveAttribute('aria-checked', 'true');
    await expect(markers).not.toHaveCount(0, { timeout: RENDER_TIMEOUT });

    await firstOption.click();
    await expect(firstOption).toHaveAttribute('aria-checked', 'false');
    await expect(markers).toHaveCount(0, { timeout: RENDER_TIMEOUT });
    await expect(page.locator(LOLLIPOP)).toBeVisible();

    await firstOption.click();
    await expect(firstOption).toHaveAttribute('aria-checked', 'true');
    await expect(markers).not.toHaveCount(0, { timeout: RENDER_TIMEOUT });
    await expect(page.locator(LOLLIPOP)).toBeVisible();
});
