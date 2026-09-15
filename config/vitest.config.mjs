import { realpathSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { listFiles } from '../tools/lib/moduleUnits.mjs';

// Guard against the drive-letter-case launch failure (Windows).
//
// Vitest resolves its own dist from the path it was launched with, but hands the module
// runner canonically-cased ids. When the two disagree, vitest fails its own externalization
// check, the module runner loads a *second* copy of @vitest/runner whose module-scoped
// `runner` is never initialised, and every test file dies at its first describe() with
// "TypeError: Cannot read properties of undefined (reading 'config')" — all files at once,
// which reads like the runner came up broken rather than like a test regression.
//
// cmd.exe preserves whatever case you type (`cd /d d:\...`); PowerShell and Git Bash
// normalise to `D:`. That is the entire "intermittency" — it depends only on the launcher,
// not on caching, jsdom, parallelism or load.
//
// `npm test` routes through tools/run-vitest.mjs, which spawns vitest canonically and is
// immune. This guard covers direct `npx vitest` invocations, which are not.
//
// Narrowed to a *case-only* mismatch deliberately. A junction, a `subst` drive, a mapped
// network drive or a symlinked checkout also make these two strings differ, and refusing to
// run at all on those setups would cost more than the guard is worth — the failure this
// guards against is the launcher's drive-letter casing, nothing else.
const cwd = process.cwd();
const canonicalCwd = realpathSync.native(cwd);
if (cwd !== canonicalCwd && cwd.toLowerCase() === canonicalCwd.toLowerCase()) {
    throw new Error(
        `Vitest was launched from a differently-cased path (${cwd}). Re-run from ${canonicalCwd}, ` +
            'or use "npm test" — otherwise vitest loads two copies of @vitest/runner and every ' +
            'test file fails at its first describe() with ' +
            '"Cannot read properties of undefined (reading \'config\')".',
    );
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Two projects. Pure-logic tests run in Node; a file that needs a DOM opts into the
 * browser project with a `// @vitest-browser` marker on its first line and runs in real
 * Chromium (the installed Google Chrome, driven by Playwright) — no jsdom, so layout,
 * SVG and d3 behave exactly as in the app. The marker keeps each file's DOM dependence
 * visible where it is relied on.
 * @param {string} dir - Directory to scan.
 * @param {string[]} [out] - Accumulator.
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

const BROWSER_FILES = browserTestFiles(path.join(ROOT, 'tests', 'unit'));

export default defineConfig({
    test: {
        reporters: ['verbose'],
        // Visibility only — deliberately no thresholds. The number is here to show
        // which parts of src/ the suite actually reaches, not to gate a push: much of
        // src/ is d3/Tabulator render code that e2e covers, so a coverage floor would
        // push tests toward the wrong layer. Not wired into `npm run check` for the
        // same reason; run `npm run test:coverage` on demand.
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
                    include: ['tests/unit/**/*.test.js'],
                    exclude: BROWSER_FILES,
                    restoreMocks: true,
                },
            },
            {
                test: {
                    name: 'browser',
                    include: BROWSER_FILES,
                    restoreMocks: true,
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
