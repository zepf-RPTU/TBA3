import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('tools/docs-sidebar', () => {
    // Node resolves a module through junctions and symlinks but leaves argv[1] as typed, so a
    // main-module test comparing the two skipped the check in a linked checkout and exited 0.
    it('runs its --check when launched through a linked checkout', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tba3-docs-sidebar-'));
        const link = path.join(tempDir, 'repo');
        fs.symlinkSync(repoRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
        try {
            const result = spawnSync(
                process.execPath,
                [path.join(link, 'tools', 'docs-sidebar.mjs'), '--check'],
                { cwd: repoRoot, encoding: 'utf8' },
            );
            expect(`${result.stdout}${result.stderr}`).toMatch(/docs\/module-index\.md is/);
        } finally {
            // The link alone, never a recursive removal: that would follow it into the repo.
            fs.unlinkSync(link);
            fs.rmdirSync(tempDir);
        }
    }, 60_000);
});
