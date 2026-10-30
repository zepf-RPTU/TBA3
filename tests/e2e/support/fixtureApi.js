/**
 * Serve fixture data inside the test: through the API path, or edited.
 *
 * The dashboards load their curated demo datasets from fixture folders, so the API branch
 * of the loader is only reached for a scope no app lists. `serveFixtureAsApi` routes such a scope's
 * `api/` requests to the fixture files: a request is answered only when it is exactly one
 * of the requests in `datasetEndpoints.js` filled for that scope, so the contract the real
 * API serves is the one the test checks, and a drifted template fails with a 404.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GROUP_REQUESTS, SCHOOL_REQUESTS, fillEndpoint } from '@tba3/modules/documents';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} scope - The unlisted scope to answer, e.g. `groups/api-probe`.
 * @param {string} folder - The fixture folder under the app's `public/data/<app>/`.
 * @param {(file: string, answer: unknown) => unknown} [edit] - Changes an answer (parsed JSON) before it is served, to break it on purpose.
 * @returns {Promise<void>}
 */
export async function serveFixtureAsApi(page, scope, folder, edit) {
    const isGroup = scope.startsWith('groups/');
    await page.route(`**/api/${scope}/**`, async (route) => {
        const url = new URL(route.request().url());
        const request =
            url.pathname.slice(url.pathname.indexOf('/api/') + '/api/'.length) + url.search;
        const app = isGroup ? (url.searchParams.get('domain') ?? '') : 'sl';
        const requests = isGroup ? GROUP_REQUESTS[/** @type {'en'|'ma'} */ (app)] : SCHOOL_REQUESTS;
        const match = requests?.find(
            ({ template }) => template && fillEndpoint(template, scope) === request,
        );
        if (!match) {
            await route.fulfill({ status: 404, body: 'Not Found' });
            return;
        }
        const body = readFileSync(path.join('public', 'data', app, folder, match.file), 'utf8');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: edit ? JSON.stringify(edit(match.file, JSON.parse(body))) : body,
        });
    });
}
