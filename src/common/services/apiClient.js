/**
 * Access to the TBA3 API: where it lives (`getApiBaseUrl`) and how an unreachable one is
 * reported (`fetchApiJson`). The JSON fetch itself is the package's (`fetchJson`).
 *
 * The API is reached same-origin under `api/`: the dev and preview servers proxy it to
 * `TBA3_API`, by default port 8000 (vite.config.js); a deployment's reverse proxy does the
 * same (docker/nginx.conf). `?api=` overrides the base, accepting only same-origin or
 * loopback hosts over http(s), so a link cannot point a reader's browser at a foreign
 * server whose payload text the glossary popups render as HTML.
 */

import { FETCH_TIMEOUT_MS, fetchJson, HttpError } from '@tba3/modules/documents';
import { LOOPBACK_HOSTS } from '../../../config/csp.mjs';

/**
 * Resolve a site-relative path (`data/en/`, `api/`) to an absolute URL under the
 * deployed base. Static files under `public/` and the API proxy live at site paths, not
 * beside the module that asks for them — a built chunk's own URL is `/assets/<hash>.js`.
 * @param {string} sitePath - Path below the site base, no leading slash.
 * @returns {URL}
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

/**
 * Parse an `?api=` override. Anything but a base this page may trust throws, so a
 * mistyped override does not read as a server outage.
 * @param {string} override - The raw query value.
 * @returns {URL}
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
        (base.origin === window.location.origin || LOOPBACK_HOSTS.includes(base.hostname));
    if (!allowed) {
        throw new Error(
            `?api= rejected: "${override}" — only this site's origin or localhost/127.0.0.1 ` +
                'over http(s) may serve the API.',
        );
    }
    return base;
}

/**
 * The API base URL: same-origin `api/` by default, overridable per page load with
 * `?api=http://host:port/`.
 * @returns {URL} The base URL; `apiRequestLoader` adds a missing trailing slash.
 * @throws {Error} When the override names a scheme or host the page may not trust.
 */
export function getApiBaseUrl() {
    const override = new URLSearchParams(window.location.search).get('api');
    return override ? parseApiOverride(override) : siteUrl('api/');
}

/**
 * Fetch one API document, reporting an unreachable server in terms a reader can act on.
 * @param {URL} url - Absolute URL of the document.
 * @returns {Promise<unknown>} The parsed document; rejects with a message naming the unreachable server.
 */
export async function fetchApiJson(url) {
    try {
        return await fetchJson(url);
    } catch (error) {
        // Two shapes mean "nobody started the API": `fetch` rejects with a TypeError
        // when the request reached no server (a direct `?api=` base), and the proxy in
        // front of the same-origin `api/` answers 502/503/504 as an HttpError. Any other
        // non-OK status is the API's own answer and already names URL and status.
        if (error instanceof DOMException && error.name === 'TimeoutError') {
            throw new ApiUnreachableError(
                `TBA3 API did not answer ${url.href} within ${FETCH_TIMEOUT_MS / 1000} s.`,
            );
        }
        const unreachable =
            error instanceof TypeError ||
            (error instanceof HttpError && [502, 503, 504].includes(error.status));
        if (unreachable) {
            throw new ApiUnreachableError(
                `TBA3 API not reachable via ${url.href} — the dev/preview server and the ` +
                    'deployment proxy /api/ to the API server (dev/preview: TBA3_API, by default ' +
                    'http://127.0.0.1:8000).',
            );
        }
        throw error;
    }
}
