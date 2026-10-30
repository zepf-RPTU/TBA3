/**
 * A `Repo` held in memory, so a tool's rules run against a handful of files instead of
 * the working tree.
 */

/** @typedef {import('../../../../tools/lib/repo.mjs').Repo} Repo */

/**
 * @param {{[file: string]: string}} files - Each repo-relative path and its text.
 * @param {object} [ports]
 * @param {{[file: string]: Record<string, unknown>}} [ports.modules] - What `importModule`
 *   answers per file.
 * @param {{[specifier: string]: string}} [ports.resolutions] - What `resolve` answers per
 *   package specifier.
 * @returns {Repo}
 */
export function memoryRepo(files, { modules = {}, resolutions = {} } = {}) {
    const paths = Object.keys(files).sort();
    return {
        listFiles: (target) =>
            paths.filter((file) => file === target || file.startsWith(`${target}/`)),
        exists: (file) => Object.hasOwn(files, file),
        readText(file) {
            if (!Object.hasOwn(files, file)) throw new Error(`memoryRepo has no ${file}`);
            return files[file];
        },
        resolve: (specifier) => resolutions[specifier] ?? null,
        async importModule(file) {
            if (!Object.hasOwn(modules, file)) throw new Error(`memoryRepo runs no ${file}`);
            return modules[file];
        },
    };
}
