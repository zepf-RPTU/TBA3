/**
 * Light / dark surface switching.
 *
 * One `data-color-scheme` attribute on <html> sets its `color-scheme`, and every
 * surface, ink and chart colour follows: each token is a `light-dark()` pair, the
 * computed palette tokens (`paletteTokens.js`) too. The preference is one of `system`,
 * `light`, `dark`; the attribute always carries the resolved scheme. `system` follows
 * `prefers-color-scheme` live. The preference in effect is per page: localStorage,
 * shared by every tab, only seeds the next page load.
 *
 * A switch snaps: colour transitions are off for the frame it lands in (`data-scheme-switching`,
 * `interactive.css`), the `disableTransitionOnChange` pattern of next-themes.
 *
 * `public/color-scheme-boot.js` stamps the attribute before the first paint with the
 * same key, ids and resolution; keep the two in step.
 */

import { readStoredChoice, storeChoice } from './storedChoice.js';

/** The preference choices, in display order. */
export const COLOR_SCHEMES = Object.freeze([
    { id: 'system', icon: 'brightness_auto' },
    { id: 'light', icon: 'light_mode' },
    { id: 'dark', icon: 'dark_mode' },
]);

const DEFAULT_SCHEME_ID = 'system';
const STORAGE_KEY = 'tba3_color_scheme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

// The preference this page applied. Not re-read from localStorage: another tab may
// have written a different one there since.
let activeSchemeId = DEFAULT_SCHEME_ID;

/**
 * @param {string} id - A scheme id.
 * @returns {boolean} Whether `id` is one of `COLOR_SCHEMES`.
 */
function isValidSchemeId(id) {
    return COLOR_SCHEMES.some((scheme) => scheme.id === id);
}

/**
 * The OS preference, read live.
 * @returns {boolean} True when the OS asks for a dark scheme.
 */
function prefersDark() {
    return window.matchMedia(DARK_QUERY).matches;
}

/**
 * @param {string} id - A stored preference.
 * @returns {'light' | 'dark'} The scheme that preference resolves to right now.
 */
function resolveScheme(id) {
    if (id === 'light' || id === 'dark') return id;
    return prefersDark() ? 'dark' : 'light';
}

/**
 * Stamp the resolved scheme on <html>.
 * @param {string} id
 */
function stampScheme(id) {
    activeSchemeId = id;
    document.documentElement.dataset.colorScheme = resolveScheme(id);
}

/**
 * Stamp the scheme with transitions off, so every surface lands on the new scheme in
 * one frame instead of fading one by one. Every token, the published palette ones
 * included, is a `light-dark()` pair, so the stamp alone repaints.
 * @param {string} id
 */
function switchScheme(id) {
    const root = document.documentElement;
    root.dataset.schemeSwitching = '';
    stampScheme(id);
    // Flush styles while transitions are off, so the new colours are the start values
    // when they come back on.
    void getComputedStyle(root).color;
    requestAnimationFrame(() => delete root.dataset.schemeSwitching);
}

/**
 * The preference in effect: what the user chose, not what it resolved to.
 * @returns {string} One of `COLOR_SCHEMES` ids.
 */
export function getActiveColorScheme() {
    return activeSchemeId;
}

/**
 * Apply a scheme preference: stamp the resolved scheme on <html> and persist the
 * choice; the page repaints through the cascade.
 * @param {string} id - One of `COLOR_SCHEMES` ids.
 * @returns {string} The applied preference id (`system` when `id` is unknown).
 */
export function applyColorScheme(id) {
    const schemeId = isValidSchemeId(id) ? id : DEFAULT_SCHEME_ID;
    storeChoice(STORAGE_KEY, schemeId);
    switchScheme(schemeId);
    return schemeId;
}

/**
 * Apply the persisted preference before the dashboard renders, and start following
 * the OS preference for as long as `system` is chosen. Call once during bootstrap;
 * the app keeps the returned disposer for its teardown.
 * @returns {() => void} Stops following the OS preference.
 */
export function initColorScheme() {
    stampScheme(readStoredChoice(STORAGE_KEY, COLOR_SCHEMES, DEFAULT_SCHEME_ID));

    const listener = new AbortController();
    window.matchMedia(DARK_QUERY).addEventListener(
        'change',
        () => {
            if (activeSchemeId !== 'system') return;
            switchScheme('system');
        },
        { signal: listener.signal },
    );
    return () => listener.abort();
}
