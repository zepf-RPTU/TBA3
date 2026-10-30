/**
 * The export cart's DOM contract: the `.module-container` card, the `batch-select`
 * checkbox, the `tba3-export-images` image store and the toolbar's export trigger.
 *
 * The locator helpers are free functions; everything that needs a page or has to choose
 * between tapping and clicking comes off `exportCart(page)`.
 */

import { expect } from './test.js';
import { LOAD_TIMEOUT_MS } from './app.js';

/** @typedef {ReturnType<typeof exportCart>} ExportCart */

const BATCH_SELECT = '[data-header-action-button="batch-select"]';

/** Capture is asynchronous and goes through IndexedDB; the checkbox flips only after. */
export const CAPTURE_TIMEOUT_MS = 20_000;

/** The IndexedDB database the captured images are stored in. */
const IMAGE_STORE = 'tba3-export-images';

/**
 * The module card that contains `inner`.
 * @param {import('@playwright/test').Locator} inner - Anything inside the card.
 * @returns {import('@playwright/test').Locator} The enclosing `.module-container`.
 */
export const cardOf = (inner) =>
    inner.locator('xpath=ancestor-or-self::*[contains(@class,"module-container")][1]');

/**
 * The batch-export checkbox of a card. Some cards (chart hosts, overlay panels) *are* the
 * `.module-container`; for the rest, compose with `cardOf`.
 * @param {import('@playwright/test').Locator} card
 * @returns {import('@playwright/test').Locator}
 */
export const tickOf = (card) => card.locator(BATCH_SELECT).first();

/**
 * The report card showing one view.
 * @param {import('@playwright/test').Page} page
 * @param {string} viewLabel - The view's label in the card's meta line.
 * @returns {import('@playwright/test').Locator}
 */
export const reportCardFor = (page, viewLabel) =>
    page
        .locator('.report-card')
        .filter({ has: page.locator('.report-card-meta', { hasText: viewLabel }) });

/**
 * Assert where a card stands in a report of two cards: the first card's "up" and the
 * last card's "down" are the `aria-disabled` ones. The DOM order is not the report order, the
 * layout places each card.
 * @param {import('@playwright/test').Locator} card
 * @param {'first'|'last'} place
 */
export async function expectReportPlace(card, place) {
    const up = card.locator('[data-report-card-action="up"]');
    const down = card.locator('[data-report-card-action="down"]');
    await expect(place === 'first' ? up : down).toHaveAttribute('aria-disabled', 'true');
    await expect(place === 'first' ? down : up).not.toHaveAttribute('aria-disabled');
}

/**
 * The cart verbs, bound to one page.
 *
 * `touch: true` taps instead of clicking: a Playwright `.click()` hovers first, which
 * reveals a hover-gated affordance a touch test must reach without hovering. It needs a
 * context with `test.use(TABLET)` (./test.js).
 * @param {import('@playwright/test').Page} page
 * @param {{ touch?: boolean }} [options]
 */
export function exportCart(page, { touch = false } = {}) {
    const hit = (/** @type {import('@playwright/test').Locator} */ locator) =>
        touch ? locator.tap() : locator.click();

    /**
     * Tick a card and wait until its capture is stored.
     * @param {import('@playwright/test').Locator} card - The module card, not something inside it.
     */
    async function tick(card) {
        const checkbox = tickOf(card);
        await checkbox.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await hit(checkbox);
        await expect(checkbox).toHaveAttribute('aria-checked', 'true', {
            timeout: CAPTURE_TIMEOUT_MS,
        });
    }

    /**
     * Delete the stored images only; the cart in sessionStorage survives, which is what
     * an evicted image store looks like to the app.
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

    /**
     * Tick the first chart of the EN overview, which must be the current view.
     * @returns {Promise<import('@playwright/test').Locator>} The chart's svg.
     */
    async function tickOverviewChart() {
        const svg = page.locator('#en-overview-container svg').first();
        await svg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await tick(cardOf(svg));
        return svg;
    }

    /** Hit the batch toolbar's export button, which opens the report view. */
    async function toReport() {
        await hit(
            page.locator('.batch-export-toolbar').getByRole('button', { name: 'Bericht öffnen' }),
        );
        await expect(page).toHaveURL(/#report$/);
    }

    return { hit, tick, tickOverviewChart, dropImageStore, toReport };
}
