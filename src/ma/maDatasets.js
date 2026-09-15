/**
 * MA dataset catalog — the one authoritative definition of every derived MA
 * dataset: its DataStore key, the inputs it reads, and the builder that
 * produces it. Consumers ask the store by name (`getDataset`) and never
 * restate this wiring.
 *
 * Registered once per DataStore instance: by MaAppModule at construction, and
 * by unit tests that read these keys.
 */

import { MA_DATA_KEYS } from './maConstants.js';
import { buildStudentRecords, buildRawStudentArray } from './utils/maStudentDataAdapter.js';
import { buildItemArray } from './utils/maItemDataAdapter.js';
import { deriveMaDomains } from './utils/maDomains.js';

/**
 * Declare the derived MA datasets on a DataStore. Nothing is computed here —
 * each dataset is built lazily on its first `getDataset` call.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store the definitions are registered on.
 */
export function defineMaDatasets(dataStore) {
    dataStore.defineDatasets({
        [MA_DATA_KEYS.ITEM_RECORDS]: {
            inputs: [
                MA_DATA_KEYS.ITEMS,
                MA_DATA_KEYS.STUDENTS_AGGREGATION,
                MA_DATA_KEYS.ITEM_AGGREGATION,
            ],
            build: buildItemArray,
        },
        [MA_DATA_KEYS.STUDENT_RECORDS]: {
            inputs: [
                MA_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS,
                MA_DATA_KEYS.STUDENTS_AGGREGATION,
                MA_DATA_KEYS.ITEM_RECORDS,
            ],
            // buildStudentRecords wants the class's item count, not the records
            build: (studentsCompetenceLevels, studentsAggregation, itemRecords) =>
                buildStudentRecords(
                    studentsCompetenceLevels,
                    studentsAggregation,
                    itemRecords.length,
                ),
        },
        [MA_DATA_KEYS.RAW_STUDENT_RECORDS]: {
            inputs: [MA_DATA_KEYS.ITEMS, MA_DATA_KEYS.STUDENTS_AGGREGATION],
            build: buildRawStudentArray,
        },
        [MA_DATA_KEYS.DOMAINS]: {
            inputs: [MA_DATA_KEYS.ITEMS],
            build: deriveMaDomains,
        },
    });
}
