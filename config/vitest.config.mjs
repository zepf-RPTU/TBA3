import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { listFiles } from '../tools/lib/repo.mjs';
import { assertCanonicalLaunchPath } from '../tools/lib/vitestLaunchGuard.mjs';

assertCanonicalLaunchPath();

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Two projects. Pure-logic tests run in Node; a file that needs a DOM opts into the
 * browser project with a `// @vitest-browser` marker on its first line and runs in real
 * Chromium (the installed Google Chrome, driven by Playwright) — no jsdom, so layout,
 * SVG and d3 behave exactly as in the app. The marker keeps each file's DOM dependence
 * visible where it is relied on.
 * @param {string} dir
 * @returns {string[]} Repo-relative paths of the browser test files.
 */
function browserTestFiles(dir) {
    return listFiles(dir)
        .filter(
            (file) =>
                file.endsWith('.test.js') &&
                readFileSync(file, 'utf8').startsWith('// @vitest-browser'),
        )
        .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'));
}

// Each package owns its unit tests (`packages/<name>/test/`); `tests/unit/` keeps the app's.
const TEST_DIRS = ['tests/unit', 'packages/modules/test', 'packages/module-base/test'];
const BROWSER_FILES = TEST_DIRS.flatMap((dir) => browserTestFiles(path.join(ROOT, dir)));
const SETUP_FILES = ['tests/unit/support/litDevBanner.js', 'tests/unit/support/testReset.js'];

export default defineConfig({
    test: {
        // The gate prints one line per file; `--reporter=verbose` lists every test.
        reporters: ['default'],
        // Visibility only, no thresholds: much of src/ is d3/Tabulator render code that
        // e2e covers, so a coverage floor would push tests toward the wrong layer. Not
        // wired into `npm run check` for the same reason.
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.js', 'packages/*/src/**/*.js'],
        },
        projects: [
            {
                test: {
                    name: 'node',
                    environment: 'node',
                    include: TEST_DIRS.map((dir) => `${dir}/**/*.test.js`),
                    exclude: BROWSER_FILES,
                    setupFiles: SETUP_FILES,
                    restoreMocks: true,
                    unstubGlobals: true,
                },
            },
            {
                test: {
                    name: 'browser',
                    include: BROWSER_FILES,
                    setupFiles: SETUP_FILES,
                    restoreMocks: true,
                    unstubGlobals: true,
                    browser: {
                        enabled: true,
                        headless: true,
                        screenshotFailures: false,
                        provider: playwright({ launchOptions: { channel: 'chrome' } }),
                        instances: [{ browser: 'chromium' }],
                    },
                },
            },
        ],
    },
});
