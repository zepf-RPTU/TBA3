/**
 * KMK standard ranks (1 = unter Mindeststandard … 5 = Optimalstandard) as the payload
 * carries them per level, and what can be inferred for a level the payload left
 * unranked from its neighbours on the same ladder. Pure arithmetic; the payload reader in
 * `competenceScalePayload.js` applies it to every scale before registration.
 */

export const MIN_STANDARD_RANK = 1;
export const MAX_STANDARD_RANK = 5;

/**
 * One `standardRank:<id>` property value as a rank, or `null` when it is absent or not
 * a rank this scale vocabulary has.
 *
 * Range-checked rather than trusted: the value arrives as a string over the wire, and a
 * rank outside 1…5 would sort and band silently wrong rather than loudly. Out of range
 * therefore reads as *unranked*, the same as a level the payload sent no key for — there
 * is no second carrier to fall back to.
 *
 * `Number` and not `parseInt`, for the same reason: `parseInt` reads `"3 (Regelstandard)"`
 * and `"1x"` as a rank and discards the rest, so a value that is not a number at all would
 * be accepted as one. Only a string that is *entirely* a rank counts.
 * @param {string|undefined} raw - One `standardRank:<id>` property value, as it arrived over the wire.
 * @returns {number|null} Rank 1…5, or null when absent or not entirely a rank in range.
 */
export function parseStandardRank(raw) {
    if (typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    const rank = Number(trimmed);
    return Number.isInteger(rank) && rank >= MIN_STANDARD_RANK && rank <= MAX_STANDARD_RANK
        ? rank
        : null;
}

/**
 * Narrow each level's possible KMK standard rank from the ranks its scale *does* name.
 *
 * A level the payload ships no rank for is not unconstrained: it sits in a ladder, and
 * the ranked levels around it bound it from both sides. NRW's `k.h.N.` sits below a
 * rank-1 band, so its own rank cannot exceed 1 — and since 1 is the lowest rank there is,
 * `k.h.N.` *is* rank 1 and belongs in the lowest-rank metric. Nothing here reads the
 * level's position on its own; the bound comes from what the payload ranked above and
 * below it.
 *
 * A scale that ranks nothing keeps every level at the full `[1, 5]`, which satisfies no
 * metric — the "unknown, never zero" rule this registry exists for.
 * @param {Array<{nameShort?: string, shippedRank?: number|null}>} levels
 *        In scale order, lowest first
 * @returns {Map<string, {lower: number, upper: number}>} keyed by `nameShort`
 */
export function deriveRankBounds(levels) {
    // A level the payload ranked outright bounds its unranked neighbours, so `k.h.N.` —
    // which ships no rank key by design — is still pinned to 1 by the rank-1 band above it.
    const ranks = levels.map((level) => level.shippedRank ?? null);

    /** @type {Map<string, {lower: number, upper: number}>} */
    const bounds = new Map();
    for (let index = 0; index < levels.length; index++) {
        const rank = ranks[index];
        if (rank !== null) {
            bounds.set(String(levels[index].nameShort), { lower: rank, upper: rank });
            continue;
        }

        let lower = MIN_STANDARD_RANK;
        for (let below = index - 1; below >= 0; below--) {
            const named = ranks[below];
            if (named !== null) {
                lower = named;
                break;
            }
        }

        let upper = MAX_STANDARD_RANK;
        for (let above = index + 1; above < levels.length; above++) {
            const named = ranks[above];
            if (named !== null) {
                upper = named;
                break;
            }
        }

        bounds.set(String(levels[index].nameShort), { lower, upper });
    }

    return bounds;
}

/**
 * Whether `predicate` holds for every rank the level could possibly carry.
 *
 * "Every" and not "any": a level that *might* be Regelstandard must not be counted as
 * one. For the `e_` / `ge_` / `le_` aliases the interval collapses to a single rank
 * whenever the scale named the level, so this is exact rather than conservative there.
 * @param {{rankLowerBound: number, rankUpperBound: number}} entry - The level being tested.
 * @param {(rank: number) => boolean} predicate - Holds for the ranks the metric counts.
 * @returns {boolean} True only when every rank the level could carry satisfies `predicate`.
 */
export function satisfiesEveryPossibleRank(entry, predicate) {
    for (let rank = entry.rankLowerBound; rank <= entry.rankUpperBound; rank++) {
        if (!predicate(rank)) return false;
    }
    return true;
}
