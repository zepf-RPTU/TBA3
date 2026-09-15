/**
 * E2E test: EN item detail panel — solver / non-solver student grid.
 *
 * The panel shows the smaller of the two student groups by default and offers a
 * toggle (with counts) to the other one. Each name is a button that navigates to
 * the student view with that student selected.
 *
 * The navigation half is the reason this spec exists: the click writes
 * `currentStudentId` and navigates, and an *already visited* student view only
 * picks the change up through its suspended state observer, delivered on resume.
 * The test therefore visits the student view first, so the cold-start path
 * cannot mask a broken resume path.
 *
 * Selection is driven by clicking the plain "Aufgabe" (exercise name) cell — the
 * same approach as en-item-detail-tabs.spec.js — so the click toggles Tabulator
 * row selection without triggering the item-number preview overlay.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const UI_TIMEOUT = 5_000;

const NAME_CELL = '.tabulator-cell[tabulator-field="exercise.name"]';

describe('EN item detail – student group grid', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/');

        // Visit the student view once so the later navigation exercises the
        // suspended-view resume path rather than a first-time render.
        await page.locator('#studentViewButton').click();
        await page
            .locator('select.header-module-student-select')
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        await page.locator('#itemViewButton').click();
        await page
            .locator('#item-table .tabulator-row')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    });

    test('toggles between the two groups and navigates to a clicked student', async ({ page }) => {
        const panel = page.locator('.en-item-view .item-detail-content');
        const groupButtons = panel.locator('.item-detail-group-button');
        const activeGroup = panel.locator('.item-detail-group-button[aria-pressed="true"]');
        const names = panel.locator('.detail-student-name');

        // Select an item → both group buttons appear, exactly one is pressed
        await page.locator('#item-table .tabulator-row').first().locator(NAME_CELL).click();
        await expect(groupButtons).toHaveCount(2, { timeout: UI_TIMEOUT });
        await expect(activeGroup).toHaveCount(1);

        // Labels carry the group sizes, e.g. "gelöst (24)"
        await expect(groupButtons.first()).toHaveText(/gelöst \(\d+\)/);

        // Two oracles, because either alone is passable by a broken switch: the pressed
        // group must actually flip, and the rendered list must be exactly as long as the
        // pressed button says it is. "The names changed" would pass for any wrong list.
        const activeGroupName = () => activeGroup.getAttribute('data-group');
        const renderedCountMatchesLabel = async () => {
            const label = (await activeGroup.textContent()) ?? '';
            const expected = Number(label.match(/\((\d+)\)/)?.[1] ?? -1);
            return expected >= 0 && (await names.count()) === expected;
        };

        const groupBefore = await activeGroupName();
        const namesBefore = (await names.allInnerTexts()).join('|');
        expect(groupBefore).toBeTruthy();
        await expect.poll(renderedCountMatchesLabel, { timeout: UI_TIMEOUT }).toBe(true);

        await panel.locator('.item-detail-group-button[aria-pressed="false"]').click();
        await expect(activeGroup).toHaveCount(1);
        await expect.poll(activeGroupName, { timeout: UI_TIMEOUT }).not.toBe(groupBefore);
        await expect.poll(renderedCountMatchesLabel, { timeout: UI_TIMEOUT }).toBe(true);

        // Back to the first group: the same group is pressed and the exact list returns.
        await panel.locator('.item-detail-group-button[aria-pressed="false"]').click();
        await expect.poll(activeGroupName, { timeout: UI_TIMEOUT }).toBe(groupBefore);
        await expect
            .poll(async () => (await names.allInnerTexts()).join('|'), { timeout: UI_TIMEOUT })
            .toBe(namesBefore);

        // Clicking a name navigates to the student view with that student selected
        const firstName = names.first();
        await firstName.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
        const studentId = await firstName.getAttribute('data-student-id');
        expect(studentId).toBeTruthy();

        await firstName.click();

        const studentSelect = page.locator('select.header-module-student-select');
        await studentSelect.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
        await expect(studentSelect).toHaveValue(studentId ?? '', { timeout: UI_TIMEOUT });
    });
});
