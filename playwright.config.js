// End-to-end suite (`npm run test:e2e`): Playwright Test drives the installed Google Chrome
// against the built bundle, served by `vite preview` — the artifact users get. Every
// dataset it opens is a committed fixture; a spec that needs the API path answers it
// itself (tests/e2e/support/fixtureApi.js). Stays at the repo root: Playwright resolves
// `testDir` and `webServer.cwd` relative to the config's directory.
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { LOAD_TIMEOUT_MS } from './tests/e2e/support/timeouts.js';

/** The built bundle on 8765, served by `vite preview`. */
export const previewServer = {
    // `TBA3_E2E_REUSE_DIST=1` serves the dist/ already there, for a caller that has just
    // built this tree. Without a build it builds anyway,
    // since preview would answer 404 and still count as ready: the dashboards alone, as
    // no spec opens the wiki that `npm run build` adds.
    command:
        process.env.TBA3_E2E_REUSE_DIST === '1' && existsSync('dist/index.html')
            ? 'npm run preview'
            : 'npx vite build && npm run preview',
    url: 'http://localhost:8765/',
    // A stale server on 8765 fails the run instead of silently testing someone
    // else's build (strictPort in vite.config.js does the same for preview).
    reuseExistingServer: false,
    timeout: 180_000,
};

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 30_000,
    retries: 0,
    // One spec file at a time: several specs assert timing-sensitive layout and focus
    // (header clipping, export captures, modal Escape), and they fail under the CPU
    // contention of parallel Chrome instances.
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        ...devices['Desktop Chrome'],
        // The installed Google Chrome — no browser download required.
        channel: 'chrome',
        baseURL: 'http://localhost:8765',
        actionTimeout: 10_000,
        navigationTimeout: LOAD_TIMEOUT_MS,
        trace: 'retain-on-failure',
    },
    webServer: previewServer,
});
