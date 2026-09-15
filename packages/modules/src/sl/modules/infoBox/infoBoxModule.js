import { ContentModule } from '@tba3/module-base/modules/contentModule.js';
import { targetEl } from '@tba3/module-base/utils/domBuilder.js';
import { emptySlData } from '../../slData.js';
import { CompetenceShareQueries } from '../../utils/slCompetenceShares.js';
import { normalizeDataSubjectName } from '../../utils/slSubjectConfig.js';
import { createMaterialSectionLinksFromToken } from './infoBoxLinks.js';
import { InfoBoxTextResolver } from './infoBoxTextResolver.js';
import { expandRepeatBlock, isRepeatBlockDefinition } from './infoBoxRepeatBlocks.js';
import {
    isLinkBlockDefinition,
    isTextBlockDefinition,
    resolveActiveSection,
    resolveSectionMeta,
} from './infoBoxDefinitions.js';
import {
    renderEmptyState,
    renderSectionBlocks,
    renderSectionButtons,
    setActiveSectionButton,
} from './infoBoxSectionDom.js';
import './infoBoxModule.css';

class InfoBoxModule extends ContentModule {
    /** @type {HTMLElement|null} */
    #controlsRoot = null;
    /** @type {HTMLElement|null} */
    #buttonsRow = null;
    /** @type {string|null} */
    #activeSectionKey = null;
    /** @type {Record<string, any>|null} */
    #currentBox = null;
    /** @type {string|null} */
    #currentBoxKey = null;
    /** @type {Record<string, any>} */
    #currentSectionTypes = {};
    /** @type {Record<string, any>|null} */
    #currentPlaceholderContext = null;
    /** @type {CompetenceShareQueries|null} */
    #queries = null;
    /** @type {InfoBoxTextResolver|null} */
    #placeholderResolver = null;

    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            showModuleTitle: true,
            boxKey: null,
            placeholderContext: null,
            onLinkActivated: null,
        });
    }

    // ============================================================================
    // BASE CLASS HOOKS
    // ============================================================================

    /** @override */
    getExportControlDefinition() {
        if (!this.#currentBox?.sections?.length) {
            return null;
        }

        return this._buildExportControlDefinition('info-box');
    }

    /**
     * One instance shows a whole family of boxes: the comparison view swaps the
     * box in place as its summary changes, and the section buttons swap which
     * section is rendered. Both change what a capture would show.
     * @override
     */
    getExportIdentity() {
        return [this.#currentBoxKey, this.#activeSectionKey];
    }

    /** @override */
    async _doRenderContent(data = {}) {
        const box = this.#resolveBoxDefinition(data);
        this.#currentBox = box;

        this.#ensureControlsRoot();
        const sections = Array.isArray(box?.sections) ? box.sections : [];
        if (this.#controlsRoot) {
            this.#controlsRoot.hidden = sections.length === 0;
        }

        if (sections.length === 0) {
            this.#activeSectionKey = null;
            if (this.#buttonsRow) renderSectionButtons(this.#buttonsRow, [], null);
            renderEmptyState(this.contentContainer);
            return;
        }

        const activeSection = /** @type {Record<string, any>} */ (
            resolveActiveSection(sections, this.#activeSectionKey)
        );
        this.#activeSectionKey = activeSection.type;
        if (this.#buttonsRow) {
            renderSectionButtons(
                this.#buttonsRow,
                sections.map((section) => resolveSectionMeta(section, this.#currentSectionTypes)),
                this.#activeSectionKey,
            );
        }
        this.#renderSection(activeSection);
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    /** @override */
    async update(data) {
        await super.update(data);
        if (this.destroyed) {
            return;
        }

        await this.render(this.getData() ?? {});
    }

    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================

    #getQueries() {
        if (!this.#queries) {
            this.#queries = new CompetenceShareQueries({
                moduleId: this.id,
                slData: this.getOption('slData') ?? emptySlData(),
            });
        }

        return this.#queries;
    }

    #getPlaceholderResolver() {
        if (!this.#placeholderResolver) {
            this.#placeholderResolver = new InfoBoxTextResolver({
                moduleId: this.id,
                queries: this.#getQueries(),
                getPlaceholderContext: () => this.#currentPlaceholderContext,
                warnUnresolved: (source, reason, params) =>
                    this.#warnUnresolvedPlaceholder(source, reason, params),
            });
        }

        return this.#placeholderResolver;
    }

    #resolveBoxDefinition(data) {
        const boxKey = data.boxKey ?? this.getOption('boxKey');
        this.#currentBoxKey = boxKey;
        const infoBoxes = (this.getOption('slData') ?? emptySlData()).infoBoxes();
        this.#currentSectionTypes = infoBoxes?.sectionTypes ?? {};
        this.#currentPlaceholderContext = this.#buildPlaceholderContext(data, infoBoxes);

        if (!boxKey || !infoBoxes?.boxes) {
            console.warn(`InfoBoxModule[${this.id}]: Missing info box source or boxKey`);
            return null;
        }

        const box = infoBoxes.boxes[boxKey] ?? null;
        if (!box) {
            console.warn(`InfoBoxModule[${this.id}]: No info box found for key "${boxKey}"`);
        }
        return box;
    }

    /**
     * The context the placeholders resolve `current` and `summaries` against: the render
     * payload's, else the option's, with the Fach spelled the payload's way and the locale
     * defaulted from the document.
     * @param {Record<string, any>} data - The render payload.
     * @param {Record<string, any>|null} infoBoxes - The info-box document.
     * @returns {Record<string, any>} The context.
     */
    #buildPlaceholderContext(data, infoBoxes) {
        const context = data.placeholderContext ?? this.getOption('placeholderContext') ?? {};

        return {
            ...context,
            subjectName: normalizeDataSubjectName(context.subjectName ?? null),
            locale: context.locale ?? infoBoxes?.meta?.locale ?? 'de-DE',
            summaries: context.summaries ?? {},
        };
    }

    #ensureControlsRoot() {
        if (this.#controlsRoot?.isConnected && this.#buttonsRow?.isConnected) {
            return;
        }

        const container = this.container;
        if (!container) {
            return;
        }

        const controlsRoot = document.createElement('div');
        controlsRoot.className = 'info-box-controls layout-row';

        const buttonsRow = document.createElement('div');
        buttonsRow.className = 'btn-group info-box-section-buttons';
        controlsRoot.appendChild(buttonsRow);

        container.insertBefore(controlsRoot, this.contentContainer);

        this.resources.trackDomListener(controlsRoot, 'click', (event) => {
            const button = /** @type {HTMLElement|null} */ (
                targetEl(event)?.closest('.info-box-section-btn')
            );
            if (!button || !buttonsRow.contains(button)) {
                return;
            }

            const nextSectionKey = button.dataset.sectionKey;
            if (!nextSectionKey || nextSectionKey === this.#activeSectionKey) {
                return;
            }

            const activeSection = this.#currentBox?.sections?.find(
                (section) => section.type === nextSectionKey,
            );
            if (!activeSection) {
                return;
            }

            this.#activeSectionKey = nextSectionKey;
            setActiveSectionButton(buttonsRow, nextSectionKey);
            this.#renderSection(activeSection);
            // The section is part of this box's export identity and this path
            // never goes through render(), so nothing else would resync the id.
            this.syncExportControls();
        });

        this.#controlsRoot = controlsRoot;
        this.#buttonsRow = buttonsRow;
    }

    #renderSection(section) {
        const entries = (Array.isArray(section.blocks) ? section.blocks : []).flatMap((block) =>
            this.#buildBlockEntries(block, section),
        );
        renderSectionBlocks(this.contentContainer, entries, (link) => this.#activateLink(link));
    }

    async #activateLink(link) {
        try {
            await link.onActivate();
            const onLinkActivated = this.getOption('onLinkActivated');
            if (typeof onLinkActivated === 'function') {
                await onLinkActivated({
                    link,
                    boxKey: this.#currentBoxKey,
                    sectionKey: this.#activeSectionKey,
                });
            }
        } catch (error) {
            console.error(`InfoBoxModule[${this.id}]: Failed to activate link`, error);
        }
    }

    /**
     * The entries one block becomes: a text block one entry (with its sublist as
     * children), a repeat block one per iteration, a link block one `links` entry.
     * Inside a sublist only text and repeat blocks are read.
     * @param {*} block - The block.
     * @param {Record<string, any>|null} section - The section, whose link mode is the fallback; `null` inside a sublist.
     * @returns {Array<Record<string, any>>} The entries.
     */
    #buildBlockEntries(block, section) {
        if (typeof block === 'string') {
            return this.#createTextEntry(block, null, []);
        }

        if (isTextBlockDefinition(block)) {
            const sublist = Array.isArray(block.sublist) ? block.sublist : [];
            return this.#createTextEntry(
                block.text,
                null,
                sublist.flatMap((child) => this.#buildBlockEntries(child, null)),
            );
        }

        if (isRepeatBlockDefinition(block)) {
            return expandRepeatBlock(block, {
                slData: this.getOption('slData') ?? emptySlData(),
                placeholderContext: this.#currentPlaceholderContext,
                moduleId: this.id,
            }).flatMap(({ block: repeatedBlock, contextOverride }) =>
                this.#createTextEntry(repeatedBlock, contextOverride, []),
            );
        }

        if (section && isLinkBlockDefinition(block)) {
            const links = this.#resolveBlockLinks(block, section);
            return links.length > 0 ? [{ type: 'links', links }] : [];
        }

        console.warn(`InfoBoxModule[${this.id}]: Unsupported info-box block`, block);
        return [];
    }

    /**
     * Resolve one text block into a `text` entry.
     * @param {string} block - The text block.
     * @param {Record<string, any>|null} contextOverride - A repeat iteration's context.
     * @param {Array<Record<string, any>>} children - The nested entries.
     * @returns {Array<Record<string, any>>} One entry, or none when the text resolved to nothing.
     */
    #createTextEntry(block, contextOverride, children) {
        const text = this.#resolveTextBlock(block, contextOverride);
        return text === null ? [] : [{ type: 'text', text, children }];
    }

    /**
     * The material links a link block asks for.
     * @param {Record<string, any>} block - The link block.
     * @param {Record<string, any>} section - The section, whose link mode is the fallback.
     * @returns {Array<Record<string, any>>} The links.
     */
    #resolveBlockLinks(block, section) {
        // The keys the link builder reads, named rather than spread: it is a utility,
        // not a child module, so _childOptions()'s contract does not cover it and a
        // key added to that bundle should not silently flow here (open finding 35).
        return createMaterialSectionLinksFromToken({
            token: block.token,
            currentSubject: this.#currentPlaceholderContext?.subjectName ?? null,
            className: this.#currentPlaceholderContext?.className ?? null,
            queries: this.#getQueries(),
            appState: this.getOption('appState'),
            onNavigate: this.getOption('onNavigate'),
            materialLinkSubjectMode: resolveSectionMeta(section, this.#currentSectionTypes)
                .materialLinkSubjectMode,
        });
    }

    /**
     * Resolve one text block's placeholders, optionally against a per-iteration context
     * rather than the view's own — that is what lets a repeat block say something
     * different for each class.
     * @param {string} block - The text block.
     * @param {Record<string, any>|null} contextOverride - The context this iteration resolves against.
     * @returns {string|null} The resolved block, or `null` when it is to be dropped.
     */
    #resolveTextBlock(block, contextOverride) {
        if (!contextOverride) {
            return this.#getPlaceholderResolver().resolveTextBlock(block);
        }

        const previousContext = this.#currentPlaceholderContext;
        this.#currentPlaceholderContext = { ...previousContext, ...contextOverride };

        try {
            return this.#getPlaceholderResolver().resolveTextBlock(block);
        } finally {
            this.#currentPlaceholderContext = previousContext;
        }
    }

    #warnUnresolvedPlaceholder(source, reason, params) {
        console.warn(
            `InfoBoxModule[${this.id}]: Could not resolve placeholder ${source} (${reason})`,
            {
                boxKey: this.#currentBoxKey,
                sectionKey: this.#activeSectionKey,
                params,
                context: this.#currentPlaceholderContext,
            },
        );
    }
}

export { InfoBoxModule };
