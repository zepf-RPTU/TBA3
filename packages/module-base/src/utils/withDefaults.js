/**
 * Fill the option keys a caller left out from a module's defaults. A key set to
 * `undefined` counts as left out, so it never clobbers a default.
 * @template {object} D
 * @template {object} O
 * @param {D} defaults
 * @param {O} options - They win wherever they are defined.
 * @returns {O & D} A new object.
 */
export function withDefaults(defaults, options) {
    const merged = /** @type {{[key: string]: unknown}} */ ({ ...options });
    for (const [key, value] of Object.entries(defaults)) {
        if (merged[key] === undefined) merged[key] = value;
    }
    return /** @type {O & D} */ (merged);
}
