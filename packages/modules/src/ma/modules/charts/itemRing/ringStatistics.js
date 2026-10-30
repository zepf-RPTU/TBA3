/**
 * MA Item Ring Statistics — the figures every item ring draws, as pure functions.
 *
 * Two sources produce the same shape, both counted in responses:
 * - `groupStats`     sums each item's own counts (`solvedCount` of `responseCount`),
 *                    as items.json's `descriptiveStatistics` delivers them.
 * - `ringFigures`    counts the actual `item.results` rows of the selected students,
 *                    when they are a proper subset of the group.
 */

import { compareLevelLabels } from '../../../../common/domain/levels.js';
import { percentOf } from '../../../../common/domain/itemResultCounts.js';
import { RESULT_CODE } from '../../../../common/domain/apiValueMaps.js';

/**
 * The item fields the ring figures are counted from.
 * @typedef {object} RingItem
 * @property {string} competenceLevel - The item's Aufgabenniveau.
 * @property {number} responseCount - The group's responses to the item (items.json `descriptiveStatistics.total`); 0 when absent.
 * @property {number} solvedCount - Solved responses among `responseCount` (`descriptiveStatistics.frequency`).
 * @property {Map<string, number>} [results] - Each student's result code; `1` is solved.
 */
/**
 * One Aufgabenniveau's figures; `successRate` is `null` when nobody answered its items, so
 * every reader prints the missing-value dash rather than a measured 0 %.
 * @typedef {{level: string, count: number, successRate: number|null}} ItemCompetenceLevelStats
 */
/** @typedef {{count: number, correct: number, opportunities: number}} ItemCompetenceLevelAccumulator */
/**
 * @typedef {object} RingStats
 * @property {number} totalItems - How many items the ring segments; never the opportunity count.
 * @property {ItemCompetenceLevelStats[]} itemCompetenceLevelDistribution - One entry per Aufgabenniveau, in scale order.
 * @property {number} successRate - Solved share across all opportunities, 0–100.
 * @property {number} totalCorrect - Solved opportunities.
 * @property {number} totalOpportunities - Responses the rate is a share of.
 */
/**
 * @typedef {object} RingFigures
 * @property {RingStats} groupStats - The group figures the outer ring always shows.
 * @property {RingStats} ringStats - The selection's figures, or `groupStats` itself without a proper subset selected.
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Group figures for a ring: each item's own result counts, summed. An item without
 * responses still segments the ring, but it must not enter the denominator — counting
 * it as 0 % would deflate the group rate.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette - The app's palette, whose item scale orders the levels.
 * @param {RingItem[]} itemArray
 * @returns {RingStats} Zeroed when there are no items.
 */
export function groupStats(palette, itemArray) {
    return ringStats(palette, itemArray, (item) =>
        item.responseCount > 0 ? [item.solvedCount, item.responseCount] : null,
    );
}

/**
 * Everything a ring draws for a selection: the group figures the outer ring always shows,
 * and the figures the inner ring, centre and tick stand for — the selection's, or the
 * group's own object when no proper subset is selected (`selection.isSubset`), so figures
 * and tick always agree.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {RingItem[]} itemArray
 * @param {import('./selection.js').RingSelection} selection
 * @param {RingStats} [groupFigures] - The group figures, when the caller already holds them.
 * @returns {RingFigures}
 */
export function ringFigures(
    palette,
    itemArray,
    selection,
    groupFigures = groupStats(palette, itemArray),
) {
    return {
        groupStats: groupFigures,
        ringStats: selection.isSubset
            ? selectionStats(
                  palette,
                  itemArray,
                  /** @type {ReadonlyArray<string>} */ (selection.ids),
              )
            : groupFigures,
    };
}

