/**
 * Ordering and labelling competence levels, and relating the registered item scale
 * (Aufgabenniveau) to whatever reporting scale the payload registered.
 *
 * A dataset carries two scales, both read from the payload. The reporting scale
 * (students, aggregates) varies by state (`A1…C1`, `A1.1…B1.2`, `k.h.N., KS 1…KS 5`,
 * `MiStd--…OptStd`, `KS 1a…KS 5`) and is registered from `competence-levels.json`
 * (`competenceLevelPalette`). The item scale (`Ia, Ib, II, III, IV, V` for de/ma,
 * `A1.1 … C1.2` for en/fr) is registered the same way from `items.json`, in its own
 * namespace (`registerItemCompetenceScales`).
 *
 * The link between them is the item slot: an item level's `id` is its slot on the item
 * scale, and each reporting level's value group names the slots it covers as
 * `itemLevelSpan:<id>`.
 */

/** @typedef {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} CompetenceLevelPalette */

import { compareText } from '../utils/compare.js';

// ============================================================================
// THE REGISTERED ITEM SCALE
// ============================================================================

/**
 * Every level of the item scale an item level belongs to, in scale order, as
 * `getScaleLevelNames` lists a reporting scale's.
 * @param {CompetenceLevelPalette} palette
 * @param {string|number|null|undefined} itemCompetenceLevelToken
 * @returns {string[]} Empty when no registered item scale defines the level.
 */
export function getItemScaleLevelNames(palette, itemCompetenceLevelToken) {
    const entry = palette.getItemLevel(itemCompetenceLevelToken)?.entry;
    return entry ? palette.getScaleLevelNames(entry.name, entry.scaleId) : [];
}

// ============================================================================
// ITEM SCALE ↔ REPORTING SCALE
// ============================================================================

/**
 * Compare an item's Aufgabenniveau with the item slots a student's reported level covers.
 *
 * Negative when the item is below the span (`slot - from`), positive when above
 * (`slot - to`), 0 inside it, and null when the two cannot be related, which a caller
 * must not treat as a number. The span is the student's own value group's
 * (`readItemLevelSpan`), so the comparison follows that student's booklet.
 * @param {CompetenceLevelPalette} palette
 * @param {string|number|null|undefined} itemCompetenceLevelToken
 * @param {import('../services/competenceScalePayload.js').ItemLevelSpan|null|undefined} span - The item slots the student's level covers.
 * @returns {number|null} Negative below, positive above, 0 inside; null without a slot or a span.
 */
export function compareItemCompetenceLevelToReportedSpan(palette, itemCompetenceLevelToken, span) {
    if (!span) return null;
    const slot = palette.getItemLevel(itemCompetenceLevelToken)?.slot ?? null;
    if (slot === null) return null;
    if (slot < span.from) return slot - span.from;
    if (slot > span.to) return slot - span.to;
    return 0;
}

/**
 * Sort comparator for a column of level labels: item levels by their registered item scale,
 * reporting levels by their registered ordinal, anything else after both, alphabetically.
 * A label that parses as an item level takes the item scale's ordinal because a column of
 * them may be only partly registered (a state export may grade items up to `B2.2` on a
 * ladder that stops at `B1.2`); where the vocabularies coincide (`I…V`, `A1.1…B1.2`)
 * the two orders agree. The two ordinal spaces are not comparable with each other: a
 * column is either item levels or reporting levels, never both.
 * @param {CompetenceLevelPalette} palette
 * @param {string|number|null|undefined} a
 * @param {string|number|null|undefined} b
 * @returns {number}
 */
export function compareLevelLabels(palette, a, b) {
    const [textA, textB] = [String(a ?? ''), String(b ?? '')];
    return labelOrdinal(palette, textA) - labelOrdinal(palette, textB) || compareText(textA, textB);
}

/**
 * Sort position of one level in a column: on the item scale where it is an item level,
 * on the reporting scale otherwise (see `compareLevelLabels`). Memoised per registration:
 * a sort asks twice per comparison.
 * @param {CompetenceLevelPalette} palette
 * @param {string} level
 * @returns {number} Sortable position; `Number.MAX_SAFE_INTEGER` for anything unregistered.
 */
function labelOrdinal(palette, level) {
    return palette.memo(`labelOrdinal:${level}`, () => {
        const itemEntry = palette.getItemLevel(level)?.entry;
        return palette.getCompetenceLevelOrdinal(level, itemEntry?.scaleId);
    });
}
