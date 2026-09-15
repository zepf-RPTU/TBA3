/**
 * E2E test: one ⌀ toggle moves every SL Überblick card.
 *
 * SL keeps its reference-average visibility in the app-wide comparison state
 * (BaseAppModule's `comparisonState`, seeded from the delivered Landesschnitt rows
 * as `state:<id>`). The ⌀ dropdown in any card's header writes it through
 * `setComparisonMode`; the summary view observes the state key, rebuilds
 * the whole payload and re-renders all seven row cards from it.
 *
 * Oracle: each card draws one `.deviation-bar--average` per visible reference average
 * — a column exists exactly where a bar does — so the count across the view moves
 * 7 → 0 → 7. The second toggle is made from a *different* card than the first, which
 * is what pins the state as app-wide rather than per card.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const RENDER_TIMEOUT = 10_000;

const AVERAGE_ID = 'state:state';

/** Open one card's ⌀ menu and return the Landesschnitt row. */
async function openAverageRow(card) {
    await card.locator('[data-header-action-button="comparison"]').click();
    return card.locator(`button.header-action-checkbox-option[data-menu-item-id="${AVERAGE_ID}"]`);
}

test('hiding the Landesschnitt from one card hides it on every card, and another card brings it back', async ({
    page,
}) => {
    await gotoApp(page, '/sl/');
    await page
        .locator('.sl-summary-view svg')
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

    const cards = page.locator('.sl-summary-view .module-container');
    const averageBars = page.locator('.sl-summary-view .deviation-bar--average');
    await expect(cards).toHaveCount(7, { timeout: RENDER_TIMEOUT });
    await expect(averageBars).toHaveCount(7, { timeout: RENDER_TIMEOUT });

    // Every delivered reference average starts visible.
    const firstRow = await openAverageRow(cards.first());
    await expect(firstRow).toHaveAttribute('aria-checked', 'true');

    await firstRow.click();
    await expect(averageBars).toHaveCount(0, { timeout: RENDER_TIMEOUT });

    // A different card sees the same state…
    const lastRow = await openAverageRow(cards.last());
    await expect(lastRow).toHaveAttribute('aria-checked', 'false');

    // …and toggling it back on there restores the column everywhere.
    await lastRow.click();
    await expect(averageBars).toHaveCount(7, { timeout: RENDER_TIMEOUT });
});
