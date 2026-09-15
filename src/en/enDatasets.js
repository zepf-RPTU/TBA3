/**
 * EN dataset catalog — the one authoritative definition of every derived EN
 * dataset: its DataStore key, the inputs it reads, and the builder that
 * produces it. Consumers ask the store by name (`getDataset`) and never
 * restate this wiring.
 *
 * Registered once per DataStore instance: by EnAppModule at construction, and
 * by unit tests that drive modules reading via `getEnConfig`/`getDataset`.
 */

import { EN_DATA_KEYS } from './enConstants.js';
import { buildEnConfig } from './enConfig.js';
import { parseStyleAggregation } from '@tba3/modules/en-domain';
import { buildClassStudentRecords } from './utils/enStudentDataAdapter.js';
import { buildItemArray } from './utils/enItemDataAdapter.js';

/**
 * Declare the derived EN datasets on a DataStore. Nothing is computed here —
 * each dataset is built lazily on its first `getDataset` call.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store the definitions are registered on.
 */
export function defineEnDatasets(dataStore) {
    dataStore.defineDatasets({
        [EN_DATA_KEYS.STYLE_AVERAGES]: {
            inputs: [EN_DATA_KEYS.AGGREGATION],
            build: parseStyleAggregation,
        },
        [EN_DATA_KEYS.CONFIG]: {
            inputs: [
                EN_DATA_KEYS.COMPETENCE_LEVELS,
                EN_DATA_KEYS.STYLE_AGGREGATION,
                EN_DATA_KEYS.STYLE_AVERAGES,
                EN_DATA_KEYS.COMPETENCE_LEVELS_CLASS,
            ],
            build: buildEnConfig,
        },
        [EN_DATA_KEYS.STUDENT_RECORDS]: {
            inputs: [
                EN_DATA_KEYS.COMPETENCE_LEVELS,
                EN_DATA_KEYS.STYLE_AGGREGATION,
                EN_DATA_KEYS.CONFIG,
            ],
            build: buildClassStudentRecords,
        },
        [EN_DATA_KEYS.ITEM_RECORDS]: {
            inputs: [
                EN_DATA_KEYS.ITEMS,
                EN_DATA_KEYS.STYLE_AGGREGATION,
                EN_DATA_KEYS.ITEM_AGGREGATION,
            ],
            build: buildItemArray,
        },
    });
}
