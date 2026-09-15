/**
 * E2E test: the overlays that claim `aria-modal` behave like modals for a keyboard.
 *
 * axe cannot see a missing focus trap — a dialog that lets Tab walk out into the
 * page behind it passes every rule. This spec is the only guard for what
 * `modalFocus.js` provides: focus moves into the dialog on open, Tab stays inside
 * it because the page behind is `inert`, and closing hands focus back to the
 * element that opened it. Two composers are covered — the shared SingletonOverlay
 * path (EN item preview) and a direct `openModalDialog` caller (SL detail overlay).
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const TAB_PRESSES = 8;

/**
 * Where focus is, from the dialog's point of view: `inside`, `chrome` (the browser's
 * own UI — Tab past the last control leaves the page, which `inert` does not wrap
 * around, exactly as a native `<dialog>` behaves), or the offending element.
 * @param {import('playwright').Page} page - The page.
 * @param {string} selector - The dialog root.
 * @returns {Promise<string>} `inside`, `chrome`, or a description of the page element that has focus.
 */
function focusLocation(page, selector) {
    return page.evaluate((sel) => {
        const active = document.activeElement;
        if (!active || active === document.body) return 'chrome';
        if (document.querySelector(sel)?.contains(active)) return 'inside';
        return `${active.tagName.toLowerCase()}.${active.className}`;
    }, selector);
}

/**
 * The shared assertions: focus is inside, Tab keeps it inside, the page behind is
 * inert and no longer is once the dialog closed.
 * @param {import('playwright').Page} page - The page.
 * @param {string} dialog - The open dialog's selector.
 */
async function expectModalKeyboardBehaviour(page, dialog) {
    await expect(page.locator(dialog)).toHaveAttribute('aria-modal', 'true');
    await expect.poll(() => focusLocation(page, dialog)).toBe('inside');
    await expect(page.locator('.main-content')).toHaveAttribute('inert', '');

    for (let i = 0; i < TAB_PRESSES; i += 1) {
        await page.keyboard.press('Tab');
        expect(['inside', 'chrome']).toContain(await focusLocation(page, dialog));
    }
}

describe('EN item preview (SingletonOverlay)', () => {
    const TRIGGER = '#item-table [data-item-action="show-task"]';
    const DIALOG = '.item-preview-overlay.visible';

    test('keeps focus inside and returns it to the trigger', async ({ page }) => {
        await gotoApp(page, '/en/');
        await page.locator('#itemViewButton').click();
        const trigger = page.locator(TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        // The pointer is still over the sidebar, which expands on hover and covers
        // the table's first column; park it over the content first.
        await page.mouse.move(700, 400);
        await expect(page.locator('.sidebar')).not.toHaveClass(/is-expanded/);

        await trigger.click();
        await expect(page.locator(DIALOG)).toBeVisible();
        await expectModalKeyboardBehaviour(page, DIALOG);

        await page.keyboard.press('Escape');
        await expect(page.locator(DIALOG)).toHaveCount(0);
        await expect(page.locator('.main-content')).not.toHaveAttribute('inert', '');
        await expect(trigger).toBeFocused();
    });
});

describe('SL detail overlay (openModalDialog)', () => {
    const CARD = '.chart-thumbnail-card';
    const DIALOG = '.sl-detail-overlay.visible';

    test('keeps focus inside and returns it to the card', async ({ page }) => {
        await gotoApp(page, '/sl/');
        await page.locator('#overviewViewButton').click();
        const card = page.locator(CARD).first();
        await card.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        await card.click();
        await expect(page.locator(DIALOG)).toBeVisible();
        await expectModalKeyboardBehaviour(page, DIALOG);

        await page.locator(`${DIALOG} [data-detail-overlay-action="close"]`).click();
        await expect(page.locator(DIALOG)).toHaveCount(0);
        await expect(page.locator('.main-content')).not.toHaveAttribute('inert', '');
        await expect(card).toBeFocused();
    });
});
