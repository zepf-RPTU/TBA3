import { describe, expect, it } from 'vitest';
import { listSourceFiles, workspacePackages } from '../../../../tools/lib/repo.mjs';
import { memoryRepo } from '../support/memoryRepo.js';

describe('tools/lib/repo', () => {
    const repo = memoryRepo({
        'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
        // Folder order puts the dependent package first.
        'packages/charts/package.json': JSON.stringify({
            name: '@x/charts',
            files: ['src', 'index.js'],
            peerDependencies: { '@x/kit': '*' },
        }),
        'packages/charts/index.js': 'export {};',
        'packages/charts/src/bar.js': 'export {};',
        'packages/charts/test/bar.test.js': 'export {};',
        'packages/kit/package.json': JSON.stringify({ name: '@x/kit' }),
        'packages/kit/base.js': 'export {};',
        'src/app.js': 'export {};',
        'tools/check.mjs': 'export {};',
    });

    it('orders each workspace package after the ones it depends on, with what it publishes', () => {
        expect(workspacePackages(repo).map(({ dir, roots }) => ({ dir, roots }))).toEqual([
            // No `files`: npm publishes the whole folder.
            { dir: 'packages/kit', roots: ['packages/kit'] },
            { dir: 'packages/charts', roots: ['packages/charts/src', 'packages/charts/index.js'] },
        ]);
    });

    it("lists tba3's src/ and every file a workspace package publishes", () => {
        expect(listSourceFiles(repo)).toEqual([
            'src/app.js',
            'packages/kit/base.js',
            'packages/kit/package.json',
            'packages/charts/src/bar.js',
            'packages/charts/index.js',
        ]);
    });
});
