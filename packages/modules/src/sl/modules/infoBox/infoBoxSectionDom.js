/**
 * The DOM an info box paints: the section buttons, the block sequence of the active
 * section (text list items with sublists, link button groups), and the empty state.
 * Each builder takes its host element; the module owns the state and the click handling.
 */

import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';
import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';
import { createIcon } from '@tba3/module-base/utils/icons.js';
import { VALUE_MARKER_CLOSE, VALUE_MARKER_OPEN } from './infoBoxTextResolver.js';

/**
 * Rebuild the icon buttons, one per section with a key.
 * @param {HTMLElement} buttonsRow - The `.info-box-section-buttons` group.
 * @param {Array<{key: string|null, icon: string, tooltipText: string|null}>} sectionMetas - From `resolveSectionMeta`; the tooltip is the accessible name.
 * @param {string|null} activeSectionKey - The section shown.
 */
export function renderSectionButtons(buttonsRow, sectionMetas, activeSectionKey) {
    buttonsRow.replaceChildren();

    sectionMetas.forEach((sectionMeta) => {
        if (!sectionMeta.key) {
            return;
        }

        const isActive = sectionMeta.key === activeSectionKey;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn--icon info-box-section-btn';
        button.dataset.sectionKey = sectionMeta.key;
        button.setAttribute('aria-label', sectionMeta.tooltipText ?? '');
        button.setAttribute('aria-pressed', String(isActive));
        button.setAttribute('data-tooltip-text', sectionMeta.tooltipText ?? '');
        if (isActive) {
            button.classList.add('is-active');
        }

        button.appendChild(createIcon(sectionMeta.icon));
        buttonsRow.appendChild(button);
    });
}

/**
 * Move the active mark to one button without rebuilding the row.
 * @param {HTMLElement} buttonsRow - The `.info-box-section-buttons` group.
 * @param {string|null} activeSectionKey - The section shown.
 */
export function setActiveSectionButton(buttonsRow, activeSectionKey) {
    const buttons = /** @type {NodeListOf<HTMLElement>} */ (
        buttonsRow.querySelectorAll('.info-box-section-btn')
    );
    buttons.forEach((button) => {
        const isActive = button.dataset.sectionKey === activeSectionKey;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

/**
 * Paint a section's entries: consecutive text entries share one list, a links entry
 * breaks the list and renders as a button group.
 * @param {HTMLElement} container - The content container; cleared first.
 * @param {Array<Record<string, any>>} entries - `{type: 'text', text, children}` and `{type: 'links', links}` entries.
 * @param {(link: Record<string, any>) => void} onLinkActivate - Called when a link button is pressed.
 */
export function renderSectionBlocks(container, entries, onLinkActivate) {
    const items = Array.isArray(entries) ? entries : [];
    container.innerHTML = '';

    const content = document.createDocumentFragment();
    const sequence = document.createElement('div');
    sequence.className = 'info-box-block-sequence layout-stack';
    let list = null;

    const flushList = () => {
        if (list && list.childElementCount > 0) {
            sequence.appendChild(list);
        }
        list = null;
    };

    const ensureList = () => {
        if (!list) {
            list = document.createElement('ul');
            list.className = 'info-box-block-list layout-stack';
        }

        return list;
    };

    items.forEach((entry) => {
        if (entry?.type === 'links') {
            flushList();
            const linkList = renderSectionLinkList(entry.links, onLinkActivate);
            if (linkList) {
                sequence.appendChild(linkList);
            }
            return;
        }

        const item = renderSectionTextListItem(entry);
        if (item) {
            ensureList().appendChild(item);
        }
    });

    flushList();

    if (sequence.childElementCount > 0) {
        content.appendChild(sequence);
    }

    container.appendChild(content);
}

/**
 * Render one text entry as a list item, its children as a nested list.
 * @param {Record<string, any>|null} [entry] - The entry; anything but a text entry renders nothing.
 * @returns {HTMLElement|null} The item, or `null` when there is nothing to render.
 */
export function renderSectionTextListItem(entry = null) {
    if (!entry || entry.type !== 'text') {
        return null;
    }

    const item = document.createElement('li');
    item.className = 'info-box-block-item';
    item.innerHTML = renderBlockText(String(entry.text ?? ''));

    const children = Array.isArray(entry.children) ? entry.children : [];
    if (children.length > 0) {
        const sublist = document.createElement('ul');
        sublist.className = 'info-box-block-list info-box-block-sublist layout-stack';
        children.forEach((childEntry) => {
            const childItem = renderSectionTextListItem(childEntry);
            if (childItem) {
                sublist.appendChild(childItem);
            }
        });

        if (sublist.childElementCount > 0) {
            item.appendChild(sublist);
        }
    }

    return item;
}

/**
 * Render material links as a button group.
 * @param {Array<Record<string, any>>} links - From `createMaterialSectionLinksFromToken`.
 * @param {(link: Record<string, any>) => void} onLinkActivate - Called when an enabled link is pressed.
 * @returns {HTMLElement|null} The group, or `null` when no link has a label.
 */
export function renderSectionLinkList(links = [], onLinkActivate) {
    const linkList = document.createElement('div');
    linkList.className = 'btn-group btn-group--wrap info-box-link-list';

    links.forEach((link) => {
        if (!link?.label) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn--text';
        button.textContent = link.label;

        if (!link.disabled && typeof link.onActivate === 'function') {
            button.addEventListener('click', () => onLinkActivate(link));
        } else {
            button.disabled = true;
        }

        linkList.appendChild(button);
    });

    return linkList.childElementCount > 0 ? linkList : null;
}

/**
 * Escape a resolved text and turn its value markers into `.info-box-placeholder-value`
 * spans, then let the glossary annotate it.
 * @param {string} [text] - The resolved text.
 * @returns {string} Safe HTML.
 */
export function renderBlockText(text = '') {
    const escapedText = escapeHtml(String(text ?? ''));
    const withValueMarkup = escapedText
        .replaceAll(VALUE_MARKER_OPEN, '<span class="info-box-placeholder-value">')
        .replaceAll(VALUE_MARKER_CLOSE, '</span>');

    return glossaryAnnotator.annotateHTML(withValueMarkup);
}

/**
 * Replace the content with the shared "nothing to show" sentence.
 * @param {HTMLElement} container - The content container.
 */
export function renderEmptyState(container) {
    container.innerHTML = '';

    const emptyState = document.createElement('p');
    emptyState.className = 'info-box-empty-state text-muted';
    // The sentence lives in `sl.results` (shared glossary) — the entry every info box
    // already reads its title from.
    emptyState.textContent = glossaryAnnotator.getRequiredEntryText('sl.results.messages.empty');

    container.appendChild(emptyState);
}
