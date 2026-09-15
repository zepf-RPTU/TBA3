/**
 * ksThemeService — Competence-level (Kompetenzstufe) color theme switching.
 *
 * Toggles the whole KS palette by setting a single `data-ks-theme` attribute on
 * <html>. The colors themselves are generated per theme by `competenceLevelColors`
 * from the level scale in the loaded data. The chosen theme is persisted to
 * localStorage and re-applied before first render to avoid a color flash.
 * @module ksThemeService
 */

import { invalidateThemeColorCache } from './themeService.js';
import { DATA_THEME_ID, hasDataColors } from './competenceLevelColors.js';
import { notifyPaletteRepaint } from './paletteRepaint.js';

/** Available KS color themes (German labels, shown in the sidebar settings). */
const KS_THEMES = Object.freeze([
    { id: 'default', label: 'Standard' },
    { id: 'grayscale', label: 'Graustufen' },
    { id: 'colorblind', label: 'Farbenblind-sicher' },
    { id: DATA_THEME_ID, label: 'Landesvorgabe' },
]);

const DEFAULT_THEME_ID = 'default';
const STORAGE_KEY = 'tba3_ks_theme';

/**
 * @param {string} id - A KS theme id.
 * @returns {boolean} Whether `id` is a known theme.
 */
function isValidThemeId(id) {
    return KS_THEMES.some((theme) => theme.id === id);
}

/**
 * Whether a theme can currently be applied. `Landesvorgabe` needs colors in the
 * payload — offering it against `"description": null` data would silently repeat
 * the default ramp under a name that promises the state's own palette.
 * @param {string} id - A KS theme id.
 * @returns {boolean} True when the theme can be applied now — `Landesvorgabe` needs colors in the loaded payload.
 */
function isThemeAvailable(id) {
    if (!isValidThemeId(id)) return false;
    return id !== DATA_THEME_ID || hasDataColors();
}

/**
 * The themes to offer right now, in `KS_THEMES` order.
 * @returns {Array<{id: string, label: string}>} The themes offerable right now, in declaration order.
 */
export function getAvailableKsThemes() {
    return KS_THEMES.filter((theme) => isThemeAvailable(theme.id));
}

/**
 * Read the persisted theme id, falling back to the default.
 * @returns {string} The persisted theme id, or the default when nothing valid is stored.
 */
function readStoredThemeId() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && isValidThemeId(stored)) {
            return stored;
        }
    } catch {
        // localStorage may be unavailable (private mode / disabled) — ignore.
    }
    return DEFAULT_THEME_ID;
}

/**
 * The currently active theme id, derived from the <html> attribute (falls back
 * to the default when unset or currently unavailable).
 *
 * A persisted `Landesvorgabe` is reported as `default` while the loaded class has no
 * data colors, but the attribute is deliberately left alone: the palette resolves it
 * to the default ramp anyway, and the preference comes back to life when a class that
 * does carry colors is opened.
 * @returns {string} The theme in effect; the default while a persisted one is unavailable.
 */
export function getActiveKsTheme() {
    const current = document.documentElement.dataset.ksTheme;
    return current && isThemeAvailable(current) ? current : DEFAULT_THEME_ID;
}

/**
 * Apply a KS color theme: set the <html> attribute, persist the choice, and
 * invalidate the theme-color cache so JS-baked chart colors re-read the new
 * palette on the next render.
 *
 * Does NOT trigger a re-render — the caller (app coordinator) rebuilds the
 * active view so charts that bake resolved colors pick up the change.
 * @param {string} id - One of KS_THEMES ids
 * @returns {string} The applied theme id (default when `id` is unknown)
 */
export function applyKsTheme(id) {
    const themeId = isValidThemeId(id) ? id : DEFAULT_THEME_ID;

    document.documentElement.dataset.ksTheme = themeId;

    try {
        localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
        // Persistence is best-effort; the attribute still applies for this session.
    }

    invalidateThemeColorCache();
    // Charts and tables redraw off onThemeChanged(), which only reaches the active view.
    // Whatever paints bands outside that tree is the host's to redraw.
    notifyPaletteRepaint();
    return themeId;
}

/**
 * Apply the persisted theme to <html> before the dashboard renders.
 * Call once during bootstrap, ahead of app initialization.
 */
export function initKsThemeFromStorage() {
    document.documentElement.dataset.ksTheme = readStoredThemeId();
}
