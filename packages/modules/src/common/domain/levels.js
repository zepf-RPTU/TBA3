/**
 * Level utilities — rendering a competence level, and relating the registered item scale
 * (Aufgabenniveau) to whatever reporting scale the payload registered.
 *
 * A dataset carries two scales. The **reporting scale** (students, aggregates) varies by
 * state — `A1…C1`, `A1.1…B1.2`, `k.h.N., KS 1…KS 5`, `MiStd--…OptStd`, `KS 1a…KS 5` — and
 * is registered from `competence-levels.json` (`competenceLevelPalette`). The **item scale**
 * (`Ia, Ib, II, III, IV, V` for de/ma, `A1.1 … C1.2` for en/fr) is registered the same way
 * from `items.json`, in its own namespace — `registerItemCompetenceScales`. Neither is
 * spelled out here: both come from the payload.
 *
 * The link between them is the KMK standard rank, which both sides state: the reporting
 * level through its row's `standardRank:<id>`, the item level through the same key on the
 * items row. Nothing here maps a level to a rank — that is the server's to say.
 */

import {
    getCompetencyBand,
    getCompetencyLevelOrdinal,
    getItemScaleIds,
    getLevelGlossaryKey,
    getLevelNamesForStandardRank,
    getStandardRank,
} from '../services/competenceLevelPalette.js';
import { getBandColor } from '../services/competenceLevelColors.js';
import { getCompetencyAppearance } from '../services/themeService.js';

// ============================================================================
// THE REGISTERED ITEM SCALE
// ============================================================================

/**
 * The registered item-scale entry a level belongs to, or null when no item scale defines it.
 *
 * The item scales stay out of the registry's bare-name index (see
 * `registerItemCompetenceScales`), so a bare level is resolved by trying each registered item
 * scale in turn. A dataset registers one per items document, and EN and MA — the only apps
 * that declare an `itemScaleDocument` — ship one document each, so the loop has one entry
 * today. It is a loop rather than a single id because the registry accepts more than one and
 * nothing here should depend on that count.
 * @param {string|number|null|undefined} itemLevel - An Aufgabenniveau token, as `items.json` spells it.
 * @returns {{entry: import('../services/competenceScalePayload.js').CompetenceLevelEntry, scaleId: string}|null} The entry and the scale it came from.
 */
function resolveItemEntry(itemLevel) {
    for (const scaleId of getItemScaleIds()) {
        const entry = getCompetencyBand(itemLevel, scaleId);
        if (entry) return { entry, scaleId };
    }
    return null;
}

/**
 * Parse an item level into its band, KMK rank and sub-band position.
 *
 * Every field comes from the registered scale, and so from the payload: band and sub-band
 * from the shipped `id` order, the rank from the row's `standardRank:<id>` property. `rank`
 * is `null` for a payload that states none — the caller must treat that as "cannot relate",
 * never as "below".
 * @param {string|number|null|undefined} itemLevel - An Aufgabenniveau token, as `items.json` spells it.
 * @returns {{band: string, rank: number|null, subIndex: number}|null} null when no registered item scale defines it
 */
export function parseItemLevel(itemLevel) {
    const resolved = resolveItemEntry(itemLevel);
    if (!resolved) return null;
    const { bandKey, standardRank, subBandIndex } = resolved.entry;
    return { band: bandKey, rank: standardRank, subIndex: subBandIndex };
}

/**
 * Position of an item level on its registered item scale — sorts `Ia < Ib < II < … < V` and
 * `A1.1 < A1.2 < A2.1 < … < C1.2`, in the order the payload's `id`s declare. Unknown values
 * sort last.
 * @param {string|number|null|undefined} itemLevel - An Aufgabenniveau token, as `items.json` spells it.
 * @returns {number} Sortable position on the item scale; `Number.MAX_SAFE_INTEGER` for anything unregistered.
 */
export function getItemLevelOrdinal(itemLevel) {
    const resolved = resolveItemEntry(itemLevel);
    return resolved
        ? getCompetencyLevelOrdinal(itemLevel, resolved.scaleId)
        : Number.MAX_SAFE_INTEGER;
}

