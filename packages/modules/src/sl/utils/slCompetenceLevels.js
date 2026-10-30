/**
 * SL competence-level aliases — resolves the `ge_medium` / `le_low` / `e_high` band
 * vocabulary into concrete level names.
 *
 * The names come from the scales registered with the app's palette at load time
 * (`CompetenceLevelPalette.registerCompetenceLevelScales`), never from a table here:
 * each state's export has its own level vocabulary. Which KMK standard a level represents
 * is the one its value group shipped as `standardBand:<level id>`; `competenceLevels[].name`
 * is not read for it. Untagged levels count by their position on the ladder
 * (`getStandardBandSelection`).
 *
 * The names are matched flat, across scales (`extractCompetenceLevelCounts` in
 * `slCompetenceShares.js` counts a value group's levels by name): safe because the
 * server tags by label, so a name shared by two scales carries the same band on both.
 *
 * Resolve per call, not once at module scope: the palette is empty until
 * the competence-levels document has landed.
 */

/** @typedef {import('../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} CompetenceLevelPalette */
/** @typedef {import('../../common/services/competenceScalePayload.js').StandardBand} StandardBand */
/** @typedef {{rawAlias: string, operator: 'e'|'ge'|'le', band: StandardBand}} BandAlias */

import { parseStandardBand } from '../../common/services/competenceScalePayload.js';

/**
 * Parse a band alias, `<operator>_<band>`:
 *
 * - `e_X`  — the levels tagged X
 * - `ge_X` — the lowest level tagged X and everything above it
 * - `le_X` — the highest level tagged X and everything below it
 *
 * with X one of `low` (unter Mindeststandard), `medium` (Regelstandard), `high`
 * (Optimalstandard). `resolveCompetenceLevelBandAlias` and `formatStandardBands` both
 * parse through here, so they accept the same vocabulary.
 * @param {string|undefined} rawAlias - The alias to parse, e.g. `ge_medium`; `undefined` when a template left the argument out.
 * @returns {BandAlias|null} `null` when the input is not an alias at all
 */
function parseBandAlias(rawAlias) {
    const alias = typeof rawAlias === 'string' ? rawAlias.trim() : '';
    const match = /^(e|ge|le)_(\w+)$/.exec(alias);
    const band = parseStandardBand(match?.[2]);
    if (!match || !band) {
        return null;
    }

    return { rawAlias: alias, operator: /** @type {'e'|'ge'|'le'} */ (match[1]), band };
}

/**
 * Expand a band alias into the level names it counts, across every loaded scale. The
 * `null`/`[]` split lets callers tell "not an alias" from "an alias that matched nothing".
 * @param {CompetenceLevelPalette} palette
 * @param {string} levelAlias
 * @returns {string[]|null} The level names, `[]` when no loaded scale tags that band, or `null` when the input is not an alias.
 */
function resolveCompetenceLevelBandAlias(palette, levelAlias) {
    const alias = parseBandAlias(levelAlias);
    if (!alias) {
        return null;
    }

    // Deduplicated by name: two ladders can carry the same level name and both qualify.
    const levelNames = [
        ...new Set(
            palette
                .getStandardBandSelection(alias.operator, alias.band)
                .flatMap((selection) => selection.levels.map((level) => level.name)),
        ),
    ];

    return levelNames;
}

/**
 * The band each loaded scale reaches a band alias at, as one phrase: `III bzw. B1` on a
 * payload carrying two ladders, `KS 3` on one: the one spelling of a band in prose
 * ("Anteil auf oder oberhalb von Kompetenzstufe III bzw. B1").
 *
 * `resolveCompetenceLevelBandAlias` needs every qualifying level; this names the set
 * per scale. The name follows the alias operator, as the surrounding prose does:
 * `ge_X` ("≥ …", "oder höher") names the floor of the qualifying set, `e_X` and `le_X`
 * ("unterhalb …", "≤ …") its ceiling. On a ladder that splits its low band into `KS 1a`
 * and `KS 1b`, `le_low` therefore reads `KS 1b`, the top of what the share counts. An
 * `e_X` set of more than one level is named as its range (`Ia–Ib`), since either end
 * alone would name only part of it.
 *
 * Silent when it resolves to nothing: the caller drops the block, and
 * `resolveCompetenceLevelBandAlias` warns for the same alias (every block naming a band
 * also states a share).
 * @param {CompetenceLevelPalette} palette
 * @param {string|undefined} levelAlias - `undefined` when a template left the argument out.
 * @returns {string|null} The phrase; `''` when no loaded scale tags that band; `null` when the input is not an alias.
 */
function formatStandardBands(palette, levelAlias) {
    const alias = parseBandAlias(levelAlias);
    if (!alias) {
        return null;
    }
    const names = palette.getStandardBandSelection(alias.operator, alias.band).map(({ levels }) => {
        const floor = levels[0].name;
        const ceiling = levels[levels.length - 1].name;
        if (alias.operator === 'ge') return floor;
        return alias.operator === 'e' && levels.length > 1 ? `${floor}–${ceiling}` : ceiling;
    });
    return [...new Set(names)].join(' bzw. ');
}

/**
 * Report an alias no loaded scale can express; the share queries' alias dataset calls it
 * once per store and alias.
 *
 * The untagged-scale warning in `slCompetenceShares` cannot cover this: an alias that
 * resolves to no level names is rejected before any value group is read, and every metric
 * then vanishes without a message.
 * @param {string} levelAlias - A band alias (`parseBandAlias` reads it).
 */
function warnUnresolvableAlias(levelAlias) {
    const alias = parseBandAlias(levelAlias);
    if (!alias) return;
    const { rawAlias, band } = alias;
    console.warn(
        `[slCompetenceLevels] No loaded competence scale names a "${band}" band ` +
            `(standardBand:<level id>), so "${rawAlias}" resolves to no levels and the metric is ` +
            'reported as unknown rather than 0 %.',
    );
}

/** Every level at or above the Regelstandard. */
const MEDIUM_OR_ABOVE = /** @type {const} */ ({ operator: 'ge', band: 'medium' });

/** The alias of `MEDIUM_OR_ABOVE`, as the SL texts spell it. */
const MEDIUM_OR_ABOVE_ALIAS = `${MEDIUM_OR_ABOVE.operator}_${MEDIUM_OR_ABOVE.band}`;

/**
 * Whether a level is at or above the Regelstandard: at or above its own scale's lowest
 * level tagged `medium` (`mediumIndex`), which is what `ge_medium` selects.
 *
 * An unregistered level, or one whose scale tags no `medium` band, is unknown rather
 * than "below".
 * @param {CompetenceLevelPalette} palette
 * @param {string|null|undefined} levelNameShort - A missing one is unknown.
 * @param {string} [scaleId] - The ladder the level sits on; see `getCompetenceLevelEntry`.
 * @returns {boolean|null} `null` when unknown.
 */
function isAtOrAboveMedium(palette, levelNameShort, scaleId) {
    const entry = palette.getCompetenceLevelEntry(levelNameShort, scaleId);
    if (!entry || entry.mediumIndex === null) return null;
    return entry.levelIndex >= entry.mediumIndex;
}

export {
    formatStandardBands,
    isAtOrAboveMedium,
    MEDIUM_OR_ABOVE_ALIAS,
    resolveCompetenceLevelBandAlias,
    warnUnresolvableAlias,
};
