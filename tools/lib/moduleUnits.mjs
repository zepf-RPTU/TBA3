/**
 * Module-unit scan shared by the structure check and the docs generator.
 *
 * A unit is the root BaseModule, an exported BaseModule/ContentModule/*TableModule/
 * *ViewModule/*ViewBase/BaseAppModule subclass — mixin wrappers included — or the
 * descriptor a src/**\/modules/charts/**\/*Config.js exports, whose host is
 * ChartHostModule. Every unit documents itself in a German `<unitFile>.md` beside its
 * source (docs/architecture.md, "Modul-Dokumentation").
 * The kind is told apart by what the class extends: an app module (BaseAppModule or
 * another app), a view (BaseViewModule, another view or a *ViewBase), or a content unit
 * (everything else). The two roots BaseViewModule and BaseAppModule document as view
 * and app themselves.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const skippedDirectories = new Set(['.git', 'node_modules']);

// Groups: class name, mixin wrapping the base (if any), base class.
const moduleClassPattern =
    /^\s*(?:export\s+)?class\s+(\w+)\s+extends\s+(?:(\w+)\()?(\w*Module|\w*ViewBase)\b/gm;
const rootModuleName = 'BaseModule';
const rootClassPattern = new RegExp(
    String.raw`^\s*(?:export\s+)?class\s+${rootModuleName}\s*\{`,
    'm',
);
export const chartConfigFilePattern = /[\\/]modules[\\/]charts[\\/].*Config\.js$/;
const chartConfigExportPattern = /^export const (\w+Config)\b/m;

export function toRelativePath(filePath) {
    return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

export function listFiles(directoryPath) {
    if (!fs.existsSync(directoryPath)) return [];

    const filePaths = [];

    for (const directoryEntry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        const fullPath = path.join(directoryPath, directoryEntry.name);

        if (directoryEntry.isDirectory()) {
            if (!skippedDirectories.has(directoryEntry.name)) {
                filePaths.push(...listFiles(fullPath));
            }
            continue;
        }

        if (directoryEntry.isFile()) {
            filePaths.push(fullPath);
        }
    }

    return filePaths;
}

export function readTextFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

export function docKindOf(name, baseName) {
    if (name === 'BaseAppModule' || /AppModule$/.test(baseName)) return 'app';
    if (name === 'BaseViewModule' || /ViewModule$|ViewBase$/.test(baseName)) return 'view';
    return 'content';
}

function isExportedName(sourceText, name) {
    return new RegExp(String.raw`^export\s+(?:class\s+${name}\b|\{[^}]*\b${name}\b)`, 'm').test(
        sourceText,
    );
}

/**
 * @typedef {object} ModuleUnit
 * @property {string} name
 * @property {'app' | 'view' | 'content'} kind
 * @property {string | null} base - The class it extends; a descriptor's host; null for the root.
 * @property {string | null} mixin - The mixin wrapping `base`, if any.
 * @property {boolean} descriptor - A chart config descriptor rather than a class.
 */

/** @returns {ModuleUnit[]} */
export function listModuleUnits(filePath) {
    const sourceText = readTextFile(filePath);
    const units = [...sourceText.matchAll(moduleClassPattern)]
        .filter((match) => isExportedName(sourceText, match[1]))
        .map(([, name, mixin, base]) => ({
            name,
            kind: docKindOf(name, base),
            base,
            mixin: mixin ?? null,
            descriptor: false,
        }));
    if (rootClassPattern.test(sourceText) && isExportedName(sourceText, rootModuleName)) {
        units.push({
            name: rootModuleName,
            kind: 'content',
            base: null,
            mixin: null,
            descriptor: false,
        });
    }
    if (chartConfigFilePattern.test(filePath)) {
        const exportMatch = sourceText.match(chartConfigExportPattern);
        if (exportMatch) {
            units.push({
                name: exportMatch[1],
                kind: 'content',
                base: 'ChartHostModule',
                mixin: null,
                descriptor: true,
            });
        }
    }
    return units;
}

/**
 * Every source file under src/ that declares at least one unit, with the doc path it
 * must document itself in (which may not exist yet — the structure check reports that).
 * @returns {{ sourcePath: string, docPath: string, units: ReturnType<typeof listModuleUnits> }[]}
 */
/**
 * Where module units live. The kit's own sources sit outside `src/`, but its units are
 * units like any other — a `BaseModule`/`ContentModule` subclass there still owes the
 * same German sidecar doc. Rules that encode tba3 house style stay scoped to `src/`.
 * @returns {string[]} Every `.js` file that may declare a module unit.
 */
function unitRoots() {
    return [
        ...listFiles(path.join(repoRoot, 'src')),
        ...listFiles(path.join(repoRoot, 'packages', 'module-base', 'src')),
        ...listFiles(path.join(repoRoot, 'packages', 'modules', 'src')),
    ];
}

export function listUnitSources() {
    return unitRoots()
        .filter((filePath) => filePath.endsWith('.js'))
        .map((sourcePath) => ({
            sourcePath,
            docPath: sourcePath.replace(/\.js$/, '.md'),
            units: listModuleUnits(sourcePath),
        }))
        .filter(({ units }) => units.length > 0);
}
