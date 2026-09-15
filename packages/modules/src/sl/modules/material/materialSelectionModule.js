/**
 * MaterialSelectionModule - shows the material page for the selected Fach ×
 * Seitentyp. The selection comes from outside through `setSelection()`.
 */

import { ContentModule } from '@tba3/module-base/modules/contentModule.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';
import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';
import { MaterialContentResolver } from './materialContentResolver.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import materialContent from './materialContent.json' with { type: 'json' };
import './materialSelectionModule.css';

/**
 * MaterialSelectionModule - Creates and manages material selection interface
 * @augments ContentModule
 */
export class MaterialSelectionModule extends ContentModule {
    /** @type {Record<string, any>|null} */
    #contentData = null;
    /** @type {Record<string, any>|null} */
    #contentLookup = null;
    /** @type {{subject: string, type: string}} */
    #selectionState = { subject: 'Gesamt', type: 'Übersicht' };
    /** @type {MaterialContentResolver|null} */
    #contentResolver = null;

    /**
     * Creates a new MaterialSelectionModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options (slData, …)
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        // The pages come from the co-located JSON module: bundled, so no fetch and
        // nothing to await — the lazy-load machinery this replaced is gone with it.
        this.#contentData = materialContent;
        this.#buildContentLookup();
    }

    /**
     * Build flat lookup map for O(1) content access
     * Creates keys like "Gesamt|Übersicht" for fast lookup
     */
    #buildContentLookup() {
        this.#contentLookup = { ...this.#contentData?.entries };
    }

    #getContentResolver() {
        if (!this.#contentResolver) {
            this.#contentResolver = new MaterialContentResolver({
                slData: this.getOption('slData'),
            });
        }

        return this.#contentResolver;
    }

    /**
     * Default assignId to true (extends ContentModule directly).
     * @override
     */
    validateContainer({ assignId = true } = {}) {
        return super.validateContainer({ assignId });
    }

    /**
     * Rebuild the content on a KS color-theme switch. The competence-distribution
     * stacks are HTML with the band color stamped inline as `--ks-band-color`
     * (materialContentResolver), so unlike a chart or a table they would keep the
     * old palette until the next selector click.
     * @override
     */
    onThemeChanged() {
        if (this.initialized) {
            this.#updateContent();
        }
        super.onThemeChanged();
    }

    /** @override */
    getExportControlDefinition() {
        return this._buildExportControlDefinition('material');
    }

    /**
     * The header selectors swap subject and type in place, so one instance
     * shows every subject × type combination in turn.
     * @override
     */
    getExportIdentity() {
        return [this.#selectionState.subject, this.#selectionState.type];
    }

    /**
     * Render the material selection interface
     * @override
     * @returns {Promise<void>}
     */
    async _doRenderContent() {
        this.contentContainer.innerHTML = '';
        this.contentContainer.classList.add('material-selection-module', 'material-content-area');
        this.element = this.contentContainer;

        this.#updateContent();
    }

    /**
     * Update content area based on current selections using flat lookup
     */
    #updateContent() {
        if (!this.element) {
            return;
        }

        this.element.innerHTML = '';

        const key = `${this.#selectionState.subject}|${this.#selectionState.type}`;
        const entry = this.#contentLookup?.[key] ?? null;
        const content =
            entry?.status === 'implemented'
                ? this.#getContentResolver().renderEntry(entry)
                : this.#renderUnderConstructionState();
        const contentTemplate = document.createElement('template');
        contentTemplate.innerHTML = glossaryAnnotator.annotateHTML(content).trim();
        this.element.appendChild(contentTemplate.content.cloneNode(true));

        // Subject and type are this module's export identity, and every change
        // lands here without going through render() — so the id is refreshed
        // from the one place all of them pass through.
        this.syncExportControls();
    }

    #renderUnderConstructionState() {
        const selectionSummary = `${this.#selectionState.type} - ${this.#selectionState.subject}`;

        return `
            <div class="material-under-construction notice-callout" role="note" aria-label="${glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.region-hint.label')}">
                <span class="material-under-construction-icon notice-callout-icon" aria-hidden="true">
                    ${iconSvg('warning')}
                </span>
                <div class="material-under-construction-copy notice-callout-copy">
                    <p class="material-under-construction-message notice-callout-message">Dieser Teil der Rückmeldung ist vorerst nur ein Platzhalter und befindet sich in Bearbeitung.</p>
                    <p class="material-under-construction-selection">Ausgewählt: <strong>${escapeHtml(selectionSummary)}</strong></p>
                </div>
            </div>
        `;
    }

    /**
     * Set selection from external source
     * @param {'subject'|'type'} selectorId - Which half of the selection to set
     * @param {string} value - Value to select
     */
    setSelection(selectorId, value) {
        if (this.#selectionState[selectorId] === value) return;

        this.#selectionState[selectorId] = value;
        this.#updateContent();
    }
}
