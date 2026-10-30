// @vitest-browser

import { describe, expect, it, vi } from 'vitest';
import { claimExportTab, exportTabId } from '../../../../src/common/export/exportTab.js';
import { exportImageStore } from '../../../../src/common/export/exportImageStore.js';
import { captureRecord } from '../../support/captureRecord.js';

// The cart is per tab, so a closed tab's captures can never reach a report again;
// left in IndexedDB they would pile up. A live tab's must stay.

const APP = 'tabtest';

/**
 * File a capture under a tab id that no live tab holds, as a closed tab leaves it.
 * @param {string} itemId - The capture's target id.
 * @param {number} [capturedAtMs] - When it was captured, in epoch time.
 */
async function putForClosedTab(itemId, capturedAtMs = 1) {
    // The store creates the database on its first use; a test run alone has made none.
    await exportImageStore.list(APP);
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('tba3-export-images', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
        const transaction = db.transaction('images', 'readwrite');
        transaction.objectStore('images').put({
            key: `tabtest:closed-tab:${itemId}`,
            itemId,
            tabId: 'closed-tab',
            ...captureRecord(itemId),
            capturedAt: capturedAtMs,
        });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    db.close();
}

describe('exportImageStore per tab', () => {
    it("drops a closed tab's captures and keeps this tab's", async () => {
        await claimExportTab(APP);
        await exportImageStore.put(APP, 'mine', captureRecord('mine'));
        await putForClosedTab('theirs');

        await exportImageStore.discardClosedTabs(APP);

        const all = await new Promise(
            (
                /** @type {(rows: import('../../../../src/common/export/exportImageStore.js').StoredExportImage[]) => void} */ resolve,
            ) => {
                const request = indexedDB.open('tba3-export-images', 1);
                request.onsuccess = () => {
                    const read = request.result
                        .transaction('images')
                        .objectStore('images')
                        .getAll(IDBKeyRange.bound('tabtest:', 'tabtest:￿'));
                    read.onsuccess = () => {
                        request.result.close();
                        resolve(read.result);
                    };
                };
            },
        );
        expect(all.map((value) => value.tabId)).toEqual([exportTabId(APP)]);
        expect((await exportImageStore.list(APP)).map((value) => value.itemId)).toEqual(['mine']);

        await exportImageStore.clear(APP);
    });

    // A tab the browser restored but has not loaded yet holds no lock either; its
    // recent captures must still be there when it loads and opens its report.
    it('keeps a recent capture of a tab whose lock nobody holds', async () => {
        await claimExportTab(APP);
        await putForClosedTab('restored', Date.now());

        await exportImageStore.discardClosedTabs(APP);

        const kept = await new Promise((resolve) => {
            const request = indexedDB.open('tba3-export-images', 1);
            request.onsuccess = () => {
                const read = request.result
                    .transaction('images', 'readwrite')
                    .objectStore('images');
                const get = read.get('tabtest:closed-tab:restored');
                get.onsuccess = () => {
                    read.delete('tabtest:closed-tab:restored');
                    request.result.close();
                    resolve(get.result);
                };
            };
        });
        expect(kept?.itemId).toBe('restored');
    });

    // Clearing the site's data closes the page's connection; every later tick would
    // otherwise fail on the dead one until the page reloads.
    it('opens the database again after the browser closed the connection', async () => {
        await exportImageStore.put(APP, 'before', captureRecord('before'));
        const transaction = IDBDatabase.prototype.transaction;
        /** @type {IDBDatabase[]} */
        const connections = [];
        vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(
            /**
             * @this {IDBDatabase}
             * @param {Parameters<IDBDatabase['transaction']>} args
             */
            function (...args) {
                connections.push(this);
                return transaction.apply(this, args);
            },
        );
        await exportImageStore.list(APP);
        const [connection] = connections;
        connection.close();
        connection.dispatchEvent(new Event('close'));

        await exportImageStore.put(APP, 'after', captureRecord('after'));

        expect((await exportImageStore.list(APP)).map((value) => value.itemId).sort()).toEqual([
            'after',
            'before',
        ]);
        await exportImageStore.clear(APP);
    });
});
