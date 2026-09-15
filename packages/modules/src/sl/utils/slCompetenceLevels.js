/**
 * SL competence-level aliases — resolves the `ge_3` / `le_1` / `e_5` vocabulary the
 * summary metrics, material texts and info boxes use into concrete level names.
 *
 * The names come from the scales registered at load time
 * (`competenceLevelPalette.registerCompetenceLevelScales`), never from a table here:
 * SL loads a different state's export per dataset and those use five different level
 * vocabularies. The rank a level carries is the one its row shipped as
 * `standardRank:<level id>`, and nothing else — the client stopped reading
 * `competenceLevels[].name` for it.
 *
 * Resolve per call, not once at module scope: the registry is empty until
 * `fetchSlData` has run.
 */

import {
    getLevelNamesForStandardRank,
    getPaletteVersion,
    getStandardBandNames,
    getStandardRank,
    hasAnyStandardRank,
} from '../../common/services/competenceLevelPalette.js';

/**
 * Aliases already reported as unresolvable, so the warning fires once per alias
 * rather than once per metric per render.
 *
 * Keyed by palette version as well as alias: the registry can be replaced (tests reset it,
 * and `getPaletteVersion` exists so downstream caches can tell), and a cache that outlived
 * the reset would swallow the warning for the next payload.
 * @type {Set<string>}
 */
const warnedUnresolvableAliases = new Set();

/**
 * Parse a rank alias into the rank predicate it stands for.
 *
 * - `e_N`  — exactly rank N
 * - `ge_N` — rank N or higher
 * - `le_N` — rank N or lower
 *
 * The grammar lives here once: `resolveCompetenceLevelRankAlias` asks the registry which
 * *levels* satisfy it and `resolveStandardBandsForAlias` which *bands* it starts at, but
 * both must accept exactly the same alias vocabulary.
 * @param {string} levelAlias - The alias to parse, e.g. `ge_3`.
 * @returns {{rawAlias: string, operator: 'e'|'ge'|'le', predicate: (rank: number) => boolean}|null}
 *   `null` when the input is not an alias at all
 */
function parseRankAlias(levelAlias) {
    const rawAlias = typeof levelAlias === 'string' ? levelAlias.trim() : '';
    const aliasMatch = rawAlias.match(/^(e|ge|le)_(\d+)$/i);
    if (!aliasMatch) {
        return null;
    }

    const operator = /** @type {'e'|'ge'|'le'} */ (aliasMatch[1].toLowerCase());
    const threshold = Number(aliasMatch[2]);

    return {
        rawAlias,
        operator,
        predicate: (rank) => {
            if (operator === 'e') {
                return rank === threshold;
            }

            if (operator === 'ge') {
                return rank >= threshold;
            }

            return rank <= threshold;
        },
    };
}

/**
 * Expand a rank alias into the level names that satisfy it.
 *
 * Returns `null` for anything that is not an alias (so callers can tell "not an alias"
 * from "an alias that matched nothing"), and `[]` when no loaded scale names a level
 * of that rank.
 * @param {string} levelAlias - The alias to expand.
 * @returns {string[]|null} The level names, `[]` when no loaded scale has one of that rank, or `null` when the input is not an alias.
 */
function resolveCompetenceLevelRankAlias(levelAlias) {
    const alias = parseRankAlias(levelAlias);
    if (!alias) {
        return null;
    }

    const levelNames = getLevelNamesForStandardRank(alias.predicate);

    if (levelNames.length === 0) {
        warnUnresolvableAlias(alias.rawAlias);
    }

    return levelNames;
}

/**
 * The band each loaded scale reaches a rank alias at — the band the prose now names
 * outright: "Anteil auf oder oberhalb von Kompetenzstufe III bzw. B1". It used to sit in
 * parentheses after a standard's name; the standard is no longer printed.
 *
 * The counterpart of `resolveCompetenceLevelRankAlias`, which answers the same question
 * for a *share*: that one needs every qualifying level, this one needs the boundary band
 * per scale. Which boundary follows the alias operator, because that is the operator the
 * surrounding prose spells out: `ge_N` ("≥ …", "oder höher") names the floor of the
 * qualifying set, `e_N` and `le_N` ("unterhalb …", "≤ …") its ceiling. On NRW's split
 * Mathematik ladder that is what makes `e_1` read `KS 1 bzw. KS 1b` instead of naming the
 * bottom rung `KS 1a` and leaving `KS 1` — the band the Deutsch ladder calls "unter
 * Mindeststandard" — unnamed while `shareRange(levelAlias=e_1)` counts it. Both read the loaded scales, so the wording follows the dataset — `KS 3` on
 * Nordrhein-Westfalen, `ReStd bzw. B1` on Bremen — instead of the `III bzw. B1` that used
 * to be written into `info_boxes.json` by hand.
 *
 * Deliberately silent when it resolves to nothing: the caller drops the block, and
 * `resolveCompetenceLevelRankAlias` has already warned for the same alias on the same
 * payload (every block naming a band also states a share).
 * @param {string} levelAlias - The alias whose starting bands are wanted.
 * @returns {string[]|null} `null` when the input is not an alias; `[]` when no loaded
 *   scale has a level of that rank
 */
