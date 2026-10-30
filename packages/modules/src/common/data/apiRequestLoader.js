/**
 * The loader a standalone host hands its `DocumentStore`: every request goes to a TBA3
 * API, filled for one scope. A host that serves files of its own (`info-boxes.json`)
 * wraps it in a loader that answers those requests first.
 */

import { fillEndpoint } from './datasetEndpoints.js';
import { fetchJson as fetchJsonDocument } from './fetchJson.js';

/**
 * `groups/<id>` or `schools/<id>`, the id one path segment. The scope comes off the page
 * URL and is resolved against the base: a `//host`, `..` or `?` in it would send the
 * request to another host, out of the API prefix or with a query of its own. `%`, `\` and
 * tabs/newlines are refused too, as the URL parser turns them into those.
 */
const SCOPE_PATTERN = /^(?:groups|schools)\/(?!\.\.?$)[^/?#\\%\t\n\r]+$/;

/**
 * @param {object} options
 * @param {string|URL} options.baseUrl - The absolute API base; a missing trailing slash is added.
 * @param {string} options.scope - `groups/<id>` or `schools/<id>`.
 * @param {(url: URL) => Promise<unknown>} [options.fetchJson] - Sends one request; the default fetches and fails on a non-OK status.
 * @returns {import('./documentStore.js').RequestLoader}
 * @throws {Error} for a scope `SCOPE_PATTERN` refuses
 */
export function apiRequestLoader({ baseUrl, scope, fetchJson = (url) => fetchJsonDocument(url) }) {
    if (!SCOPE_PATTERN.test(scope)) {
        throw new Error(`'${scope}' is not a scope: expected groups/<id> or schools/<id>`);
    }
    // The templates are relative: against `…/api` they would resolve to `…/groups/…` and
    // silently drop the prefix the base was given for.
    const base = new URL(baseUrl);
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    return (request) => {
        if (!request.template) {
            throw new Error(
                `'${request.file}' is served by the host (${request.site}), not by the API — the host's loader must answer it`,
            );
        }
        return fetchJson(new URL(fillEndpoint(request.template, scope), base));
    };
}
