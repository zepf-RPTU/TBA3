/**
 * E2E test: notes drawer — one notebook per dashboard and dataset, with manual pages and
 * cross-view module links.
 *
 * The link targets exist only once a view has rendered, so the behaviors that would
 * break silently are guarded here: losing a page's text, refusing to link into a view
 * the user has not opened yet (the app does not render views off-screen for the menu),
 * and a chip that has to navigate before it can highlight.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { openNotes } from './support/nav.js';

const NOTES_BUTTON = '[data-header-action-button="notes-toggle"]';
const DRAWER = '.notes-drawer:popover-open';
const EDITOR = '.notes-drawer .ql-editor';
const TAB = '.notes-drawer-tab';
/** The delete button's name, which also names its confirmation. */
const DELETE_PAGE = 'Seite löschen';
const LINK_BUTTON = '.notes-link-control button[aria-haspopup]';
const MENU_ITEM =
    '.notes-drawer .header-action-dropdown:popover-open .header-action-dropdown-option';

test.describe('Notes drawer', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/');
        await openNotes(page, { touch: false });
    });

    test("starts as a single page and keeps each page's text when switching", async ({ page }) => {
        await expect(page.locator(TAB)).toHaveCount(1);
        await expect(page.locator(TAB).first()).toHaveText('1');

        await page.locator(EDITOR).click();
        await page.keyboard.type('Seite eins');

        await page.locator('.notes-drawer-tab-add').click();
        await expect(page.locator(TAB)).toHaveCount(2);
        await expect(page.locator(EDITOR)).not.toContainText('Seite eins');
        await page.locator(EDITOR).click();
        await page.keyboard.type('Seite zwei');

        // Switching back restores page one: the edit was flushed, not dropped.
        await page.locator(TAB).first().click();
        await expect(page.locator(EDITOR)).toContainText('Seite eins');
        await page.locator(TAB).nth(1).click();
        await expect(page.locator(EDITOR)).toContainText('Seite zwei');
    });

    test('is a named dialog that takes focus on open and returns it on close', async ({ page }) => {
        const drawer = page.locator(DRAWER);
        await expect(drawer).toHaveAttribute('role', 'dialog');
        await expect(page.getByRole('dialog', { name: 'Notizen' })).toBeVisible();
        await expect(page.locator(EDITOR)).toBeFocused();

        // Off the header: a pointer resting on a header control opens its label tooltip,
        // which Escape closes first (WCAG 1.4.13).
        await page.mouse.move(640, 600);
        await expect(page.locator('.tooltip:popover-open')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(drawer).toBeHidden();
        await expect(page.locator(NOTES_BUTTON)).toBeFocused();
    });

    test('restores its pages after a reload', async ({ page }) => {
        await page.locator(EDITOR).click();
        await page.keyboard.type('Bleibt erhalten');
        await page.locator('.notes-drawer-tab-add').click();

        // No close first: every edit is stored as it is made.
        await page.reload({ timeout: LOAD_TIMEOUT_MS });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT_MS });
        await openNotes(page, { touch: false });

        await expect(page.locator(TAB)).toHaveCount(2);
        await page.locator(TAB).first().click();
        await expect(page.locator(EDITOR)).toContainText('Bleibt erhalten');
    });

    test("exports the dataset's pages as one Markdown file", async ({ page }) => {
        await page.locator(EDITOR).click();
        await page.keyboard.type('Erste Seite');
        await page.locator('.notes-drawer-tab-add').click();
        await page.locator(EDITOR).click();
        await page.keyboard.type('Zweite Seite');

        // The text typed last is still in the editor, not yet saved: the export
        // reads it from there.
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: 'Notizen exportieren' }).click(),
        ]);

        expect(download.suggestedFilename()).toMatch(/^tba3-en-notizen-.+\.md$/);
        const markdown = readFileSync(await download.path(), 'utf8');
        expect(markdown).toBe('# 1\n\nErste Seite\n\n# 2\n\nZweite Seite\n');
    });

    test('clears every page only after the confirmation, and keeps them cleared', async ({
        page,
    }) => {
        await page.locator(EDITOR).click();
        await page.keyboard.type('Wird gelöscht');
        await page.locator('.notes-drawer-tab-add').click();
        await expect(page.locator(TAB)).toHaveCount(2);

        const clear = page.getByRole('button', { name: 'Alle Notizen löschen' });
        const confirmDialog = page.getByRole('dialog', { name: 'Alle Notizen löschen' });
        await clear.click();
        await expect(confirmDialog).toBeVisible();
        await confirmDialog.getByRole('button', { name: 'Abbrechen' }).click();
        await expect(confirmDialog).toBeHidden();
        await expect(page.locator(TAB)).toHaveCount(2);

        await clear.click();
        await confirmDialog.getByRole('button', { name: 'Löschen' }).click();
        await expect(confirmDialog).toBeHidden();
        await expect(page.locator(TAB)).toHaveCount(1);
        await expect(page.locator(EDITOR)).not.toContainText('Wird gelöscht');

        await page.reload({ timeout: LOAD_TIMEOUT_MS });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT_MS });
        await openNotes(page, { touch: false });
        await expect(page.locator(TAB)).toHaveCount(1);
        await expect(page.locator(EDITOR)).not.toContainText('Wird gelöscht');
    });

    test('asks before deleting a page with text, and not before an empty one', async ({ page }) => {
        await page.locator(EDITOR).click();
        await page.keyboard.type('Bleibt vielleicht');
        await page.locator('.notes-drawer-tab-add').click();
        await expect(page.locator(TAB)).toHaveCount(2);

        // The new page is empty: it goes without a question.
        await page.locator('.notes-drawer-tab-delete').click();
        await expect(page.locator(TAB)).toHaveCount(1);

        const confirmDialog = page.getByRole('dialog', { name: DELETE_PAGE });
        await page.locator('.notes-drawer-tab-add').click();
        await page.locator(TAB).first().click();
        await page.locator('.notes-drawer-tab-delete').click();
        await expect(confirmDialog).toBeVisible();
        await confirmDialog.getByRole('button', { name: 'Abbrechen' }).click();
        await expect(page.locator(TAB)).toHaveCount(2);
        await expect(page.locator(EDITOR)).toContainText('Bleibt vielleicht');

        await page.locator('.notes-drawer-tab-delete').click();
        await confirmDialog.getByRole('button', { name: 'Löschen' }).click();
        await expect(page.locator(TAB)).toHaveCount(1);
        await expect(page.locator(EDITOR)).not.toContainText('Bleibt vielleicht');
    });

    test('renames a page by double-click', async ({ page }) => {
        await page.locator(TAB).first().dblclick();
        await page.locator('.notes-drawer-tab-input').fill('Elternabend');
        await page.keyboard.press('Enter');

        await expect(page.locator(TAB).first()).toHaveText('Elternabend');
    });

    test('offers the rename pencil to a keyboard, not only to a finger', async ({ page }) => {
        // On the desktop context: the pencil must render under `@media (hover: hover)`
        // too, because no key produces a dblclick, and a `display: none` pencil is
        // missing from the accessibility tree, where axe cannot see the gap.
        const pencil = page.locator('.notes-drawer-tab-rename');
        await expect(pencil).toBeVisible();

        await pencil.focus();
        await expect(pencil).toBeFocused();
        await page.keyboard.press('Enter');

        await page.locator('.notes-drawer-tab-input').fill('Zeugniskonferenz');
        await page.keyboard.press('Enter');

        await expect(page.locator(TAB).first()).toHaveText('Zeugniskonferenz');
    });

    test('lets one tab edit a notebook while another follows it read-only', async ({
        page,
        context,
    }) => {
        await page.locator(EDITOR).click();
        await page.keyboard.type('Aus Tab eins');

        const other = await context.newPage();
        await gotoApp(other, '/en/');
        await openNotes(other, { touch: false });
        const readOnly = '.notes-drawer[data-read-only]';
        await expect(other.locator(readOnly)).toBeVisible();
        await expect(other.locator('.notes-drawer .ql-toolbar')).toBeHidden();
        await expect(other.locator(EDITOR)).toContainText('Aus Tab eins');

        // The reader follows the editor's saves.
        await page.locator(EDITOR).press('End');
        await page.keyboard.type(' und mehr');
        await expect(other.locator(EDITOR)).toContainText('Aus Tab eins und mehr');

        await other.getByRole('button', { name: 'Hier bearbeiten' }).click();
        await expect(other.locator(readOnly)).toHaveCount(0);
        await expect(page.locator(readOnly)).toBeVisible();
        await expect(other.locator(EDITOR)).toBeFocused();
        await other.keyboard.type('Tab zwei: ');
        await expect(page.locator(EDITOR)).toContainText('Tab zwei: Aus Tab eins und mehr');
        await other.close();
    });

    test('lists modules only for views opened this session, and the chip navigates there', async ({
        page,
    }) => {
        // Aufgaben (item) has not been visited: its modules do not exist yet, and the
        // menu says so.
        await page.locator(LINK_BUTTON).click();
        await page.locator(MENU_ITEM, { hasText: /^\s*Aufgaben\s*$/ }).click();
        const hint = page.locator(MENU_ITEM, { hasText: 'Ansicht zuerst öffnen' });
        await expect(hint).toBeVisible();
        await expect(hint).toBeDisabled();
        await expect(page.locator(MENU_ITEM, { hasText: 'Aufgabendetails' })).toHaveCount(0);
        await page.keyboard.press('Escape');

        await clickNav(page, '#itemViewButton');
        await expect(page.locator('#item-table')).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
        await clickNav(page, '#welcomeViewButton');
        await expect(page.locator('#welcomeViewButton')).toHaveAttribute('aria-current', 'page');

        await page.locator(LINK_BUTTON).click();
        await page.locator(MENU_ITEM, { hasText: /^\s*Aufgaben\s*$/ }).click();
        const moduleItem = page.locator(MENU_ITEM, { hasText: 'Aufgabendetails' }).first();
        await moduleItem.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
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
