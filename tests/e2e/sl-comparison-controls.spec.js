/**
 * E2E test: SL Gruppenvergleich — the selectors and the drawn comparison agree.
 *
 * The chart keeps its selection in one reactive state, and `setState` skips notifying
 * when every key compares equal. Were a Kategorie change to write a second copy of the
 * selection directly, the reactive one would go stale, and the next selection matching
 * the stale copy would be dropped as "no change": the select would show the new Gruppe
 * while the chart still drew the old one.
 *
 * The oracle is the wing-header labels, which name the two groups the chart drew.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { selectFor } from './support/slComparison.js';
import { waitForSettled } from './support/settle.js';
import { required } from '../../packages/modules/test/support/required.js';

const CONTROLS = '.group-comparison-controls select';

/**
 * The two group names the chart has drawn in its wing headers, left group first,
 * without the `n = …` line under each name.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The left and right group labels.
 */
function drawnGroups(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('.wing-header-name')].map((node) => node.textContent ?? ''),
    );
}

/**
 * Change one selector and wait for the chart to settle: equal reads of the labels could
 * still be the previous pair, read before the redraw started.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @param {string} value
 * @returns {Promise<string[]>} The group labels once the page is still.
 */
async function choose(page, label, value) {
    await selectFor(page, label).selectOption(value);
    await waitForSettled(page);
    return drawnGroups(page);
}

/** @param {import('@playwright/test').Page} page */
async function openComparison(page) {
    await gotoApp(page, '/sl/#comparison');
    await page.waitForSelector(CONTROLS, { timeout: LOAD_TIMEOUT_MS });
    await page
        .locator('.wing-header-name')
        .first()
        .waitFor({ state: 'attached', timeout: LOAD_TIMEOUT_MS });
}

test.describe('SL Gruppenvergleich controls', () => {
    test('draws the Gruppe the selector names, even after a Kategorie round-trip', async ({
        page,
    }) => {
        await openComparison(page);

        // The Kategorie hop below is what would desync a second state copy; without it
        // the same final selection redraws fine.
        await choose(page, 'Kategorie', 'gender');

        const genders = await selectFor(page, 'Gruppe 1').evaluate(
            (/** @type {HTMLSelectElement} */ select) =>
                [...select.options].map((option) => option.value),
        );
        const initialGroup1 = await selectFor(page, 'Gruppe 1').inputValue();
        const otherGroup = genders.find((value) => value !== initialGroup1);
        expect(otherGroup, 'the gender category must offer a second value to swap to').toBeTruthy();
        const swapTo = required(otherGroup);

        // Swap, so the reactive state holds the swapped pair.
        const swapped = await choose(page, 'Gruppe 1', swapTo);
        expect(swapped[0]).not.toBe((await choose(page, 'Gruppe 1', initialGroup1))[0]);

        // Back on the swapped pair for the round-trip below.
        await choose(page, 'Gruppe 1', swapTo);

        // Both hops reset the groups, the write that would leave a second copy stale.
        await choose(page, 'Kategorie', 'group');
        const afterRoundTrip = await choose(page, 'Kategorie', 'gender');

        // The reset restored the default pair, so this is a real change of Gruppe 1, to
        // the value a stale copy would still hold.
        const afterReselect = await choose(page, 'Gruppe 1', swapTo);

        expect(afterReselect).not.toEqual(afterRoundTrip);
        expect(await selectFor(page, 'Gruppe 1').inputValue()).toBe(otherGroup);
        expect(afterReselect[0]).toBe(swapped[0]);
    });

    test('a Kategorie round-trip returns the exact comparison it started from', async ({
        page,
    }) => {
        await openComparison(page);

        const start = await choose(page, 'Kategorie', 'gender');
        expect(start).toHaveLength(2);

        // The hop must redraw, or a Kategorie switch that does nothing would pass.
        expect(await choose(page, 'Kategorie', 'group')).not.toEqual(start);
        const back = await choose(page, 'Kategorie', 'gender');

        expect(back).toEqual(start);
    });
});
