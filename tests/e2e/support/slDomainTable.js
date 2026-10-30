/**
 * Opens the SL Details view and its domain table, shared by the fixture and server tiers.
 */

import { expect } from './test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './app.js';
import { selectMode } from './modes.js';

/**
 * Open the SL Details view (Lerngruppen) straight from its hash route.
 * @param {import('@playwright/test').Page} page
 * @param {string} [path] - The SL page path, e.g. `/sl/?scope=schools/sl`.
 */
export async function openSlDetails(page, path = '/sl/') {
    await gotoApp(page, `${path}#details`);
    await page.locator('.sl-details-view').waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
}

/**
 * Open the Details view in table mode — where the domain table lives.
 * @param {import('@playwright/test').Page} page
 * @param {string} path - The SL page path, e.g. `/sl/?scope=schools/sl`.
 * @param {'by_subjects' | 'by_groups'} [grouping]
 * @returns {Promise<import('@playwright/test').Locator>} The table wrapper.
 */
export async function openDomainTable(page, path, grouping = 'by_subjects') {
    await openSlDetails(page, path);
    await selectMode(page, grouping);
    await selectMode(page, 'table');

    const wrapper = page.locator(`[data-details-section='table:${grouping}']`);
    await expect(wrapper).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    return wrapper;
}

/**
 * Expand the table's first subject group; groups start collapsed.
 * @param {import('@playwright/test').Locator} wrapper - The table wrapper.
 * @returns {Promise<import('@playwright/test').Locator>} The data rows, at least one shown.
 */
export async function expandFirstGroup(wrapper) {
    const firstGroup = wrapper.locator('.tabulator-group').first();
    await firstGroup.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    await firstGroup.click();
    const rows = wrapper.locator('.tabulator-row:not(.tabulator-group)');
    await expect.poll(() => rows.count(), { timeout: LOAD_TIMEOUT_MS }).toBeGreaterThan(0);
    return rows;
}
