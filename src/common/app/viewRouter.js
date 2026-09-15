/**
 * ViewRouter - Minimal hash-based router for in-app view navigation.
 *
 * Keeps the URL fragment (e.g. `#overview`) in sync with the currently active
 * view of a single-page app shell. Enables deep-linking, bookmarking, and the
 * browser back/forward buttons without a build step or server-side routing.
 *
 * Why hash (not the History API path)?
 * - Works under Live Server, plain static hosting, and `file://`.
 * - Refreshing a deep link never 404s (the fragment is not sent to the server).
 * - Keeps the three separate HTML shells with their current filenames; the hash
 *   only selects which view is shown inside a shell.
 *
 * A view's URL slug is its view key verbatim (`overview` -> `#overview`), so the
 * set of routable slugs is exactly the app's viewConfig keys.
 */
export class ViewRouter {
    /** @type {Set<string>} All routable view keys */
    #viewKeys;

    /** @type {(viewKey: string) => void} */
    #onRouteChange;

    /**
     * When true, the next `hashchange` event was caused by our own `syncUrl()`
     * call and must be ignored to avoid a redundant route change.
     * @type {boolean}
     */
    #suppressNext = false;

    /** @type {(() => void) | null} */
    #boundHandler = null;

    /**
     * @param {string[]} viewKeys - All view keys for this app (from viewConfig).
     * @param {(viewKey: string) => void} onRouteChange - Called when the URL
     *   changes to a known view (e.g. back/forward or a manual edit).
     */
    constructor(viewKeys, onRouteChange) {
        this.#viewKeys = new Set(viewKeys);
        this.#onRouteChange = typeof onRouteChange === 'function' ? onRouteChange : () => {};
    }

    /**
     * Start listening for URL hash changes (back/forward, manual edits).
     * Idempotent: calling twice has no extra effect.
     */
    start() {
        if (this.#boundHandler) return;

        this.#boundHandler = () => {
            if (this.#suppressNext) {
                this.#suppressNext = false;
                return;
            }
            const viewKey = this.getViewFromLocation();
            if (viewKey) {
                this.#onRouteChange(viewKey);
            }
        };

        window.addEventListener('hashchange', this.#boundHandler);
    }

    /**
     * Resolve the view key encoded in the current URL hash.
     * @returns {string|null} The matching view key, or null if absent/unknown.
     */
    getViewFromLocation() {
        const slug = (window.location.hash || '').replace(/^#\/?/, '').trim();
        if (!slug) return null;
        return this.#viewKeys.has(slug) ? slug : null;
    }

    /**
     * Reflect the given view in the URL hash.
     *
     * - `replace: false` (default) pushes a new history entry so the browser
     *   back button returns to the previous view. This assignment fires a
     *   `hashchange` event, which is suppressed so it does not loop back.
     * - `replace: true` rewrites the current entry via `replaceState` (used on
     *   initial load to avoid a phantom history entry). `replaceState` does not
     *   fire `hashchange`, so no suppression is needed.
     *
     * No-ops when the hash already matches (e.g. when this is driven by a
     * back/forward navigation), which avoids polluting the history stack.
     * @param {string} viewKey - The view to reflect in the hash.
     * @param {{ replace?: boolean }} [options] - Rewrite the current history entry instead of pushing a new one.
     */
    syncUrl(viewKey, { replace = false } = {}) {
        if (!this.#viewKeys.has(viewKey)) return;

        const newHash = `#${viewKey}`;
        if (window.location.hash === newHash) return;

        if (replace) {
            window.history.replaceState(null, '', newHash);
        } else {
            this.#suppressNext = true;
            window.location.hash = newHash;
        }
    }

    /**
     * Remove the hash listener and reset internal state.
     */
    destroy() {
        if (this.#boundHandler) {
            window.removeEventListener('hashchange', this.#boundHandler);
            this.#boundHandler = null;
        }
        this.#suppressNext = false;
    }
}

/**
 * The router view key the user is looking at, read from the URL hash.
 *
 * A free function rather than a `ViewRouter` method: export records carry the
 * view key (file names, PDF footer, report captions/order) and the export layer
 * holds no router instance. It is resolved when the user acts - on export or on
 * tick - never at registration time, which for a freshly rendered view runs
 * before the router has synced the hash.
 *
 * Unlike `getViewFromLocation()`, this does not validate against a view-key set
 * (it has none) and never returns null: an export file name needs a string.
 * @returns {string} Current view key, or 'unknown'.
 */
export function getCurrentViewKey() {
    return window.location.hash.replace('#', '') || 'unknown';
}
