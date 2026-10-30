/**
 * A capture store that keeps its records in memory, for as long as it lives. It shares
 * the `ImageStore` interface and the per-app, per-tab keys declared here with the page's
 * IndexedDB store (`exportImageStore.js`).
 */

import { exportTabId } from './exportTab.js';

/**
 * @typedef {object} ExportImageRecord
 * @property {string} title - Module title at capture time, shown on the report card.
 * @property {string} view - Router view key the module was captured in
 * @property {Blob} blob - PNG capture
 * @property {number} width - Capture width in device px
 * @property {number} height - Capture height in device px
 * @property {number} capturedAt - Epoch ms
 * @property {number} docOrder - Position of the module among its view's cards
 * @property {string} datasetLabel - Dataset the capture was taken in, for the
 *   report caption (the dataset id is already part of the target id)
 */

/**
 * @typedef {ExportImageRecord & {itemId: string, tabId: string}} StoredExportImage
 */

/**
 * Where a cart keeps its captures: per app and per tab, a record per export target id.
 * @typedef {object} ImageStore
 * @property {(appId: string, itemId: string, record: ExportImageRecord) => Promise<void>} put - File a capture under its export target id, replacing one filed there before.
 * @property {(appId: string, itemId: string) => Promise<void>} delete
 * @property {(appId: string) => Promise<StoredExportImage[]>} list - Every capture of this tab.
 * @property {(appId: string) => Promise<void>} clear - Remove every capture of this tab.
 * @property {(appId: string) => Promise<void>} discardClosedTabs - Remove the captures of this app's closed tabs.
 */

/**
 * Namespace an item id with the app and the tab, so neither the three dashboards nor two
 * tabs of one collide in the store.
 * @param {string} appId
 * @param {string} itemId
 * @returns {string}
 */
export function keyOf(appId, itemId) {
    return `${appId}:${exportTabId(appId)}:${itemId}`;
}

/**
 * @param {string} appId
 * @param {string} itemId
 * @param {ExportImageRecord} record
 * @returns {StoredExportImage & {key: string}} The record as the store keeps it.
 */
export function storedRecord(appId, itemId, record) {
    return { key: keyOf(appId, itemId), itemId, tabId: exportTabId(appId), ...record };
}

/** @implements {ImageStore} */
class MemoryImageStore {
    /** @type {Map<string, StoredExportImage & {key: string}>} */
    #records = new Map();

    /** @type {ImageStore['put']} */
    async put(appId, itemId, record) {
        const value = storedRecord(appId, itemId, record);
        this.#records.set(value.key, value);
    }

    /** @type {ImageStore['delete']} */
    async delete(appId, itemId) {
        this.#records.delete(keyOf(appId, itemId));
    }

    /** @type {ImageStore['list']} */
    async list(appId) {
        return this.#under(keyOf(appId, ''));
    }

    /** @type {ImageStore['clear']} */
    async clear(appId) {
        for (const { key } of this.#under(keyOf(appId, ''))) this.#records.delete(key);
    }

    /**
     * Nothing to do: the records go with the page.
     * @type {ImageStore['discardClosedTabs']}
     */
    async discardClosedTabs() {}

    /**
     * @param {string} prefix
     * @returns {Array<StoredExportImage & {key: string}>} The records under it.
     */
    #under(prefix) {
        return Array.from(this.#records.values()).filter((value) => value.key.startsWith(prefix));
    }
}

/**
 * @returns {ImageStore} An empty store.
 */
export function createMemoryImageStore() {
    return new MemoryImageStore();
}
