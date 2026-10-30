/**
 * ViewRouter — hash router for in-app view navigation.
 *
 * Keeps the URL fragment (`#overview`) in sync with the active view, for deep links
 * and back/forward. The hash rather than a path: static hosting needs no rewrite
 * rules, a reloaded deep link never 404s, and each dashboard keeps its HTML file.
 *
 * A view's slug is its view key verbatim, so the routable slugs are the viewConfig keys.
 */
export class ViewRouter {
    /** @type {Set<string>} */
    #viewKeys;

    /** @type {(viewKey: string) => void} */
    #onRouteChange;

    /** @type {(() => void) | null} */
    #boundHandler = null;

    /**
     * @param {string[]} viewKeys - All view keys for this app (from viewConfig).
     * @param {(viewKey: string) => void} onRouteChange - Called when the URL
     *   changes to a known view (e.g. back/forward or a manual edit).
     */
    constructor(viewKeys, onRouteChange) {
        this.#viewKeys = new Set(viewKeys);
        this.#onRouteChange = onRouteChange;
    }

    /**
     * Start listening for URL hash changes (back/forward, manual edits). Idempotent.
     */
    start() {
        if (this.#boundHandler) return;

        this.#boundHandler = () => {
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
     * Reflect the given view in the URL hash, through the History API, which fires no
     * `hashchange`: `replace: false` pushes a new entry so the back button
     * returns to the previous view, `replace: true` rewrites the current one (initial
     * load, so there is no phantom entry). Back/forward between entries still fires
     * `hashchange`, which start() routes.
     *
     * No-op when the hash already matches (a back/forward navigation drove this).
     * @param {string} viewKey
     * @param {{ replace: boolean }} options
     */
    syncUrl(viewKey, { replace }) {
        if (!this.#viewKeys.has(viewKey)) return;

        const newHash = `#${viewKey}`;
        if (window.location.hash === newHash) return;

        window.history[replace ? 'replaceState' : 'pushState'](null, '', newHash);
    }

    /**
     * Remove the hash listener.
     */
    destroy() {
        if (this.#boundHandler) {
            window.removeEventListener('hashchange', this.#boundHandler);
            this.#boundHandler = null;
        }
    }
}
