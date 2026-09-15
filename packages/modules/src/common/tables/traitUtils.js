import { getTraitFallbackLabel } from '../domain/traitRegistry.js';
import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';
import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';

const traitsDataCache = new Map();
const TRAITS_CACHE_MAX_SIZE = 500;

/**
 * Cache key for a row’s trait set: its members, sorted, so two rows with the same
 * traits in a different insertion order share one cached rendering.
 * @param {{traits?: Set<string>}} rowData - The table row, whose `traits` set is read.
 * @returns {string} The key; empty string for a row with no traits.
 */
function getTraitsCacheKey(rowData) {
    const traits = rowData.traits;
    if (!traits || traits.size === 0) return '';
    return [...traits].sort().join('_');
}

/**
 * The row’s traits and their comma-joined text, memoised by trait set.
 * Filtering and sorting run this per row on every pass, so the join is cached rather
 * than recomputed.
 * @param {{traits?: Set<string>}} rowData - The table row, whose `traits` set is read.
 * @returns {{activeTraits: Array<{name: string, glossaryKey: string}>, text: string}} The traits in display order with their glossary keys, and the joined text.
 */
function getTraitData(rowData) {
    const cacheKey = getTraitsCacheKey(rowData);

    if (traitsDataCache.has(cacheKey)) {
        return traitsDataCache.get(cacheKey);
    }

    const traits = rowData.traits;
    const activeTraits =
        traits && traits.size > 0
            ? [...traits].map((trait) => ({ name: trait.toUpperCase(), glossaryKey: trait }))
            : [];

    activeTraits.sort((a, b) => a.name.localeCompare(b.name));

    const text =
        activeTraits.length === 0 ? '—' : activeTraits.map((trait) => trait.name).join(', ');
    const result = { text, activeTraits };

    if (traitsDataCache.size >= TRAITS_CACHE_MAX_SIZE) {
        const firstKey = traitsDataCache.keys().next().value;
        traitsDataCache.delete(firstKey);
    }

    traitsDataCache.set(cacheKey, result);
    return result;
}

/**
 * Get trait text only for sorting and filtering.
 * @param {{traits?: Set<string>}} rowData - The table row, whose `traits` set is read.
 * @returns {string} The comma-joined trait text, or an em dash when the row has none.
 */
export function getTraitsText(rowData) {
    return getTraitData(rowData).text;
}

/**
 * Build a formatted traits display as a DOM element or HTML string.
 * @param {{traits?: Set<string>}} rowData - The table row, whose `traits` set is read.
 * @param {boolean} [asHtmlString=false] - Return markup instead of a built element.
 * @returns {HTMLElement|string} The rendered traits — glossary-annotated markup when `asHtmlString`, otherwise an element.
 */
export function getTraitsAsText(rowData, asHtmlString = false) {
    const { activeTraits } = getTraitData(rowData);

    if (asHtmlString) {
        if (activeTraits.length === 0) {
            // The same entry the DOM branch below reads: two spellings of one empty state
            // would agree only until someone edits the glossary.
            const emptyText = escapeHtml(
                glossaryAnnotator.getRequiredEntryText('general.messages.no-traits'),
            );
            return `<div class="traits-container traits-empty"><span class="trait-empty" data-tooltip-text="${emptyText}">—</span></div>`;
        }
        // Every chip keeps its `data-glossary-key` regardless of the fallback, so the
        // popup starts working the moment the glossary does learn the code.
        const traitHtml = activeTraits
            .map((trait) => {
                const fallback = getTraitFallbackLabel(trait.glossaryKey);
                const tooltipAttr = fallback ? ` data-tooltip-text="${escapeHtml(fallback)}"` : '';
                return `<span class="trait-item glossary-term" data-glossary-key="${escapeHtml(trait.glossaryKey)}"${tooltipAttr}>${escapeHtml(trait.name)}</span>`;
            })
            .join('');
        return `<div class="traits-container">${traitHtml}</div>`;
    }

    const container = document.createElement('div');
    container.className =
        activeTraits.length === 0 ? 'traits-container traits-empty' : 'traits-container';

    if (activeTraits.length === 0) {
        const emptyIndicator = document.createElement('span');
        emptyIndicator.textContent = '—';
        emptyIndicator.className = 'trait-empty';
        emptyIndicator.setAttribute(
            'data-tooltip-text',
            glossaryAnnotator.getRequiredEntryText('general.messages.no-traits'),
        );
        container.appendChild(emptyIndicator);
    } else {
        activeTraits.forEach((trait) => {
            const el = document.createElement('span');
            el.className = 'trait-item glossary-term';
            el.textContent = trait.name;
            el.dataset.glossaryKey = trait.glossaryKey;
            const fallback = getTraitFallbackLabel(trait.glossaryKey);
            if (fallback) el.setAttribute('data-tooltip-text', fallback);
            container.appendChild(el);
        });
    }

    return container;
}
