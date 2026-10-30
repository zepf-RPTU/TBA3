/**
 * SlDetailsViewModule — the SL "Details" view: the results by subject or by group, as
 * a grid of chart thumbnails with a Kasten or as a table.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { cssVars, isActivationKey } from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import { ChartHostModule } from '@tba3/modules/charts';
import { InfoBoxModule } from '@tba3/modules/info-box';
import { SlGroupTableModule } from '@tba3/modules/tables/sl-group';
import { SlDomainTableModule } from '@tba3/modules/tables/sl-domain';
import { SlDetailOverlayModule } from '../modules/slDetailOverlay/slDetailOverlayModule.js';
import { buildGroupCards, buildSubjectCards } from './slDetailsChartGroups.js';
import { materialStatePatch } from '../slMaterialNavigation.js';
import { DETAILS_GROUPINGS, DISPLAY_MODES } from '../slConstants.js';
import './slDetailsViewModule.css';

/** @typedef {import('../modules/slDetailOverlay/slDetailOverlayModule.js').DetailChartHost} PreviewHost */

/** @typedef {import('./slDetailsChartGroups.js').ThumbnailCard} ThumbnailCard */

/** The four contents of the view, each named `displayMode:detailsGrouping`. */
const SECTIONS = Object.freeze({
    DOMAIN_TABLE: `${DISPLAY_MODES.TABLE}:${DETAILS_GROUPINGS.BY_SUBJECTS}`,
    GROUP_TABLE: `${DISPLAY_MODES.TABLE}:${DETAILS_GROUPINGS.BY_GROUPS}`,
    SUBJECT_CHARTS: `${DISPLAY_MODES.CHARTS}:${DETAILS_GROUPINGS.BY_SUBJECTS}`,
    GROUP_CHARTS: `${DISPLAY_MODES.CHARTS}:${DETAILS_GROUPINGS.BY_GROUPS}`,
});

/** Each section's wrapper id; a table takes its wrapper's place. */
const WRAPPER_IDS = Object.freeze({
    [SECTIONS.DOMAIN_TABLE]: 'details-domain-table-wrapper',
    [SECTIONS.GROUP_TABLE]: 'details-group-table-wrapper',
    [SECTIONS.SUBJECT_CHARTS]: 'details-subject-charts-wrapper',
    [SECTIONS.GROUP_CHARTS]: 'details-group-charts-wrapper',
});

/** @augments {BaseViewModule<import('../slAppModule.js').SlState>} */
export class SlDetailsViewModule extends BaseViewModule {
    /** @type {SlDetailOverlayModule|null} */
    #detailOverlay = null;
    /** @type {Map<string, Promise<void>>} Started section mounts, by `displayMode:detailsGrouping`. */
    #mounts = new Map();
    /**
     * The built tables, by `displayMode:detailsGrouping`.
     * @type {Map<string, SlDomainTableModule|SlGroupTableModule>}
     */
    #tables = new Map();
    /** @type {Map<string, import('lit').TemplateResult>} */
    #chartGrids = new Map();

    /**
     * An info-box material link's handler.
     * @param {{subject: string, type: string}} selection - The Fach, as the payload names it, and the Typ.
     * @returns {Promise<void>} Settles once the material view is shown.
     */
    #openMaterial = (selection) =>
        this.navigate('material', { statePatch: materialStatePatch(selection) });

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.classList.add('sl-details-view');
        this.#render();

