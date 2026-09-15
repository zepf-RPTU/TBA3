/**
 * ItemPreviewOverlay — Singleton service for the single-task preview pop-up.
 *
 * Renders an individual task ("Aufgabe") in a modal overlay: number, name and
 * metadata plus labeled PLACEHOLDER slots for media (Text, Bild, Audio). The task
 * payload carries no media, so the slots render empty; they fill once it does.
 *
 * The lazy-build/mount/visibility/Escape-close mechanics are delegated to a
 * composed SingletonOverlay (shared with NotesController); this class owns
 * the backdrop-click-to-close and content-rendering behavior specific to the
 * task preview. One instance per app page is sufficient.
 *
 * Usage:
 *   import { itemPreviewOverlay } from './itemPreviewOverlay.js';
 *   itemPreviewOverlay.show({ number: 'H-1.1', title: 'Brian\'s Voice Message',
 *                             domainLabel: 'Hörverstehen', level: 'A1.1', styles: [] });
 */

import { escapeHtml, iconSvg } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { SingletonOverlay } from './singletonOverlay.js';
import './itemPreviewOverlay.css';

const MEDIA_SLOTS = [
    { key: 'text', label: 'Text', hint: 'Aufgabentext folgt.' },
    { key: 'image', label: 'Bild', hint: 'Bild folgt.' },
    { key: 'audio', label: 'Audio', hint: 'Audio folgt.' },
];

class ItemPreviewOverlay {
    /** @type {SingletonOverlay|null} Built on first use: the dialog name is glossary copy, which is not ready at import time. */
    #overlayInstance = null;

    get #overlay() {
        this.#overlayInstance ??= new SingletonOverlay(
            'modal-backdrop item-preview-overlay',
            (root) => this.#buildContent(root),
            {
                onShow: () => {
                    document.body.style.overflow = 'hidden';
                },
                onHide: () => {
                    document.body.style.overflow = '';
                },
                modal: {
                    label: glossaryAnnotator.getRequiredEntryText(
                        'general.buttons.element_texts.item-preview.label',
                    ),
                },
            },
        );
        return this.#overlayInstance;
    }

    /** @type {ItemPreviewOverlay|null} */
    static #instance = null;

    static getInstance() {
        if (!ItemPreviewOverlay.#instance) {
            ItemPreviewOverlay.#instance = new ItemPreviewOverlay();
        }
        return ItemPreviewOverlay.#instance;
    }

    /**
     * Show the preview overlay for a single task.
     * @param {object} task - Normalized task info (subject-agnostic)
     * @param {string} task.number - Task number (e.g. "H-1.1")
     * @param {string} [task.title] - Task / exercise name
     * @param {string} [task.domainLabel] - Domain label (e.g. "Hörverstehen")
     * @param {string} [task.level] - Competence level label (e.g. "A1.1")
     * @param {string[]|string} [task.styles] - Styles / Stile
     */
    show(task = /** @type {any} */ ({})) {
        this.#overlay.show();
        this.#renderContent(task);
    }

    // ── Private ─────────────────────────────────────────────────────────────

    /**
     * Populates the overlay root (already created/appended by SingletonOverlay)
     * with its markup and wiring. Called once, on first show().
     * @param {HTMLElement} root - The overlay element, already created and appended by SingletonOverlay.
     */
    #buildContent(root) {
        root.innerHTML = `
            <div class="item-preview-overlay-content">
                <button class="btn btn--icon btn--size-toolbar-xs item-preview-overlay-close" data-overlay-action="close" aria-label="${glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.close.label')}">
                    ${iconSvg('close')}
                </button>
                <div class="item-preview-overlay-body"></div>
            </div>
        `;

        // Backdrop click closes; clicks inside the content do not bubble up.
        root.addEventListener('click', () => this.#overlay.hide());
        root.querySelector('.item-preview-overlay-content')?.addEventListener('click', (e) =>
            e.stopPropagation(),
        );
        root.querySelector('[data-overlay-action="close"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#overlay.hide();
        });
    }

    #renderContent(task) {
        const body = this.#overlay.getRoot()?.querySelector('.item-preview-overlay-body');
        if (!body) return;
        const number = task.number ? escapeHtml(task.number) : '';
        const title = task.title ? escapeHtml(task.title) : '';
        const stylesText = Array.isArray(task.styles) ? task.styles.join(', ') : task.styles || '';

        const metaRows = /** @type {Array<[string, string]>} */ (
            [
                task.domainLabel ? ['Domäne', task.domainLabel] : null,
                task.level ? ['Niveau', task.level] : null,
                stylesText ? ['Stile', stylesText] : null,
            ].filter(Boolean)
        )
            .map(
                ([label, value]) => `
            <div class="detail-row">
                <span class="detail-label">${escapeHtml(label)}:</span>
                <span class="detail-value">${escapeHtml(value)}</span>
            </div>
        `,
            )
            .join('');

        const mediaSlots = MEDIA_SLOTS.map(
            (slot) => `
            <div class="item-preview-media-slot" data-media="${slot.key}">
                <span class="item-preview-media-slot-label">${escapeHtml(slot.label)}</span>
                <span class="item-preview-media-slot-hint">${escapeHtml(slot.hint)}</span>
            </div>
        `,
        ).join('');

        body.innerHTML = `
            <header class="item-preview-overlay-header">
                <span class="item-preview-overlay-number">${number}</span>
                ${title ? `<h2 class="item-preview-overlay-title">${title}</h2>` : ''}
            </header>
            ${metaRows ? `<div class="item-preview-overlay-meta detail-section">${metaRows}</div>` : ''}
            <div class="help-notice notice-callout layout-row" role="note">
                <span class="help-notice-icon notice-callout-icon" aria-hidden="true">
                    ${iconSvg('warning')}
                </span>
                <p class="help-notice-message notice-callout-message">Die Darstellung einzelner Aufgaben ist vorerst ein Platzhalter und befindet sich in Bearbeitung.</p>
            </div>
            <div class="item-preview-media">${mediaSlots}</div>
        `;
    }
}

export const itemPreviewOverlay = ItemPreviewOverlay.getInstance();
