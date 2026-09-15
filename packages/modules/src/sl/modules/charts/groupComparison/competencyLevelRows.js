/**
 * Band alignment for the Gruppenvergleich's competence-scale rows.
 *
 * Turns one or more level orders into comparable rows, highest band first, so groups
 * measured on differently deep ladders can be plotted against each other.
 */

import {
    getCompetencyBand,
    getCompetencyLevelOrdinal,
    getScaleLevelNames,
} from '../../../../common/services/competenceLevelPalette.js';

/**
 * @typedef {{order: string[], scaleId?: string}} LevelOrder
 *   One group's levels, lowest first, and the registered ladder they sit on
 *   (`stats.scaleId`). Without the id a name resolves to whichever ladder registered it
 *   last — fine on a dataset with one ladder, wrong on NRW's page holding two.
 */

/**
 * Group a level order into its bands, lowest band first, using the registered scale.
 * Levels the registry does not know are dropped — they have no position to align on.
 *
 * The bands are the **scale's**, not only the levels this group happens to list: a group
 * whose payload row omits a level of its own ladder (nobody reached it) still aligns
 * band by band with a group that has it, rather than shifting every row below the gap.
 *
 * Grouped by `bandKey`, the level's own band, so `Ia`/`Ib` and `A1.1`/`A1.2` still share
 * a row — they genuinely are one band — while two distinct levels cannot merge.
 * @param {LevelOrder} levelOrder - One group's levels and ladder.
 * @returns {string[][]} One entry per band, each holding that band's levels in scale order
 */
function groupOrderIntoBands({ order, scaleId }) {
    /** @type {Map<string, string[]>} bandKey → levels, in first-appearance order */
    const bands = new Map();

    // Only a caller naming the ladder gets its full band list: a bare name resolves to
    // whichever ladder registered it last, which on a page holding two is a guess.
    const listed = (order ?? []).filter((level) => typeof level === 'string');
    const scaleLevels =
        scaleId !== undefined && listed.length > 0 ? getScaleLevelNames(listed[0], scaleId) : [];
    const levels = scaleLevels.length > 0 ? scaleLevels : listed;

    for (const level of levels) {
        const entry = getCompetencyBand(level, scaleId);
        if (!entry) continue;

        const members = bands.get(entry.bandKey) ?? [];
        members.push(level);
        bands.set(entry.bandKey, members);
    }

    const byOrdinal = (a, b) =>
        getCompetencyLevelOrdinal(a, scaleId) - getCompetencyLevelOrdinal(b, scaleId);

    // Sorting is stable, so bands whose ordinals tie keep the order they were inserted
    // in, which is the scale's own.
    return [...bands.values()]
        .map((members) => members.sort(byOrdinal))
        .sort((a, b) => byOrdinal(a[0], b[0]));
}

/**
 * Accept the bare `string[]` form as well as the `{order, scaleId}` one.
 * @param {string[]|LevelOrder} levelOrder - Either form.
 * @returns {LevelOrder|null} Normalised, or null for anything else.
 */
function normalizeLevelOrder(levelOrder) {
    if (Array.isArray(levelOrder)) return { order: levelOrder, scaleId: undefined };
    if (levelOrder && Array.isArray(levelOrder.order)) return levelOrder;
    return null;
}

/**
 * Align one or more competence scales into comparable rows, highest band first.
 *
 * Alignment is by **band position counted from the top**, not by level name: the
 * scales being compared are frequently different (Kategorie "Fach" puts Deutsch next
 * to Englisch, and a state may measure them on ladders of different depth). Anchoring
 * at the top keeps the strongest band of each scale on the same row, which is the
 * comparison a reader makes.
 *
 * A scale with fewer bands simply contributes nothing to the rows below its own
 * depth, leaving them one-sided. Padding them would invent a level the scale does
 * not have.
 * @param {Array<string[]|LevelOrder>} levelOrders - One level order per group, lowest level first, each with its ladder where known
 * @returns {Array<{key: string, labels: Array<string|null>, sourceLevels: string[][], sharedLabel: string|null}>} One row per band depth, with a `null` label for every group whose scale does not reach it.
 */
export function buildCompetencyLevelRows(levelOrders = []) {
    const bandedOrders = levelOrders
        .map(normalizeLevelOrder)
        .filter(Boolean)
        .map(groupOrderIntoBands);
    if (bandedOrders.length === 0) return [];

    const rowCount = Math.max(...bandedOrders.map((bands) => bands.length), 0);
    if (rowCount === 0) return [];

    const rows = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        // Row 0 is the highest band of every scale; each step down takes the next
        // band down of each scale, counted from that scale's own top.
        const sourceLevels = bandedOrders.map((bands) => bands[bands.length - 1 - rowIndex] ?? []);
        if (!sourceLevels.some((levels) => levels.length > 0)) continue;

        const labels = sourceLevels.map((levels) => (levels.length > 0 ? levels.join('/') : null));
        const nonEmptyLabels = labels.filter(Boolean);
        const sharedLabel =
            nonEmptyLabels.length > 0 &&
            nonEmptyLabels.every((label) => label === nonEmptyLabels[0])
                ? nonEmptyLabels[0]
                : null;

        rows.push({
            key: `band-${rowIndex}`,
            labels,
            sourceLevels,
            sharedLabel,
        });
    }

    return rows;
}
