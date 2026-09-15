/**
 * MA domain lookup — derives the `{ domain, domainLabel }` list from the item
 * groups already held in the DataStore.
 *
 * Domains are a pure function of the loaded item groups, so they are derived once
 * and cached per-DataStore instance as the dataset declared in maDatasets.js.
 */

import { MA_DATA_KEYS } from '../maConstants.js';

/**
 * Derive the MA domain list from the class item groups.
 * @param {Array<{domain?: {id?: string, name?: string}}>} classItems - The class's item groups, one per Leitidee, in payload order.
 * @returns {Array<{domain: string, domainLabel: string}>} One entry per Leitidee, in the same order.
 */
export function deriveMaDomains(classItems) {
    return (classItems ?? []).map((g) => ({
        domain: g.domain?.id ?? '',
        domainLabel: g.domain?.name ?? '',
    }));
}

/**
 * Get the MA domains for the current class, derived once and cached in the
 * DataStore. The dataset's wiring (`MA_DATA_KEYS.ITEMS` → `deriveMaDomains`)
 * is declared in maDatasets.js.
 * @param {import('../../common/services/dataStore.js').DataStore} [dataStore] - Store holding the current class's loaded datasets.
 * @returns {Array<{domain: string, domainLabel: string}>} The Leitideen, or an empty list without a store.
 */
export function getMaDomains(dataStore) {
    if (!dataStore) return [];
    return dataStore.getDataset(MA_DATA_KEYS.DOMAINS);
}
