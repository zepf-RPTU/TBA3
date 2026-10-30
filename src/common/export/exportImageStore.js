/**
 * Captured module images for the report view.
 *
 * A module ticked for the Sammelexport is captured right then (it is on screen
 * at that moment) and the PNG is stored here, keyed per app and per tab (see
 * `exportTab.js`), so the report can show modules from views that are not mounted
 * and survive a reload like the selection itself does. IndexedDB because the blobs
 * do not fit localStorage. Where the browser offers no IndexedDB at all, records
 * live in memory for the page (`memoryImageStore.js`, the other adapter of the same
 * interface); a request that fails on a working database rejects, and its caller
 * reports it — it never drops the store and with it every earlier capture.
 */

import { liveExportTabIds } from './exportTab.js';
import { createMemoryImageStore, keyOf, storedRecord } from './memoryImageStore.js';

const DB_NAME = 'tba3-export-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';
// How long a tab whose lock nobody holds keeps its captures. A tab the browser restored
// but has not loaded yet holds no lock either, so the lock alone cannot tell it from a
// closed one; a week covers any restored session.
const CLOSED_TAB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** @typedef {import('./memoryImageStore.js').ExportImageRecord} ExportImageRecord */
/** @typedef {import('./memoryImageStore.js').StoredExportImage} StoredExportImage */
/** @typedef {import('./memoryImageStore.js').ImageStore} ImageStore */

/** @implements {ImageStore} */
class IndexedDbImageStore {
    /** @type {Promise<IDBDatabase|null>|null} */
    #dbPromise = null;
    /** Where records live when the browser offers no IndexedDB. */
    #memory = createMemoryImageStore();

    /** @type {ImageStore['put']} */
    async put(appId, itemId, record) {
        const db = await this.#openDb();
        if (!db) return this.#memory.put(appId, itemId, record);
        const value = storedRecord(appId, itemId, record);
        await this.#request(db, 'readwrite', (store) => store.put(value));
    }

    /** @type {ImageStore['delete']} */
    async delete(appId, itemId) {
        const db = await this.#openDb();
        if (!db) return this.#memory.delete(appId, itemId);
        await this.#request(db, 'readwrite', (store) => store.delete(keyOf(appId, itemId)));
    }

    /** @type {ImageStore['list']} */
    async list(appId) {
        const db = await this.#openDb();
        if (!db) return this.#memory.list(appId);
        return this.#request(db, 'readonly', (store) =>
            store.getAll(this.#range(keyOf(appId, ''))),
        );
    }

    /** @type {ImageStore['clear']} */
    async clear(appId) {
        const db = await this.#openDb();
        if (!db) return this.#memory.clear(appId);
        await this.#request(db, 'readwrite', (store) =>
            store.delete(this.#range(keyOf(appId, ''))),
        );
    }

    /**
     * Remove the captures of this app's closed tabs: their carts died with them, so no
     * report can show the images any more. A tab counts as closed when nobody holds its
     * lock and its newest capture is older than `CLOSED_TAB_RETENTION_MS`.
     * @type {ImageStore['discardClosedTabs']}
     */
    async discardClosedTabs(appId) {
        const live = await liveExportTabIds();
        const db = live && (await this.#openDb());
        if (!db) return;
        const appPrefix = `${appId}:`;
        /** @type {StoredExportImage[]} */
        const values = await this.#request(db, 'readonly', (store) =>
            store.getAll(this.#range(appPrefix)),
        );
        /** @type {Map<string, number>} */
        const newestByTab = new Map();
        for (const { tabId, capturedAt } of values) {
            if (!live.has(tabId)) {
                newestByTab.set(tabId, Math.max(newestByTab.get(tabId) ?? 0, capturedAt));
            }
        }
        const cutoff = Date.now() - CLOSED_TAB_RETENTION_MS;
        for (const [id, newest] of newestByTab) {
            if (newest >= cutoff) continue;
            await this.#request(db, 'readwrite', (store) =>
                store.delete(this.#range(`${appPrefix}${id}:`)),
            );
        }
    }

    /**
     * @param {string} prefix
     * @returns {IDBKeyRange} Every key starting with it.
     */
    #range(prefix) {
        return IDBKeyRange.bound(prefix, `${prefix}￿`);
    }

    /**
     * @returns {Promise<IDBDatabase|null>} The open database, or null for a memory-only page.
     */
    #openDb() {
        this.#dbPromise ??= new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') {
                console.warn(
                    '[exportImageStore] IndexedDB unavailable, captured images live in memory only',
                );
                resolve(null);
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
            };
            request.onsuccess = () => {
                const db = request.result;
                // Another page deletes or upgrades the database: step aside, and open
                // it afresh on the next request, instead of blocking that page.
                db.onversionchange = () => {
                    db.close();
                    this.#dbPromise = null;
                };
                // The browser closed the connection (site data cleared): the next
                // request opens a new one instead of failing on this one for good.
                db.onclose = () => {
                    this.#dbPromise = null;
                };
                resolve(db);
            };
            request.onerror = () => {
                console.warn(
                    '[exportImageStore] IndexedDB could not open, captured images live in memory only:',
                    request.error,
                );
                resolve(null);
            };
        });
        return this.#dbPromise;
    }

    /**
     * Run one request inside its own transaction.
     * @template T
     * @param {IDBDatabase} db
     * @param {IDBTransactionMode} mode
     * @param {(store: IDBObjectStore) => IDBRequest<T>} run - Issues the request against the object store.
     * @returns {Promise<T>} The request's result, or a rejection carrying its error.
     */
    #request(db, mode, run) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, mode);
            const request = run(transaction.objectStore(STORE_NAME));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }
}

/** The page's one store: IndexedDB, in memory where the browser offers none. */
export const exportImageStore = new IndexedDbImageStore();
