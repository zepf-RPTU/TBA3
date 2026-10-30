// The image tier of the end-to-end suite: the specs in this folder check the nginx image
// (Dockerfile, docker/nginx.conf) — what it serves, the headers it sends, and that the
// dashboards boot under them. It starts nothing itself; bring the stack up first, from
// the repo root:
//   docker compose up --build -d
//   npx playwright test --config tests/e2e-docker/playwright.config.js
//   docker compose down
import { defineConfig } from '@playwright/test';
import fixtureConfig from '../../playwright.config.js';

export default defineConfig({
    ...fixtureConfig,
    testDir: '.',
    // compose.yaml's published port.
    use: { ...fixtureConfig.use, baseURL: 'http://127.0.0.1:8080' },
    webServer: undefined,
});
