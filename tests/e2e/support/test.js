/**
 * The e2e test API: Playwright Test's `test`, with every context held to the production CSP.
 *
 * Runner-level settings (browser, base URL, the action timeout, the preview server) live
 * in playwright.config.js; this file adds what a spec reads by name.
 */

import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export { LOAD_TIMEOUT_MS, RENDER_TIMEOUT_MS, REVEAL_TIMEOUT_MS } from './timeouts.js';
/**
 * The tablet tier, for `test.use(TABLET)`: iPad landscape with touch. Both flags are
 * needed: `hasTouch` alone only enables page.tap(), while Blink keeps reporting
 * `hover: hover` / `pointer: fine` until `isMobile` puts it on the mobile emulation path,
 * and `page.emulateMedia()` cannot set those two features. Without it nothing under
 * `@media (hover: none)` / `(pointer: coarse)` is reachable.
 */
export const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true };
/**
 * What Chrome says when the page's CSP (config/csp.mjs, in the built pages' `<meta>`)
 * blocks something: a refused load or inline style, or an HTML write that bypassed the
 * Trusted Types policies.
 */
const CSP_VIOLATION = /Content Security Policy|TrustedHTML|Trusted Type/;

/**
 * Seed the colour-scheme preference for every page the context opens; the app reads it
 * before first paint, so the page boots on that surface.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {'light'|'dark'} scheme
 */
export async function seedColorScheme(context, scheme) {
    await context.addInitScript(
        (value) => localStorage.setItem('tba3_color_scheme', value),
        scheme,
    );
}

export const test = base.extend({
    // Every test runs under the production CSP; a violation fails it, whichever page of
    // the context it happened on.
    context: async ({ context }, use) => {
        /** @type {string[]} */
        const violations = [];
        context.on('console', (msg) => {
            if (CSP_VIOLATION.test(msg.text())) violations.push(msg.text());
        });
        context.on('weberror', (webError) => {
            const message = webError.error().message;
            if (CSP_VIOLATION.test(message)) violations.push(message);
        });
        await use(context);
        if (violations.length > 0) {
            throw new Error(`CSP violations:\n${[...new Set(violations)].join('\n')}`);
        }
    },
});
