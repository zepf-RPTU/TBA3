/**
 * E2E test: the MA focus card's student list opens the student it names.
 *
 * In the item view a name opens the student view with that student; in the student view
 * it switches the student in place. The student selector is the oracle in both, and in
 * the student view the focus ring's student tick, which the name's rate must match.
 */

import { test, expect } from './support/test.js';
import { expectNamesOneStudent, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { selectMode } from './support/modes.js';
import { required } from '../../packages/modules/test/support/required.js';

const SELECT = '#student-top-bar-selector-module-select';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} focus - The view's focus host.
 * @returns {import('@playwright/test').Locator} The names its student list shows.
 */
const names = (page, focus) => page.locator(`${focus} .detail-student-name`);

/**
 * @param {string|null} text - A German percentage, e.g. "42,5 %".
 * @returns {number}
 */
const percent = (text) => Number((text ?? '').replace(/[^\d,]/g, '').replace(',', '.'));

test.describe('MA focus card – student list', () => {
    test('a name in the item view opens that student', async ({ page }) => {
        await gotoApp(page, '/ma/#item');
        await selectMode(page, 'chart-only');
        const name = names(page, '#ma-item-focus').first();
        await name.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const studentName = required(await name.locator('span').first().textContent()).trim();

        await name.click();

        await expect(page.locator(`${SELECT} option:checked`)).toHaveText(studentName, {
            timeout: LOAD_TIMEOUT_MS,
        });
        await expectNamesOneStudent(page.locator(SELECT), studentName);
    });

    test('a name in the student view switches the student in place', async ({ page }) => {
        await gotoApp(page, '/ma/#student');
        await selectMode(page, 'chart-only');
        const list = names(page, '#ma-student-focus');
        await list.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const current = required(
            await page.locator(`${SELECT} option:checked`).textContent(),
        ).trim();
        // Matched exactly: a substring match would skip a student whose name contains
        // the current one.
        const listedNames = (await list.locator('span:first-child').allTextContents()).map((text) =>
            text.trim(),
        );
        const index = listedNames.findIndex((text) => text !== current);
        expect(index).toBeGreaterThanOrEqual(0);
        const target = list.nth(index);
        const studentName = listedNames[index];
        await expectNamesOneStudent(page.locator(SELECT), studentName);
        const listed = percent(await target.locator('.detail-student-name-detail').textContent());

        await target.click();

        await expect(page.locator(`${SELECT} option:checked`)).toHaveText(studentName, {
            timeout: LOAD_TIMEOUT_MS,
        });
        // Counted as the ring counts a one-student selection: the Leistung row of the
        // selected student (second, after the group's) gives the listed rate, to the
        // list's whole percent.
        const selectionRow = page.locator('#ma-student-focus .detail-row').nth(1);
        await expect
            .poll(async () =>
                Math.round(percent(await selectionRow.locator('.detail-value').textContent())),
            )
            .toBe(listed);
    });
});
