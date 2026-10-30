/**
 * The cascade's entry points and the sheets they share, in one place, so every check
 * means the same thing by "shared sheet".
 */
import path from 'node:path';
import { diskRepo } from './repo.mjs';

/** @typedef {import('./repo.mjs').Repo} Repo */

export const cssLayerNames = ['vendor', 'foundation', 'common', 'modules', 'views'];
export const cssEntrySheets = [
    'src/en/main.css',
    'src/ma/main.css',
    'src/sl/main.css',
    'src/chooser.css',
    // The shared imports of the three app entry sheets, which import it unlayered.
    'src/styles/app.css',
];
/**
 * Each workspace package's token defaults, by its folder under `packages/`: a package
 * reads its own and those of the packages below it. tba3 imports them first, its own
 * sheets override.
 * @type {{[packageFolder: string]: string}}
 */
export const tokenDefaultsSheets = {
    'module-base': 'packages/module-base/src/styles/tokens.css',
    modules: 'packages/modules/styles/tokens.css',
};

/**
 * The one layout breakpoint (`@custom-media --stacked-layout`). No sheet imports it: the
 * build prepends it to every sheet.
 */
export const breakpointsSheet = 'src/styles/foundation/breakpoints.css';

const importPattern = /^\s*@import\s+(?:url\()?['"]([^'"]+)['"]\)?[^;]*;/gm;

/**
 * Every sheet an entry sheet imports — shared, layered at the import, and owned by no
 * unit.
 * @param {Repo} [repo] - The working tree unless given.
 * @returns {string[]} Repo-relative POSIX paths.
 */
export function listSharedSheets(repo = diskRepo()) {
    const shared = new Set();
    for (const entry of cssEntrySheets) {
        const text = repo.readText(entry).replace(/\/\*[\s\S]*?\*\//g, '');
        for (const [, specifier] of text.matchAll(importPattern)) {
            if (specifier.startsWith('.')) {
                const relative = path.posix.join(path.posix.dirname(entry), specifier);
                if (!cssEntrySheets.includes(relative)) shared.add(relative);
            } else if (specifier.startsWith('@tba3/')) {
                const resolved = repo.resolve(specifier);
                if (resolved) shared.add(resolved);
            }
        }
    }
    return [...shared];
}
