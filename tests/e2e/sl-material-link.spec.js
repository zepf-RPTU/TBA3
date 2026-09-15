/**
 * E2E test: an info-box material link carries the reader to the material view.
 *
 * The link builder reaches its two dependencies — `appState` (where the Fach and Typ
 * selection is written) and `onNavigate` (which switches the view) — through the info
 * box's option bundle, two levels below the view that owns them:
 * SL view → InfoBoxModule → `createMaterialSectionLinksFromToken`. Nothing else pins
 * that chain, and a bundle that stops forwarding one of them is a regression that no
 * unit test can see.
 *
 * Both halves are asserted separately: the navigation (`onNavigate`) and the selection
 * the material header comes up on (`appState.updateState`, read back by the header
 * controls' `injectState` as that view renders — which is why the write has to happen
 * before the navigation).
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

/**
 * The Typ the material header falls back to when state names none
 * (`slHeaderControls.js`). A link naming *this* Typ could not tell "the link's selection
 * was applied" apart from "the header came up on its own default", so the test insists
 * on a link that names something else.
 */
const DEFAULT_MATERIAL_TYPE = 'Übersicht';

describe('SL info-box material link', () => {
    test('navigates to the material view and selects the Fach and Typ it names', async ({
        page,
    }) => {
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(String(error)));

        await gotoApp(page, '/sl/');

        // Klassen & Fächer carries more than one material link, so one of them names a
        // non-default Typ; the Willkommen box only ever offers the default one.
        await page.locator('#overviewViewButton').click();
        const links = page.locator('.info-box-link-list button:not([disabled])');
        await expect(links.first()).toBeVisible({ timeout: LOAD_TIMEOUT });

        // "<Typ>: <Fach> im Material anzeigen" — the label states what the link promises.
        const labels = await links.allInnerTexts();
        const parsed = labels
            .map((label) => label.match(/^(.+?):\s*(.+?)\s+im Material/))
            .map((match, index) => match && { index, type: match[1], subject: match[2] })
            .filter(Boolean);
        const target = parsed.find((link) => link.type !== DEFAULT_MATERIAL_TYPE);
        expect(
            target,
            `a link naming a non-default Typ, from ${JSON.stringify(labels)}`,
        ).toBeTruthy();

        await links.nth(target.index).click();

        // Half one: it navigated.
        await expect(page.locator('.sl-material-view')).toBeVisible({ timeout: LOAD_TIMEOUT });
        await expect(page).toHaveURL(/#material$/);

        // Half two: the selection reached state before that view's header rendered, so
        // the header came up on the link's Typ rather than on its own default.
        const selected = page.locator('.header-module-button-group button[aria-pressed="true"]');
        await expect(selected).toHaveCount(2, { timeout: LOAD_TIMEOUT });
        await expect(selected).toHaveText([target.type, target.subject]);

        expect(pageErrors, 'no page errors').toEqual([]);
    });
});
