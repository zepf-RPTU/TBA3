/**
 * colorSchemeService — light / dark surface switching.
 *
 * The twin of `ksThemeService`: one `data-color-scheme` attribute on <html> selects
 * the token block in `src/styles/foundation/variables.css`, and every surface, ink
 * and chart-chrome colour follows through CSS `var()` or the next
 * `getThemeColors()` read. The stored preference is one of `system`, `light`, `dark`;
 * the attribute always carries the *resolved* scheme (`light` or `dark`), so CSS never
 * has to reason about the OS setting itself. `system` follows
 * `prefers-color-scheme` and tracks it live.
 *
 * The competence-level palette reads the same attribute (`competenceLevelColors.js`
 * resolves its ramps per scheme from `RAMP_STOPS` in `colorRamp.js`), so a switch
 * repaints data colours as well as chrome.
 * @module colorSchemeService
 */

import { invalidateThemeColorCache } from './themeService.js';
import { notifyPaletteRepaint } from './paletteRepaint.js';

/** The choices offered in the sidebar settings, in display order. */
export const COLOR_SCHEMES = Object.freeze([
    { id: 'system', label: 'System', icon: 'brightness_auto' },
    { id: 'light', label: 'Hell', icon: 'light_mode' },
    { id: 'dark', label: 'Dunkel', icon: 'dark_mode' },
]);

const DEFAULT_SCHEME_ID = 'system';
const STORAGE_KEY = 'tba3_color_scheme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * @param {string} id - A scheme id.
 * @returns {boolean} Whether `id` is one of `COLOR_SCHEMES`.
 */
function isValidSchemeId(id) {
    return COLOR_SCHEMES.some((scheme) => scheme.id === id);
}

/**
 * The OS preference, read live. False where `matchMedia` is unavailable (Node tests).
 * @returns {boolean} True when the OS asks for a dark scheme.
 */
function prefersDark() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
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
 * Read the persisted preference, falling back to `system`.
 * @returns {string} The persisted scheme id, or `system` when nothing valid is stored.
 */
function readStoredSchemeId() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && isValidSchemeId(stored)) return stored;
    } catch {
        // localStorage may be unavailable (private mode / disabled) — ignore.
    }
    return DEFAULT_SCHEME_ID;
}

/**
 * Stamp the resolved scheme on <html> and drop the JS-side colour cache.
 * @param {string} id - The chosen preference.
 */
function stampScheme(id) {
    document.documentElement.dataset.colorScheme = resolveScheme(id);
    invalidateThemeColorCache();
}

/**
 * The preference in effect: what the user chose, not what it resolved to.
 * @returns {string} One of `COLOR_SCHEMES` ids.
 */
export function getActiveColorScheme() {
    return readStoredSchemeId();
}

/**
 * Apply a scheme preference: stamp the resolved scheme on <html>, persist the choice
 * and invalidate the theme-colour cache so JS-baked chart colours re-read the tokens.
 *
 * Does NOT redraw — the caller (the sidebar, through the app coordinator's
 * `onThemeChanged`) refreshes the active view, exactly as after a KS theme switch.
 * @param {string} id - One of `COLOR_SCHEMES` ids.
 * @returns {string} The applied preference id (`system` when `id` is unknown).
 */
export function applyColorScheme(id) {
    const schemeId = isValidSchemeId(id) ? id : DEFAULT_SCHEME_ID;

    try {
        localStorage.setItem(STORAGE_KEY, schemeId);
    } catch {
        // Persistence is best-effort; the attribute still applies for this session.
    }

    stampScheme(schemeId);
    // Charts and tables redraw off onThemeChanged(), which only reaches the active view.
    // Whatever paints bands outside that tree is the host's to redraw.
    notifyPaletteRepaint();
    return schemeId;
}

/**
 * Apply the persisted preference before the dashboard renders, and start following
 * the OS preference for as long as `system` is chosen. Call once during bootstrap.
 * @param {() => void} onSystemChange - Runs after the OS preference flipped the resolved
 *   scheme; the caller redraws the active view. Ignored while an explicit scheme is chosen.
 */
export function initColorScheme(onSystemChange) {
    stampScheme(readStoredSchemeId());

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
        if (readStoredSchemeId() !== 'system') return;
        stampScheme('system');
        notifyPaletteRepaint();
        onSystemChange();
    });
}
