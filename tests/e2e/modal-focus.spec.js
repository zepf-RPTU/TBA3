/**
 * E2E test: the modal `<dialog>`s behave like modals for a keyboard.
 *
 * axe cannot see a missing focus trap: a dialog that lets Tab walk out into the page
 * behind it passes every rule. This guards what `showModal()` provides and ModalDialog
 * must not undo: focus moves into the dialog on open, Tab stays inside it because the
 * page behind is inert, and closing hands focus back to the element that opened it.
 * Every modal composes ModalDialog; three are covered, plus the innermost-first Escape
 * rule inside a modal.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { openScatterplotFilter } from './support/nav.js';
import { COMPETENCE_CARD, OVERLAY } from './support/slCompetenceChart.js';

const TAB_PRESSES = 8;

/**
 * Where focus is, from the dialog's point of view: `inside`, `chrome` (the browser's
 * own UI: Tab past the last control leaves the page, as with any native `<dialog>`),
 * or the offending element.
 * @param {import('@playwright/test').Page} page
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
 * Whether the page behind the dialogs takes focus: false while a modal makes it inert.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} Whether the first sidebar button could be focused.
 */
function pageTakesFocus(page) {
    return page.evaluate(() => {
        const button = /** @type {HTMLElement} */ (document.querySelector('.sidebar-nav-button'));
        const before = document.activeElement;
        button.focus();
        const took = document.activeElement === button;
        if (took && before instanceof HTMLElement) before.focus();
        return took;
    });
}

/**
 * The shared assertions: the dialog is modal, focus is inside, Tab keeps it inside
 * and the page behind is inert.
 * @param {import('@playwright/test').Page} page
 * @param {string} dialog - The open dialog's selector.
 */
async function expectModalKeyboardBehaviour(page, dialog) {
    expect(await page.locator(dialog).evaluate((el) => el.matches('dialog:modal'))).toBe(true);
    await expect.poll(() => focusLocation(page, dialog)).toBe('inside');
    expect(await pageTakesFocus(page)).toBe(false);

    for (let i = 0; i < TAB_PRESSES; i += 1) {
        await page.keyboard.press('Tab');
        expect(['inside', 'chrome']).toContain(await focusLocation(page, dialog));
    }
}

test.describe('EN item preview', () => {
    const TRIGGER = '#item-table button.item-preview-trigger';
    const DIALOG = '.item-preview-overlay[open]';

    test('keeps focus inside and returns it to the trigger', async ({ page }) => {
        await gotoApp(page, '/en/#item');
        const trigger = page.locator(TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // Focusing scrolls the table into view, and Tabulator rebuilds every cell the
        // first time a table built below the fold becomes visible, from its
        // IntersectionObserver callback a frame or two after the scroll. The focus must
        // survive that rebuild.
        await trigger.focus();
        await page.evaluate(
            () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
        );
        await expect(trigger).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator(DIALOG)).toBeVisible();
        await expectModalKeyboardBehaviour(page, DIALOG);

        await page.keyboard.press('Escape');
        await expect(page.locator(DIALOG)).toHaveCount(0);
        await expect(trigger).toBeFocused();
        expect(await pageTakesFocus(page)).toBe(true);
        // Built per preview, and gone once it closed.
        await expect(page.locator('.item-preview-overlay')).toHaveCount(0);
    });
});

test.describe('SL detail overlay', () => {
    test('keeps focus inside and returns it to the card', async ({ page }) => {
        await gotoApp(page, '/sl/#details');
        const card = page.locator(COMPETENCE_CARD).first();
        await card.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        await card.click();
        await expect(page.locator(OVERLAY)).toBeVisible();
        await expectModalKeyboardBehaviour(page, OVERLAY);

        await page.locator(`${OVERLAY} .modal-close`).click();
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await expect(card).toBeFocused();
    });
});

test.describe('EN scatterplot filter', () => {
    const DIALOG = '.scatterplot-filter-overlay[open]';

    test('keeps focus inside, closes on its ✕ and returns focus to the trigger', async ({
        page,
    }) => {
        const trigger = await openScatterplotFilter(page, { touch: false });
        await expect(page.locator(DIALOG)).toHaveAttribute(
            'aria-label',
            'Schüler:innen suchen und finden',
        );
        await expectModalKeyboardBehaviour(page, DIALOG);

        await page.locator(`${DIALOG} .modal-close`).click();
        await expect(page.locator(DIALOG)).toHaveCount(0);
        await expect(trigger).toBeFocused();
    });
});

test.describe('Escape inside a modal', () => {
    test('closes an open menu first, and the modal on the next press', async ({ page }) => {
        await gotoApp(page, '/sl/#details');
        const card = page.locator(COMPETENCE_CARD).first();
        await card.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await card.click();

        const dialog = page.locator(OVERLAY);
        const menuButton = dialog.locator('[aria-haspopup]').first();
        await menuButton.click();
        const openMenu = dialog.locator('.header-action-dropdown:popover-open');
        await expect(openMenu).toHaveCount(1);

        await page.keyboard.press('Escape');
        await expect(openMenu).toHaveCount(0);
        await expect(dialog).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    });
});
