/**
 * A user's pick from a fixed list, persisted in localStorage. Persistence is
 * best-effort: where localStorage is unavailable (private mode, disabled) the read
 * falls back and the write is dropped.
 */

/**
 * @param {string} key
 * @param {ReadonlyArray<{id: string}>} choices - The valid choices.
 * @param {string} fallback - Returned when nothing valid is stored.
 * @returns {string} The stored id when it names one of `choices`, else `fallback`.
 */
export function readStoredChoice(key, choices, fallback) {
    try {
        const stored = localStorage.getItem(key);
        if (stored && choices.some((choice) => choice.id === stored)) return stored;
    } catch {
        // localStorage unavailable: fall back.
    }
    return fallback;
}

/**
 * @param {string} key
 * @param {string} id
 */
export function storeChoice(key, id) {
    try {
        localStorage.setItem(key, id);
    } catch {
        // localStorage unavailable: the choice holds for this page only.
    }
}
