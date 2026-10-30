/**
 * This tab's identity for the export cart. The cart is per tab: each tab of a dashboard
 * ticks its own cards, and a second tab neither sees nor wipes the first one's.
 *
 * The id lives in `sessionStorage`, so it survives a reload of the tab (a dataset switch
 * is one) and dies with the tab. While the tab lives it holds a Web Lock named after its
 * id, which tells the others two things: a duplicated tab — the browser copies
 * `sessionStorage` into it — finds its copied id's lock taken and takes a new id, and
 * the images of a tab whose lock nobody holds any more can be discarded
 * (`discardClosedTabs` in the image store, which owns the retention rule).
 *
 * Web Locks exist only in a secure context; served over plain HTTP from another host the
 * tab keeps its `sessionStorage` id without a lock, so a duplicated tab shares its
 * origin's cart and no closed tab's images are discarded. A lock request that fails
 * leaves the tab the same way.
 */

import { holdLock } from '../services/webLock.js';

const LOCK_PREFIX = 'tba3-export-tab:';

/**
 * @param {string} appId - The dashboard (`en`, `ma`, `sl`).
 * @returns {string} This dashboard's sessionStorage key for the tab id.
 */
const sessionKey = (appId) => `tba3_export_tab_${appId}`;

/** @type {Map<string, string>} Each dashboard's tab id, once read or minted. */
const tabIds = new Map();

/**
 * This tab's id, read from `sessionStorage` or minted on first use.
 * @param {string} appId
 * @returns {string}
 */
export function exportTabId(appId) {
    let tabId = tabIds.get(appId) ?? null;
    if (tabId) return tabId;
    try {
        tabId = sessionStorage.getItem(sessionKey(appId));
    } catch {
        // Storage blocked: the id lives for this page load only.
    }
    if (!tabId) return mintTabId(appId);
    tabIds.set(appId, tabId);
    return tabId;
}

/**
 * Take a new id for this tab and remember it.
 * @param {string} appId
 * @returns {string}
 */
function mintTabId(appId) {
    // Not crypto.randomUUID(): that one exists only in a secure context.
    const tabId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
        n.toString(16).padStart(8, '0'),
    ).join('');
    tabIds.set(appId, tabId);
    try {
        sessionStorage.setItem(sessionKey(appId), tabId);
    } catch {
        // Storage blocked: the id lives for this page load only.
    }
    return tabId;
}

/**
 * Hold this tab's lock for the tab's lifetime — or, when another live tab already holds
 * it (this tab is a duplicate carrying a copied id), take a new id and hold that one.
 * Called once at start-up, before anything reads the cart.
 * @param {string} appId
 * @returns {Promise<void>}
 */
export async function claimExportTab(appId) {
    if (!navigator.locks) {
        exportTabId(appId);
        return;
    }
    try {
        if (await holdTabLock(exportTabId(appId))) return;
        await holdTabLock(mintTabId(appId));
    } catch (error) {
        // As without Web Locks: the tab keeps its id, unlocked.
        console.warn('[exportTab] Could not take the export lock:', error);
    }
}

/**
 * The ids of every tab of this origin that is still open.
 * @returns {Promise<Set<string>|null>} The live tab ids, this tab's included; null
 *   without Web Locks, when no tab's liveness is known.
 */
export async function liveExportTabIds() {
    if (!navigator.locks) return null;
    const { held = [] } = await navigator.locks.query();
    return new Set(
        held
            .map((lock) => lock.name ?? '')
            .filter((name) => name.startsWith(LOCK_PREFIX))
            .map((name) => name.slice(LOCK_PREFIX.length)),
    );
}

/**
 * Take the lock of `id` and keep it until the tab closes.
 * @param {string} id
 * @returns {Promise<boolean>} Whether this tab now holds it; false when another tab does.
 *   Rejects when the request fails.
 */
async function holdTabLock(id) {
    return (await holdLock(`${LOCK_PREFIX}${id}`, { ifAvailable: true })) !== null;
}
