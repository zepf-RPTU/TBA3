/**
 * Fixture API: answers the dashboards' API requests off `public/data/` so the `?scope=`
 * path runs without a server.
 *
 * The dashboards fetch a dataset either from a fixture folder or from the API under
 * `api/`, naming the same documents either way (src/common/services/datasetAcquisition.js).
 * This middleware — dev and preview alike — takes the API side for the committed
 * fixtures: `?scope=groups/8b_good` on EN resolves to `public/data/en/8b_good/`,
 * `?scope=schools/sl` on SL to `public/data/sl/sl/`. The scope's second segment is the
 * fixture folder, the app folder follows from the request (`domain=en|ma` on a group
 * request, `sl` for a school request), and a request is answered only when it is
 * exactly one of the templates in `datasetEndpoints.js` filled for that scope — so the
 * contract the real API serves is the one the fixtures serve, and a drifted template
 * fails here with a 404 instead of silently succeeding.
 *
 * A scope whose folder does not exist is passed on to the `/api/` proxy, so a running
 * API server still answers its own scopes.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    GROUP_ENDPOINTS,
    SCHOOL_ENDPOINTS,
    fillEndpoint,
} from '../src/common/services/datasetEndpoints.js';

const DATA_ROOT = fileURLToPath(new URL('../public/data/', import.meta.url));

/**
 * Resolve one `/api/...` request to a fixture file.
 * @param {string} requestUrl - Path and query as received, e.g. `/api/groups/8b_good/items?domain=en&...`.
 * @returns {{file: string} | {status: 404} | null} The file to serve, a 404 for a
 * fixture scope asking for a document its contract does not have, or null when the
 * request is not for a fixture scope.
 */
function resolveFixtureRequest(requestUrl) {
    const url = new URL(requestUrl, 'http://fixture');
    const match = /^\/api\/(groups|schools)\/([^/?]+)\//.exec(url.pathname);
    if (!match) return null;
    const [, level, folder] = match;
    const isGroup = level === 'groups';
    const subject = url.searchParams.get('domain') ?? '';
    const app = isGroup ? subject : 'sl';
    if (!/^(en|ma|sl)$/.test(app)) return null;

    const folderPath = path.join(DATA_ROOT, app, folder);
    if (!existsSync(folderPath)) return null;

    const request = url.pathname.slice('/api/'.length) + url.search;
    const scope = `${level}/${folder}`;
    for (const [document, template] of Object.entries(
        isGroup ? GROUP_ENDPOINTS : SCHOOL_ENDPOINTS,
    )) {
        if (fillEndpoint(template, scope, subject) === request) {
            const file = path.join(folderPath, document);
            return existsSync(file) ? { file } : { status: 404 };
        }
    }
    return { status: 404 };
}

/**
 * @param {import('node:http').IncomingMessage} req - The request.
 * @param {import('node:http').ServerResponse} res - The response.
 * @param {() => void} next - Hands the request on (to the proxy, for a non-fixture scope).
 */
function serveFixture(req, res, next) {
    const resolved = req.url ? resolveFixtureRequest(req.url) : null;
    if (!resolved) return next();
    if ('status' in resolved) {
        res.writeHead(resolved.status, { 'Content-Type': 'text/plain' }).end('Not Found');
        return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(readFileSync(resolved.file));
}

/** @returns {import('vite').Plugin} The plugin, for dev and preview. */
export function fixtureApiPlugin() {
    return {
        name: 'tba3-fixture-api',
        // Registered directly, not from a returned post-hook, so it runs before Vite's
        // own middlewares — the proxy among them.
        configureServer(server) {
            server.middlewares.use(serveFixture);
        },
        configurePreviewServer(server) {
            server.middlewares.use(serveFixture);
        },
    };
}
