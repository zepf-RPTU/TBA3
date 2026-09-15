/**
 * Pure selection helpers for the EN item detail panel: per-item tabs and the
 * solver / non-solver student group.
 * Kept standalone (no module/DOM imports) so they stay trivially unit-testable.
 */

/**
 * Resolve which selected item should be active after a selection change.
 * - A newly-added item (not in the previous set) becomes active — the last one
 *   when several were added at once ("select a new row → switch to it").
 * - Otherwise keep the current active item if it is still selected.
 * - Otherwise fall back to the last item in the set (or null when empty).
 * @param {Array<{[key: string]: any}>} prevItems - Previously selected items (each with iqbId)
 * @param {Array<{[key: string]: any}>} nextItems - Newly selected items (each with iqbId)
 * @param {string|null} currentActiveId - Currently active item's iqbId
 * @returns {string|null} The iqbId that should be active
 */
export function resolveActiveId(prevItems, nextItems, currentActiveId) {
    const prevIds = new Set(prevItems.map((i) => i.iqbId));
    const newlyAdded = nextItems.filter((i) => !prevIds.has(i.iqbId));
    if (newlyAdded.length > 0) {
        return newlyAdded[newlyAdded.length - 1].iqbId;
    }
    if (nextItems.some((i) => i.iqbId === currentActiveId)) {
        return currentActiveId;
    }
    return nextItems.length ? nextItems[nextItems.length - 1].iqbId : null;
}

/** Student group ids for the item detail panel's solver/non-solver toggle. */
export const STUDENT_GROUP = Object.freeze({ SOLVED: 'solved', UNSOLVED: 'unsolved' });

/**
 * Resolve which student group the panel shows by default: the smaller one.
 * Ties go to the solvers, so an item solved by at most half the class shows who
 * managed it, and anything above shows who still needs help.
 *
 * Derived from list lengths only — the Student view's per-item records are built
 * from the same two groups, so no count fields are involved.
 * @param {number} solverCount - Number of students who solved the item
 * @param {number} nonSolverCount - Number who answered wrong or did not attempt it
 * @returns {'solved'|'unsolved'} Group id to show
 */
export function resolveDefaultStudentGroup(solverCount, nonSolverCount) {
    return solverCount <= nonSolverCount ? STUDENT_GROUP.SOLVED : STUDENT_GROUP.UNSOLVED;
}

/**
 * Sort students by last name, then first name, using German collation.
 * @param {Array<{[key: string]: any}>} students - Records with firstName/lastName
 * @returns {Array<{[key: string]: any}>} New sorted array (input untouched)
 */
export function sortStudentsByName(students) {
    return [...students].sort(
        (a, b) =>
            (a.lastName ?? '').localeCompare(b.lastName ?? '', 'de') ||
            (a.firstName ?? '').localeCompare(b.firstName ?? '', 'de'),
    );
}
