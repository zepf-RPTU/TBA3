import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Launches vitest from the canonical, OS-cased repo path.
//
// cmd.exe preserves the drive-letter case you type (`cd /d d:\...`) where PowerShell and
// Git Bash normalise it, and `node_modules/.bin/vitest.cmd` passes `%~dp0` through verbatim.
// Vitest resolves its own dist from that launch path but hands the module runner
// canonically-cased ids, so a case mismatch makes it fail its own externalization check,
// load a second copy of @vitest/runner whose module-scoped `runner` is never initialised,
// and every test file dies at its first describe() with
// "TypeError: Cannot read properties of undefined (reading 'config')".
// Spawning with a canonical cwd and a canonical absolute CLI path avoids it entirely.
const repoRoot = fs.realpathSync.native(process.cwd());
const vitestCli = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');

const result = spawnSync(process.execPath, [vitestCli, ...process.argv.slice(2)], {
    cwd: repoRoot,
    stdio: 'inherit',
});

// A spawn that never started produces no child output at all, so say so rather than
// exiting 1 in silence.
if (result.error) {
    console.error(`run-vitest: could not launch ${vitestCli}: ${result.error.message}`);
    process.exit(1);
}

// `status` is null when the child was killed by a signal.
process.exit(result.status ?? 1);
