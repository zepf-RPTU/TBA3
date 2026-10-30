/**
 * JSON records in Web Storage, one per key: `localStorage` for what every tab shares,
 * `sessionStorage` for what is one tab's. A missing or unparsable record and a blocked
 * storage read as absent; the next write replaces what is there. A failed read or write
 * is logged and dropped — nothing stored here is worth a throw.
 */

/** @typedef {'localStorage'|'sessionStorage'} StorageArea */

/**
 * @param {string} key
 * @param {StorageArea} [area] - Read inside the try: a blocked storage throws on access.
 * @returns {Record<string, any>|null} The stored record, or null when there is none that parses.
 */
export function readJson(key, area = 'localStorage') {
    try {
        const stored = window[area].getItem(key);
        return stored === null ? null : JSON.parse(stored);
    } catch (error) {
        console.error(`[jsonStorage] Failed to read "${key}":`, error);
        return null;
    }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {StorageArea} [area]
 */
export function writeJson(key, value, area = 'localStorage') {
    try {
        window[area].setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`[jsonStorage] Failed to write "${key}":`, error);
    }
}
