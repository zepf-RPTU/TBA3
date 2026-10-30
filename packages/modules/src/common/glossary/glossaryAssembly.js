/**
 * Assemble the glossary tree from the shared vocabulary file and the co-located
 * fragments each module owns.
 *
 * `glossary.json` beside this file holds only what has no single owner: the `general.*`
 * entries the package's cards read. A host adds its own shared copy as a further base.
 * Everything else lives in a `<owner>.glossary.json` beside what owns it, mounted at the
 * dot-path `<app>GlossaryFragments` names, a subject's term vocabulary included
 * (`{app}Shared.glossary.json` at `{app}.shared`, compiled into one alias regex by
 * the `GlossaryAnnotator` constructor), so an app ships and parses its own subject's terms only.
 */

import { fillKnownTokens } from '@tba3/module-base/glossary';

/** @typedef {import('@tba3/module-base/glossary').GlossaryTree} GlossaryTree */

/**
 * Whether the merge recurses into a value. Arrays are leaves: a fragment replacing an
 * array replaces it whole.
 * @param {unknown} value
 * @returns {boolean} True for a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge `source` into `target` in place. Plain objects recurse; anything else is
 * a leaf, and two leaves at one path mean two owners claim the same entry.
 * @param {GlossaryTree} target
 * @param {GlossaryTree} source
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
 * `<app>.<view>` and a chart fragment mounted at `<app>.<view>.<chart>`
 * compose without either knowing the other exists. A fragment that would
 * overwrite an existing leaf throws: an entry with two owners has to fail the build.
 * @param {GlossaryTree|GlossaryTree[]} bases - Parsed `glossary.json`, or several base trees merged in order
 *   (a host's own shared copy after the package's); two bases claiming one leaf throw.
 * @param {{[dotPath: string]: GlossaryTree}} [fragments] - Dot-path → co-located fragment
 * @param {{terms?: Readonly<{[name: string]: string}>}} [options] - `terms`: the app's fixed
 *   vocabulary (`{{Stufe}}` → `GER-Stufe`), filled into every string of the tree, alias
 *   texts included, once; any other token is left for its card to fill at runtime.
 * @returns {GlossaryTree} A copy; no base is mutated.
 */
export function assembleGlossary(bases, fragments = {}, { terms } = {}) {
    const [first, ...rest] = Array.isArray(bases) ? bases : [bases];
    const assembled = structuredClone(first ?? {});
    for (const base of rest) {
        mergeInto(assembled, base ?? {}, '');
    }

    // Sorted so a collision reports the same path whatever order the barrel lists
    // its imports in.
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

    if (terms) fillTerms(assembled, terms);
    return assembled;
}

/**
 * Fill the named terms into every string under a node, in place, leaving unknown tokens
 * as they are: `{{Domäne}}` is the card's to fill.
 * @param {object} node - An object or array of the assembled tree, which nothing else holds.
 * @param {Readonly<{[name: string]: string}>} terms
 */
function fillTerms(node, terms) {
    const record = /** @type {{[key: string]: unknown}} */ (node);
    for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') record[key] = fillKnownTokens(value, terms);
        else if (value !== null && typeof value === 'object') fillTerms(value, terms);
    }
}
