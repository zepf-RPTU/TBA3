/**
 * The colour each registered competence level is painted.
 *
 * Two themes are generated per scale (`getLevelColors`): the default ramp centred on
 * the scale's `medium` level, and the grayscale ramp sampled to its level count. The
 * third theme, `data`, uses the colors the state shipped in the payload and
 * is only offered when they are present and visible on the active colour scheme's
 * surface.
 *
 * Functions over an app's palette (`CompetenceLevelPalette`), which they read and never
 * write; kept out of the palette class so the registry stays free of d3
 * (`colorRamp.js`). The resolved paints are memoised on the palette (`memo`) per scheme
 * and theme, so a registration drops them.
 */

import {
    DEFAULT_THEME_ID,
    SURFACES,
    getLevelColors,
    inkOn,
    contrastWithSurface,
} from './colorRamp.js';

/** @typedef {import('./competenceScalePayload.js').CompetenceLevelEntry} CompetenceLevelEntry */
/** @typedef {import('./competenceLevelPalette.js').CompetenceLevelPalette} CompetenceLevelPalette */

/** Theme that paints from the colors shipped in the data payload. */
export const DATA_THEME_ID = 'data';

/**
 * Contrast a shipped data color must clear against the chart surface of the active
 * colour scheme to be used under the `data` theme; below it the level falls back to its
 * generated ramp color.
 *
 * Far below the 3:1 floor the generated ramps are validated against: shipped palettes
 * are light washes meant to sit behind black text, and the ramp floor would discard
 * most of a payload. The threshold only separates "invisible" from "light": a shipped
 * `#ffffff` is the light chart surface exactly (1.00:1) and falls back to the ramp.
 */
const MIN_SURFACE_CONTRAST = 1.1;

/** The colour scheme assumed when nothing is stamped on `<html>` (Node tests, first paint). */
const DEFAULT_SCHEME = 'light';

/**
 * How a level is painted: its fill, and the ink a label on that fill takes.
 * @typedef {{color: string, ink: string}} BandPaint
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Whether the loaded data shipped its own colors that are visible on the active colour
 * scheme's surface. Gates the `data` theme, which would otherwise repeat the default
 * ramp.
 * @param {CompetenceLevelPalette} palette
 * @returns {boolean}
 */
export function hasDataColors(palette) {
    const surface = SURFACES[readActiveScheme()];
    for (const entry of palette.getRegisteredLevels()) {
        if (entry.dataColor && isVisibleOn(entry.dataColor, surface)) return true;
    }
    return false;
}

/**
 * Fill and label ink for a competence level under the theme active on `<html>`.
 * @param {CompetenceLevelPalette} palette
 * @param {string|number|null|undefined} level
 * @param {string|undefined} scaleId - Which ladder `level` belongs to; see `getCompetenceLevelEntry`
 * @param {'light'|'dark'} scheme
 * @returns {BandPaint|null} Null when `level` is not a registered level.
 */
export function getBandPaint(palette, level, scaleId, scheme) {
    const entry = palette.getCompetenceLevelEntry(level, scaleId);
    if (!entry) return null;
    const paints = resolvePaints(palette, readActiveThemeId(), scheme);
    return paints.get(entry.scopedKey) ?? null;
}

/**
 * Every reporting level's hex color under a theme, keyed by the level's `nameShort`.
 * @param {CompetenceLevelPalette} palette
 * @param {string} themeId
 * @returns {{[level: string]: string}}
 */
export function getBandColorsByLevel(palette, themeId) {
    const paints = resolvePaints(palette, themeId, readActiveScheme());
    /** @type {{[level: string]: string}} */
    const byLevel = {};
    for (const entry of palette.getRegisteredLevels()) {
        // Reporting scales only: the map is keyed by bare name, so an item scale in it
        // would answer a student level's colour lookup with the item ladder's ramp.
        if (!palette.isReportingEntry(entry)) continue;
        const color = paints.get(entry.scopedKey)?.color;
        // Keyed by name, so two ladders sharing one name collapse to the last registered.
        // Callers that must tell them apart use `getBandPaint(palette, level, scaleId, scheme)`.
        if (color) byLevel[entry.name] = color;
    }
    return byLevel;
}

/**
 * The active competence-level theme, read from `<html>`, the attribute
 * `competenceLevelThemeService` writes. Read directly, not imported:
 * `competenceLevelThemeService` → `themeService` → here would be a cycle.
 * @returns {string} The theme id on `<html>`, or the default when unset.
 */
export function readActiveThemeId() {
    return document.documentElement.dataset.competenceLevelTheme || DEFAULT_THEME_ID;
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * The active colour scheme, read from `<html>`, the attribute `colorSchemeService`
 * writes (always the resolved scheme, `light` or `dark`). Read directly for the same
 * reason as `readActiveThemeId`.
 * @returns {'light'|'dark'} The scheme on `<html>`, or light when unset.
 */
function readActiveScheme() {
    const scheme = document.documentElement.dataset.colorScheme;
    return scheme === 'dark' ? 'dark' : DEFAULT_SCHEME;
}

/**
 * Whether a shipped colour clears `MIN_SURFACE_CONTRAST` on a surface. Per scheme:
 * `#ffffff` is invisible on white and visible on the dark surface.
 * @param {string} color - A hex literal.
 * @param {string} surface - The scheme's chart surface.
 * @returns {boolean}
 */
function isVisibleOn(color, surface) {
    return contrastWithSurface(color, surface) >= MIN_SURFACE_CONTRAST;
}

/**
 * The level → paint map for a theme on a colour scheme, memoised per palette until its
 * registry next changes.
 * @param {CompetenceLevelPalette} palette
 * @param {string} themeId
 * @param {'light'|'dark'} scheme
 * @returns {Map<string, BandPaint>} Keyed by `scopedKey`.
 */
function resolvePaints(palette, themeId, scheme) {
    return palette.memo(`paints:${scheme}:${themeId}`, () =>
        buildBandPaints(palette.getRegisteredLevels(), themeId, scheme),
    );
}

/**
 * Paint every entry under a theme on a colour scheme.
 * @param {Iterable<CompetenceLevelEntry>} entries
 * @param {string} themeId
 * @param {'light'|'dark'} scheme
 * @returns {Map<string, BandPaint>} Keyed by `scopedKey`.
 */
function buildBandPaints(entries, themeId, scheme) {
    const useDataColors = themeId === DATA_THEME_ID;
    const surface = SURFACES[scheme];
    /** @type {Map<string, BandPaint>} */
    const paints = new Map();
    // Judged on this scheme's surface: a shipped `#rrggbbaa` lets the surface show through.
    const paint = (/** @type {string} */ color) => ({ color, ink: inkOn(color, { scheme }) });
    /** @type {Map<string, string[]>} scaleId → its levels' colours */
    const colorsByScale = new Map();

    for (const entry of entries) {
        if (useDataColors && entry.dataColor && isVisibleOn(entry.dataColor, surface)) {
            paints.set(entry.scopedKey, paint(entry.dataColor));
            continue;
        }
        let colors = colorsByScale.get(entry.scaleId);
        if (!colors) {
            colors = getLevelColors(themeId, scheme, entry.levelCount, entry.mediumIndex);
            colorsByScale.set(entry.scaleId, colors);
        }
        paints.set(entry.scopedKey, paint(colors[entry.levelIndex]));
    }
    return paints;
}
