/**
 * A real SL `DataStore` for unit tests, as the app builds it.
 *
 * The SL data port (`slDataFromStore`) and the service readers around it resolve every
 * derived payload through the dataset catalog. A `{ getRawData }` object literal answers
 * the raw half only, so a suite using one exercised fallbacks that no dashboard takes —
 * which is why those fallbacks are gone and this is the one way a suite gets a store.
 */

import { DataStore } from '../../../src/common/services/dataStore.js';
import { defineSlDatasets } from '../../../src/sl/slDataService.js';

/**
 * A store with the derived SL datasets declared and the given raw payloads written in.
 * @param {Record<string, any>} [rawData] - Raw payloads keyed by `SL_DATA_KEYS` entry.
 * @returns {import('../../../src/common/services/dataStore.js').DataStore} The store.
 */
export function createSlDataStore(rawData = {}) {
    const dataStore = new DataStore();
    defineSlDatasets(dataStore);

    for (const [key, value] of Object.entries(rawData)) {
        dataStore.setRawData(key, value);
    }

    return dataStore;
}
