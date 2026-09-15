/**
 * Efficiently compares two arrays of primitives or student-like objects.
 * @param {Array} arr1 - One array.
 * @param {Array} arr2 - The other.
 * @returns {boolean} True when both hold the same members in the same order; identity and length are checked first.
 */
export function arraysEqual(arr1, arr2) {
    if (arr1 === arr2) return true;
    if (!arr1 || !arr2) return arr1 === arr2;
    if (arr1.length !== arr2.length) return false;

    for (let index = 0; index < arr1.length; index++) {
        const value1 = arr1[index]?.studentId ?? arr1[index];
        const value2 = arr2[index]?.studentId ?? arr2[index];
        if (value1 !== value2) return false;
    }

    return true;
}
