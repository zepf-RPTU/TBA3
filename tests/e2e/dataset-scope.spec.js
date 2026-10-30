/**
 * E2E test: an unlisted `?scope=` and the API code path, without a server.
 *
 * The listed datasets load from their fixture folders, so the API branch of
 * `createDatasetLoader` (src/common/services/datasetAcquisition.js) is reached through a
 * scope no app lists, answered here from a committed fixture (support/fixtureApi.js).
 * Covered end to end: the request templates, the same-origin `api/` base, the
 * selector's appended ad-hoc entry, and the cards a refused connection and a malformed
 * document turn into.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { serveFixtureAsApi } from './support/fixtureApi.js';

/** A scope no app lists, so it takes the API path. */
const PROBE = 'api-probe';

test('an EN group scope loads through the API path and is listed as the selected dataset', async ({
    page,
}) => {
    /** @type {string[]} */
    const apiRequests = [];
    page.on('request', (request) => {
        if (request.url().includes('/api/')) apiRequests.push(new URL(request.url()).pathname);
    });

    await serveFixtureAsApi(page, `groups/${PROBE}`, '8b_good');
    await gotoApp(page, `/en/?scope=groups/${PROBE}`);

    expect(apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests.every((path) => path.startsWith(`/api/groups/${PROBE}/`))).toBe(true);

    // `datasetSelectorItems` appends the ad-hoc scope so the selector shows what is loaded.
    const trigger = page.locator('#en-shared-header .header-module-select button');
    await expect(trigger).toHaveAccessibleName(`Lerngruppe: groups/${PROBE}`);
    await trigger.click();
    await expect(
        page.getByRole('menuitemradio', { name: `groups/${PROBE}`, checked: true }),
    ).toBeVisible();
});

test('a scope no server answers renders the unreachable-server card, not a blank page', async ({
    page,
}) => {
    // `?api=` points at a loopback port nothing listens on: `fetch` rejects with a
    // TypeError, which `fetchApiJson` maps to ApiUnreachableError, and bootstrap renders
    // that inline. The preview proxy would depend on what listens on 8000: a running API
    // server answers 404 for an unknown scope, a different card.
    await page.goto(`/en/?scope=groups/${PROBE}&api=http://127.0.0.1:49152/`);
    const alert = page.locator('.dashboard-bootstrap-error');
    await expect(alert).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    await expect(alert).toContainText('nicht erreichbar');
    // The shell is up (the overview reads no document before it shows), so the way on
    // is another dataset, not a reload that keeps the same `?scope`.
    await expect(alert).toContainText('anderen Datensatz');
    await expect(alert).not.toContainText('Laden Sie die Seite neu');
});

test('a first view that fails on the load leaves links out and no second alert', async ({
    page,
}) => {
    // The group view waits for the data, so the dashboard does not come up at all.
    await page.goto(`/en/?scope=groups/${PROBE}&api=http://127.0.0.1:49152/#group`);
    const alert = page.locator('.dashboard-bootstrap-error');
    await expect(alert).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    await expect(alert.locator('a[href="../"]')).toBeVisible();
    // A reload would keep `?scope` and `?api` and fail again: the page without them.
    await expect(alert.locator('a[href="/en/"]')).toBeVisible();
    // The sidebar never rendered, so the alert carries the Impressum link.
    await expect(alert.locator('a[href="../docs/docs/impressum.html"]')).toBeVisible();
    // The failed switch reports in the same task as the alert, so a count now is final.
    expect(await page.locator('.toast').count()).toBe(0);
});

test('a document the store rejects renders the malformed-data card, not a broken dashboard', async ({
    page,
}) => {
    // One row without its `type`: the store's schema check fails the load, and bootstrap
    // names the cause instead of letting a chart misread the row.
    await serveFixtureAsApi(page, `groups/${PROBE}`, '8b_good', (file, answer) =>
        file === 'competence-levels.json'
            ? /** @type {Array<Record<string, unknown>>} */ (answer).map((row, index) =>
                  index === 0 ? { ...row, type: undefined } : row,
              )
            : answer,
    );
    /** @type {string[]} */
    const shapeErrors = [];
    page.on('console', (msg) => {
        if (msg.text().includes('DocumentShapeError')) shapeErrors.push(msg.text());
    });
    await page.goto(`/en/?scope=groups/${PROBE}`);

    const alert = page.locator('.dashboard-bootstrap-error');
    await expect(alert).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    await expect(alert).toContainText('nicht die erwartete Form');
    await expect.poll(() => shapeErrors.join(' ')).toContain("Document 'competence-levels.json'");
});
