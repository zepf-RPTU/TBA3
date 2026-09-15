/**
 * Shared helpers for the SL domain-table specs.
 */

import { expect } from './test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './app.js';

/**
 * Open the overview in table mode, grouped by subject — where the domain table lives.
 * @param {import('playwright').Page} page - The test page.
 * @param {string} path - The SL page path, e.g. `/sl/?class=sl`.
 * @returns {Promise<import('playwright').Locator>} The table wrapper.
 */
export async function openDomainTable(page, path) {
    await gotoApp(page, path);
    await page
        .locator('.sl-summary-view svg')
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await clickNav(page, '#overviewViewButton');
    await page.locator('.sl-overview-view').waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

    for (const mode of ['by_subjects', 'table']) {
        const button = page
            .locator(`[data-mode-switch-button="true"][data-mode="${mode}"]`)
            .first();
        await button.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        if (!(await button.isDisabled())) await button.click();
    }

    const wrapper = page.locator('#overview-domain-table-wrapper');
    await expect(wrapper).toBeVisible({ timeout: LOAD_TIMEOUT });
    return wrapper;
}

/**
 * Expand the first subject group and read its rows' leading label column, which
 * carries the average's payload name for comparison rows and the class name otherwise.
 * @param {import('playwright').Locator} wrapper - The table wrapper from `openDomainTable`.
 * @returns {Promise<Array<{label: string, type: string}>>} The rows, empty labels dropped.
 */
export async function readFirstGroupLabels(wrapper) {
    const firstGroup = wrapper.locator('.tabulator-group').first();
    await firstGroup.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await firstGroup.click();

    const rows = wrapper.locator('.tabulator-row:not(.tabulator-group)');
    await expect.poll(async () => await rows.count(), { timeout: LOAD_TIMEOUT }).toBeGreaterThan(0);

    return (
        await rows.evaluateAll((nodes) =>
            nodes.map((node) => ({
                label: node.querySelector('.tabulator-cell')?.textContent?.trim() ?? '',
                type: node.className,
            })),
        )
    ).filter((row) => row.label);
}
