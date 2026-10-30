/**
 * E2E test: one ⌀ toggle moves every SL Überblick card.
 *
 * SL keeps its reference-average visibility in the app-wide comparison state
 * (BaseAppModule's `comparisonState`). The ⌀ dropdown in any card's header writes it;
 * the summary view observes it and re-renders all seven row cards.
 *
 * Oracle: each card draws one `.deviation-bar--average` per visible reference average,
 * so the count across the view moves 7 → 0 → 7. The second toggle is made from a
 * different card than the first, which pins the state as app-wide rather than per card.
 */

import { test, expect, RENDER_TIMEOUT_MS } from './support/test.js';
import { gotoApp, openComparisonRow } from './support/app.js';

const AVERAGE_ID = 'state';

test('hiding the Landesschnitt from one card hides it on every card, and another card brings it back', async ({
    page,
}) => {
    await gotoApp(page, '/sl/');

    const cards = page.locator('.sl-summary-view .module-container');
    const averageBars = page.locator('.sl-summary-view .deviation-bar--average');
    await expect(cards).toHaveCount(7, { timeout: RENDER_TIMEOUT_MS });
    await expect(averageBars).toHaveCount(7, { timeout: RENDER_TIMEOUT_MS });

    const firstRow = await openComparisonRow(cards.first(), AVERAGE_ID);
    await expect(firstRow).toHaveAttribute('aria-checked', 'true');

    await firstRow.click();
    await expect(averageBars).toHaveCount(0, { timeout: RENDER_TIMEOUT_MS });

    const lastRow = await openComparisonRow(cards.last(), AVERAGE_ID);
    await expect(lastRow).toHaveAttribute('aria-checked', 'false');

    await lastRow.click();
    await expect(averageBars).toHaveCount(7, { timeout: RENDER_TIMEOUT_MS });
});
