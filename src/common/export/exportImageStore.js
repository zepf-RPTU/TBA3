/**
 * Captured module images for the report view.
 *
 * A module ticked for the Sammelexport is captured right then (it is on screen
 * at that moment) and the PNG is stored here, keyed per app, so the report can
 * show modules from views that are not mounted and survive a reload like the
 * selection itself does. IndexedDB because the blobs do not fit localStorage;
 * when it is unavailable or fails, records live in memory for the session and
 * one warning says so.
 */

import { getAppId } from './exportFiles.js';

const DB_NAME = 'tba3-export-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

/**
 * @typedef {object} ExportImageRecord
 * @property {string} title - Module title at capture time, shown on the report card.
 * @property {string} view - Router view key the module was captured in
 * @property {Blob} blob - PNG capture
 * @property {number} width - Capture width in device px
 * @property {number} height - Capture height in device px
 * @property {number} capturedAt - Epoch ms
 * @property {number} docOrder - Position of the module among its view's cards
 * @property {string} [datasetLabel] - Dataset the capture was taken in, for the
 *   report caption (the dataset id is already part of the target id)
 */

/**
 * @typedef {ExportImageRecord & {itemId: string}} StoredExportImage
 */

class ExportImageStore {
    /** @type {Promise<IDBDatabase|null>|null} */
    #dbPromise = null;
    /** @type {Map<string, StoredExportImage & {key: string}>} */
    #memory = new Map();
    #warned = false;

    /**
     * @param {string} itemId - Export target id the capture is filed under.
     * @param {ExportImageRecord} record - The capture and its provenance.
     * @returns {Promise<void>}
     */
    async put(itemId, record) {
        const value = { key: this.#key(itemId), itemId, ...record };
        const db = await this.#openDb();
        if (!db) {
            this.#memory.set(value.key, value);
            return;
        }
        try {
            await this.#request(db, 'readwrite', (store) => store.put(value));
        } catch (error) {
            this.#fallBack(error);
            this.#memory.set(value.key, value);
        }
    }

    /**
     * @param {string} itemId - Export target id the capture is filed under.
     * @returns {Promise<void>}
     */
    async delete(itemId) {
        const key = this.#key(itemId);
        this.#memory.delete(key);
        const db = await this.#openDb();
        if (!db) return;
        try {
            await this.#request(db, 'readwrite', (store) => store.delete(key));
        } catch (error) {
            this.#fallBack(error);
        }
    }

    /**
     * All records of the current app.
     * @returns {Promise<Array<StoredExportImage>>} Every capture of the current app; empty when the store is unreadable.
     */
    async list() {
        const db = await this.#openDb();
        if (!db) return this.#listMemory();
        try {
            const values = await this.#request(db, 'readonly', (store) =>
                store.getAll(this.#appRange()),
            );
            return Array.isArray(values) ? values : [];
        } catch (error) {
            this.#fallBack(error);
            return this.#listMemory();
        }
    }

    /**
     * Remove every record of the current app.
     * @returns {Promise<void>}
     */
    async clear() {
        const prefix = this.#key('');
        for (const key of Array.from(this.#memory.keys())) {
            if (key.startsWith(prefix)) this.#memory.delete(key);
        }
        const db = await this.#openDb();
        if (!db) return;
        try {
            await this.#request(db, 'readwrite', (store) => store.delete(this.#appRange()));
        } catch (error) {
            this.#fallBack(error);
        }
    }

    // ------------------------------------------------------------------------

    /**
     * Namespace an item id with the current app, so the three dashboards cannot collide in one store.
     * @param {string} itemId - Export target id.
     * @returns {string} The storage key.
     */
    #key(itemId) {
        return `${getAppId()}:${itemId}`;
    }

    #appRange() {
        const prefix = this.#key('');
        return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    }

    #listMemory() {
        const prefix = this.#key('');
        return Array.from(this.#memory.values()).filter((value) => value.key.startsWith(prefix));
    }

    /**
     * Resolves to the open database, or null when IndexedDB is unusable here.
     * @returns {Promise<IDBDatabase|null>} The open database, or null once the store has fallen back to memory.
     */
    #openDb() {
        if (this.#dbPromise) return this.#dbPromise;
        this.#dbPromise = new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') {
                this.#fallBack(new Error('indexedDB is not defined'));
                resolve(null);
                return;
            }
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => {
                    this.#fallBack(request.error);
                    resolve(null);
                };
                request.onblocked = () => {
                    this.#fallBack(new Error('open blocked'));
                    resolve(null);
                };
            } catch (error) {
                this.#fallBack(error);
                resolve(null);
            }
        });
        return this.#dbPromise;
    }

    /**
     * Run one request inside its own transaction.
     * @param {IDBDatabase} db - The open database.
     * @param {IDBTransactionMode} mode - Transaction mode the request needs.
     * @param {(store: IDBObjectStore) => IDBRequest} run - Issues the request against the object store.
     * @returns {Promise<any>} The request's result, or a rejection carrying its error.
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

    /**
     * Switch to memory-only for the rest of the session; warn once.
     * @param {unknown} error - What made IndexedDB unusable; logged once, then the store is memory-only.
     */
    #fallBack(error) {
        this.#dbPromise = Promise.resolve(null);
        if (this.#warned) return;
        this.#warned = true;
        console.warn(
            '[exportImageStore] IndexedDB unavailable, captured images live in memory only:',
            error,
        );
    }
}

export const exportImageStore = new ExportImageStore();
