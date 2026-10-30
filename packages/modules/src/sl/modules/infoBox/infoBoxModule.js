import { ContentModule, createState, writeState } from '@tba3/module-base';
import { INFO_BOX_DOCUMENTS, resolveInfoBox } from './infoBoxContent.js';
import {
    renderEmptyState,
    renderSectionBlocks,
    renderSectionButtons,
} from './infoBoxSectionDom.js';
import './infoBoxModule.css';

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *     context: import('../../../common/context/moduleContext.js').ModuleContext,
 *     onOpenMaterial?: ((selection: import('./infoBoxLinks.js').MaterialSelection) => Promise<void>) | null,
 * }} InfoBoxOptions
 */

/** @typedef {import('./infoBoxContent.js').PlaceholderInput} PlaceholderInput */

/**
 * What a host hands the box: which box, and what its placeholders resolve against.
 * @typedef {{boxKey?: string|null, placeholderContext?: PlaceholderInput}} InfoBoxData
 */

/** @augments {ContentModule<InfoBoxOptions>} */
class InfoBoxModule extends ContentModule {
    /** @override */
    static defaultOptions = { showModuleTitle: true };

    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = INFO_BOX_DOCUMENTS;

    /** @type {HTMLElement|null} */
    #controlsRoot = null;
    /** @type {HTMLElement|null} */
    #buttonsRow = null;

    constructor() {
        super();
        /** @type {import('@tba3/module-base').State<{box: string|null, section: string|null}>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<{box: string|null, section: string|null}>} */ ({
                box: null,
                section: null,
            }),
        );
    }

    // ============================================================================
    // BASE CLASS HOOKS
    // ============================================================================

    /**
     * @override
     * @returns {'visual'|null} `'visual'` while the box shows a section.
     */
    _getExportType() {
        return this.state.section.value === null ? null : 'visual';
    }

    /**
     * One instance shows a whole family of boxes: a host may swap the box in
     * place (`boxKey`), and the section buttons swap which section is rendered. Both change what a capture would show.
     * @override
     */
    getExportIdentity() {
        return [this.state.box.value, this.state.section.value];
    }

    /**
     * @override
     * @param {InfoBoxData} [data]
     */
    async _renderBody(data = {}) {
        this.#ensureControlsRoot();
        this.#show(data, this.state.section.value);
    }

    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================

    /**
     * Paint the box `data` names on `sectionKey`, or on the box's first section.
     * @param {InfoBoxData} data
     * @param {string|null} sectionKey
     */
    #show(data, sectionKey) {
        const boxKey = data.boxKey ?? null;
        const content = resolveInfoBox(this.options.context, {
            boxKey,
            sectionKey,
            placeholderContext: data.placeholderContext ?? {},
            onOpenMaterial: this.options.onOpenMaterial ?? null,
            warn: (message, details) =>
                console.warn(
                    `InfoBoxModule[${this.id}]: ${message}`,
                    ...(details ? [details] : []),
                ),
        });
        // Box and section in one write, so the export control moves once, straight to
        // the new target.
        writeState(this.state, { box: boxKey, section: content?.activeSection ?? null });
        if (this.#controlsRoot) this.#controlsRoot.hidden = content === null;
        if (this.#buttonsRow) {
            renderSectionButtons(
                this.#buttonsRow,
                content?.sections ?? [],
                this.state.section.value,
                this.#onSelectSection,
            );
        }

        if (!content) {
            renderEmptyState(this.contentContainer, this.#emptyStateText());
            return;
        }
        renderSectionBlocks(
            this.options.context.glossary,
            this.contentContainer,
            content.entries,
            (link) => this.#activateLink(link),
        );
    }

    /**
     * Show another section of the box.
     * @param {string} sectionKey - The pressed button's section.
     */
    #onSelectSection = (sectionKey) => {
        if (sectionKey === this.state.section.value) return;
        this.#show(/** @type {InfoBoxData} */ (this.data ?? {}), sectionKey);
    };

    /**
     * The "nothing to show" sentence from this box's own glossary entry, which also
     * carries its title: each host words it for what its box is about.
     * @returns {string}
     */
    #emptyStateText() {
        const text = this.glossaryEntry?.messages?.empty;
        if (typeof text !== 'string') {
            throw new Error(
                `InfoBoxModule[${this.id}]: glossary entry "${this.glossaryKey}" has no messages.empty`,
            );
        }
        return text;
    }

    #ensureControlsRoot() {
        if (this.#controlsRoot?.isConnected && this.#buttonsRow?.isConnected) {
            return;
        }

        const controlsRoot = document.createElement('div');
        controlsRoot.className = 'info-box-controls layout-row';

        const buttonsRow = document.createElement('div');
        buttonsRow.className = 'btn-group info-box-section-buttons';
        controlsRoot.appendChild(buttonsRow);

        this.insertBefore(controlsRoot, this.contentContainer);

        this.#controlsRoot = controlsRoot;
        this.#buttonsRow = buttonsRow;
    }

    /**
     * Run a pressed link's handler, logging a failure rather than letting it escape.
     * @param {import('./infoBoxLinks.js').MaterialSectionLink} link - The pressed link; only an enabled one, which has a handler, can be pressed.
     */
    async #activateLink(link) {
        try {
            await link.onActivate?.();
        } catch (error) {
            console.error(`InfoBoxModule[${this.id}]: Failed to activate link`, error);
        }
    }
}

customElements.define('tba-info-box', InfoBoxModule);

export { InfoBoxModule };
