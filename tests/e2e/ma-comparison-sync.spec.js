/**
 * E2E test: one ⌀ toggle moves every MA chart.
 *
 * MA keeps one comparison state on the app module (BaseAppModule's `comparisonState`),
 * keyed by the comparison-group ids the payload ships (`school`, `state`). The ⌀
 * dropdown in either chart's header writes it; each view observes it and pushes it to
 * its charts, and a suspended view receives the latest value on resume.
 *
 * The competence-level chart is on the overview and the lollipop on the item view, so a
 * toggle on one reaches the other only through the app state and the resume catch-up.
 * Dropping the item view's observer fails the item-view assertions; dropping the
 * overview's fails the last.
 *
 * Oracles: the competence-level chart draws one `g.bar-group` per visible group (a
 * hidden group is filtered out of the data, not faded), so its count moves; the lollipop
 * fades a hidden average's markers and marks them `aria-hidden`, and with the
 * Landesschnitt the only group toggled, its markers are the only ones that carry it.
 */

import { test, expect, RENDER_TIMEOUT_MS } from './support/test.js';
import { clickNav, gotoApp, openComparisonRow } from './support/app.js';
import { selectMode } from './support/modes.js';

const COMPETENCE_LEVEL_CHART = '#ma-overview-competenceLevelDistribution';
const LOLLIPOP = '#ma-item-lollipop';
const STATE_ID = 'state';

test('hiding the Landesschnitt on the overview competence-level chart hides it on the item lollipop, and back', async ({
    page,
}) => {
    await gotoApp(page, '/ma/#overview');

    const competenceLevelModule = page.locator(COMPETENCE_LEVEL_CHART);
    const competenceLevelBarGroups = page.locator(`${COMPETENCE_LEVEL_CHART} svg g.bar-group`);
    await expect(competenceLevelBarGroups).toHaveCount(3, { timeout: RENDER_TIMEOUT_MS });

    const competenceLevelStateRow = await openComparisonRow(competenceLevelModule, STATE_ID);
    await expect(competenceLevelStateRow).toHaveAttribute('aria-checked', 'true');

    await competenceLevelStateRow.click();
    await expect(competenceLevelBarGroups).toHaveCount(2, { timeout: RENDER_TIMEOUT_MS });

    // The item view was never shown, so its lollipop is first built with the group off;
    // the lollipop section only shows in the table-only layout mode.
    await clickNav(page, '#itemViewButton');
    await selectMode(page, 'table-only');

    const lollipopModule = page.locator(LOLLIPOP);
    // The card opens unfolded, its ⌀ button in reach.
    await expect(lollipopModule.locator('.content-module-toggle')).toHaveAttribute(
        'aria-expanded',
        'true',
    );
    const comparisonMarkers = page.locator(`${LOLLIPOP} svg .comparison-average-marker`);
    const hiddenMarkers = page.locator(
        `${LOLLIPOP} svg .comparison-average-marker[aria-hidden="true"]`,
    );
    await expect(hiddenMarkers).not.toHaveCount(0, { timeout: RENDER_TIMEOUT_MS });
    // The Schulschnitt stays on.
    expect(await comparisonMarkers.count()).toBeGreaterThan(await hiddenMarkers.count());

    const lollipopStateRow = await openComparisonRow(lollipopModule, STATE_ID);
    await expect(lollipopStateRow).toHaveAttribute('aria-checked', 'false');

    await lollipopStateRow.click();
    await expect(lollipopStateRow).toHaveAttribute('aria-checked', 'true');
    await expect(hiddenMarkers).toHaveCount(0, { timeout: RENDER_TIMEOUT_MS });
    // The menu rebuilds its rows on a toggle, detaching the clicked row before the click
    // reaches the collapsible header; a guard using `closest()` on it would collapse the module.
    await expect(page.locator(LOLLIPOP)).toBeVisible();

    // The overview, suspended meanwhile, catches up on resume.
    await clickNav(page, '#overviewViewButton');
    await expect(competenceLevelBarGroups).toHaveCount(3, { timeout: RENDER_TIMEOUT_MS });
});
