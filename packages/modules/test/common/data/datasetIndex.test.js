import { describe, expect, it } from 'vitest';
import { DocumentStore } from '../../../src/common/data/index.js';
import { getRecordsByIds, indexBy } from '../../../src/common/data/datasetIndex.js';
import { dataset } from '../../../src/common/data/documentStore.js';

/**
 * A sync payload carries ids in table order; the consumer gets the records back in that
 * order, without the ids the dataset does not know.
 */

const ROWS_BY_ID = dataset('t.rowsById', {
    inputs: ['items.json'],
    build: () =>
        indexBy(
            [
                { iqbId: 'a', name: '1' },
                { iqbId: 'b', name: '2' },
                { iqbId: 'c', name: '3' },
            ],
            'iqbId',
        ),
});

/** A store whose `items.json` is ensured, so the dataset's input has landed. */
const makeStore = async () => {
    const store = new DocumentStore({
        requests: [{ file: 'items.json', template: 'items', documents: ['items.json'] }],
        loadRequest: async () => [],
    });
    await store.ensure(['items.json']);
    return store;
};

describe('getRecordsByIds', () => {
    it('returns the records in the order of the ids, dropping unknown ones', async () => {
        const store = await makeStore();

        const records = getRecordsByIds(store, ROWS_BY_ID, ['c', 'x', 'a']);

        expect(records.map((record) => record.name)).toEqual(['3', '1']);
    });
});
