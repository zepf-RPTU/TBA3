/**
 * Competence-level (Kompetenzstufe) color theme switching.
 *
 * Switches the whole competence-level palette through one
 * `data-competence-level-theme` attribute on <html>. The colors are generated per theme
 * by `competenceLevelColors` from the level scale in the loaded data. The chosen theme
 * is persisted to localStorage and re-applied before first render to avoid a color flash.
 */

import { DEFAULT_THEME_ID } from './colorRamp.js';
import { DATA_THEME_ID, hasDataColors } from './competenceLevelColors.js';
import { publishPaletteTokens } from './paletteTokens.js';
import { readStoredChoice, storeChoice } from './storedChoice.js';

/** The available competence-level color themes. */
const COMPETENCE_LEVEL_THEMES = Object.freeze([
    { id: DEFAULT_THEME_ID },
    { id: 'grayscale' },
    { id: DATA_THEME_ID },
]);

const STORAGE_KEY = 'tba3_competence_level_theme';

/**
 * @param {string} id
 * @returns {boolean} Whether `id` is a known theme.
 */
function isValidThemeId(id) {
    return COMPETENCE_LEVEL_THEMES.some((theme) => theme.id === id);
}

/**
 * Whether a theme can currently be applied: `Landesvorgabe` needs colors in the
 * payload (`hasDataColors`).
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string} id
 * @returns {boolean}
 */
function isThemeAvailable(palette, id) {
    if (!isValidThemeId(id)) return false;
    return id !== DATA_THEME_ID || hasDataColors(palette);
}

/**
 * The themes to offer right now, in `COMPETENCE_LEVEL_THEMES` order.
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette - The app's palette, whose loaded scale decides whether `Landesvorgabe` has colours.
 * @returns {Array<{id: string}>}
 */
export function getAvailableCompetenceLevelThemes(palette) {
    return COMPETENCE_LEVEL_THEMES.filter((theme) => isThemeAvailable(palette, theme.id));
}

/**
 * The currently active theme id, derived from the <html> attribute (falls back
 * to the default when unset or currently unavailable).
 *
 * A persisted `Landesvorgabe` is reported as `default` while the loaded group has no
 * data colors, but the attribute stays: the palette resolves it to the default ramp,
 * and the preference applies again when a group that carries colors is opened.
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @returns {string}
 */
export function getActiveCompetenceLevelTheme(palette) {
    const current = document.documentElement.dataset.competenceLevelTheme;
    return current && isThemeAvailable(palette, current) ? current : DEFAULT_THEME_ID;
}

/**
 * Apply a competence-level color theme: set the <html> attribute, persist the choice and republish
 * the computed palette tokens; the page repaints through the cascade.
 * @param {string} id - One of COMPETENCE_LEVEL_THEMES ids
 * @returns {string} The applied theme id (default when `id` is unknown)
 */
export function applyCompetenceLevelTheme(id) {
    const themeId = isValidThemeId(id) ? id : DEFAULT_THEME_ID;

    document.documentElement.dataset.competenceLevelTheme = themeId;
    storeChoice(STORAGE_KEY, themeId);
    publishPaletteTokens();
    return themeId;
}

/**
 * Apply the persisted theme to <html> before the dashboard renders.
 * Call once during bootstrap, ahead of app initialization.
 */
export function initCompetenceLevelThemeFromStorage() {
    document.documentElement.dataset.competenceLevelTheme = readStoredChoice(
        STORAGE_KEY,
        COMPETENCE_LEVEL_THEMES,
        DEFAULT_THEME_ID,
    );
}
