/**
 * The header's mode switch (modeSwitchModule.js): one button per mode, the active one
 * `aria-pressed` and `aria-disabled`, still focusable.
 */

import { LOAD_TIMEOUT_MS } from './app.js';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} mode - The button's `data-mode`.
 * @returns {import('@playwright/test').Locator} The first mode-switch button for it.
 */
export const modeButton = (page, mode) => page.locator(`.mode-button[data-mode="${mode}"]`).first();

/**
 * Switch to a mode; a no-op when it is already the active one.
 * @param {import('@playwright/test').Page} page
 * @param {string} mode - The button's `data-mode`.
 */
export async function selectMode(page, mode) {
    const button = modeButton(page, mode);
    await button.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
}
