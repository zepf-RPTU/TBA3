/**
 * How a competence level paints under the active theme: an item mark's colour, and a
 * level value's markup with its band colour and glossary stamp. The level vocabulary
 * itself is `common/domain/levels.js`.
 */

import { getItemScaleLevelNames } from '../domain/levels.js';
import { getCompetenceAppearance } from './themeService.js';
import { cssVarsAttr, escapeHtml } from '@tba3/module-base';
import { glossaryTermAttrs } from '@tba3/module-base/glossary';
import { MISSING_VALUE } from '../utils/numberFormat.js';

/**
 * The color an item level paints with under the active theme: the colour of the
 * reporting level it maps to (`palette.getItemLevel`), on that level's
 * own scale. The payload's item hexes are the state's `data`-theme colours and match the
 * reporting ones anyway.
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string|number|null|undefined} itemCompetenceLevelToken - An Aufgabenniveau token, as `items.json` spells it.
 * @returns {string|null} The reporting level's colour `var()`, or null so the caller can pick its neutral fallback.
 */
function getItemCompetenceLevelColor(palette, itemCompetenceLevelToken) {
    const reportingLevel = palette.getItemLevel(itemCompetenceLevelToken)?.reportingLevel ?? null;
    return reportingLevel === null
        ? null
        : (getCompetenceAppearance(palette, reportingLevel.name, reportingLevel.scaleId)
              ?.baseColor ?? null);
}

/**
 * The color an item mark paints with: the reporting level's colour, or, for a level
 * nothing answers, the neutral bar color, the fallback a reporting level gets too
 * (`getCompetenceColor`).
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string|number|null|undefined} itemCompetenceLevelToken - An Aufgabenniveau token, as `items.json` spells it.
 * @returns {string} The colour's `var()`.
 */
export function getItemCompetenceLevelFill(palette, itemCompetenceLevelToken) {
    return (
        getItemCompetenceLevelColor(palette, itemCompetenceLevelToken) ?? 'var(--default-bar-color)'
    );
}

/**
 * Create an HTML string for a reported competence level value with glossary popup
 * annotation: the level paints as itself.
 *
 * The band color is stamped as `--competence-level-band-color` (`cssVarsAttr`, read by
 * competence-levels.css): the scale comes from the loaded data, so there is no fixed
 * per-level CSS variable to key on. Values outside the registered scale inherit the
 * text color. A painted value also carries its scale's labels, one per line, as
 * `data-level-sizer`, whose widest competence-levels.css reserves, so every value of
 * one scale is equally wide and a centred column lines its swatches up. Memoised per
 * registration: a table formats it per cell, and the markup depends only on the
 * registered scales (the colours are `var()` tokens).
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string|null|undefined} level - The level to render; a missing one prints `MISSING_VALUE`, unstyled.
 * @returns {string}
 */
export function createGerLevelHtml(palette, level) {
    if (!level) return `<span class="ger-text">${MISSING_VALUE}</span>`;
    return palette.memo(`gerLevelHtml:${level}`, () =>
        levelHtml(
            palette,
            level,
            getCompetenceAppearance(palette, level)?.baseColor ?? null,
            palette.getScaleLevelNames(level),
        ),
    );
}

/**
 * Create an HTML string for an Aufgabenniveau value, as `createGerLevelHtml` does for a
 * reported level: the item paints as the reporting level whose item-slot span covers it
 * (`B1.1` on `KS 1…KS 5`), the one path the charts beside it take, so a ladder without
 * spans leaves it neutral.
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string|null|undefined} level - The item level to render; a missing one prints `MISSING_VALUE`, unstyled.
 * @returns {string}
 */
export function createItemLevelHtml(palette, level) {
    if (!level) return `<span class="ger-text">${MISSING_VALUE}</span>`;
    return palette.memo(`itemLevelHtml:${level}`, () =>
        levelHtml(
            palette,
            level,
            getItemCompetenceLevelColor(palette, level),
            getItemScaleLevelNames(palette, level),
        ),
    );
}

/**
 * @param {import('./competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string} level
 * @param {string|null} bandColor - The colour `var()` to paint with; null leaves the text color.
 * @param {string[]} scaleLevels - Every label of the level's scale; empty only when `bandColor` is null.
 * @returns {string} See `createGerLevelHtml`.
 */
function levelHtml(palette, level, bandColor, scaleLevels) {
    const bandClass = bandColor ? ' competence-level' : '';
    const bandAttr = bandColor ? cssVarsAttr({ '--competence-level-band-color': bandColor }) : '';
    const sizerAttr = bandColor ? ` data-level-sizer="${escapeHtml(scaleLevels.join('\n'))}"` : '';

    const glossaryKey = palette.getLevelGlossaryKey(level);
    const className = `ger-text${bandClass}`;
    // No tab stop: the value fills a table cell, and one per row would flood the tab order.
    const attrs = glossaryKey
        ? glossaryTermAttrs(glossaryKey, className, { focusable: false })
        : `class="${className}"`;

    return `<span ${attrs}${bandAttr}${sizerAttr}>${escapeHtml(level)}</span>`;
}