function resolveStandardBandsForAlias(levelAlias) {
    const alias = parseRankAlias(levelAlias);
    if (!alias) {
        return null;
    }
    return getStandardBandNames(alias.predicate, alias.operator === 'ge' ? 'floor' : 'ceiling');
}

/**
 * The bands of `resolveStandardBandsForAlias` as one phrase — `III bzw. B1` on a payload
 * carrying two ladders, `KS 3` on one — the spelling every info-box sentence, metric label
 * and material text uses.
 * @param {string} levelAlias - The alias whose starting bands are wanted.
 * @returns {string|null} The phrase; `''` when no loaded scale has a level of that rank; `null` when the input is not an alias.
 */
function formatStandardBands(levelAlias) {
    return resolveStandardBandsForAlias(levelAlias)?.join(' bzw. ') ?? null;
}

/**
 * Report an alias no loaded scale can express, once per alias.
 *
 * `slCompetenceShares` warns when a *row* cannot answer a standard-based question, but it
 * never sees the worst case: an alias that resolves to no level names at all is
 * rejected by `getCompetenceLevelShare` before any row is read, so the per-row warning
 * cannot fire. Every metric then vanishes and the Überblick comes up blank in silence.
 *
 * Two different causes land here and they need different remedies, so they are told apart
 * rather than both blamed on a missing `name`: either no loaded scale names any standard
 * at all (the export is at fault), or the scales do but none has a level of *this* rank —
 * `e_5` against a ladder topping out at "Regelstandard plus", or a threshold the
 * `(e|ge|le)_(\d+)` grammar accepts but no scale can have, such as `ge_9`.
 *
 * No current dataset reaches the first case — every scale of all four ranks its levels,
 * the GER ladders included, and the checked-in fixtures carry the same key. It stays one
 * export away: a state that ships no `standardRank:<id>` at all lands here.
 * @param {string} alias - The alias that could not be resolved.
 */
function warnUnresolvableAlias(alias) {
    const cacheKey = `${getPaletteVersion()}:${alias}`;
    if (warnedUnresolvableAliases.has(cacheKey)) {
        return;
    }

    warnedUnresolvableAliases.add(cacheKey);

    console.warn(
        hasAnyStandardRank()
            ? `[slCompetenceLevels] No loaded competence scale has a level of the KMK standard ` +
                  `"${alias}" asks for, so it resolves to no levels and the metric is reported as ` +
                  'unknown rather than 0 %. The scales do name their standards — check whether the ' +
                  'requested rank exists in them.'
            : `[slCompetenceLevels] No loaded competence scale declares a KMK standard, so "${alias}" ` +
                  'resolves to no levels and every standard-based metric is reported as unknown ' +
                  'rather than 0 %. The rank is read from the payload alone: expect one ' +
                  '`standardRank:<level id>` row property per ranked level. The wording in ' +
                  '`competenceLevels[].name` is not consulted.',
    );
}

/**
 * Whether a level is at or above Regelstandard.
 *
 * An unregistered level, or one whose scale never named its standards, is **not**
 * "below" — it is unknown, and this returns false for both. Callers that need to tell
 * the two apart use `scaleHasStandardRanks`.
 * @param {string} levelNameShort - The level's short name.
 * @param {string} [scaleId] - The ladder the level sits on; see `getCompetencyBand`.
 * @returns {boolean} True only when the level is known *and* ranked at or above Regelstandard.
 */
function isAtOrAboveRegularStandard(levelNameShort, scaleId) {
    const rank = getStandardRank(levelNameShort, scaleId);
    return rank !== null && rank >= 3;
}

export {
    formatStandardBands,
    isAtOrAboveRegularStandard,
    resolveCompetenceLevelRankAlias,
    resolveStandardBandsForAlias,
};
