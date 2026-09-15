/**
 * Access to the TBA3 API.
 *
 * A real dataset is never copied into `data/` as a JSON export — it is fetched from an
 * API through a `?scope=` on the URL. The hand-made demo fixtures live on disk; which of
 * the two a dataset uses is decided by its descriptor, see `datasetAcquisition.js`.
 *
 * The API is reached same-origin under `api/`: the dev and preview servers answer the
 * fixture folders' own scopes themselves (config/fixtureApiPlugin.js) and proxy
 * everything else to an API server on port 8000 (vite.config.js); a deployment's reverse
 * proxy does the same (docker/nginx.conf). `?api=` overrides the base for a
 * differently-hosted one.
 * The override is held to that reasoning: only same-origin or loopback hosts over
 * http(s) are accepted, so a link cannot point a reader's browser at a foreign server
 * whose payload text the glossary popups render as HTML.
 */

/**
 * Resolve a site-relative path (`data/en/`, `api/`) to an absolute URL under the
 * deployed base. Static files under `public/` and the API proxy live at site paths, not
 * beside the module that asks for them — a built chunk's own URL is `/assets/<hash>.js`.
 * @param {string} sitePath - Path below the site base, no leading slash.
 * @returns {URL} The absolute URL.
 */
export function siteUrl(sitePath) {
    return new URL(`${import.meta.env.BASE_URL}${sitePath}`, document.baseURI);
}

/** The API never answered — nobody started the API server, or the proxy cannot reach it. */
export class ApiUnreachableError extends Error {
    /** @param {string} message - The developer-facing message, naming the URL. */
    constructor(message) {
        super(message);
        this.name = 'ApiUnreachableError';
    }
}

/** A response that arrived but was not OK, carrying the status so callers can branch on it. */
class HttpError extends Error {
    /**
     * @param {string} message - The failure message, naming path and status.
     * @param {number} status - The HTTP status the server answered with.
     */
    constructor(message, status) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

/**
 * Fetch a JSON document at a path relative to a base URL; the demo fixtures under
 * `public/data/` load this way, and the API fetch below wraps it.
 * @param {string|URL} relativePath - an absolute URL resolves on its own, ignoring the base
 * @param {string|URL} [baseUrl] - Base the relative path resolves against; required unless the path is absolute.
 * @returns {Promise<any>} The parsed JSON; rejects naming the relative path and HTTP status.
 * @throws {HttpError} When the server answered with a non-OK status.
 */
export async function fetchJson(relativePath, baseUrl) {
    const response = await fetch(new URL(relativePath, baseUrl));
    if (!response.ok) {
        throw new HttpError(
            `Failed to load ${relativePath}: ${response.status} ${response.statusText}`,
            response.status,
        );
    }
    return response.json();
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Parse an `?api=` override, accepting only a base this page may trust: `http:`/`https:`
 * to the page's own origin or to a loopback host on any port. Anything else throws —
 * loudly, so a mistyped override reads as what it is rather than as a server outage.
 * @param {string} override - The raw query value.
 * @returns {URL} The parsed base.
 */
function parseApiOverride(override) {
    let base;
    try {
        base = new URL(override);
    } catch {
        throw new Error(`?api= is not a URL: "${override}"`);
    }
    const allowed =
        (base.protocol === 'http:' || base.protocol === 'https:') &&
        (base.origin === window.location.origin || LOOPBACK_HOSTS.has(base.hostname));
    if (!allowed) {
        throw new Error(
            `?api= rejected: "${override}" — only this site's origin or localhost/127.0.0.1 ` +
                'over http(s) may serve the API.',
        );
    }
    return base;
}

/**
 * The API base URL, overridable per page load with `?api=http://host:port/`. By default
 * the API is same-origin under `api/`: the dev and preview servers (vite.config.js)
 * proxy it to port 8000, a deployment's reverse proxy does the same.
 * @param {string} [search=window.location.search] - Query string to read the `?api=` override from; injectable for tests.
 * @returns {URL} The base URL, guaranteed to end in a slash so relative endpoints resolve under it.
 * @throws {Error} When the override names a scheme or host the page may not trust.
 */
export function getApiBaseUrl(search = window.location.search) {
    const override = new URLSearchParams(search).get('api');
    const base = override ? parseApiOverride(override) : siteUrl('api/');
    // The endpoint templates are relative, so a base whose path lacks a trailing slash
    // (`?api=http://host/api`) would resolve against its parent and silently drop the
    // prefix the override was given for.
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    return base;
}

/**
 * Fetch one API document, reporting an unreachable server in terms a reader can act on.
 * @param {URL} url - Absolute URL of the document.
 * @returns {Promise<any>} The parsed document; rejects with a message naming the unreachable server.
 */
export async function fetchApiJson(url) {
    try {
        return await fetchJson(url);
    } catch (error) {
        // Two shapes mean the same thing — nobody started the API. `fetch` rejects with
        // a TypeError when the request never reached a server at all (a direct `?api=`
        // base), and the proxy in front of the same-origin `api/` answers 502/503/504
        // when it cannot reach the API server, which arrives as an HttpError instead. Any
        // other non-OK status is the API's own answer and already names URL and status.
        const unreachable =
            error instanceof TypeError ||
            (error instanceof HttpError && [502, 503, 504].includes(error.status));
        if (unreachable) {
            throw new ApiUnreachableError(
                `TBA3 API not reachable via ${url.href} — the dev/preview server and the ` +
                    'deployment proxy /api/ to an API server on port 8000.',
            );
        }
        throw error;
    }
}
