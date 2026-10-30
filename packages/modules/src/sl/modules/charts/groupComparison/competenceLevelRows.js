/**
 * Level alignment for the Gruppenvergleich's competence-scale rows: one or more level
 * orders become comparable rows, highest level first, so groups measured on differently
 * deep ladders can be plotted against each other.
 */

import { sortCompetenceLevels } from '../../../../common/services/competenceLevelPaint.js';

/**
 * @typedef {{order: string[], scaleId?: string}} LevelOrder
 *   One group's levels, lowest first, and the registered ladder they sit on
 *   (`stats.scaleId`). Without the id a name resolves to whichever ladder registered it
 *   last, which is wrong on a page holding two.
 */

/**
 * A level order on its registered scale, lowest level first. Levels the registry does
 * not know are dropped — they have no position to align on.
 *
 * The levels are the scale's, not only the ones this group lists: a group whose payload
 * value group omits a level of its own ladder (nobody reached it) still aligns level by
 * level with a group that has it, rather than shifting every row below the gap.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette - The app's palette, holding the registered scales.
 * @param {LevelOrder} levelOrder
 * @returns {string[]}
 */
function orderScaleLevels(palette, { order, scaleId }) {
    // Only a caller naming the ladder gets its full level list (`LevelOrder`).
    const listed = (order ?? []).filter((level) => typeof level === 'string');
    const scaleLevels =
        scaleId !== undefined && listed.length > 0
            ? palette.getScaleLevelNames(listed[0], scaleId)
            : [];
    if (scaleLevels.length > 0) return scaleLevels;

    return sortCompetenceLevels(
        palette,
        listed.filter((level) => palette.getCompetenceLevelEntry(level, scaleId)),
        () => scaleId,
    );
}

/**
 * One row of the comparison: a level depth, with each group's label and level there.
 * @typedef {object} CompetenceLevelRow
 * @property {string} key - `level-<depth>`, the depth counted from the top.
 * @property {string[]} labels - One label per level order; a scale that does not reach the depth takes the first group's that does.
 * @property {Array<string|null>} sourceLevels - Per level order, the level the row stands for; null where the scale does not reach.
 */

/**
 * Align one or more competence scales into comparable rows, highest level first.
 *
 * Alignment is by level position counted from the top, not by level name: the scales
 * compared can differ (Kategorie "Fach" puts Deutsch next to Englisch, and a state may
 * measure them on ladders of different depth). Anchoring at the top keeps the strongest
 * level of each scale on the same row.
 *
 * A scale with fewer levels contributes nothing to the rows below its own depth, leaving
 * them one-sided. Padding them would invent a level the scale does not have.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {LevelOrder[]} levelOrders - One per group.
 * @returns {CompetenceLevelRow[]} One row per level depth.
 */
export function buildCompetenceLevelRows(palette, levelOrders) {
    const orders = levelOrders.map((levelOrder) => orderScaleLevels(palette, levelOrder));
    const rowCount = Math.max(...orders.map((levels) => levels.length), 0);
    if (rowCount === 0) return [];

    const rows = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        // Row 0 is the highest level of every scale; each step down takes the next
        // level down of each scale, counted from that scale's own top.
        const sourceLevels = orders.map((levels) => levels[levels.length - 1 - rowIndex] ?? null);
        // The longest scale reaches every row, so some level is always there.
        const fallback = /** @type {string} */ (sourceLevels.find((level) => level !== null));
        rows.push({
            key: `level-${rowIndex}`,
            labels: sourceLevels.map((level) => level ?? fallback),
            sourceLevels,
        });
    }

    return rows;
}
