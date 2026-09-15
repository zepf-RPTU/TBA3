/**
 * MA Task Ring Statistics — the figures every task ring draws, as pure functions.
 *
 * Two sources produce the same shape, both counted in responses:
 * - `classStats`     sums each item's own result counts (`correctCount` of `total`),
 *                    as the per-item aggregation delivers them.
 * - `selectionStats` counts the actual `item.results` rows of the selected students.
 *
 * Input:  itemArray from maItemDataAdapter (`competenceLevel`, `correctCount`, `total`, `results`)
 * Output: RingStats — read by TaskRingChart and TaskRingFocusChart
 */

import { compareLevelLabels } from '../../../../common/domain/levels.js';

/** @typedef {{niveau: string, count: number, successRate: number}} NiveauStats */
/** @typedef {{count: number, correct: number, opportunities: number}} NiveauAccumulator */
/**
 * @typedef {object} RingStats
 * @property {number} totalTasks - How many items the ring segments; never the opportunity count.
 * @property {NiveauStats[]} niveauDistribution - One entry per Aufgabenniveau, in scale order.
 * @property {number} successRate - Solved share across all opportunities, 0–100.
 * @property {number} totalCorrect - Solved opportunities.
 * @property {number} totalOpportunities - Responses the rate is a share of.
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Class figures for a ring: each item's own result counts, summed.
 * @param {Array<object>|null} itemArray - The items the ring segments stand for.
 * @returns {RingStats} The figures, zeroed when there are no items.
 */
export function classStats(itemArray) {
    if (!itemArray?.length) return emptyRingStats();

    /** @type {Record<string, NiveauAccumulator>} */
    const niveauStats = {};
    let totalCorrect = 0;
    let totalOpportunities = 0;

    for (const item of itemArray) {
        const stats = niveauEntry(niveauStats, item.competenceLevel);
        stats.count++;

        // An item the per-item aggregation does not cover still segments the ring, but it
        // must not enter the denominator — counting it as 0 % would deflate the class rate.
        if (!(item.total > 0)) continue;

        stats.correct += item.correctCount;
        stats.opportunities += item.total;
        totalCorrect += item.correctCount;
        totalOpportunities += item.total;
    }

    return {
        totalTasks: itemArray.length,
        niveauDistribution: toNiveauDistribution(niveauStats),
        successRate: rate(totalCorrect, totalOpportunities),
        totalCorrect,
        totalOpportunities,
    };
}

/**
 * Figures for a selection of students, counted from their recorded results.
 * @param {Array<object>|null} itemArray - The items the ring segments stand for.
 * @param {string|object|Array<string|object>|null} studentFilter - The selected students, as ids or objects carrying `studentId`.
 * @returns {RingStats} The figures, zeroed when there are no items.
 */
export function selectionStats(itemArray, studentFilter) {
    if (!itemArray?.length) return emptyRingStats();

    const targetStudentIdSet = createStudentIdSet(studentFilter);
    /** @type {Record<string, NiveauAccumulator>} */
    const niveauStats = {};
    let totalCorrect = 0;
    let totalOpportunities = 0;

    for (const item of itemArray) {
        const stats = niveauEntry(niveauStats, item.competenceLevel);
        stats.count++;

        // Same rule as the class path: an item nobody was scored on segments the ring
        // but contributes no opportunities.
        if (!Array.isArray(item.results)) continue;

        // Only the selected students' results are kept: a map over the whole class
        // would be built once per item to read a handful of keys.
        const selectedResults = new Map();
        for (const result of item.results) {
            const studentId = String(result[0]);
            if (targetStudentIdSet.has(studentId))
                selectedResults.set(studentId, parseInt(result[1]));
        }
        for (const studentId of targetStudentIdSet) {
            stats.opportunities++;
            totalOpportunities++;
            // A selected student missing from the results is an opportunity, not a success.
            if (selectedResults.get(studentId) === 1) {
                stats.correct++;
                totalCorrect++;
            }
        }
    }

    return {
        totalTasks: itemArray.length,
        niveauDistribution: toNiveauDistribution(niveauStats),
        successRate: rate(totalCorrect, totalOpportunities),
        totalCorrect,
        totalOpportunities,
    };
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * The zeroed shape the empty placeholder ring renders from, rather than
 * special-casing its own numbers.
 * @returns {RingStats} All figures at zero.
 */
function emptyRingStats() {
    return {
        totalTasks: 0,
        niveauDistribution: [],
        successRate: 0,
        totalCorrect: 0,
        totalOpportunities: 0,
    };
}

/**
 * The accumulator for one Aufgabenniveau, created on first sight.
 * @param {Record<string, NiveauAccumulator>} niveauStats - The accumulator map.
 * @param {string} niveau - The Niveau, as the item scale spells it.
 * @returns {NiveauAccumulator} Its entry.
 */
function niveauEntry(niveauStats, niveau) {
    if (!niveauStats[niveau]) {
        niveauStats[niveau] = { count: 0, correct: 0, opportunities: 0 };
    }
    return niveauStats[niveau];
}

/**
 * The inner ring's segments, in the order it draws them.
 * @param {Record<string, NiveauAccumulator>} niveauStats - The accumulator map.
 * @returns {NiveauStats[]} One entry per Niveau, in the order of the registered item scale.
 */
function toNiveauDistribution(niveauStats) {
    return Object.entries(niveauStats)
        .map(([niveau, s]) => ({
            niveau,
            count: s.count,
            successRate: rate(s.correct, s.opportunities),
        }))
        .sort((a, b) => compareLevelLabels(a.niveau, b.niveau));
}

/**
 * A share as a percentage, zero when nothing was attempted.
 * @param {number} correct - Solved opportunities.
 * @param {number} opportunities - Opportunities they are a share of.
 * @returns {number} The share, 0–100.
 */
function rate(correct, opportunities) {
    return opportunities > 0 ? (correct / opportunities) * 100 : 0;
}

/**
 * Creates a set of student IDs from various input formats
 * @param {string|object|Array<string|object>|null} studentFilter - One student, a list of them, or student objects carrying `studentId`.
 * @returns {Set<string>} The ids as strings; empty when no filter was given.
 */
function createStudentIdSet(studentFilter) {
    const targetStudentIdSet = new Set();
    if (Array.isArray(studentFilter)) {
        studentFilter.forEach((item) => {
            const id = typeof item === 'object' ? item.studentId : item;
            if (id != null) targetStudentIdSet.add(String(id));
        });
    } else if (studentFilter != null) {
        targetStudentIdSet.add(String(studentFilter));
    }
    return targetStudentIdSet;
}
