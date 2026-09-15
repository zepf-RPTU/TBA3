/**
 * The SL dashboard on the demo fixture, pinned against the scale-handling rework.
 *
 * An SL dataset is one German state's export, and the states do not share a
 * competence-level scale: `Ia…V`, `A1…C1`, `A1.1…B1.2`, `MiStd--…OptStd` and
 * `k.h.N., KS 1…KS 5` all occur. This spec keeps the fixture's numbers and views honest.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp } from './support/app.js';
import { collectErrors } from './support/pageErrors.js';
import { normalizeText, waitForSummaryRows } from './support/slSummary.js';

describe('SL demo fixture', () => {
    test('loads every routed view without a page error', async ({ page }) => {
        const { consoleErrors, pageErrors } = collectErrors(page);
        await gotoApp(page, '/sl/?class=sl');

        const buttons = page.locator('.sidebar-nav-button');
        const count = await buttons.count();
        expect(count).toBeGreaterThan(0);

        for (let index = 0; index < count; index++) {
            await buttons.nth(index).click();
            await page.waitForTimeout(400);
        }

        expect(pageErrors, 'uncaught errors').toEqual([]);
        // No SL file is optional (info_boxes.json sits once in data/sl/ and a missing
        // one is a hard failure), so every failed sub-resource is a real defect.
        expect(consoleErrors, 'console errors').toEqual([]);
    });

    test('the Überblick numbers for the demo fixture are unchanged by the rework', async ({
        page,
    }) => {
        // The fixture's GER levels gained explicit standard names so the metric reads
        // them from the data instead of a hardcoded rank table. Both resolve to the same
        // level sets — {III,IV,V} ∪ {B1,B2,C1} — so every number must be identical.
        await gotoApp(page, '/sl/?class=sl');
        await waitForSummaryRows(page);

        const rows = await page
            .locator('.sl-summary-view .summary-row-card')
            .evaluateAll((cards) =>
                cards.map((card) => [
                    card.querySelector('.content-module-title')?.textContent?.trim(),
                    card.querySelector('.school-value')?.textContent?.trim(),
                ]),
            );

        expect(
            Object.fromEntries(
                rows.map(([title, value]) => [normalizeText(title), normalizeText(value)]),
            ),
        ).toEqual({
            'Deutsch: Rechtschreibung': '78 %',
            'Deutsch: Leseverstehen': '70 %',
            'Englisch: Hörverstehen': '52 %',
            'Englisch: Leseverstehen': '43 %',
            Mathematik: '38 %',
            // Französisch was never absent from the fixture — only from the view, via a
            // hardcoded exclusion list removed 2026-08-12. Its arrival must not disturb
            // any number above.
            'Französisch: Hörverstehen': '73 %',
            'Französisch: Leseverstehen': '56 %',
        });
    });
});