// ============================================================================
// ITEM SCALE ↔ REPORTING SCALE
// ============================================================================

/**
 * The registered entry an item level resolves to: the level itself where the reporting
 * scale defines it (`A1.1` on Niedersachsen's ladder), else its band (`B1.1` → `B1` on the
 * `A1…C1` scales) — the same fallback `getLevelGlossaryKey` makes.
 * @param {string|number|null|undefined} itemLevel - An Aufgabenniveau token, as `items.json` spells it.
 * @returns {import('../services/competenceScalePayload.js').CompetenceLevelEntry|null} The registered entry for the level or its band, or null when the reporting scale knows neither.
 */
function resolveRegisteredItemEntry(itemLevel) {
    return (
        getCompetencyBand(itemLevel) ??
        getCompetencyBand(resolveItemEntry(itemLevel)?.entry.bandKey)
    );
}

/**
 * The reporting level an item level maps to through its KMK rank, or null when the loaded
 * scale names no level of that rank. A split rank (`KS 1a`/`KS 1b`, `MiStd--`/`MiStd-`) is
 * matched by sub-band position, so `Ia` → `KS 1a` and `Ib` → `KS 1b`; a single level takes
 * every sub-band of the rank.
 * @param {{rank: number, subIndex: number}} parsed - An already-parsed item level whose rank the payload states, and whose sub-band position picks between levels sharing it.
 * @returns {string|null} `nameShort` of the reporting level
 */
function reportingLevelForRank(parsed) {
    const names = getLevelNamesForStandardRank((rank) => rank === parsed.rank)
        // `getLevelNamesForStandardRank` also admits levels whose rank is merely *bounded*
        // to this value (`k.h.N.`); a color or a comparison needs the ones that name it.
        .filter((name) => getStandardRank(name) === parsed.rank)
        .sort((a, b) => getCompetencyLevelOrdinal(a) - getCompetencyLevelOrdinal(b));
    if (names.length === 0) return null;
    return names[Math.min(parsed.subIndex, names.length - 1)];
}

/**
 * Compare an item's Aufgabenniveau with a student's reported level.
 *
 * Negative when the item is below the reported level, positive when above, 0 when equal,
 * and **null when the two cannot be related** — a caller that treats null as a number has
 * reintroduced the "unknown means below" bug. Order of preference: both on the same
 * registered scale → ordinals; else both name a KMK standard → ranks; else null.
 * @param {string|number|null|undefined} itemLevel - An Aufgabenniveau token, as `items.json` spells it.
 * @param {string|number|null|undefined} reportedLevel - The student's reported competence level.
 * @returns {number|null} Negative below, positive above, 0 equal — and null when the two cannot be related at all.
 */
export function compareItemLevelToReportedLevel(itemLevel, reportedLevel) {
    const reported = getCompetencyBand(reportedLevel);
    if (!reported) return null;

    const item = resolveRegisteredItemEntry(itemLevel);
    if (item && item.scaleId === reported.scaleId) {
        return getCompetencyLevelOrdinal(item.name) - getCompetencyLevelOrdinal(reported.name);
    }

    const parsed = parseItemLevel(itemLevel);
    if (!parsed || parsed.rank === null || reported.standardRank === null) return null;
    return parsed.rank - reported.standardRank;
}

/**
 * The color an item level paints with under the active theme: its own registered color,
 * its band's, or — across vocabularies — the color of the reporting level of the same KMK
 * rank. Null when nothing answers, so the caller picks its neutral fallback.
 * @param {string|number|null|undefined} itemLevel - An Aufgabenniveau token, as `items.json` spells it.
 * @returns {string|null} Hex color under the active theme, or null so the caller can pick its neutral fallback.
 */
