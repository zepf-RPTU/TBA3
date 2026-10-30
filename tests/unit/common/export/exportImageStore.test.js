// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';
import { exportImageStore } from '../../../../src/common/export/exportImageStore.js';
import { createMemoryImageStore } from '../../../../src/common/export/memoryImageStore.js';
import { captureRecord } from '../../support/captureRecord.js';

// One contract, two adapters: the page's IndexedDB store (real IndexedDB here) and the
// memory store a test hands its cart. A cart written against one runs on the other.

/** The dashboard the records are filed under. */
const APP = 'tba3';

describe.each([
    ['the memory store', createMemoryImageStore()],
    ['the page store, on IndexedDB', exportImageStore],
])('%s', (_name, store) => {
    afterEach(async () => {
        await store.clear(APP);
        await store.clear('ma');
    });

    it('put/list/delete/clear round-trip records with their item ids', async () => {
        await store.put(APP, 'a', captureRecord('A'));
        await store.put(APP, 'b', captureRecord('B', 'item'));

        expect((await store.list(APP)).find((entry) => entry.itemId === 'a')?.title).toBe('A');
        expect((await store.list(APP)).map((entry) => entry.itemId).sort()).toEqual(['a', 'b']);

        await store.delete(APP, 'a');
        expect((await store.list(APP)).map((entry) => entry.itemId)).toEqual(['b']);

        await store.clear(APP);
        expect(await store.list(APP)).toEqual([]);
    });

    it('overwrites a re-captured item in place', async () => {
        await store.put(APP, 'a', captureRecord('old'));
        await store.put(APP, 'a', captureRecord('new'));

        const records = await store.list(APP);
        expect(records).toHaveLength(1);
        expect(records[0].title).toBe('new');
    });

    it('scopes list() and clear() to the app named', async () => {
        await store.put(APP, 'a', captureRecord('A'));
        await store.put('ma', 'a', captureRecord('MA'));
        expect((await store.list('ma')).map((entry) => entry.title)).toEqual(['MA']);
        await store.clear('ma');
        expect(await store.list('ma')).toEqual([]);
        expect((await store.list(APP)).map((entry) => entry.title)).toEqual(['A']);
    });
});
