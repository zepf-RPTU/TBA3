/**
 * The nginx image as compose.yaml runs it: routes, response headers, precompressed
 * files, the API proxy without an API, and the dashboards booting under the header CSP
 * (a violation fails the test through the shared `test` fixture).
 */

import { DASHBOARD_CSP, DOCS_CSP } from '../../config/csp.mjs';
import { gotoApp } from '../e2e/support/app.js';
import { assertNoPageErrors, collectErrors } from '../e2e/support/pageErrors.js';
import { expect, test } from '../e2e/support/test.js';

const DASHBOARDS = ['/en/', '/ma/', '/sl/'];

/** A committed fixture, served from data/ like every dataset the demo opens. */
const FIXTURE_PATH = '/data/en/8a_mid/items.json';

test.describe('routes', () => {
    for (const path of ['/', ...DASHBOARDS, '/docs/', '/NOTICE', FIXTURE_PATH]) {
        test(`${path} is served`, async ({ request }) => {
            expect((await request.get(path)).status()).toBe(200);
        });
    }

    test('an unknown path is a 404, not the chooser', async ({ request }) => {
        expect((await request.get('/no-such-page')).status()).toBe(404);
    });

    test('/api/ answers 502 without an api container', async ({ request }) => {
        expect((await request.get('/api/health')).status()).toBe(502);
    });
});

test.describe('headers', () => {
    test('every response carries the security headers', async ({ request }) => {
        const headers = (await request.get('/en/')).headers();
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['referrer-policy']).toBe('same-origin');
        expect(headers['permissions-policy']).toContain('camera=()');
        expect(headers['server']).toBe('nginx');
    });

    test('the dashboards and the wiki get their own CSP', async ({ request }) => {
        for (const path of ['/', ...DASHBOARDS]) {
            expect((await request.get(path)).headers()['content-security-policy']).toBe(
                DASHBOARD_CSP,
            );
        }
        expect((await request.get('/docs/')).headers()['content-security-policy']).toBe(DOCS_CSP);
    });

    test('hashed bundles are immutable, everything else revalidates', async ({ request }) => {
        const page = await request.get('/en/');
        expect(page.headers()['cache-control']).toBe('no-cache');
        expect((await request.get(FIXTURE_PATH)).headers()['cache-control']).toBe('no-cache');
        const bundle = (await page.text()).match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
        expect(bundle, 'no hashed bundle in /en/').toBeDefined();
        expect((await request.get(/** @type {string} */ (bundle))).headers()['cache-control']).toBe(
            'public, max-age=31536000, immutable',
        );
    });

    test('static files are sent gzipped', async ({ request }) => {
        const response = await request.get(FIXTURE_PATH, {
            headers: { 'Accept-Encoding': 'gzip' },
        });
        expect(response.headers()['content-encoding']).toBe('gzip');
        expect(response.headers()['vary']).toBe('Accept-Encoding');
    });
});

test.describe('pages', () => {
    for (const path of DASHBOARDS) {
        test(`${path} boots under the header CSP`, async ({ page }) => {
            const { pageErrors } = collectErrors(page);
            await gotoApp(page, path);
            assertNoPageErrors(pageErrors);
        });
    }

    test('the wiki renders under its CSP', async ({ page }) => {
        const { pageErrors } = collectErrors(page);
        await page.goto('/docs/');
        await expect(page.locator('h1').first()).toBeVisible();
        assertNoPageErrors(pageErrors);
    });
});
