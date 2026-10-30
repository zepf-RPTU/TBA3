import { realpathSync } from 'node:fs';

/**
 * Refuse a Vitest launch from a differently-cased path (Windows).
 *
 * Vitest resolves its own dist from the path it was launched with but hands the module
 * runner canonically-cased ids. When the two disagree it fails its own externalization
 * check, loads a second copy of `@vitest/runner` whose module-scoped `runner` is never
 * initialised, and every test file dies at its first describe() with "Cannot read
 * properties of undefined (reading 'config')" — all files at once. cmd.exe preserves the
 * case you type (`cd /d d:\...`); PowerShell and Git Bash normalise to `D:`. `npm test`
 * routes through tools/run-vitest.mjs, which spawns from the canonical path and is
 * immune; this guard covers a bare `npx vitest`.
 *
 * Case-only on purpose: a junction, a `subst` drive or a symlinked checkout also make the
 * two strings differ, and refusing to run there would cost more than the guard is worth.
 */
export function assertCanonicalLaunchPath() {
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
}
