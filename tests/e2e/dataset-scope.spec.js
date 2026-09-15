/**
 * E2E test: the `?scope=` escape hatch and the API code path, without a server.
 *
 * The dataset lists carry the demo fixtures only, so the API branch of
 * `createDatasetLoader` (src/common/services/datasetAcquisition.js) is reached through
 * `?scope=<level>/<id>` alone. The fixture API plugin (config/fixtureApiPlugin.js)
 * answers those requests for the committed fixtures, which is what lets this spec
 * exercise the branch end to end: the request templates, the same-origin `api/` base,
 * the selector's appended ad-hoc entry, and the "server not reachable" card a refused
 * connection has to turn into.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

test('an EN group scope loads through the API path and is listed as the selected dataset', async ({
    page,
}) => {
    const apiRequests = [];
    page.on('request', (request) => {
        if (request.url().includes('/api/')) apiRequests.push(new URL(request.url()).pathname);
    });

    await gotoApp(page, '/en/?scope=groups/8b_good');
    await expect(page.locator('.dashboard-bootstrap-error')).toHaveCount(0);

    // Every document came from `api/`, none from the fixture folder.
    expect(apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests.every((path) => path.startsWith('/api/groups/8b_good/'))).toBe(true);

    // `datasetSelectorItems` appends the ad-hoc scope so the selector shows what is loaded.
    const selector = page.locator('#en-shared-header .header-module-select select');
    await expect(selector).toHaveValue('groups/8b_good');
    await expect(selector.locator('option[value="groups/8b_good"]')).toHaveText('groups/8b_good');
});

test('an SL school scope loads through the API path', async ({ page }) => {
    await gotoApp(page, '/sl/?scope=schools/sl');
    await expect(page.locator('.dashboard-bootstrap-error')).toHaveCount(0);
    await page.waitForSelector('.view-skeleton', { state: 'detached', timeout: LOAD_TIMEOUT });
    await expect(page.locator('.sl-summary-view .school-value').first()).toBeVisible({
        timeout: LOAD_TIMEOUT,
    });
});

test('a scope no server answers renders the unreachable-server card, not a blank page', async ({
    page,
}) => {
    // `?api=` points at a loopback port nothing listens on, so the documents exist but
    // the server does not: `fetch` rejects with a TypeError, which `fetchApiJson` maps to
    // ApiUnreachableError, and bootstrap renders that inline instead of throwing. Going
    // through the preview proxy instead would depend on what happens to be listening on
    // 8000 — a running API server answers 404 for an unknown scope, a different card.
    await page.goto('/en/?scope=groups/8b_good&api=http://127.0.0.1:49152/', {
        timeout: LOAD_TIMEOUT,
    });
    const alert = page.locator('.dashboard-bootstrap-error');
    await expect(alert).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(alert).toContainText('nicht erreichbar');
});
