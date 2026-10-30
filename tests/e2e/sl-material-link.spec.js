/**
 * E2E test: an info-box material link carries the reader to the material view.
 *
 * The link reaches the app through one callback, `onOpenMaterial`, which the SL view
 * builds from its own `navigate()` and hands the info box: SL view → InfoBoxModule →
 * `createMaterialSectionLinks`. No unit test sees a view that stops forwarding it.
 *
 * Both halves of the handler are asserted: the navigation, and the selection the
 * material header comes up on (the navigation's `statePatch`, read back by the header
 * controls' `injectState` as that view renders, so the write has to precede the
 * navigation).
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { assertNoPageErrors, collectErrors } from './support/pageErrors.js';
import { required } from '../../packages/modules/test/support/required.js';

/**
 * The Fach the material header falls back to when state names none: the fixture's first
 * (`slHeaderControls.js`). A link naming this Fach could not tell "the link's selection
 * was applied" apart from "the header came up on its own default", so the test needs a
 * link that names another.
 */
const DEFAULT_MATERIAL_SUBJECT = 'Deutsch';

test.describe('SL info-box material link', () => {
    test('navigates to the material view and selects the Fach and Typ it names', async ({
        page,
    }) => {
        const { pageErrors } = collectErrors(page);

        // The box's last section links the school's weakest Fach, which is not the
        // fixture's first; its opening section only names a page the material lacks.
        await gotoApp(page, '/sl/#details');
        await page.locator('.info-box-section-btn').last().click();
        const links = page.locator('.info-box-link-list button:not([aria-disabled="true"])');
        await expect(links.first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

        // "<Typ>: <Fach> im Material anzeigen" — the label states what the link promises.
        const labels = await links.allInnerTexts();
        // `filter(Boolean)` drops the labels that did not parse.
        const parsed = /** @type {Array<{index: number, type: string, subject: string}>} */ (
            labels
                .map((label) => label.match(/^(.+?):\s*(.+?)\s+im Material/))
                .map((match, index) => match && { index, type: match[1], subject: match[2] })
                .filter(Boolean)
        );
        const target = parsed.find((link) => link.subject !== DEFAULT_MATERIAL_SUBJECT);
        expect(
            target,
            `a link naming a non-default Fach, from ${JSON.stringify(labels)}`,
        ).toBeTruthy();

        const link = required(target);
        await links.nth(link.index).click();

        await expect(page.locator('tba-sl-material-view')).toBeVisible({
            timeout: LOAD_TIMEOUT_MS,
        });
        await expect(page).toHaveURL(/#material$/);

        // The selection reached state before that view's header rendered, so the header
        // came up on the link's Fach rather than on its own default.
        const selected = page.locator(
            '#sl-shared-header-type-select button[aria-pressed="true"], #sl-shared-header-subject-select button[aria-pressed="true"]',
        );
        await expect(selected).toHaveCount(2, { timeout: LOAD_TIMEOUT_MS });
        await expect(selected).toHaveText([link.type, link.subject]);

        assertNoPageErrors(pageErrors);
    });
});
