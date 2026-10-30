/**
 * Records by id: a catalog declares the index as a dataset (`indexBy`), and a sync payload
 * carries ids only, each resolved against that one index.
 */

/**
 * Index records by one of their fields; a catalog dataset's build.
 * @template {{[key: string]: any}} TRecord
 * @param {ReadonlyArray<TRecord>} records
 * @param {keyof TRecord & string} idField - The record property the ids name.
 * @returns {Map<string, TRecord>}
 */
export function indexBy(records, idField) {
    return new Map(records.map((record) => [record[idField], record]));
}

/**
 * @template TRecord
 * @param {import('./documentStore.js').DocumentStore} documents
 * @param {import('./documentStore.js').DatasetKey<ReadonlyMap<string, TRecord>>} indexKey - A catalog's records-by-id dataset.
 * @param {ReadonlyArray<string>} ids - Ids in the order the caller wants the records back.
 * @returns {TRecord[]} The matching records in that order; an unknown id is dropped.
 */
export function getRecordsByIds(documents, indexKey, ids) {
    const byId = documents.getDataset(indexKey);
    const records = [];
    for (const id of ids) {
        const record = byId.get(id);
        if (record !== undefined) records.push(record);
    }
    return records;
}
