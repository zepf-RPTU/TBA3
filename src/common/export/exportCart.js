/**
 * One app's batch export cart (an `AppContext` member): this tab's report — which export
 * targets are ticked, in what order and how wide their report cards are — kept per app and
 * per tab (see `exportTab.js`) for as long as the tab lives. A ticked target's capture
 * lives in the cart's image store; the cart files it there before it ticks it, and dropping
 * a tick drops its image and its place in the report, so callers make one call.
 *
 * The ticked ids are a signal (`selection`): a reader inside an effect follows it. It
 * changes when a target is ticked or dropped, not when the report is rearranged.
 */

import { computed, signal } from '@preact/signals-core';
import { exportTabId } from './exportTab.js';
import { readJson, writeJson } from '../services/jsonStorage.js';

/** @typedef {import('./memoryImageStore.js').StoredExportImage} StoredExportImage */

/** The widths a report card may take, in grid columns out of 12, widest first. */
export const SPAN_PRESETS = Object.freeze([12, 8, 6, 4]);
const DEFAULT_SPAN = 12;

/**
 * A tick as the tab stores it.
 * @typedef {object} CartEntry
 * @property {string} id - Export target id.
 * @property {number} [span] - Its report card's width (one of `SPAN_PRESETS`); absent until the report placed the card.
 */

/**
 * A card of the report: a ticked target with its width and its stored capture.
 * @typedef {object} ReportItem
 * @property {string} id - Export target id.
 * @property {number} span - Grid columns the card occupies (one of `SPAN_PRESETS`).
 * @property {StoredExportImage} record - The stored capture: its blob, source view, dataset and timestamp.
 */

export class ExportCart {
    /** @type {string} The dashboard whose cart this is. */
    #appId;

    /** @type {string} The sessionStorage key of this tab's cart. */
    #storageKey;

    /** @type {import('./memoryImageStore.js').ImageStore} Where the ticked targets' captures live. */
    #images;

    /** @type {ReadonlyArray<CartEntry>} The ticks in report order, as stored. */
    #entries;

    /** @type {import('@preact/signals-core').Signal<ReadonlyArray<string>>} */
    #ticked;

    /**
     * The ticked ids, across all views.
     * @readonly
     * @type {import('@preact/signals-core').ReadonlySignal<ReadonlyArray<string>>}
     */
    selection;

    /**
     * Built once the tab holds its id (`claimExportTab` runs before the app context).
     * @param {object} options
     * @param {string} options.appId - The dashboard (`en`, `ma`, `sl`): one cart per dashboard and tab, since export target ids are only unique within an app.
     * @param {import('./memoryImageStore.js').ImageStore} options.images - Where the captures live.
     */
    constructor({ appId, images }) {
        this.#appId = appId;
        this.#images = images;
        this.#storageKey = `tba3_export_cart_${appId}_${exportTabId(appId)}`;
        this.#entries = this.#load();
        this.#ticked = signal(Object.freeze(this.#entries.map((entry) => entry.id)));
        this.selection = computed(() => this.#ticked.value);
    }

    // ========================================================================
    // SELECTION
    // ========================================================================

    /**
     * Store a target's capture, then tick it; a target already in the cart keeps its
     * place and width and gets the new image. The image goes in first, so a tick always
     * has one (`readReport` relies on it).
     * @param {string} id
     * @param {import('./memoryImageStore.js').ExportImageRecord} record
     * @returns {Promise<void>} Rejects, ticking nothing, when the image cannot be stored.
     */
    async add(id, record) {
        await this.#images.put(this.#appId, id, record);
        if (!this.#entries.some((entry) => entry.id === id))
            this.#write([...this.#entries, { id }]);
    }

    /**
     * Drop one tick, its stored image and its place in the report, whether or not its
     * module is mounted. Ticked again, the target is a new card.
     * @param {string} id
     */
    remove(id) {
        this.#removeAll([id]);
    }

    /** Drop every tick, every stored image and the arrangement. */
    clear() {
        this.#write([]);
        this.#images.clear(this.#appId).catch((error) => {
            console.warn('[ExportCart] Could not remove stored captures:', error);
        });
    }

    /**
     * Reads `selection`, so an effect calling it follows the cart.
     * @param {string} id
     * @returns {boolean}
     */
    isSelected(id) {
        return this.selection.value.includes(id);
    }

    // ========================================================================
    // REPORT
    // ========================================================================

