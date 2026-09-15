/**
 * Assemble the glossary tree from the shared vocabulary file and the co-located
 * fragments each module owns.
 *
 * `glossary.json` beside this file holds only what has no single owner: the per-subject term
 * vocabulary (`{app}.shared.element_texts`, compiled into one alias regex by
 * `glossaryAnnotator.init`) and the `general.*` entries the package's cards read. A host adds
 * its own shared copy as a further base. Everything else lives in a `<owner>.glossary.json`
 * beside the module it belongs to, mounted at the dot-path `<app>GlossaryFragments` names.
 *
 * The result is the same object shape consumers already walk with
 * `resolveDotPath` (`glossaryText.js`), so nothing downstream knows the tree was
 * assembled rather than parsed from one file.
 */

/**
 * Whether a value is a plain object, so the merge should recurse into it.
 * Arrays are leaves: a fragment replacing an array replaces it whole.
 * @param {*} value - The value to test.
 * @returns {boolean} True for a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge `source` into `target` in place. Plain objects recurse; anything else is
 * a leaf, and two leaves at one path mean two owners claim the same entry.
 * @param {object} target - The tree being built, mutated in place.
 * @param {object} source - The fragment being merged in.
 * @param {string} pathPrefix - Dot-path of `target`, for the collision message
 */
function mergeInto(target, source, pathPrefix) {
    for (const [key, sourceValue] of Object.entries(source)) {
        const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const targetValue = target[key];

        if (targetValue === undefined) {
            target[key] = structuredClone(sourceValue);
            continue;
        }

        if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
            mergeInto(targetValue, sourceValue, currentPath);
            continue;
        }

        throw new Error(
            `Glossary collision at '${currentPath}': the entry is already defined. ` +
                `Delete it from one of the bases or from the other fragment that claims it.`,
        );
    }
}

/**
 * Build the full glossary tree.
 *
 * Mount paths are prefixes, and the merge is deep, so a view fragment mounted at
 * `en.overview` and a chart fragment mounted at `en.overview.scatterplot`
 * compose without either knowing the other exists. A fragment that would
 * overwrite an existing leaf throws rather than winning silently — a half-moved
 * entry has to fail the build, not render the stale copy.
 * @param {object|object[]} bases - Parsed `glossary.json`, or several base trees merged in order
 *   (a host's own shared copy after the package's); two bases claiming one leaf throw.
 * @param {{[dotPath: string]: object}} [fragments] - Dot-path → co-located fragment
 * @returns {object} The assembled tree (a copy; no base is mutated)
 */
export function assembleGlossary(bases, fragments = {}) {
    const [first, ...rest] = Array.isArray(bases) ? bases : [bases];
    const assembled = structuredClone(first ?? {});
    for (const base of rest) {
        mergeInto(assembled, base ?? {}, '');
    }

    // Sorted so a collision reports the same path whatever order the barrel
    // happens to list its imports in.
    for (const mountPath of Object.keys(fragments).sort()) {
        const fragment = fragments[mountPath];

        if (!isPlainObject(fragment)) {
            throw new Error(`Glossary fragment at '${mountPath}' is not an object`);
        }
        if (!mountPath) {
            throw new Error('Glossary fragment mount path is empty');
        }

        let node = assembled;
        for (const segment of mountPath.split('.')) {
            if (node[segment] === undefined) node[segment] = {};
            else if (!isPlainObject(node[segment])) {
                throw new Error(
                    `Glossary mount path '${mountPath}' runs through the leaf '${segment}'`,
                );
            }
            node = node[segment];
        }

        mergeInto(node, fragment, mountPath);
    }

    return assembled;
}
