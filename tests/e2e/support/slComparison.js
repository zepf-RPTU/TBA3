/**
 * Shared helpers for the SL Gruppenvergleich specs.
 */

/**
 * The strip's select a label names. The wrapping `<label>` names the select, and its
 * accessible name goes on with the selected option, so the label is matched as a prefix.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {import('@playwright/test').Locator}
 */
export const selectFor = (page, label) =>
    page.locator('.group-comparison-controls').getByLabel(new RegExp(`^${label}`));
