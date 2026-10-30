import { escapeHtml } from '@tba3/module-base';
import { glossaryTermAttrs } from '@tba3/module-base/glossary';
import { compareText } from '../utils/compare.js';
import { MISSING_VALUE } from '../utils/numberFormat.js';

/**
 * The payload's own label for a trait the glossary cannot describe, or `null`.
 *
 * The gate for every trait label the UI shows, so the payload label and the glossary popup never both fire on one
 * element: the glossary wins wherever it knows the code, and the payload label is the
 * fallback for a trait `glossary.json` does not describe.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary.
 * @param {ReadonlyMap<string, string>} traitLabels - The payload's labels, a catalog's `TRAIT_LABELS` dataset.
 * @param {string} code - A trait code from the payload.
 * @returns {string|null} The payload label, or null when the glossary already describes the code and should win.
 */
export function getTraitFallbackLabel(glossary, traitLabels, code) {
    if (glossary.resolveEntryKey(code)) return null;
    return traitLabels.get(code) ?? null;
}

/**
 * A row's traits in display order with their glossary keys, their names, and the joined text.
 * @typedef {{activeTraits: Array<{name: string, glossaryKey: string}>, names: string[], text: string}} TraitData
 */

/** @type {TraitData} */
const NO_TRAITS = { activeTraits: [], names: [], text: MISSING_VALUE };

/**
 * Per trait set, which a row holds by reference for its lifetime.
 * @type {WeakMap<Set<string>, TraitData>}
 */
const traitsDataCache = new WeakMap();

/**
 * The row’s traits, their names and their comma-joined text, memoised per trait set:
 * filtering and sorting run this per row on every pass.
 * @param {{traits?: Set<string>}} rowData
 * @returns {TraitData}
 */
export function getTraitData(rowData) {
    const traits = rowData.traits;
    if (!traits || traits.size === 0) return NO_TRAITS;

    let result = traitsDataCache.get(traits);
    if (!result) {
        const activeTraits = [...traits]
            .map((trait) => ({ name: trait.toUpperCase(), glossaryKey: trait }))
            .sort((a, b) => compareText(a.name, b.name));
        const names = activeTraits.map((trait) => trait.name);
        result = { activeTraits, names, text: names.join(', ') };
        traitsDataCache.set(traits, result);
    }
    return result;
}

/**
 * The traits as text, for the download.
 * @param {{traits?: Set<string>}} rowData
 * @returns {string} The comma-joined trait text, or `MISSING_VALUE` when the row has none.
 */
export function getTraitsText(rowData) {
    return getTraitData(rowData).text;
}

/**
 * Build the traits display as glossary-ready markup.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary: the empty-state text, and which codes it describes.
 * @param {ReadonlyMap<string, string>} traitLabels - The payload's labels, a catalog's `TRAIT_LABELS` dataset.
 * @param {{traits?: Set<string>}} rowData
 * @returns {string} The trait chips, or the `MISSING_VALUE` empty state with its tooltip.
 */
export function getTraitsHtml(glossary, traitLabels, rowData) {
    const { activeTraits } = getTraitData(rowData);

    if (activeTraits.length === 0) {
        const emptyText = escapeHtml(glossary.getRequiredEntryText('general.messages.no-traits'));
        return `<div class="traits-container"><span class="trait-empty" data-tooltip-text="${emptyText}">${MISSING_VALUE}</span></div>`;
    }
    // Every chip keeps its `data-glossary-key` beside the fallback, so the popup
    // works as soon as the glossary knows the code.
    const traitHtml = activeTraits
        .map((trait) => {
            const fallback = getTraitFallbackLabel(glossary, traitLabels, trait.glossaryKey);
            const tooltipAttr = fallback ? ` data-tooltip-text="${escapeHtml(fallback)}"` : '';
            return `<span ${glossaryTermAttrs(trait.glossaryKey, 'trait-item', { focusable: false })}${tooltipAttr}>${escapeHtml(trait.name)}</span>`;
        })
        .join('');
    return `<div class="traits-container">${traitHtml}</div>`;
}