    /**
     * The report: every tick with its width and its stored capture, in report order. The
     * cart and the image store are made to agree first. An image nobody ticks any more
     * (cleared elsewhere, a failed tick) is deleted. A tick whose image is gone (IndexedDB
     * evicted or unusable) is dropped, which changes `selection`. A tick the report has not
     * placed yet joins at full width after the placed ones, in view order, then in its
     * view's on-screen order, then by capture time, so a fresh report reads top to bottom
     * like the sidebar; that placement is stored.
     *
     * A tick stores its image before it selects, so an id ticked both before and after
     * the image list was read and still without an image is an orphan, not a tick that
     * landed while the list was in flight.
     * @param {ReadonlyArray<string>} viewOrder - View keys in sidebar order; a view not in it sorts last.
     * @returns {Promise<{items: Array<ReportItem>, healedCount: number}>} The report, and how many ticks were dropped for having no image.
     */
    async readReport(viewOrder) {
        const tickedBefore = new Set(this.selection.value);
        const records = await this.#images.list(this.#appId);
        // Read after the list resolved, so a tick that completed meanwhile is not stale.
        const ticked = new Set(this.selection.value);
        /** @type {Map<string, StoredExportImage>} */
        const recordById = new Map();
        for (const record of records) {
            if (ticked.has(record.itemId)) {
                recordById.set(record.itemId, record);
                continue;
            }
            this.#images.delete(this.#appId, record.itemId).catch((error) => {
                console.warn('[ExportCart] Could not remove stale capture:', error);
            });
        }
        const orphans = [...ticked].filter((id) => tickedBefore.has(id) && !recordById.has(id));
        this.#removeAll(orphans);

        /**
         * @param {string} view
         * @returns {number} Its sidebar position; an unknown view sorts last.
         */
        const viewIndex = (view) => {
            const index = viewOrder.indexOf(view);
            return index === -1 ? viewOrder.length : index;
        };
        const shown = this.#entries.filter((entry) => recordById.has(entry.id));
        const placed = shown.filter((entry) => entry.span !== undefined);
        const fresh = shown
            .filter((entry) => entry.span === undefined)
            .map((entry) => /** @type {StoredExportImage} */ (recordById.get(entry.id)))
            .sort(
                (a, b) =>
                    viewIndex(a.view) - viewIndex(b.view) ||
                    a.docOrder - b.docOrder ||
                    a.capturedAt - b.capturedAt,
            )
            .map((record) => ({ id: record.itemId, span: DEFAULT_SPAN }));
        const items = [...placed, ...fresh].map(({ id, span }) => ({
            id,
            span: /** @type {number} */ (span),
            record: /** @type {StoredExportImage} */ (recordById.get(id)),
        }));
        if (fresh.length > 0) this.arrange(items);
        return { items, healedCount: orphans.length };
    }

    /**
     * Store the report's order and widths. Ticks it does not name keep their place after
     * the named ones; a named id that is not ticked is skipped.
     * @param {ReadonlyArray<{id: string, span: number}>} entries - The report's cards, in order.
     */
    arrange(entries) {
        const ticked = new Set(this.#entries.map((entry) => entry.id));
        const arranged = entries
            .filter((entry) => ticked.has(entry.id))
            .map(({ id, span }) => ({ id, span: normalizeSpan(span) }));
        const named = new Set(arranged.map((entry) => entry.id));
        this.#write([...arranged, ...this.#entries.filter((entry) => !named.has(entry.id))]);
    }

    // ========================================================================
    // STORAGE
    // ========================================================================

    /**
     * Drop several ticks, their stored images and their places with one save and one
     * change of `selection`. Ids not in the cart are skipped.
     * @param {Iterable<string>} ids
     */
    #removeAll(ids) {
        const dropping = new Set(ids);
        const dropped = this.#entries.filter((entry) => dropping.has(entry.id));
        if (dropped.length === 0) return;

        this.#write(this.#entries.filter((entry) => !dropping.has(entry.id)));
        for (const { id } of dropped) {
            this.#images.delete(this.#appId, id).catch((error) => {
                console.warn('[ExportCart] Could not remove stored capture:', error);
            });
        }
    }

    /** @returns {ReadonlyArray<CartEntry>} The cart this tab stored; empty when it stored none. */
    #load() {
        const stored = readJson(this.#storageKey, 'sessionStorage');
        if (!Array.isArray(stored)) return [];
        /** @type {Map<string, CartEntry>} */
        const byId = new Map();
        for (const entry of stored) {
            if (typeof entry?.id !== 'string' || !entry.id || byId.has(entry.id)) continue;
            byId.set(
                entry.id,
                entry.span === undefined
                    ? { id: entry.id }
                    : { id: entry.id, span: normalizeSpan(entry.span) },
            );
        }
        return Object.freeze([...byId.values()]);
    }

    /**
     * Make `entries` the cart: store it, then publish its ids through `selection` when a
     * tick came or went.
     * @param {Array<CartEntry>} entries - The new cart, in report order.
     */
    #write(entries) {
        writeJson(this.#storageKey, entries, 'sessionStorage');
        this.#entries = Object.freeze(entries);
        const ids = entries.map((entry) => entry.id);
        const current = new Set(this.#ticked.peek());
        if (ids.length !== current.size || ids.some((id) => !current.has(id))) {
            this.#ticked.value = Object.freeze(ids);
        }
    }
}

/**
 * @param {unknown} span - A stored span value, which may be out of range.
 * @returns {number} The value when it is one of the presets, otherwise the default span.
 */
function normalizeSpan(span) {
    return SPAN_PRESETS.includes(/** @type {number} */ (span))
        ? /** @type {number} */ (span)
        : DEFAULT_SPAN;
}