/**
 * Each student's own Lösungsquote over the items, counted as the ring counts a one-student
 * selection. A student no item has a result for is left out: there is no rate to place.
 * @template {{studentId: string}} TStudent
 * @param {ReadonlyArray<RingItem>} itemArray
 * @param {ReadonlyArray<TStudent>} students - The group's students, in the order returned.
 * @returns {Array<{student: TStudent, rate: number}>} The rated students, rate 0–100.
 */
export function studentRates(itemArray, students) {
    return students.flatMap((student) => {
        if (!itemArray.some(({ results }) => results?.has(student.studentId))) return [];
        const count = selectionCounter([student.studentId]);
        let solved = 0;
        let opportunities = 0;
        for (const item of itemArray) {
            const counted = count(item);
            if (!counted) continue;
            solved += counted[0];
            opportunities += counted[1];
        }
        // An item with this student's result counts, so there is an opportunity.
        return [{ student, rate: /** @type {number} */ (percentOf(solved, opportunities)) }];
    });
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Figures for a selection of students, counted from their recorded results: one
 * opportunity per selected student and scored item. A selected student missing from an
 * item's results is an opportunity, not a success; an item nobody was scored on
 * segments the ring but contributes no opportunities.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {RingItem[]} itemArray
 * @param {ReadonlyArray<string>} studentIds
 * @returns {RingStats}
 */
function selectionStats(palette, itemArray, studentIds) {
    return ringStats(palette, itemArray, selectionCounter(studentIds));
}

/**
 * What one item adds to a selection's rate: one opportunity per selected student, a
 * success per one scored correct; an item nobody was scored on adds nothing. One rule
 * for every selection rate, so a student's own rate is the one a ring shows once that
 * student is selected.
 * @param {Iterable<string>} studentIds
 * @returns {(item: RingItem) => [number, number]|null} The item's solved and total opportunities, or `null`.
 */
export function selectionCounter(studentIds) {
    const selected = new Set(studentIds);
    return ({ results }) => {
        if (!results?.size) return null;
        let solved = 0;
        for (const studentId of selected) {
            if (results.get(studentId) === RESULT_CODE.CORRECT) solved++;
        }
        return [solved, selected.size];
    };
}

/**
 * Count a ring's figures: every item segments its level, and `countItem` says what it
 * adds to the success rate.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {RingItem[]} itemArray
 * @param {(item: RingItem) => [number, number]|null} countItem - An item's solved and total opportunities, or `null` when it segments the ring without counting.
 * @returns {RingStats}
 */
function ringStats(palette, itemArray, countItem) {
    /** @type {Record<string, ItemCompetenceLevelAccumulator>} */
    const byLevel = {};
    let totalCorrect = 0;
    let totalOpportunities = 0;
    for (const item of itemArray) {
        const stats = (byLevel[item.competenceLevel] ??= {
            count: 0,
            correct: 0,
            opportunities: 0,
        });
        stats.count++;
        const counted = countItem(item);
        if (!counted) continue;
        const [correct, opportunities] = counted;
        stats.correct += correct;
        stats.opportunities += opportunities;
        totalCorrect += correct;
        totalOpportunities += opportunities;
    }

    return {
        totalItems: itemArray.length,
        itemCompetenceLevelDistribution: toItemCompetenceLevelDistribution(palette, byLevel),
        successRate: percentOf(totalCorrect, totalOpportunities) ?? 0,
        totalCorrect,
        totalOpportunities,
    };
}

/**
 * The inner ring's segments, in the order it draws them.
 * @param {import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {Record<string, ItemCompetenceLevelAccumulator>} byLevel
 * @returns {ItemCompetenceLevelStats[]} One entry per Niveau, in the order of the registered item scale.
 */
function toItemCompetenceLevelDistribution(palette, byLevel) {
    return Object.entries(byLevel)
        .map(([level, s]) => ({
            level,
            count: s.count,
            successRate: percentOf(s.correct, s.opportunities),
        }))
        .sort((a, b) => compareLevelLabels(palette, a.level, b.level));
}
