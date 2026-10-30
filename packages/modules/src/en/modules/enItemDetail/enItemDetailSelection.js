/**
 * Pure selection helper for per-item tabs. No module or DOM imports.
 */

/**
 * Resolve which selected item should be active after a selection change.
 * - A newly-added item (not in the previous set) becomes active — the last one
 *   when several were added at once.
 * - Otherwise keep the current active item if it is still selected.
 * - Otherwise fall back to the last item in the set (or null when empty).
 * @param {ReadonlyArray<string>} prevIds
 * @param {ReadonlyArray<string>} nextIds
 * @param {string|null} currentActiveId
 * @returns {string|null}
 */
export function resolveActiveId(prevIds, nextIds, currentActiveId) {
    const prev = new Set(prevIds);
    const newlyAdded = nextIds.filter((id) => !prev.has(id));
    if (newlyAdded.length > 0) {
        return newlyAdded[newlyAdded.length - 1];
    }
    if (currentActiveId !== null && nextIds.includes(currentActiveId)) {
        return currentActiveId;
    }
    return nextIds.length ? nextIds[nextIds.length - 1] : null;
}
