/**
 * Trait ("Merkmal") covariates: extraction plus the code → label registry.
 *
 * Traits arrive as repeated `{ type: 'trait', label, value }` covariates — one entry
 * per trait a student actually has, absent when they do not. The shared `type` is
 * what makes them a *group*: everything tagged `trait` belongs in the Merkmale
 * column, whatever the state happens to encode there. Nothing here knows which codes
 * exist, so a state adding or dropping a trait needs no client change.
 *
 * `label` is the payload's own name for a code. It is registered here rather than
 * carried on each student record because the SL sub-column headers need it too, and
 * they are built from aggregated trait names that no longer have a student attached.
 * Registration is last-write-wins: labels are keyed by code, so a dataset switch
 * simply overwrites the codes it carries and leaves the rest — which are only ever
 * read for codes present in the data being rendered. `resetTraitRegistry()` empties
 * it outright.
 *
 * Codes the payload leaves unlabelled resolve to `null`; callers fall back to
 * `src/common/glossary/glossary.json`, which is where the six legacy demo codes are described.
 */

import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';

const TRAIT_COVARIATE_TYPE = 'trait';

/** @type {Map<string, string>} trait code → human-readable label from the payload */
const traitLabels = new Map();

/**
 * Extract a student's trait codes from their covariates, registering any labels.
 * @param {Array<{type: string, label?: string, value: string}>} [covariates] - The student's covariates; any labels they carry are registered as a side effect.
 * @returns {Set<string>} The trait codes that are set for this student
 */
export function extractTraits(covariates) {
    const codes = new Set();
    for (const covariate of covariates ?? []) {
        if (covariate?.type !== TRAIT_COVARIATE_TYPE) continue;
        codes.add(covariate.value);
        if (covariate.label) traitLabels.set(covariate.value, covariate.label);
    }
    return codes;
}

/**
 * The payload-supplied label for a trait code, if one was delivered.
 * @param {string} code - A trait code from the payload.
 * @returns {string|null} The label the payload delivered, or null when none was.
 */
export function getTraitLabel(code) {
    return traitLabels.get(code) ?? null;
}

/**
 * Drop every registered trait label. Test-only — a page load registers as it renders.
 */
export function resetTraitRegistry() {
    traitLabels.clear();
}

/**
 * The payload's own label for a trait the glossary cannot describe, or `null`.
 *
 * The single gate for every trait label the UI shows, so the payload label and the
 * glossary popup can never both fire on the same element: the glossary is the richer
 * source (full prose) and wins wherever it knows the code, and the payload label is
 * the fallback for any trait a state introduces after `src/common/glossary/glossary.json` was
 * written. Both the Merkmale chips and the SL sub-column headers already resolve
 * their glossary text off the bare code, so both ask this the same question.
 *
 * Not cached: the label registry fills as datasets load, so a cached answer would pin
 * an element to whatever was known the first time it happened to be rendered.
 * @param {string} code - A trait code from the payload.
 * @returns {string|null} The payload label, or null when the glossary already describes the code and should win.
 */
export function getTraitFallbackLabel(code) {
    if (glossaryAnnotator.resolveEntryKey(code)) return null;
    return getTraitLabel(code);
}
