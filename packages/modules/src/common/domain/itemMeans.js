/**
 * Per-item comparison means — one group's `descriptiveStatistics.mean` per item, as
 * the percentage the item charts plot.
 *
 * Reads the comparison groups of `items.json`. Shared by the EN and MA item adapters,
 * which draw the same benchmark markers from the same contract and must not disagree
 * about them.
 */

/**
 * Convert an API mean value (0–1 range) to a percentage (0–100 range).
 * Centralises the ×100 scale conversion so all adapters use the same contract.
 * @param {number|null|undefined} mean - Value in 0–1 range from API
 * @returns {number} Value in 0–100 range
 */
export function toPercent(mean) {
    return (mean ?? 0) * 100;
}

/**
 * Build an iqbId -> percentage (0-100) lookup map from comparison group item data.
 *
 * An item without a finite mean gets no entry: the charts draw no marker for it and
 * warn, rather than plotting a 0 % that the population never scored.
 * @param {Array|null|undefined} itemGroups - School or state item groups from items.json
 * @returns {Map<string, number>} iqbId -> percentage correct (0-100)
 */
export function buildItemMeansMap(itemGroups) {
    const map = new Map();

    for (const group of itemGroups ?? []) {
        for (const item of group.items ?? []) {
            const mean = item.descriptiveStatistics?.mean;
            if (typeof mean === 'number' && Number.isFinite(mean)) {
                map.set(item.iqbId, toPercent(mean));
            }
        }
    }

    return map;
}
