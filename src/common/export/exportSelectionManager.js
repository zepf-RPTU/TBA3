/**
 * Export Selection Manager
 * Centralized singleton for the batch export cart: which export targets are
 * ticked (persisted per app, for one browsing session) and which of them are
 * currently registered (mounted). A ticked target's capture lives in
 * `exportImageStore`; dropping a selection here drops its image too, so callers
 * make one call.
 */

import { getAppId } from './exportFiles.js';
import { exportImageStore } from './exportImageStore.js';

// One cart per dashboard: export target ids are only unique within an app, and
// the report view (which consumes the cart) is per app as well. The pre-scoping
// key held one cart for all three apps and is dropped on load.
const STORAGE_KEY = `tba3_export_selections_${getAppId()}`;
const LEGACY_SHARED_STORAGE_KEY = 'tba3_export_selections_v2';
// Marks that this tab has already run this dashboard, so the cart is a basket
// for one browsing session rather than forever: any reload of the tab keeps it
// (a dataset switch is one), a fresh tab or a browser restart starts empty.
// Per app, not one global marker — sessionStorage is per origin, so a visit to
// /en/ would otherwise suppress the gate for a later /ma/ in the same tab,
// while a trip back to the hub and into the app again must not wipe the cart.
const SESSION_KEY = `tba3_export_session_${getAppId()}`;
const STORAGE_VERSION = 3;
const MAX_STORED_SELECTIONS = 200;

