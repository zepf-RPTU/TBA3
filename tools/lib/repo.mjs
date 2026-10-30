/**
 * The repository as the tools read it: the `Repo` port,
 * the working tree behind it (`diskRepo()`), and the source the rules govern — tba3's own
 * `src/` and whatever each npm workspace package publishes. A test hands the same code an
 * in-memory `Repo`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every path in and out is repo-relative with POSIX separators.
 * @typedef {object} Repo
 * @property {(target: string) => string[]} listFiles - The file itself, or every file below
 *   the directory, sorted; none when it is missing.
 * @property {(file: string) => boolean} exists
 * @property {(file: string) => string} readText - Throws when the file is missing.
 * @property {(specifier: string) => string | null} resolve - The file a package specifier
 *   (`@tba3/modules/styles/x.css`) names by its package's `exports` map; null when none.
 * @property {(file: string) => Promise<Record<string, unknown>>} importModule - A module's
 *   namespace, after running it.
 */

/**
 * @typedef {object} PackageManifest
 * @property {string} name
 * @property {string[]} [files] - What the package publishes; everything when absent.
 * @property {string[]} [sideEffects]
 * @property {{[name: string]: string}} [dependencies]
 * @property {{[name: string]: string}} [peerDependencies]
 */

/**
 * @typedef {object} WorkspacePackage
 * @property {string} dir - Its folder, e.g. `packages/modules`.
 * @property {PackageManifest} manifest
 * @property {string[]} roots - What it publishes: each `files` entry, under `dir`.
 */

/**
 * @param {string} directoryPath - An absolute directory; missing yields nothing.
 * @returns {string[]} Every file below it, absolute, node_modules and .git excluded.
 */
export function listFiles(directoryPath) {
    return fs
        .globSync('**/*', { cwd: directoryPath, exclude: ['**/node_modules/**', '**/.git/**'] })
        .map((relativePath) => path.join(directoryPath, relativePath))
        .filter((filePath) => fs.statSync(filePath).isFile());
}

/**
 * @returns {Repo} The working tree. It lists each folder and reads each file once, so a run
 *   that outlives an edit to the tree needs a fresh one.
 */
export function diskRepo() {
    /**
     * @param {string} file - Repo-relative.
     * @returns {string} Absolute.
     */
    const absolute = (file) => path.join(repoRoot, file);
    /**
     * @param {string} filePath - Absolute.
     * @returns {string} Repo-relative, POSIX separators.
     */
    const relative = (filePath) => path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
    /** @type {Map<string, string[]>} */
    const listings = new Map();
    /** @type {Map<string, string>} */
    const texts = new Map();
    return {
        listFiles(target) {
            let files = listings.get(target);
            if (!files) {
                const targetPath = absolute(target);
                if (!fs.existsSync(targetPath)) files = [];
                else if (fs.statSync(targetPath).isFile()) files = [target];
                else files = listFiles(targetPath).map(relative).sort();
                listings.set(target, files);
            }
            return files;
        },
        exists: (file) => fs.existsSync(absolute(file)),
        readText(file) {
            let text = texts.get(file);
            if (text === undefined) {
                text = fs.readFileSync(absolute(file), 'utf8');
                texts.set(file, text);
            }
            return text;
        },
        resolve(specifier) {
            try {
                return relative(
                    fs.realpathSync.native(fileURLToPath(import.meta.resolve(specifier))),
                );
            } catch {
                return null;
            }
        },
        importModule: (file) => import(pathToFileURL(absolute(file)).href),
    };
}

/** @type {WeakMap<Repo, WorkspacePackage[]>} */
const packagesByRepo = new WeakMap();

/**
 * The npm workspace packages the root manifest names, each after the workspace packages
 * it depends on — the order in which each package sees only those below it.
 * @param {Repo} repo
 * @returns {WorkspacePackage[]}
 */
export function workspacePackages(repo) {
    let packages = packagesByRepo.get(repo);
    if (!packages) {
        packages = findWorkspacePackages(repo);
        packagesByRepo.set(repo, packages);
    }
    return packages;
}

/**
 * @param {Repo} repo
 * @returns {WorkspacePackage[]}
 */
function findWorkspacePackages(repo) {
    /** @type {string[]} */
    const patterns = JSON.parse(repo.readText('package.json')).workspaces ?? [];
    /** @type {WorkspacePackage[]} */
    const found = patterns.flatMap((pattern) => {
        // The folder above the first wildcard holds every package the pattern can match.
        const segments = pattern.split('/');
        const literal = segments.slice(
            0,
            segments.findIndex((segment) => /[*?[{]/.test(segment)),
        );
        return repo
            .listFiles(literal.length > 0 ? literal.join('/') : '.')
            .filter(
                (file) =>
                    path.posix.basename(file) === 'package.json' &&
                    path.posix.matchesGlob(path.posix.dirname(file), pattern),
            )
            .map((manifestPath) => {
                const dir = path.posix.dirname(manifestPath);
                /** @type {PackageManifest} */
                const manifest = JSON.parse(repo.readText(manifestPath));
                const roots = (manifest.files ?? ['.']).map((entry) => path.posix.join(dir, entry));
                return { dir, manifest, roots };
            });
    });
    const byName = new Map(found.map((pkg) => [pkg.manifest.name, pkg]));
    /** @type {WorkspacePackage[]} */
    const ordered = [];
    const seen = new Set();
    /** @param {WorkspacePackage} pkg */
    const visit = (pkg) => {
        if (seen.has(pkg)) return;
        seen.add(pkg);
        const { dependencies, peerDependencies } = pkg.manifest;
        for (const name of Object.keys({ ...dependencies, ...peerDependencies })) {
            const lower = byName.get(name);
            if (lower) visit(lower);
        }
        ordered.push(pkg);
    };
    found.forEach(visit);
    return ordered;
}

/**
 * @param {Repo} repo
 * @returns {string[]} Every file the structural rules govern: tba3's `src/`, then what
 *   each workspace package publishes. Rules that encode tba3 house style stay scoped to
 *   `src/` themselves.
 */
export function listSourceFiles(repo) {
    return ['src', ...workspacePackages(repo).flatMap(({ roots }) => roots)].flatMap((root) =>
        repo.listFiles(root),
    );
}
