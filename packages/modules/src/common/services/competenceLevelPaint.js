/**
 * Competence-level chart helpers: band paint, class tokens and level ordering, over the
 * scales the app's palette registered.
 */

import { getCompetenceAppearance } from './themeService.js';

/**
 * @typedef {{normalizedLevel?: string, baseColor: string, ink: string, patternKey: string}} CompetenceAppearance
 */

/**
 * Stamp the competence-band paint contract onto a DOM element: the resolved color as
 * `--competence-level-band-color`, which CSS paints from (the scale is
 * data-driven, so there is no fixed variable to key on).
 * @param {HTMLElement|SVGElement} element
 * @param {CompetenceAppearance} appearance
 */
export function applyCompetenceBandPaint(element, appearance) {
    element.style.setProperty('--competence-level-band-color', appearance.baseColor);
    // A label inside the element reads this (stacked-bar.css); it inherits like any
    // custom property, so the band decides its own label ink.
    element.style.setProperty('--competence-level-band-ink', appearance.ink);
}

/**
 * CSS-class token for a competence level: the level's own name slugified (`Ia` → 'ia',
 * `A1.1` → 'a1-1'). A selector/test hook; paint comes from `applyCompetenceBandPaint`.
 * Non-competence fields (gender, richtig/falsch, …) are returned trimmed.
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string|number|null|undefined} level
 * @param {CompetenceAppearance|null} [appearance] - The level's appearance when already resolved (on its own ladder).
 * @returns {string|null} Null for a nullish level.
 */
export function getCompetenceLevelClassToken(palette, level, appearance = null) {
    const resolved = appearance ?? (level != null ? getCompetenceAppearance(palette, level) : null);
    if (resolved) return resolved.patternKey;
    return level != null ? String(level).trim() : null;
}

/**
 * Sort competence levels lowest-first, following the scale the data registered.
 *
 * The order is the payload's own, read through the palette registry. Levels the
 * registry does not know keep their relative input order at the end: an alphabetical
 * sort would put `k.h.N.` after `KS 5` and `OptStd` before `ReStd`.
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string[]} levels
 * @param {(level: string) => string|undefined} [scaleIdForLevel] - Which ladder each level
 *   belongs to, for pages holding two ladders that share a name; omitted, a name
 *   resolves to the scale that registered it last.
 * @returns {string[]} `levels` itself, sorted in place.
 */
export function sortCompetenceLevels(palette, levels, scaleIdForLevel) {
    if (levels.length === 0) return levels;

    /**
     * @param {string} level
     * @returns {number}
     */
    const ordinal = (level) => palette.getCompetenceLevelOrdinal(level, scaleIdForLevel?.(level));
    return levels.sort((a, b) => ordinal(a) - ordinal(b));
}
