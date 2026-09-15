/**
 * The export cart's DOM contract, in one place.
 *
 * Ticking a module for the cross-view export is the same four steps everywhere — find the
 * card, find its checkbox, hit it, wait for the asynchronous capture — and the report,
 * module-export and touch specs all did it by hand. They pin the same markup, so they share
 * it from here: the `.module-container` card, the `batch-select` checkbox, the
 * `tba3-export-images` image store and the toolbar's export trigger.
 *
 * The locator helpers are free functions; everything that needs a page or has to choose
 * between tapping and clicking comes off `exportCart(page)`.
 */

import { expect } from './test.js';
import { gotoApp, LOAD_TIMEOUT } from './app.js';

/** The batch-export checkbox inside a module card's header. */
const BATCH_SELECT = '[data-header-action-button="batch-select"]';

/** Capture is asynchronous and goes through IndexedDB; the checkbox flips only after. */
export const CAPTURE_TIMEOUT = 20_000;

/** The IndexedDB database the captured images are stored in. */
const IMAGE_STORE = 'tba3-export-images';

/**
 * The module card that contains `inner`.
 * @param {import('playwright').Locator} inner - Anything inside the card.
 * @returns {import('playwright').Locator} The enclosing `.module-container`.
 */
export const cardOf = (inner) =>
    inner.locator('xpath=ancestor::*[contains(@class,"module-container")][1]');

/**
 * The batch-export checkbox of a card. Some cards (chart hosts, overlay panels) *are* the
 * `.module-container`; for the rest, compose with `cardOf`.
 * @param {import('playwright').Locator} card - The module card.
 * @returns {import('playwright').Locator} Its checkbox.
 */
export const tickOf = (card) => card.locator(BATCH_SELECT).first();

/**
 * The cart verbs, bound to one page.
 *
 * `touch: true` taps instead of clicking: a Playwright `.click()` hovers first, which on a
 * hover-gated affordance quietly does the very thing a touch test is trying to prove
 * impossible. It needs a context with `test.override('touchDevice', true)`.
 * @param {import('playwright').Page} page - The page.
 * @param {{ touch?: boolean }} [options] - Activation mode.
 * @returns {object} The cart verbs.
 */
export function exportCart(page, { touch = false } = {}) {
    const hit = (locator) => (touch ? locator.tap() : locator.click());

    /**
     * Tick a card and wait until its capture is stored.
     * @param {import('playwright').Locator} card - The module card, not something inside it.
     */
    async function tick(card) {
        const checkbox = tickOf(card);
        await checkbox.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await hit(checkbox);
        await expect(checkbox).toHaveAttribute('aria-checked', 'true', {
            timeout: CAPTURE_TIMEOUT,
        });
    }

    /**
     * Delete the stored images and nothing else — the cart in localStorage survives. On its
     * own this is what an evicted image store looks like to the app.
     */
    async function dropImageStore() {
        await page.evaluate(
            (name) =>
                new Promise((resolve) => {
                    const request = indexedDB.deleteDatabase(name);
                    request.onsuccess =
                        request.onerror =
                        request.onblocked =
                            () => resolve(undefined);
                }),
            IMAGE_STORE,
        );
    }

    /** Throw away whatever an earlier run left in the cart, then reload. */
    async function empty() {
        await page.evaluate(() => localStorage.clear());
        await dropImageStore();
        await page.reload({ timeout: LOAD_TIMEOUT });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT });
    }

    /**
     * Open a dashboard with an empty cart and an empty image store.
     * @param {string} path - App path with optional query, e.g. `/en/` or `/en/?class=8a_mid`.
     */
    async function open(path) {
        await gotoApp(page, path);
        await empty();
    }

    /** Hit the batch toolbar's export button, which opens the report view. */
    async function toReport() {
        await hit(page.locator('[data-batch-export-action="export"]'));
        await expect(page).toHaveURL(/#report$/);
    }

    return { tick, dropImageStore, empty, open, toReport };
}
