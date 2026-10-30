/**
 * Whether two lists hold the same items in the same order (`Object.is` per item). The
 * same list, or both absent, is the same; one absent is not.
 * @param {ReadonlyArray<unknown>|null|undefined} a
 * @param {ReadonlyArray<unknown>|null|undefined} b
 * @returns {boolean}
 */
export function sameItems(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((item, index) => Object.is(item, b[index]));
}
