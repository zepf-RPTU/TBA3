/**
 * E2E test: SL Gruppenvergleich — the selectors and the drawn comparison agree.
 *
 * This is the comparison view's first automated coverage of any kind: before this
 * spec, `groupComparisonControlModel.test.js` covered the pure decision helpers and
 * nothing exercised the chart, the control strip, or the view.
 *
 * What it pins is one class of bug rather than a rendering snapshot. The chart used
 * to keep its selection in two objects: `this.state` (written directly by
 * `resetGroupsForCategory`) and the reactive `_state` (written only through
 * `setState`, which skips notifying when every key compares equal). A Kategorie
 * change writes the first and not the second, so `_state` went stale — and the next
 * selection that happened to match the *stale* copy was dropped as "no change". The
 * select showed the new Gruppe while the chart still drew the old one, which is a
 * silent wrong answer, not a visible failure. The two objects are now one, so
 * "no change" means what it says.
 *
 * The oracle is the rendered x-axis labels, which name the two compared groups —
 * a semantic read of what the chart actually drew, not a re-render check.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const SETTLE_TIMEOUT = 5_000;

const CONTROLS = '.group-comparison-controls select';

const selectFor = (page, id) => page.locator(`[data-control-id="${id}"] select`).first();

/**
 * The two group names the chart has drawn, left group first. The `(n=…)` tspan that
 * follows each name is dropped — the counts move with the data, the names are what
 * the selectors chose.
 * @param {import('playwright').Page} page - The page under test.
 * @returns {Promise<string[]>} The left and right group labels.
 */
function drawnGroups(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('.left-x-label tspan, .right-x-label tspan')]
            .map((node) => node.textContent ?? '')
            .filter((text) => !/^\(n=/.test(text)),
    );
}

/**
 * Change one selector and wait for the chart to settle. Charts animate and the axis
 * labels relayout late, so settle on three consecutive equal reads rather than a
 * fixed delay.
 * @param {import('playwright').Page} page - The page under test.
 * @param {string} id - The control's `data-control-id`.
 * @param {string} value - The option value to select.
 * @returns {Promise<string[]>} The group labels once they stop moving.
 */
async function choose(page, id, value) {
    await selectFor(page, id).selectOption(value);

    let stable = 0;
    let last = null;
    await expect
        .poll(
            async () => {
                const current = JSON.stringify(await drawnGroups(page));
                stable = current === last ? stable + 1 : 0;
                last = current;
                return stable;
            },
            { timeout: SETTLE_TIMEOUT },
        )
        .toBeGreaterThanOrEqual(2);

    return drawnGroups(page);
}

async function openComparison(page) {
    await gotoApp(page, '/sl/');
    await page
        .locator('.sl-summary-view svg')
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await page.locator('#comparisonViewButton').click();
    await page.waitForSelector(CONTROLS, { timeout: LOAD_TIMEOUT });
    await page
        .locator('.left-x-label')
        .first()
        .waitFor({ state: 'attached', timeout: LOAD_TIMEOUT });
}

describe('SL Gruppenvergleich controls', () => {
    test('draws the Gruppe the selector names, even after a Kategorie round-trip', async ({
        page,
    }) => {
        await openComparison(page);

        // The Kategorie hop below is what desynced the two state objects; without it
        // the same final selection redraws fine, which is why this needs the full
        // sequence rather than a single change.
        await choose(page, 'category', 'gender');

        const genders = await selectFor(page, 'group1').evaluate((select) =>
            [...select.options].map((option) => option.value),
        );
        const initialGroup1 = await selectFor(page, 'group1').inputValue();
        const otherGroup = genders.find((value) => value !== initialGroup1);
        expect(otherGroup, 'the gender category must offer a second value to swap to').toBeTruthy();

        // Swap, so the reactive half of the state holds the swapped pair.
        const swapped = await choose(page, 'group1', otherGroup);
        expect(swapped[0]).not.toBe((await choose(page, 'group1', initialGroup1))[0]);

        // Re-swap so we are back on the swapped pair for the round-trip below.
        await choose(page, 'group1', otherGroup);

        // Hop away and back. Both hops reset the groups by writing the selection
        // directly, which is what used to leave the reactive copy stale.
        await choose(page, 'category', 'class');
        const afterRoundTrip = await choose(page, 'category', 'gender');

        // The reset restored the default pair, so this is a real change of Gruppe 1 —
        // and it is exactly the value the stale copy still held.
        const afterReselect = await choose(page, 'group1', otherGroup);

        expect(afterReselect).not.toEqual(afterRoundTrip);
        expect(await selectFor(page, 'group1').inputValue()).toBe(otherGroup);
        // The drawn left group must be the one the selector names, not the one the
        // stale copy remembered.
        expect(afterReselect[0]).toBe(swapped[0]);
    });

    test('a Kategorie round-trip returns the exact comparison it started from', async ({
        page,
    }) => {
        await openComparison(page);

        const start = await choose(page, 'category', 'gender');
        expect(start).toHaveLength(2);

        await choose(page, 'category', 'class');
        const back = await choose(page, 'category', 'gender');

        expect(back).toEqual(start);
    });
});
