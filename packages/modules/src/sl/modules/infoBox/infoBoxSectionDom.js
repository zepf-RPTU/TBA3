/**
 * The DOM an info box paints: the section buttons, the block sequence of the active
 * section (text list items with sublists, link button groups), and the empty state.
 * Each renderer takes its host element and renders into it with lit-html, which then
 * owns the host's children: painting again patches them.
 */

import { escapeHtml, renderIcon, trusted } from '@tba3/module-base';
import { glossaryRunsMarkup } from '@tba3/module-base/glossary';
import { html, nothing, render } from 'lit';

/** @typedef {import('./infoBoxContent.js').InfoBoxTextEntry} InfoBoxTextEntry */
/** @typedef {import('./infoBoxContent.js').InfoBoxEntry} InfoBoxEntry */

/**
 * Paint the icon buttons, one per section, the shown one pressed.
 * @param {HTMLElement} buttonsRow - The `.info-box-section-buttons` group.
 * @param {import('./infoBoxContent.js').SectionMeta[]} sectionMetas - The tooltip is the accessible name.
 * @param {string|null} activeSectionKey
 * @param {(sectionKey: string) => void} onSelect
 */
export function renderSectionButtons(buttonsRow, sectionMetas, activeSectionKey, onSelect) {
    const buttons = sectionMetas.map(({ key, icon, tooltipText }) => {
        const active = key === activeSectionKey;
        return html`<button
            type="button"
            class=${active ? 'btn btn--icon info-box-section-btn is-active' : 'btn btn--icon info-box-section-btn'}
            aria-label=${tooltipText}
            data-tooltip-text=${tooltipText}
            aria-pressed=${String(active)}
            @click=${() => onSelect(key)}
        >
            ${renderIcon(icon)}
        </button>`;
    });
    render(buttons, buttonsRow);
}

/**
 * Paint a section's entries: consecutive text entries share one list, a links entry
 * breaks the list and renders as a button group.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - Annotates the texts.
 * @param {HTMLElement} container - The content container.
 * @param {InfoBoxEntry[]} entries
 * @param {(link: import('./infoBoxLinks.js').MaterialSectionLink) => void} onLinkActivate - Called only for an enabled link.
 */
export function renderSectionBlocks(glossary, container, entries, onLinkActivate) {
    /** @type {import('lit').TemplateResult[]} */
    const blocks = [];
    /** @type {InfoBoxTextEntry[]} */
    let texts = [];
    const flushList = () => {
        if (texts.length > 0) blocks.push(textListTemplate(glossary, texts, false));
        texts = [];
    };
    for (const entry of entries) {
        if (entry.type === 'links') {
            flushList();
            blocks.push(linkListTemplate(glossary, entry.links, onLinkActivate));
        } else {
            texts.push(entry);
        }
    }
    flushList();

    render(
        blocks.length > 0
            ? html`<div class="info-box-block-sequence layout-stack">${blocks}</div>`
            : nothing,
        container,
    );
}

/**
 * Text entries as a list, each entry's children as a nested list.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {InfoBoxTextEntry[]} entries
 * @param {boolean} nested
 * @returns {import('lit').TemplateResult}
 */
function textListTemplate(glossary, entries, nested) {
    const items = entries.map((entry) => {
        const text = trusted(blockTextHtml(glossary, entry.segments));
        const sublist =
            entry.children.length > 0 ? textListTemplate(glossary, entry.children, true) : nothing;
        return html`<li class="info-box-block-item">${text}${sublist}</li>`;
    });
    const className = nested
        ? 'info-box-block-list info-box-block-sublist layout-stack'
        : 'info-box-block-list layout-stack';
    return html`<ul class=${className}>
        ${items}
    </ul>`;
}

/**
 * Material links as a button group. A link without a handler, to a page the prototype
 * does not have yet, renders `aria-disabled`: still focusable, so its tooltip says why.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - Words the tooltip.
 * @param {import('./infoBoxLinks.js').MaterialSectionLink[]} links - From `createMaterialSectionLinks`.
 * @param {(link: import('./infoBoxLinks.js').MaterialSectionLink) => void} onLinkActivate - Called when an enabled link is pressed.
 * @returns {import('lit').TemplateResult}
 */
function linkListTemplate(glossary, links, onLinkActivate) {
    const unfilled = glossary.getRequiredEntryText('general.messages.prototype-unfilled');
    const buttons = links.map(
        (link) =>
            html`<button
                type="button"
                class="btn btn--text"
                aria-disabled=${link.onActivate ? nothing : 'true'}
                data-tooltip-text=${link.onActivate ? nothing : unfilled}
                @click=${() => {
                    if (link.onActivate) onLinkActivate(link);
                }}
            >
                ${link.label}
            </button>`,
    );
    return html`<div class="btn-group btn-group--wrap info-box-link-list">${buttons}</div>`;
}

/**
 * Escape a resolved text, wrap each resolved value in an `.info-box-placeholder-value`
 * span (a Domäne in it already the term of its entry), then let the glossary annotate
 * the whole text at once, so a term spanning segments still matches.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {import('./infoBoxTextResolver.js').TextSegment[]} segments
 * @returns {string} Safe HTML.
 */
function blockTextHtml(glossary, segments) {
    const markup = segments
        .map((segment) =>
            'runs' in segment
                ? `<span class="info-box-placeholder-value">${glossaryRunsMarkup(segment.runs)}</span>`
                : escapeHtml(segment.text),
        )
        .join('');

    return glossary.annotateHTML(markup);
}

/**
 * Paint a "nothing to show" sentence in place of the content.
 * @param {HTMLElement} container - The content container.
 * @param {string} text
 */
export function renderEmptyState(container, text) {
    render(html`<p class="info-box-empty-state">${text}</p>`, container);
}
