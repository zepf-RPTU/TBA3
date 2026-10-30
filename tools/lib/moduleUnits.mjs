/**
 * The module-unit scan.
 *
 * A unit is the root BaseModule, an exported subclass of any `*Module` or `*ViewBase`, or
 * the descriptor a `modules/charts/**\/*Config.js` exports, whose host is ChartHostModule.
 * Every unit but the shell widgets (`unitDocs.mjs` names their folders) documents itself in
 * a German `<unitFile>.md` beside its source.
 * The kind is told apart by what the class extends: an app module (BaseAppModule or
 * another app), a view (BaseViewModule, another view or a *ViewBase), or a content unit
 * (everything else). The two roots BaseViewModule and BaseAppModule document as view
 * and app themselves.
 */
import { listSourceFiles } from './repo.mjs';

/** @typedef {import('./repo.mjs').Repo} Repo */

// Groups: class name, base class.
const moduleClassPattern =
    /^\s*(?:export\s+)?class\s+(\w+)\s+extends\s+(\w*Module|\w*ViewBase)\b/gm;
const rootClassPattern = /^\s*(?:export\s+)?class\s+(BaseModule)\s+extends\s+ReactiveElement\s*\{/m;
const chartConfigFilePattern = /(?:^|\/)modules\/charts\/.*Config\.js$/;
const chartConfigExportPattern = /^export const (\w+Config)\b/m;

/**
 * @param {string} name - The class name.
 * @param {string | null} baseName - What it extends.
 * @returns {'app' | 'view' | 'content'}
 */
function docKindOf(name, baseName) {
    const base = baseName ?? '';
    if (name === 'BaseAppModule' || base.endsWith('AppModule')) return 'app';
    if (name === 'BaseViewModule' || base.endsWith('ViewModule') || base.endsWith('ViewBase')) {
        return 'view';
    }
    return 'content';
}

/**
 * @param {string} sourceText - A module's text.
 * @param {string} name
 * @returns {boolean} Whether the module exports that name.
 */
function isExportedName(sourceText, name) {
    return new RegExp(String.raw`^export\s+(?:class\s+${name}\b|\{[^}]*\b${name}\b)`, 'm').test(
        sourceText,
    );
}

/**
 * @typedef {object} ModuleUnit
 * @property {string} name - The class or descriptor name.
 * @property {'app' | 'view' | 'content'} kind - What the doc's required headings follow.
 * @property {string | null} base - The class it extends; a descriptor's host; null for the root.
 * @property {boolean} descriptor - A chart config descriptor rather than a class.
 * @property {boolean} extended - Another module class extends it: a base, not a concrete
 *   module (a descriptor's host does not count).
 */

/**
 * @param {string} sourcePath - A repo-relative `.js` path.
 * @param {string} sourceText - Its text.
 * @returns {ModuleUnit[]}
 */
function listModuleUnits(sourcePath, sourceText) {
    /** @type {ModuleUnit[]} */
    const units = [...sourceText.matchAll(moduleClassPattern)]
        .filter((match) => isExportedName(sourceText, match[1]))
        .map(([, name, base]) => ({
            name,
            kind: docKindOf(name, base),
            base,
            descriptor: false,
            extended: false,
        }));
    const rootName = sourceText.match(rootClassPattern)?.[1];
    if (rootName && isExportedName(sourceText, rootName)) {
        units.push({
            name: rootName,
            kind: 'content',
            base: null,
            descriptor: false,
            extended: false,
        });
    }
    if (chartConfigFilePattern.test(sourcePath)) {
        const exportMatch = sourceText.match(chartConfigExportPattern);
        if (exportMatch) {
            units.push({
                name: exportMatch[1],
                kind: 'content',
                base: 'ChartHostModule',
                descriptor: true,
                extended: false,
            });
        }
    }
    return units;
}

/**
 * @typedef {object} UnitSource
 * @property {string} sourcePath - Repo-relative.
 * @property {string} docPath - The `<unitFile>.md` beside it, which may not exist yet (the
 *   structure check reports that).
 * @property {ModuleUnit[]} units
 */

/**
 * @param {Repo} repo
 * @returns {UnitSource[]} Every source file that declares at least one unit.
 */
export function listUnitSources(repo) {
    const sources = listSourceFiles(repo)
        .filter((filePath) => filePath.endsWith('.js'))
        .map((sourcePath) => ({
            sourcePath,
            docPath: sourcePath.replace(/\.js$/, '.md'),
            units: listModuleUnits(sourcePath, repo.readText(sourcePath)),
        }))
        .filter(({ units }) => units.length > 0);
    const extendedNames = new Set(
        sources.flatMap(({ units }) =>
            units.filter((unit) => !unit.descriptor).map((unit) => unit.base),
        ),
    );
    for (const { units } of sources) {
        for (const unit of units) unit.extended = extendedNames.has(unit.name);
    }
    return sources;
}
