/**
 * The MA dashboard renders the competence scale in the data, not a compiled-in one.
 *
 * The module was built against the VERA-3 fixtures, whose scale is the roman `I…V` and
 * whose payload carries no cut scores — both were compiled into the code. VERA-8
 * exports break each of those assumptions (band vocabularies differ across the states,
 * cut scores come in the payload). This spec keeps the fixture honest.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const CLASS_TABLE = '#ma-class-table';

// classId → the band labels the fixture publishes.
const CLASSES = [{ id: '3a_mid', scale: ['I', 'II', 'III', 'IV', 'V'] }];

async function openClassView(page, classId) {
    await gotoApp(page, `/ma/?class=${classId}`);
    await expect(page.locator('.dashboard-bootstrap-error')).toHaveCount(0);
    await page.locator('#combinedViewButton').click();
    await page
        .locator(`${CLASS_TABLE} .tabulator-row`)
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
}

for (const { id, scale } of CLASSES) {
    test(`${id}: every Kompetenzstufe shown belongs to the scale in the data`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));

        await openClassView(page, id);
        const shown = await page.$$eval(
            `${CLASS_TABLE} .tabulator-row .tabulator-cell[tabulator-field="ks"]`,
            (cells) => [...new Set(cells.map((c) => c.textContent.trim()).filter(Boolean))],
        );

        expect(shown.length).toBeGreaterThan(0);
        // A label off this scale means the module fell back to a compiled-in vocabulary.
        expect(shown.filter((label) => !scale.includes(label))).toEqual([]);
        expect(errors).toEqual([]);
    });
}
