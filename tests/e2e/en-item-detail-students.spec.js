/**
 * E2E test: EN item detail panel — solver / non-solver student grid.
 *
 * The panel shows the smaller of the two student groups by default and offers a
 * toggle (with counts) to the other one. Each name is a button that navigates to
 * the student view with that student selected.
 *
 * The click writes `currentStudentId` and navigates, and an already visited student
 * view picks the change up only through its suspended state observer, delivered on
 * resume. The test visits the student view first, so the cold-start path cannot mask a
 * broken resume path.
 *
 * Rows are selected by clicking the plain "Aufgabe" (exercise name) cell, which toggles
 * Tabulator row selection without opening the item-number preview overlay.
 */

import { test, expect, REVEAL_TIMEOUT_MS } from './support/test.js';
import { clickNav, expectNamesOneStudent, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';

const NAME_CELL = '.tabulator-cell[tabulator-field="exerciseName"]';

test.describe('EN item detail – student group grid', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/#student');
        await page
            .locator('select.header-module-student-select')
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        await clickNav(page, '#itemViewButton');
        await page
            .locator('#item-table .tabulator-row')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    });

    test('toggles between the two groups and navigates to a clicked student', async ({ page }) => {
        const panel = page.locator('.en-item-view .item-detail-content');
        const groupButtons = panel.locator('.student-group-button');
        const activeGroup = panel.locator('.student-group-button[aria-pressed="true"]');
        const names = panel.locator('.detail-student-name');

        await page.locator('#item-table .tabulator-row').first().locator(NAME_CELL).click();
        await expect(groupButtons).toHaveCount(2);
        await expect(activeGroup).toHaveCount(1);

        await expect(groupButtons.first()).toHaveText(/gelöst \(\d+\)/);

        // Two oracles, because a broken switch passes either alone: the pressed group
        // flips, and the rendered list is as long as the pressed button says. "The names
        // changed" would pass for any wrong list.
        const activeGroupName = async () =>
            ((await activeGroup.textContent()) ?? '').replace(/\(\d+\)/, '').trim();
        const renderedCountMatchesLabel = async () => {
            const label = (await activeGroup.textContent()) ?? '';
            const expected = Number(label.match(/\((\d+)\)/)?.[1] ?? -1);
            return expected >= 0 && (await names.count()) === expected;
        };

        const groupBefore = await activeGroupName();
        const namesBefore = (await names.allInnerTexts()).join('|');
        expect(groupBefore).toBeTruthy();
        await expect.poll(renderedCountMatchesLabel).toBe(true);

        await panel.locator('.student-group-button[aria-pressed="false"]').click();
        await expect(activeGroup).toHaveCount(1);
        await expect.poll(activeGroupName).not.toBe(groupBefore);
        await expect.poll(renderedCountMatchesLabel).toBe(true);

        await panel.locator('.student-group-button[aria-pressed="false"]').click();
        await expect.poll(activeGroupName).toBe(groupBefore);
        await expect.poll(async () => (await names.allInnerTexts()).join('|')).toBe(namesBefore);

        const firstName = names.first();
        await firstName.waitFor({ state: 'visible', timeout: REVEAL_TIMEOUT_MS });
        const studentName = (await firstName.locator('span').first().textContent())?.trim();
        expect(studentName).toBeTruthy();

        await firstName.click();

        const studentSelect = page.locator('select.header-module-student-select');
        await studentSelect.waitFor({ state: 'visible', timeout: REVEAL_TIMEOUT_MS });
        await expectNamesOneStudent(studentSelect, studentName ?? '');
        await expect(studentSelect.locator('option:checked')).toHaveText(studentName ?? '');
    });
});