export function getItemLevelColor(itemLevel) {
    // Always a *reporting* colour, never the item scale's own. The item scale is registered
    // for its order and its bands (see `resolveItemEntry`), but an item mark has to paint the
    // band the student charts beside it paint, and only the reporting ramp knows that under
    // the three generated themes. The payload's item hexes are the state's `data`-theme
    // colours and match the reporting ones anyway.
    const entry = resolveRegisteredItemEntry(itemLevel);
    if (entry) return getBandColor(entry.name);

    const parsed = parseItemLevel(itemLevel);
    if (!parsed || parsed.rank === null) return null;
    const reportingLevel = reportingLevelForRank({ rank: parsed.rank, subIndex: parsed.subIndex });
    return reportingLevel === null ? null : getBandColor(reportingLevel);
}

/**
 * Sort comparator for a column of level labels — item levels by their registered item scale,
 * reporting levels by their registered ordinal, anything else after both, alphabetically.
 * A label that parses as an item level takes the item scale's ordinal because a column of
 * them may be only partly registered (a Niedersachsen-style export grades items up to `B2.2`
 * on a ladder that stops at `B1.2`); where the vocabularies coincide (`I…V`, `A1.1…B1.2`) the two orders agree, so a
 * student-level column is unaffected. The two ordinal spaces are not comparable with each
 * other — a column is either item levels or reporting levels, never both.
 * @param {string|number|null|undefined} a - One level label from the column.
 * @param {string|number|null|undefined} b - The other level label from the same column.
 * @returns {number} Standard comparator result, ordering by the scale the column is drawn from.
 */
export function compareLevelLabels(a, b) {
    const ordinal = (level) => {
        const resolved = resolveItemEntry(level);
        return resolved
            ? getCompetencyLevelOrdinal(level, resolved.scaleId)
            : getCompetencyLevelOrdinal(level);
    };
    const diff = ordinal(a) - ordinal(b);
    return diff !== 0 ? diff : String(a ?? '').localeCompare(String(b ?? ''));
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Create an HTML string for a competence level value with glossary popup annotation.
 *
 * The band color is stamped inline as `--ks-band-color` (see table-overrides.css):
 * the scale comes from the loaded data, so there is no fixed per-level CSS variable
 * to key on. Values outside the registered scale simply inherit the text color.
 * @param {string} level - The level to render; `N/A` and empty values render unstyled.
 * @param {string} [tag='span'] - Element name to wrap the value in.
 * @param {string} [baseClass='ger-text'] - Class applied to that element.
 * @returns {string} Markup carrying the glossary stamp and the inline band color.
 */
export function createGerLevelHtml(level, tag = 'span', baseClass = 'ger-text') {
    if (!level || level === 'N/A') {
        return `<${tag} class="${baseClass}">${level || 'N/A'}</${tag}>`;
    }

    const baseLevel = level.includes('.') ? level.split('.')[0] : level;
    // Exact level first, band second — same order as the glossary key below, and for the
    // same reason: a scale that ships `A1.1 … B1.2` registers the sub-levels and not the
    // band, so collapsing first would leave those cells with no band color at all. Item
    // levels on a scale that shares no vocabulary with them (`B1.1` against `KS 1…KS 5`)
    // paint through the KMK-rank bridge, like the charts beside them.
    const appearance = getCompetencyAppearance(level) ?? getCompetencyAppearance(baseLevel);
    const bandColor = appearance?.baseColor ?? getItemLevelColor(level);
    const bandClass = bandColor ? ' competency-level' : '';
    const bandStyle = bandColor ? ` style="--ks-band-color:${bandColor}"` : '';

    // Keyed on the *full* level where the payload describes it — `A1.1` is a level in its
    // own right on the scales that ship it — and on the band otherwise, which is what the
    // EN item levels need (aggregates ship `A1 … C1`, items grade `A1.1 … C1.1`). No key
    // when the payload sent no text at all: an empty popup is worse than none, so the
    // value renders as plain text.
    const glossaryKey = getLevelGlossaryKey(level);
    const glossaryClass = glossaryKey ? ' glossary-term' : '';
    const glossaryAttr = glossaryKey ? ` data-glossary-key="${glossaryKey}"` : '';

    return `<${tag} class="${baseClass} ger-${baseLevel}${glossaryClass}${bandClass}"${bandStyle}${glossaryAttr}>${level}</${tag}>`;
}
