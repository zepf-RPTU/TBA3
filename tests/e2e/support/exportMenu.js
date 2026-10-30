/**
 * A module card's export menu: its trigger, the formats it offers, and the file one of
 * them downloads.
 */

import { readFileSync } from 'node:fs';
import { REVEAL_TIMEOUT_MS } from './test.js';
import { LOAD_TIMEOUT_MS } from './app.js';
import { CAPTURE_TIMEOUT_MS } from './cart.js';

export const EXPORT_TRIGGER = '[data-header-action-button="export-trigger"]';
const MENU_ITEM = '.header-action-dropdown-option';

/**
 * The menu rows of the dropdown `trigger` opens.
 * @param {import('@playwright/test').Locator} trigger
 * @returns {import('@playwright/test').Locator}
 */
const menuItemsOf = (trigger) => trigger.locator('..').locator(MENU_ITEM);

/**
 * The export trigger in a module card's header, once it is on screen.
 * @param {import('@playwright/test').Locator} card
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function exportTriggerOf(card) {
    const trigger = card.locator(EXPORT_TRIGGER).first();
    await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    return trigger;
}

/**
 * The formats a card's export menu offers, read off the open menu, which is closed again.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} trigger
 * @returns {Promise<string[]>} The menu rows' ids, in menu order.
 */
export async function exportFormatsOf(page, trigger) {
    await trigger.click();
    const items = menuItemsOf(trigger);
    await items.first().waitFor({ state: 'visible', timeout: REVEAL_TIMEOUT_MS });
    const ids = await items.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-menu-item-id') ?? ''),
    );
    await page.keyboard.press('Escape');
    await items.first().waitFor({ state: 'hidden', timeout: REVEAL_TIMEOUT_MS });
    return ids;
}

/**
 * Open the export menu `trigger` belongs to, pick the item whose id is `label`, and
 * return the download.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} trigger
 * @param {string} label
 * @returns {Promise<{name: string, bytes: Buffer}>} The suggested file name and the file.
 */
export async function exportVia(page, trigger, label) {
    const downloadPromise = page.waitForEvent('download', { timeout: CAPTURE_TIMEOUT_MS });
    await trigger.click();
    const item = trigger.locator('..').locator(`${MENU_ITEM}[data-menu-item-id="${label}"]`);
    await item.waitFor({ state: 'visible', timeout: REVEAL_TIMEOUT_MS });
    // By keyboard: a click would leave the pointer where the menu row was, over the card,
    // and the mark tooltip it opens there covers the next trigger.
    await item.focus();
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    const path = await download.path();
    return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

/**
 * Split an exported CSV of one table into its header cells and body rows. Tabulator
 * quotes every field, so unquoting is a plain strip.
 * @param {Buffer} bytes - The downloaded file, BOM included.
 * @returns {{header: string[], rows: string[][]}} The parsed cells.
 */
export function parseCsv(bytes) {
    /**
     * @param {string} cell - One quoted CSV field.
     * @returns {string} Its value.
     */
    const unquote = (cell) => cell.replace(/^"|"$/g, '').split('""').join('"');
    const lines = bytes.subarray(3).toString('utf8').split(/\r?\n/).filter(Boolean);
    return {
        header: lines[0].split(';').map(unquote),
        rows: lines.slice(1).map((line) => line.split(';').map(unquote)),
    };
}
