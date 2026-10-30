/**
 * E2E test: the MA student view's selector switches the student everywhere.
 *
 * A pick only reports up: the view writes it to app state and pushes it back into the
 * top bar, the info table and the item table as one batch. The oracles: the info table's
 * row, the item table's own student (its export identity), and a round trip back to the
 * first student that restores the item table's rows exactly.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS, tableData } from './support/app.js';

const SELECT = '#student-top-bar-selector-module-select';
const INFO_TABLE = '#student-top-bar .student-top-bar-info .tabulator';
const ITEM_TABLE = '#student-view-module .tabulator';

test.describe('MA student view – student selector', () => {
    test('a pick switches the info table and the item table to that student', async ({ page }) => {
        await gotoApp(page, '/ma/#student');
        await page
            .locator(`${ITEM_TABLE} .tabulator-row`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        const options = await page
            .locator(`${SELECT} option`)
            .evaluateAll((els) => els.map((e) => /** @type {HTMLOptionElement} */ (e).value));
        await expect(page.locator(SELECT)).toHaveValue(options[0]);
        const itemTableStudent = () =>
            page
                .locator(ITEM_TABLE)
                .evaluate((el) =>
                    /** @type {{getExportIdentity(): unknown} | null} */ (
                        el.closest('tba-ma-student-data-table')
                    )?.getExportIdentity(),
                );
        const itemRows = async () => JSON.stringify(await tableData(page, ITEM_TABLE));
        const firstStudentRows = await itemRows();

        await page.selectOption(SELECT, options[1]);

        await expect
            .poll(async () => (await tableData(page, INFO_TABLE))[0]?.studentId, {
                timeout: LOAD_TIMEOUT_MS,
            })
            .toBe(options[1]);
        await expect.poll(itemTableStudent).toBe(options[1]);
        await expect(page.locator(SELECT)).toHaveValue(options[1]);
        // The two students' rows differ, so the way back below can tell a re-read
        // from rows left standing.
        await expect.poll(itemRows).not.toBe(firstStudentRows);

        await page.selectOption(SELECT, options[0]);

        await expect.poll(itemTableStudent).toBe(options[0]);
        await expect.poll(itemRows).toBe(firstStudentRows);
    });
});
