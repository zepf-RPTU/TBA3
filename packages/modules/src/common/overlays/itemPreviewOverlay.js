/**
 * The item preview: one item's ("Aufgabe") content in a modal dialog, its number and
 * name above labelled placeholder slots for its media (Text, Bild, Audio). The content
 * could later come from the Aufgabenbrowser; this prototype renders the slots empty, and a
 * notice says so. The item's metadata and results are not repeated here.
 *
 * Each preview is its own ModalDialog, removed when it closes. It is reached through the
 * context's `itemPreview`, which a host wires to `showItemPreview`.
 */

import { noticeCallout } from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import { ModalDialog } from './modalDialog.js';
import { removePopupAfterTransition } from '../services/anchoredPopup.js';
import './itemPreviewOverlay.css';

/**
 * What the preview shows, as `context.itemPreview` receives it: the item's identity
 * only.
 * @typedef {{number: string, title: string}} ItemPreview
 */

/** The media slots, each labelled by `general.buttons.element_texts.item-preview-<key>` and hinted by `general.messages.item-preview-<key>-pending`. */
const MEDIA_SLOTS = ['text', 'image', 'audio'];

/**
 * Show the preview dialog for a single item.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {ItemPreview} item - The item's number (e.g. "H-1.1") and the exercise's name.
 */
export function showItemPreview(glossary, item) {
    const dialog = new ModalDialog({
        className: 'item-preview-overlay modal-dialog--centered',
        glossary,
        // Removed once its exit transition has played (getAnimations() flushes styles,
        // so the transition the close just started is among them).
        onClose: () => removePopupAfterTransition(dialog.element, { subtree: true }),
    });
    const body = document.createElement('div');
    body.className = 'item-preview-overlay-body';
    const card = document.createElement('div');
    card.className = 'item-preview-overlay-content modal-panel';
    // Pinned to the card's corner.
    card.append(dialog.closeButton, body);
    dialog.element.append(card);
    renderContent(glossary, body, item);
    dialog.show(glossary.getRequiredEntryText('general.buttons.element_texts.item-preview.label'));
}

/**
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {HTMLElement} target - The overlay body.
 * @param {Parameters<typeof showItemPreview>[1]} item
 */
function renderContent(glossary, target, item) {
    const title = item.title
        ? html`<h2 class="item-preview-overlay-title">${item.title}</h2>`
        : nothing;
    const notice = noticeCallout({
        message: glossary.getRequiredEntryText('general.messages.item-preview-placeholder'),
    });
    const mediaSlots = MEDIA_SLOTS.map(
        (key) =>
            html`<div class="item-preview-media-slot">
                <span class="item-preview-media-slot-label"
                    >${glossary.getRequiredEntryText(
                        `general.buttons.element_texts.item-preview-${key}.label`,
                    )}</span
                >
                <span class="item-preview-media-slot-hint"
                    >${glossary.getRequiredEntryText(
                        `general.messages.item-preview-${key}-pending`,
                    )}</span
                >
            </div>`,
    );

    render(
        html`<header class="item-preview-overlay-header">
                <span class="item-preview-overlay-number">${item.number || ''}</span>
                ${title}
            </header>
            ${notice}
            <div class="item-preview-media">${mediaSlots}</div>`,
        target,
    );
}