        const updateContent = () =>
            void this.#updateContent().catch((error) => {
                console.error('SlDetailsViewModule: Error updating content:', error);
            });
        this.watch(this.options.appState.detailsGrouping, updateContent);
        this.watch(this.options.appState.displayMode, updateContent);

        await this.#updateContent();
    }

    /** The four sections, each its wrapper (`WRAPPER_IDS`) until it is built. */
    #render() {
        render(
            Object.entries(WRAPPER_IDS).map(
                ([modes, wrapperId]) =>
                    this.#tables.get(modes) ??
                    html`<div id=${wrapperId} data-details-section=${modes}>
                        ${this.#chartGrids.get(modes) ?? nothing}
                    </div>`,
            ),
            this,
        );
    }

    /**
     * Show the section the current modes name, building it on the first entry. The
     * data attributes go first, so a chart measures the box CSS gives it. The started
     * mount is stored, so a quick toggle away and back never builds a section twice.
     * @returns {Promise<void>}
     */
    #updateContent() {
        const appState = this.options.appState;
        const displayMode = appState.displayMode.value;
        const detailsGrouping = appState.detailsGrouping.value;
        this.dataset.displayMode = displayMode;
        this.dataset.grouping = detailsGrouping;
        // CSS shows one section and hides the others; their modules hear it only from
        // here (`_onShow` runs what a table deferred while hidden, rebuilds a thumbnail).
        this.refreshVisibility();

        const modes = `${displayMode}:${detailsGrouping}`;
        let mount = this.#mounts.get(modes);
        if (!mount) {
            mount = this.#mountSection(modes);
            this.#mounts.set(modes, mount);
        }
        return mount;
    }

    /**
     * Build one section.
     * @param {string} modes - `displayMode:detailsGrouping`.
     * @returns {Promise<void>}
     */
    #mountSection(modes) {
        const documents = this.options.context.documents;
        const glossaryData = this.options.context.glossaryData;
        switch (modes) {
            case SECTIONS.DOMAIN_TABLE:
                return this.#mountTable(
                    modes,
                    SlDomainTableModule.create(
                        'details-domain-table',
                        this.#tableOptions('sl.details.subject-view.table'),
                    ),
                );
            case SECTIONS.GROUP_TABLE:
                return this.#mountTable(
                    modes,
                    SlGroupTableModule.create(
                        'details-group-table',
                        this.#tableOptions('sl.details.group-view.table'),
                    ),
                );
            case SECTIONS.SUBJECT_CHARTS:
                return this.#mountChartGrid(
                    modes,
                    buildSubjectCards(documents, glossaryData, this.options.context.glossary),
                    `${this.id}-subject`,
                    'detailsBySubjects',
                );
            default:
                return this.#mountChartGrid(
                    modes,
                    buildGroupCards(documents, glossaryData),
                    `${this.id}-group`,
                    'detailsByGroups',
                );
        }
    }

    /**
     * The options of one of the two Details tables, which follow the app's viz mode.
     * @param {string} glossaryKey
     * @returns {SlDomainTableModule['options']}
     */
    #tableOptions(glossaryKey) {
        return {
            ...this._childOptions(),
            glossaryKey,
            vizMode: this.options.appState.vizMode,
            showModuleTitle: true,
        };
    }

    /**
     * Put one of the two Details tables in its section's place.
     * @param {string} modes - The section's `displayMode:detailsGrouping`.
     * @param {SlDomainTableModule|SlGroupTableModule} table
     * @returns {Promise<void>} Resolves once its content is built.
     */
    async #mountTable(modes, table) {
        table.dataset.detailsSection = modes;
        this.#tables.set(modes, table);
        this.#render();
        await table.contentComplete;
    }

    /**
     * Fill a chart section with a thumbnail grid of the cards and the Kasten beside it.
     * @param {string} modes - The section's `displayMode:detailsGrouping`.
     * @param {ThumbnailCard[]} cards - The grid's cards, in order.
     * @param {string} idPrefix - Names the Kasten (`<prefix>-kasten`) and the watermarks (`<prefix>-preview-<i>`).
     * @param {string} boxKey - The info box the Kasten shows.
     * @returns {Promise<void>} Resolves once the watermarks and the Kasten built their content.
     */
    async #mountChartGrid(modes, cards, idPrefix, boxKey) {
        const previews = cards.map((card, index) =>
            this.#createPreviewHost(card, `${idPrefix}-preview-${index}`),
        );
        const kastenModule = InfoBoxModule.create(`${idPrefix}-kasten`, {
            glossaryKey: 'sl.results',
            ...this._childOptions(),
            onOpenMaterial: this.#openMaterial,
        });
        kastenModule.data = { boxKey };
        // Two columns; the pane height is divided evenly across the rows they need.
        const rowCount = Math.max(1, Math.ceil(cards.length / 2));
        this.#chartGrids.set(
            modes,
            html`
                <div class="thumbnail-grid" ${cssVars({ '--thumbnail-row-count': rowCount })}>
                    ${cards.map((card, index) => this.#thumbnailCardTemplate(card, previews[index]))}
                </div>
                ${kastenModule}
            `,
        );
        this.#render();
        await Promise.all([...previews, kastenModule].map((module) => module.contentComplete));
    }

    /**
     * A thumbnail card: the watermark's slot behind the title. Activating it opens the
     * card's detail.
     * @param {ThumbnailCard} card
     * @param {PreviewHost} preview
     * @returns {import('lit').TemplateResult}
     */
    #thumbnailCardTemplate({ title, detail }, preview) {
        /** @param {KeyboardEvent} event - A key on the card; Enter and Space activate it. */
        const onKeydown = (event) => {
            if (!isActivationKey(event)) return;
            event.preventDefault();
            this.#openDetail(detail);
        };
        return html`<div
            class="chart-thumbnail-card interactive-card"
            role="button"
            tabindex="0"
            aria-label=${title}
            @click=${() => this.#openDetail(detail)}
            @keydown=${onKeydown}
        >
            ${preview}
            <span class="chart-thumbnail-card__title">${title}</span>
        </div>`;
    }

    /**
     * The watermark behind a card's title: the descriptor the detail overlay drives, as a
     * thumbnail.
     * @param {ThumbnailCard} card
     * @param {string} id
     * @returns {PreviewHost} The watermark host, not yet placed; it follows the app's viz mode.
     */
    #createPreviewHost({ preview }, id) {
        const host = /** @type {PreviewHost} */ (
            ChartHostModule.createChart(id, preview.config, {
                ...this._childOptions(),
                // The thumbnail card around it owns the border, the background and the size.
                thumbnail: true,
                vizMode: this.options.appState.vizMode,
                ...preview.options,
            })
        );
        host.className = 'chart-thumbnail-card__preview';
        return host;
    }

    /**
     * Open a card's detail, creating the shared overlay on the first open.
     * @param {import('../modules/slDetailOverlay/slDetailOverlayModule.js').CardDetail} detail - The card's detail, forwarded to SlDetailOverlayModule.open()
     */
    #openDetail(detail) {
        if (!this.#detailOverlay) {
            const detailOverlay = SlDetailOverlayModule.create(`${this.id}-detail-overlay`, {
                ...this._childOptions(),
                vizMode: this.options.appState.vizMode,
                onOpenMaterial: this.#openMaterial,
            });
            // In its own <dialog>, outside the view's element: the view's teardown removes it.
            this.resources.trackSubscription(() => detailOverlay.remove());
            this.#detailOverlay = detailOverlay;
        }
        void this.#detailOverlay.open(detail).catch((error) => {
            console.error('SlDetailsViewModule: Error opening the detail overlay:', error);
        });
    }
}

customElements.define('tba-sl-details-view', SlDetailsViewModule);
