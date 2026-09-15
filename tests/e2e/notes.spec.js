/**
 * E2E test: notes drawer — one notebook per dashboard, with manual pages and
 * cross-view module links.
 *
 * The drawer's state model is not unit-testable (Quill is a page global and the
 * link targets only exist once a view has rendered), so the behaviors that would
 * silently break — losing a page's text, refusing to link into a view the user
 * has not opened yet (the app does not render views off-screen for the menu),
 * and a chip that has to navigate before it can highlight — are guarded here.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const NOTES_BUTTON = '[data-header-action-button="notes-toggle"]';
const DRAWER = '.notes-drawer.visible';
const EDITOR = '.notes-drawer .ql-editor';
const TAB = '.notes-drawer-tab';
const LINK_BUTTON = '.notes-link-control button[aria-haspopup]';
const MENU_ITEM = '.notes-drawer .header-action-dropdown.show .header-action-dropdown-option';

async function openDashboard(page) {
    await gotoApp(page, '/en/');
    // Willkommen is the default view — let it settle before interacting, the app
    // rejects a view switch while it is still transitioning into it.
    await page
        .getByRole('button', { name: 'Navigiere zu: Übersicht' })
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
}

async function openNotes(page) {
    await page.locator(NOTES_BUTTON).click();
    await page.waitForSelector(DRAWER, { timeout: LOAD_TIMEOUT });
}

describe('Notes drawer', () => {
    test.beforeEach(async ({ page }) => {
        await openDashboard(page);
        await openNotes(page);
    });

    test("starts as a single page and keeps each page's text when switching", async ({ page }) => {
        await expect(page.locator(TAB)).toHaveCount(1);
        await expect(page.locator(TAB).first()).toHaveText('1');

        await page.locator(EDITOR).click();
        await page.keyboard.type('Seite eins');

        // A second page starts empty and does not inherit page one's text.
        await page.locator('.notes-drawer-tab-add').click();
        await expect(page.locator(TAB)).toHaveCount(2);
        await expect(page.locator(EDITOR)).not.toContainText('Seite eins');
        await page.locator(EDITOR).click();
        await page.keyboard.type('Seite zwei');

        // Switching back restores page one — the edit was flushed, not dropped.
        await page.locator(TAB).first().click();
        await expect(page.locator(EDITOR)).toContainText('Seite eins');
        await page.locator(TAB).nth(1).click();
        await expect(page.locator(EDITOR)).toContainText('Seite zwei');
    });

    test('restores its pages after a reload', async ({ page }) => {
        await page.locator(EDITOR).click();
        await page.keyboard.type('Bleibt erhalten');
        await page.locator('.notes-drawer-tab-add').click();

        // Closing flushes the pending debounced save.
        await page.locator('.notes-drawer-close').click();
        await page.reload({ timeout: LOAD_TIMEOUT });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT });
        await openNotes(page);

        await expect(page.locator(TAB)).toHaveCount(2);
        await page.locator(TAB).first().click();
        await expect(page.locator(EDITOR)).toContainText('Bleibt erhalten');
    });

    test('renames a page by double-click', async ({ page }) => {
        await page.locator(TAB).first().dblclick();
        await page.locator('.notes-drawer-tab-input').fill('Elternabend');
        await page.keyboard.press('Enter');

        await expect(page.locator(TAB).first()).toHaveText('Elternabend');
    });

    test('offers the rename pencil to a keyboard, not only to a finger', async ({ page }) => {
        // This is the desktop context on purpose. The pencil was `display: none`
        // under `@media (hover: hover)`, which left dblclick as the only route to
        // a rename — and no key produces a dblclick, so renaming a page was
        // impossible without a pointer. `display: none` also hides it from the
        // accessibility tree, so the axe passes could not see the gap either.
        const pencil = page.locator('.notes-drawer-tab-rename');
        await expect(pencil).toBeVisible();

        await pencil.focus();
        await expect(pencil).toBeFocused();
        await page.keyboard.press('Enter');

        await page.locator('.notes-drawer-tab-input').fill('Zeugniskonferenz');
        await page.keyboard.press('Enter');

        await expect(page.locator(TAB).first()).toHaveText('Zeugniskonferenz');
    });

    test('lists modules only for views opened this session, and the chip navigates there', async ({
        page,
    }) => {
        // Aufgaben (item) has not been visited: its modules do not exist
        // yet, and the menu says so instead of rendering the view off-screen.
        await page.locator(LINK_BUTTON).click();
        await page.locator(MENU_ITEM, { hasText: /^\s*Aufgaben\s*$/ }).click();
        const hint = page.locator(MENU_ITEM, { hasText: 'Ansicht zuerst öffnen' });
        await expect(hint).toBeVisible();
        await expect(hint).toBeDisabled();
        await expect(page.locator(MENU_ITEM, { hasText: 'Aufgabendetails' })).toHaveCount(0);
        await page.keyboard.press('Escape');

        // Open the view once, then come back — its modules are now listable.
        await page.locator('#itemViewButton').click();
        await expect(page.locator('#item-table')).toBeVisible({ timeout: LOAD_TIMEOUT });
        await page.locator('#welcomeViewButton').click();
        await expect(page.locator('#welcomeViewButton')).toHaveAttribute('aria-current', 'page');

        await page.locator(LINK_BUTTON).click();
        await page.locator(MENU_ITEM, { hasText: /^\s*Aufgaben\s*$/ }).click();
        const moduleItem = page.locator(MENU_ITEM, { hasText: 'Aufgabendetails' }).first();
        await moduleItem.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const moduleLabel = (await moduleItem.textContent())?.trim();
        await moduleItem.click();

        const chip = page.locator('.notes-module-link').first();
        // Exact text, not toHaveText's whitespace-normalized match: the space that
        // separates the chip from following text must stay outside the link.
        expect(await chip.evaluate((el) => el.textContent)).toBe(moduleLabel);
        await expect(chip).toHaveAttribute('data-view-type', 'item');

        // On the welcome view; clicking the chip has to switch views first.
        await chip.click();
        await expect(page.locator('#itemViewButton')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('#item-table')).toBeVisible();
    });
});
