/**
 * The e2e test API: Vitest's `test` with a Playwright browser behind it.
 *
 * One Chrome per spec file, a fresh context and page per test — the fixtures the
 * Playwright runner used to provide. `expect` is Playwright's standalone one: its
 * auto-retrying locator matchers (`toHaveCount`, `toBeVisible`, `expect.poll`, …) work
 * without the Playwright runner; only its screenshot and snapshot matchers need it,
 * and no spec uses those. Runner-level settings live in
 * config/vitest.e2e.config.mjs; the servers come up in ./servers.js.
 */

import { test as base, describe } from 'vitest';
import { chromium, devices } from 'playwright';

export { expect } from 'playwright/test';
export { describe };

const BASE_URL = 'http://localhost:8765';
/** Playwright's `actionTimeout`: give the app time to settle after navigation. */
const ACTION_TIMEOUT = 10_000;
/** Matches LOAD_TIMEOUT in ./app.js. */
const NAVIGATION_TIMEOUT = 20_000;

export const test = base
    // The installed Google Chrome — no browser download required. Vitest reads a
    // fixture's dependencies off its destructuring pattern, so the empty pattern is
    // deliberate.
    // oxlint-disable-next-line no-empty-pattern
    .extend('browser', { scope: 'file' }, async ({}, { onCleanup }) => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        onCleanup(() => browser.close());
        return browser;
    })
    // A plain value so a spec can `test.override('viewport', …)` for its own size.
    .extend('viewport', devices['Desktop Chrome'].viewport)
    // Likewise `test.override('touchDevice', true)` for a tablet spec. Both flags are
    // needed: `hasTouch` alone only enables page.tap(), while Blink keeps reporting
    // `hover: hover` / `pointer: fine` until `isMobile` puts it on the mobile emulation
    // path — and `page.emulateMedia()` cannot set those two features at all. Everything
    // under `@media (hover: none)` / `(pointer: coarse)` is unreachable without it.
    .extend('touchDevice', false)
    .extend('context', async ({ browser, viewport, touchDevice }, { onCleanup }) => {
        const context = await browser.newContext({
            ...devices['Desktop Chrome'],
            viewport,
            // After the spread: Desktop Chrome carries hasTouch/isMobile false.
            hasTouch: touchDevice,
            isMobile: touchDevice,
            baseURL: BASE_URL,
        });
        context.setDefaultTimeout(ACTION_TIMEOUT);
        context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
        onCleanup(() => context.close());
        return context;
    })
    .extend('page', async ({ context }) => context.newPage());
