/**
 * MA task pools — the list of task subsets the class table can be scoped to.
 *
 * A "pool" restricts the class table to a subset of the test booklet's items so
 * SuS can be ordered within a single content area (Differenzierung). The first
 * pool is always "Gesamt" (the whole booklet); the rest are one pool per Leitidee
 * (content domain) that carries at least one item in the current booklet.
 *
 * The class view's "Aufgabenpool" dropdown consumes this pool list.
 */

import { MA_ALL_POOL_LABEL } from '../maConstants.js';

/**
 * @typedef {object} MaTaskPool
 * @property {string} id - Pool id: 'all' for the whole booklet, else the domain id.
 * @property {string} label - Human-readable label shown on the dropdown option.
 * @property {'all'|'leitidee'} type - Pool kind. 'all' keeps the Kompetenzstufe column
 *   and the ±Schwellenwert presets; 'leitidee' drops both (KS is undefined per Leitidee).
 * @property {Set<string>} iqbIds - iqbIds of the items belonging to this pool.
 * @property {number} nrItems - Number of items in the pool (iqbIds.size).
 */

/**
 * Build the ordered task-pool list for the current class.
 * @param {Array<{iqbId: string, domain: string}>} itemArray - Enriched item records
 *   (buildItemArray output) for the class booklet.
 * @param {Array<{domain: string, domainLabel: string}>} domains - MA domains
 *   (getMaDomains output), one entry per Leitidee present in the booklet.
 * @returns {Array<MaTaskPool>} "Gesamt" pool followed by one pool per non-empty Leitidee.
 */
export function buildTaskPools(itemArray, domains) {
    const items = itemArray ?? [];

    const allPool = /** @type {MaTaskPool} */ ({
        id: 'all',
        label: MA_ALL_POOL_LABEL,
        type: 'all',
        iqbIds: new Set(items.map((item) => item.iqbId)),
    });
    allPool.nrItems = allPool.iqbIds.size;

    const pools = [allPool];

    for (const { domain, domainLabel } of domains ?? []) {
        const iqbIds = new Set(
            items.filter((item) => item.domain === domain).map((item) => item.iqbId),
        );
        // A booklet need not cover every Leitidee — skip pools with no items.
        if (iqbIds.size === 0) continue;

        pools.push({
            id: domain,
            label: domainLabel,
            type: 'leitidee',
            iqbIds,
            nrItems: iqbIds.size,
        });
    }

    return pools;
}
