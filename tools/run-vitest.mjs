import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Launches vitest from the canonical, OS-cased repo path. A launch from a
// differently-cased path (cmd.exe preserves `d:\`) makes vitest load two copies of
// @vitest/runner — tools/lib/vitestLaunchGuard.mjs explains the failure it prevents.
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
