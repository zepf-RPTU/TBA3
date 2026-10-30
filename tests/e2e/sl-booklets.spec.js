/**
 * E2E test: the SL views never set Lösungsquoten of different booklets side by side.
 *
 * The `sl-testhefte` fixture is the demo school with Deutsch, Englisch and Mathematik
 * split over two booklets and Französisch on one; a group sits one booklet for every
 * Domäne of a Fach, so each Domäne of a split Fach is mixed. Each view degrades in its
 * own way: the Überblick drops the Lösungsquote card of a mixed Domäne and says why, the
 * Material page notes it, and the Gruppenvergleich disables the Lösungsquote for a pair
 * on different booklets.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { selectFor } from './support/slComparison.js';

const DATASET = '/sl/?scope=schools/sl-testhefte';
const NOTE = /unterschiedliche Testhefte/;

test.describe('SL with several booklets per Fach', () => {
    test('the Überblick drops the Lösungsquote of a mixed Fach, saying why', async ({ page }) => {
        await gotoApp(page, `${DATASET}#summary`);
        await page.getByRole('combobox', { name: /^Kennzahl/ }).selectOption('solution_rate');

        // Deutsch and Englisch have two Domänen each, Mathematik one: five cards say why.
        // Französisch keeps its two cards, each with the school's Lösungsquote.
        const view = page.locator('.sl-summary-view');
        await expect(view.getByText(NOTE)).toHaveCount(5, { timeout: LOAD_TIMEOUT_MS });
        await expect(view.locator('.school-value')).toHaveCount(2);
    });

    test('the Material overview notes it', async ({ page }) => {
        await gotoApp(page, `${DATASET}#material`);

        await expect(page.locator('tba-sl-material-view')).toContainText(NOTE, {
            timeout: LOAD_TIMEOUT_MS,
        });
    });

    test('the Gruppenvergleich disables the Lösungsquote for groups on different booklets', async ({
        page,
    }) => {
        await gotoApp(page, `${DATASET}#comparison`);
        await page
            .locator('.group-comparison-controls select')
            .first()
            .waitFor({ timeout: LOAD_TIMEOUT_MS });
        const points = selectFor(page, 'Diagrammtyp').locator('option[value="points"]');

        // Deutsch: 8a sat the first booklet, 8c the second.
        await selectFor(page, 'Kategorie').selectOption('group');
        await selectFor(page, 'Gruppe 1').selectOption('8a');
        await selectFor(page, 'Gruppe 2').selectOption('8c');
        await expect(points).toHaveAttribute('disabled');

        // 8a and 8b sat the same one.
        await selectFor(page, 'Gruppe 2').selectOption('8b');
        await expect(points).not.toHaveAttribute('disabled');
    });
});
