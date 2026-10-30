/**
 * E2E test: menus are `auto` popovers, so the browser closes them on a click outside
 * (light dismiss). Glossary popups are `manual` popovers the tooltip service dismisses:
 * opening one closes no open menu, a click outside the stack closes it, and a click in
 * a lower level closes the levels above it. The oracle is the `:popover-open` state and
 * the trigger's `aria-expanded`, after real input: the browser light-dismisses only on
 * trusted pointer events.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { cardOf } from './support/cart.js';

const OUTSIDE = '.header-module-title';

/** How long a hover rests on a term before its popup opens, with room to spare. */
const HOVER_OPEN_MS = 800;

test.describe('light dismiss', () => {
    test('a click outside closes an open menu; its trigger toggles it', async ({ page }) => {
        await gotoApp(page, '/en/#item');
        const card = cardOf(page.locator('#item-itemLollipop'));
        const trigger = card.locator('[data-header-action-button="export-trigger"]').first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const openMenu = card.locator('.header-action-dropdown:popover-open');

        await trigger.click();
        await expect(openMenu).toHaveCount(1);
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');

        await page.locator(OUTSIDE).first().click();
        await expect(openMenu).toHaveCount(0);
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');

        // The trigger is the menu's invoker: a second click closes it rather than
        // light-dismissing it and opening it again.
        await trigger.click();
        await expect(openMenu).toHaveCount(1);
        await trigger.click();
        await expect(openMenu).toHaveCount(0);
    });

    test('a glossary popup opened by hover leaves an open menu open', async ({ page }) => {
        // An `auto` glossary popup would close every other open `auto` popover, so a
        // term hovered on the way to a menu entry would take the menu away.
        await gotoApp(page, '/en/#item');
        const card = cardOf(page.locator('#item-itemLollipop'));
        const trigger = card.locator('[data-header-action-button="export-trigger"]').first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const openMenu = card.locator('.header-action-dropdown:popover-open');
        await trigger.click();
        await expect(openMenu).toHaveCount(1);

        await page.locator('.content-module-title .glossary-term').first().hover();
        await expect(page.locator('.glossary-popup:popover-open')).toHaveCount(1, {
            timeout: HOVER_OPEN_MS * 2,
        });
        await expect(openMenu).toHaveCount(1);
    });

    test('a click outside closes the glossary stack; one in a lower level closes the levels above', async ({
        page,
    }) => {
        await gotoApp(page, '/sl/');
        const popups = page.locator('.glossary-popup:popover-open');
        const terms = page.locator('.glossary-term');
        await terms.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // A term whose popup names another term, so a second level can open.
        let nested = null;
        for (let i = 0; i < Math.min(await terms.count(), 8) && !nested; i += 1) {
            await terms.nth(i).hover();
            await expect(popups).toHaveCount(1, { timeout: HOVER_OPEN_MS * 2 });
            const inner = popups.first().locator('.glossary-term');
            if ((await inner.count()) > 0) nested = inner.first();
            else {
                await page.locator(OUTSIDE).first().click();
                await expect(popups).toHaveCount(0);
            }
        }
        expect(nested, 'no glossary popup on the page names another term').not.toBeNull();
        const inner = /** @type {import('@playwright/test').Locator} */ (nested);

        await inner.hover();
        await expect(popups).toHaveCount(2, { timeout: HOVER_OPEN_MS * 2 });

        await popups.first().locator('.glossary-popup-title').click();
        await expect(popups).toHaveCount(1);

        await page.locator(OUTSIDE).first().click();
        await expect(popups).toHaveCount(0);
    });
});
