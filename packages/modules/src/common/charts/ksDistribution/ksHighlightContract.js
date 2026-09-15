/**
 * Ensure the host carries a normalized highlighted-level state. A recreated chart
 * reuses whatever the host already holds; a fresh host starts unhighlighted.
 * @param {object} host - The chart host owning the selection state.
 * @returns {string|null} The normalized level, or null when nothing is highlighted.
 */
export function ensureHighlightedLevelState(host) {
    host.configState.highlightedLevel = normalizeHighlightedLevel(
        host.configState.highlightedLevel,
    );
    return host.configState.highlightedLevel;
}

/**
 * Normalize highlight input to a stable nullable KS level.
 * Empty strings are treated as "no highlight" because MA reset flows clear
 * selection via empty event payloads.
 * @param {string|null|undefined} level - Raw highlight input, possibly an empty string from a reset event.
 * @returns {string|null} The normalized level, or null when nothing is highlighted.
 */
export function normalizeHighlightedLevel(level) {
    if (typeof level === 'string' && level.trim() === '') {
        return null;
    }

    return level ?? null;
}