class ExportSelectionManager {
    constructor() {
        this.items = new Map(); // id -> item object
        this.selectedIds = new Set();
        // id -> title the tick was made under, so a colliding re-registration
        // can be told apart from the same module remounting (see
        // #warnOnIdentityMismatch). Persisted with the cart, because a dataset
        // switch reloads the page and a collision must still be visible after.
        this.selectedTitles = new Map();
        this.listeners = new Map(); // event -> Set of callbacks

        // Restore selections from localStorage — unless this is the first load
        // of this dashboard in this tab, when a cart left behind by an earlier
        // session goes instead of silently re-ticking checkboxes.
        if (this.#isNewBrowsingSession()) {
            this.#discardPreviousSessionCart();
        } else {
            this.loadSelectionsFromStorage();
        }

        // Another tab of the same app wrote the cart (ticked/unticked): re-read
        // it so this tab does not write its stale copy back on its next save.
        // `storage` fires only in other tabs. Page-lifetime singleton — the
        // listener is permanent on purpose.
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (event) => {
                if (event.key !== STORAGE_KEY) return;
                this.loadSelectionsFromStorage();
                this.emit('selectionChanged', {
                    selectedIds: Array.from(this.selectedIds),
                    external: true,
                });
            });
        }
    }

    /**
     * Nullify item references to prevent retaining stale DOM/object references.
     * Called before overwriting or deleting an item.
     * @param {object} item - The item whose references should be cleared
     */
    #nullifyItemReferences(item) {
        if (!item) return;
        item.container = null;
    }

    /**
     * Register an export target for batch export.
     * @param {string} id - Unique identifier
     * @param {object} targetInfo - Metadata for the export target
     */
    registerTarget(id, targetInfo) {
        const wasSelected = this.selectedIds.has(id);

        // Nullify stale references if overwriting an existing entry
        const existing = this.items.get(id);
        if (existing) {
            this.#nullifyItemReferences(existing);
        }

        this.items.set(id, {
            id,
            type: targetInfo?.type || 'module',
            ...targetInfo,
            registeredAt: Date.now(),
        });

        // If this chart was previously selected, emit event to update UI.
        // Singleton — not a BaseModule; raw setTimeout is intentional (page-lifetime object).
        if (wasSelected) {
            this.#warnOnIdentityMismatch(id, targetInfo);
            setTimeout(() => {
                this.emit('selectionChanged', {
                    selectedIds: Array.from(this.selectedIds),
                    restoredId: id,
                });
            }, 0);
        }
    }

    /**
     * Restoring a tick assumes the target that re-registers is the one that
     * was ticked — true for a module remounting after a view switch, false
     * when two cards share an id (a reused container whose id does not carry
     * the card's identity). Then the restored tick belongs to a capture of
     * something else, and the next tick overwrites that capture.
     *
     * This is the safety net behind `buildExportTargetId()`: the dataset and
     * the module's own `getExportIdentity()` are already in the id, so what
     * reaches here is identity the id still fails to express — a module whose
     * content changes in a way nobody declared.
     *
     * The title the tick was made under is the only per-card evidence here, so
     * this cannot catch a collision between two same-titled cards. It is kept
     * with the cart rather than read back from exportImageStore: a plain
     * remount must not open that store, because an open connection blocks the
     * delete the report view's orphan healing depends on.
     * @param {string} id - Item identifier
     * @param {object} targetInfo - Metadata of the target registering now
     */
    #warnOnIdentityMismatch(id, targetInfo) {
        const title = targetInfo?.title;
        const tickedAs = this.selectedTitles.get(id);
        if (!title || !tickedAs || tickedAs === title) return;

        console.warn(
            `[ExportManager] Export id "${id}" was ticked as "${tickedAs}" but is now registered as "${title}". ` +
                'Two targets appear to share one id — their ticks and captures will overwrite each other. ' +
                'Give the id the identity of the card it belongs to.',
        );
    }

    /**
     * Unregister an item (nullifies references before removal). The selection
     * itself stays, so it persists across view changes.
     * @param {string} id - Item identifier
     */
    unregister(id) {
        const item = this.items.get(id);
        if (item) {
            this.#nullifyItemReferences(item);
        }

        const removed = this.items.delete(id);
        if (!removed) return;

        if (this.selectedIds.has(id)) {
            this.emit('selectionChanged', {
                selectedIds: Array.from(this.selectedIds),
                unregisteredId: id,
            });
        }
    }

    // ========================================================================
    // SELECTION
    // ========================================================================

    /**
     * Toggle selection for a registered item.
     * @param {string} id - Item identifier
     * @returns {boolean} New selection state (true if selected)
     */
    toggleSelection(id) {
        if (!this.items.has(id)) {
            console.warn(`[ExportManager] Cannot toggle: item ${id} not registered`);
            return false;
        }

        if (this.selectedIds.has(id)) {
            this.deselect(id);
            return false;
        }

        this.selectedIds.add(id);
        this.selectedTitles.set(id, this.items.get(id)?.title ?? null);
        this.saveSelectionsToStorage();
        this.emit('selectionChanged', {
            selectedIds: Array.from(this.selectedIds),
            changedId: id,
        });
        return true;
    }

    /**
     * Drop one selection and its stored image, whether or not its module is
     * currently registered (the report view removes cards of unmounted modules).
     * @param {string} id - Item identifier
     */
    deselect(id) {
        if (!this.selectedIds.has(id)) return;

        this.selectedIds.delete(id);
        this.selectedTitles.delete(id);
        this.saveSelectionsToStorage();
        exportImageStore.delete(id).catch((error) => {
            console.warn('[ExportManager] Could not remove stored capture:', error);
        });
        this.emit('selectionChanged', {
            selectedIds: Array.from(this.selectedIds),
            changedId: id,
        });
    }

    /**
     * Clear all selections and their stored images.
     */
    clearSelection() {
        this.selectedIds.clear();
        this.selectedTitles.clear();
        this.saveSelectionsToStorage();
        exportImageStore.clear().catch((error) => {
            console.warn('[ExportManager] Could not remove stored captures:', error);
        });
        this.emit('selectionChanged', { selectedIds: [] });
    }

    /**
     * Check if item is selected
     * @param {string} id - Item identifier
     * @returns {boolean} True when the item is in the batch cart.
     */
    isSelected(id) {
        return this.selectedIds.has(id);
    }

    /**
     * Get ids persisted in the global batch-selection cart.
     * @returns {Array<string>} Every id in the cart, across all views.
     */
    getPersistedSelectedIds() {
        return Array.from(this.selectedIds);
    }

    /**
     * Get count of persisted selected items across all views.
     * @returns {number} How many items the cart holds, across all views.
     */
    getPersistedSelectedCount() {
        return this.selectedIds.size;
    }

    // ========================================================================
    // EVENTS
    // ========================================================================

    /**
     * Register event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    /**
     * Unregister event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Emit event to all listeners
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[ExportManager] Error in ${event} listener:`, error);
                }
            });
        }
    }

    /**
     * Get registered item by id
     * @param {string} id - Item identifier
     * @returns {object | null} The registered item, or null when nothing is registered under that id.
     */
    getItem(id) {
        return this.items.get(id) || null;
    }

    /**
     * Whether this dashboard has not run in this tab yet. Marks the session on
     * the way, so only the first load of a tab reports true.
     * @returns {boolean} True on the first load of this dashboard in this tab.
     */
    #isNewBrowsingSession() {
        try {
            if (sessionStorage.getItem(SESSION_KEY)) return false;
            sessionStorage.setItem(SESSION_KEY, '1');
            return true;
        } catch (error) {
            // Storage blocked: localStorage is then blocked too, so there is no
            // cart to gate — keep the load path unchanged rather than clearing.
            console.warn(
                '[ExportManager] Session storage unavailable, keeping the stored cart:',
                error,
            );
            return false;
        }
    }

    /**
     * Drop the cart an earlier session left behind, images included, leaving
     * this session to start empty.
     */
    #discardPreviousSessionCart() {
        try {
            const hadCart = localStorage.getItem(STORAGE_KEY) !== null;
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_SHARED_STORAGE_KEY);
            // Only then open IndexedDB: a cold start with no cart is the common
            // case and has nothing to clear.
            if (!hadCart) return;
        } catch (error) {
            console.error("[ExportManager] Failed to discard the previous session's cart:", error);
            return;
        }

        exportImageStore.clear().catch((error) => {
            console.warn('[ExportManager] Could not remove stored captures:', error);
        });
    }

    /**
     * Save selected IDs to localStorage.
     */
    saveSelectionsToStorage() {
        try {
            let selections = Array.from(this.selectedIds);
            // Cap stored selections to prevent unbounded localStorage growth
            if (selections.length > MAX_STORED_SELECTIONS) {
                selections = selections.slice(-MAX_STORED_SELECTIONS);
            }

            // Titles ride along so #warnOnIdentityMismatch still has something to
            // compare after a reload — which is exactly when an id collision is
            // hardest to spot, because a dataset switch reloads the page.
            const titles = Object.fromEntries(
                selections
                    .map((id) => [id, this.selectedTitles.get(id)])
                    .filter(([, title]) => typeof title === 'string' && title),
            );

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    version: STORAGE_VERSION,
                    selectedIds: selections,
                    selectedTitles: titles,
                }),
            );
        } catch (error) {
            console.error('[ExportManager] Failed to save selections:', error);
        }
    }

    /**
     * Load selected IDs from localStorage
     */
    loadSelectionsFromStorage() {
        this.selectedTitles.clear();
        try {
            localStorage.removeItem(LEGACY_SHARED_STORAGE_KEY);
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) {
                this.selectedIds = new Set();
                return;
            }

            const parsed = JSON.parse(stored);
            const selections = Array.isArray(parsed?.selectedIds) ? parsed.selectedIds : [];
            this.selectedIds = new Set(
                selections
                    .filter((id) => typeof id === 'string' && id.trim())
                    .slice(-MAX_STORED_SELECTIONS),
            );

            // Carts written before titles were stored simply leave the guard
            // without evidence for those ids, which is what it treats as "quiet".
            const titles = parsed?.selectedTitles;
            if (titles && typeof titles === 'object') {
                for (const id of this.selectedIds) {
                    if (typeof titles[id] === 'string' && titles[id]) {
                        this.selectedTitles.set(id, titles[id]);
                    }
                }
            }
        } catch (error) {
            console.error('[ExportManager] Failed to load selections:', error);
            this.selectedIds = new Set();
        }
    }
}

// Create and export singleton instance
export const exportSelectionManager = new ExportSelectionManager();
