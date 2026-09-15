/**
 * Picking the best candidate: the min/max-with-tie-break arithmetic the info-box
 * queries select "the class with the highest share" and "the widest range" with.
 * Domain-free — a candidate is whatever the caller's `getValue` and `createSelection`
 * make of it — so the ranking rules are testable without a DataStore.
 */

/**
 * The lowest and highest candidate by `getValue`, each with the selection it maps to.
 * @param {Array<any>} candidates - What to rank.
 * @param {(candidate: any) => number|null} getValue - The figure a candidate is ranked by; `null`/non-finite candidates are skipped.
 * @param {Function} [createSelection] - What a boundary reports; the candidate itself by default.
 * @param {Function|null} [getTieBreakKey] - Orders equal values; the lower key wins.
 * @returns {{minShare: number, maxShare: number, minSelection: any, maxSelection: any}|null} Both boundaries, or `null` when nothing was rankable.
 */
export function getSelectionValueRange(
    candidates,
    getValue,
    createSelection = /** @type {Function} */ ((candidate) => candidate),
    getTieBreakKey = /** @type {Function|null} */ (null),
) {
    if (!Array.isArray(candidates) || typeof getValue !== 'function') {
        return null;
    }

    let minResult = /** @type {any} */ (null);
    let maxResult = /** @type {any} */ (null);
    const resolveTieBreakKey = typeof getTieBreakKey === 'function' ? getTieBreakKey : null;

    candidates.forEach((candidate) => {
        const value = getValue(candidate);
        if (value === null || !Number.isFinite(value)) {
            return;
        }

        const selection = createSelection(candidate, value);
        const tieBreakKey = resolveTieBreakKey?.(candidate, selection) ?? null;

        if (isRangeBoundaryBetter(value, tieBreakKey, minResult, 'min')) {
            minResult = { share: value, selection, tieBreakKey };
        }

        if (isRangeBoundaryBetter(value, tieBreakKey, maxResult, 'max')) {
            maxResult = { share: value, selection, tieBreakKey };
        }
    });

    if (!minResult || !maxResult) {
        return null;
    }

    return {
        minShare: minResult.share,
        maxShare: maxResult.share,
        minSelection: minResult.selection,
        maxSelection: maxResult.selection,
    };
}

/**
 * Whether `value` displaces the current boundary in `mode`, with the tie-break key deciding equal values.
 * @param {number} value - The candidate's figure.
 * @param {string|null} tieBreakKey - Its tie-break key.
 * @param {{share: number, tieBreakKey?: string|null}|null} currentResult - The boundary so far.
 * @param {string} [mode] - Which boundary is being kept: `min` or `max`.
 * @returns {boolean} True when the candidate becomes the new boundary.
 */
function isRangeBoundaryBetter(value, tieBreakKey, currentResult, mode = 'min') {
    if (!currentResult) {
        return true;
    }

    if (mode === 'min') {
        if (value < currentResult.share) {
            return true;
        }
    } else if (value > currentResult.share) {
        return true;
    }

    return (
        tieBreakKey !== null &&
        value === currentResult.share &&
        tieBreakKey.localeCompare(currentResult.tieBreakKey ?? '') < 0
    );
}

/**
 * The single best candidate by `getValue` in `mode`, as the selection it maps to.
 * @param {Array<any>} candidates - What to rank.
 * @param {(candidate: any) => any} createSelection - What a candidate reports; a falsy selection drops the candidate.
 * @param {(candidate: any, selection: any) => number} getValue - The figure it is ranked by.
 * @param {((candidate: any, selection: any) => string)|null} getTieBreakKey - Orders equal values; class or subject name by default.
 * @param {string} [mode] - Whether the lowest (`min`) or the highest (`max`) wins.
 * @returns {any|null} The winning selection, or `null` when nothing was rankable.
 */
export function getBestNumericSelection(
    candidates,
    createSelection,
    getValue,
    getTieBreakKey,
    mode = 'max',
) {
    if (
        !Array.isArray(candidates) ||
        typeof createSelection !== 'function' ||
        typeof getValue !== 'function'
    ) {
        return null;
    }

    let bestResult = /** @type {any} */ (null);
    const resolveTieBreakKey =
        typeof getTieBreakKey === 'function'
            ? getTieBreakKey
            : (_candidate, selection) => selection?.className ?? selection?.subjectName ?? '';

    candidates.forEach((candidate) => {
        const selection = createSelection(candidate);
        if (!selection) {
            return;
        }

        const value = getValue(candidate, selection);
        if (!Number.isFinite(value)) {
            return;
        }

        const tieBreakKey = String(resolveTieBreakKey(candidate, selection) ?? '');
        const bestValue = bestResult?.value;
        const bestTieBreakKey = bestResult?.tieBreakKey ?? '';

        if (isBetterNumericSelection(value, bestValue, tieBreakKey, bestTieBreakKey, mode)) {
            bestResult = { selection, value, tieBreakKey };
        }
    });

    return bestResult?.selection ?? null;
}

/**
 * Whether a signed difference lies on the requested side of zero.
 * @param {number} value - The difference.
 * @param {string} [comparison] - Which side counts: `gt` or `lt`.
 * @returns {boolean} False for a non-finite value.
 */
export function matchesComparison(value, comparison = 'gt') {
    if (!Number.isFinite(value)) {
        return false;
    }

    return comparison === 'lt' ? value < 0 : value > 0;
}

/**
 * Whether the next candidate beats the current best in `mode`, the lower tie-break key winning equal values.
 * @param {number} nextValue - The candidate's figure.
 * @param {*} currentValue - The best figure so far; anything non-finite means there is none yet.
 * @param {string} nextKey - The candidate's tie-break key.
 * @param {string} currentKey - The best's tie-break key.
 * @param {string} [mode] - Whether the lowest (`min`) or the highest (`max`) wins.
 * @returns {boolean} True when the candidate becomes the best.
 */
export function isBetterNumericSelection(
    nextValue,
    currentValue,
    nextKey,
    currentKey,
    mode = 'max',
) {
    if (!Number.isFinite(nextValue)) {
        return false;
    }

    if (!Number.isFinite(currentValue)) {
        return true;
    }

    if (mode === 'min') {
        return (
            nextValue < currentValue ||
            (nextValue === currentValue && nextKey.localeCompare(currentKey) < 0)
        );
    }

    return (
        nextValue > currentValue ||
        (nextValue === currentValue && nextKey.localeCompare(currentKey) < 0)
    );
}
