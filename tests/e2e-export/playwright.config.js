// The export sweep (`npm run test:e2e:export`): every module card's export menu, every
// format, downloaded once. A tier of its own because it takes minutes and checks breadth
// the fixture tier's module-export.spec.js already samples, so neither the pre-push hook
// nor CI runs it; run it after changes to the export pipeline or a card's capture.
import { defineConfig } from '@playwright/test';
import fixtureConfig, { previewServer } from '../../playwright.config.js';

export default defineConfig({
    ...fixtureConfig,
    testDir: '.',
    // Relative paths resolve against this config's folder, so the preview builds from
    // the repo root explicitly.
    webServer: { ...previewServer, cwd: '../..' },
});
