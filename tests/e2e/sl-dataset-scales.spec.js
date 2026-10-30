/**
 * The SL dashboard on the demo fixture.
 *
 * An SL dataset is one German state's export, and the states do not share a
 * competence-level scale: `Ia…V`, `A1…C1`, `A1.1…B1.2`, `MiStd--…OptStd` and
 * `k.h.N., KS 1…KS 5` all occur. This spec keeps the fixture's numbers honest.
 */

import { test, expect } from './support/test.js';
import { gotoApp } from './support/app.js';
import { SUMMARY_ROW } from './support/slCompetenceChart.js';
import { normalizeText, waitForSummaryRows } from './support/slSummary.js';

test.describe('SL demo fixture', () => {
    test('the Überblick numbers for the demo fixture', async ({ page }) => {
        // The metric reads the fixture's standard names from the data; they resolve to
        // the level sets {III,IV,V} ∪ {B1,B2,C1}.
        await gotoApp(page, '/sl/?scope=schools/sl');
        await waitForSummaryRows(page);

        const rows = await page
            .locator(SUMMARY_ROW)
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
            'Deutsch: Orthografie': '78 %',
            'Deutsch: Lesen': '70 %',
            'Englisch: Hören': '52 %',
            'Englisch: Lesen': '43 %',
            Mathematik: '38 %',
            'Französisch: Hören': '73 %',
            'Französisch: Lesen': '56 %',
        });
    });

    test('each card title links its Domäne to the entry of its own Fach', async ({ page }) => {
        // `Lesen` is a Domäne of Deutsch, Englisch and Französisch: the title must link
        // the entry its Fach's Domäne id names, and leave the Fach plain.
        await gotoApp(page, '/sl/?scope=schools/sl');
        await waitForSummaryRows(page);

        const terms = await page.locator(SUMMARY_ROW).evaluateAll((cards) =>
            cards.map((card) => {
                const title = card.querySelector('.content-module-title');
                return {
                    text: title?.textContent?.trim(),
                    keys: [...(title?.querySelectorAll('[data-glossary-key]') ?? [])].map(
                        (term) => [term.textContent, term.getAttribute('data-glossary-key')],
                    ),
                };
            }),
        );

        expect(
            Object.fromEntries(terms.map(({ text, keys }) => [normalizeText(text), keys])),
        ).toEqual({
            'Deutsch: Orthografie': [['Orthografie', 'orthografie']],
            'Deutsch: Lesen': [['Lesen', 'lesen']],
            'Englisch: Hören': [['Hören', 'hörverstehen']],
            'Englisch: Lesen': [['Lesen', 'leseverstehen']],
            Mathematik: [],
            'Französisch: Hören': [['Hören', 'hörverstehen']],
            'Französisch: Lesen': [['Lesen', 'leseverstehen']],
        });
    });
});
