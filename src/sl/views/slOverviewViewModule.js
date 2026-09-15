/**
 * SlOverviewViewModule — the SL "Übersicht" view: a domain or class table beside the
 * competency charts, for all subjects or per class.
 *
 * Observes `viewMode` / `displayMode`, which rebuild its content, and `vizMode`,
 * which it pushes to the tables, the preview hosts and the detail overlay through
 * their own verbs.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import {
    appendChildren,
    applyTemplateTokens,
    createElement,
    createPlaceholder,
    MISSING_GLOSSARY_TITLE,
} from '@tba3/module-base';
import { ChartHostModule } from '@tba3/modules/charts';
import { competencyDetailSectionConfig } from '@tba3/modules/charts/competency-detail';
import { selfEfficacyConfig } from '@tba3/modules/charts/self-efficacy';
import { InfoBoxModule } from '@tba3/modules/info-box';
import { VIZ_MODES } from '@tba3/modules/sl-domain';
import { SlClassTableModule } from '@tba3/modules/tables/sl-class';
import { SlDomainTableModule } from '@tba3/modules/tables/sl-domain';
import { SlDetailOverlayModule } from '../modules/slDetailOverlay/slDetailOverlayModule.js';
import { slDataFromStore } from '../slDataPort.js';
import { getCompetenceLevelIndex } from '../slDataService.js';
import {
    prepareClassChartGroups,
    prepareSchoolOverviewChartGroup,
    prepareSubjectChartGroups,
} from './slOverviewChartGroups.js';
import { SL_DATA_KEYS } from '../slDataKeys.js';
import './slOverviewViewModule.css';

// View modes
const VIEW_MODES = {
    BY_SUBJECTS: 'by_subjects',
};

// Display modes
const DISPLAY_MODES = {
    CHARTS: 'charts',
    TABLE: 'table',
};

/**
 * A preview's host as its config leaves it. Both descriptors a preview can carry bind
 * `setVizMode`, which is the only verb this view calls on one.
 * @typedef {import('@tba3/modules/sl/modules/charts/competency/detail/competencyDetailSectionConfig.js').CompetencyDetailSectionHost|import('@tba3/modules/sl/modules/charts/selfEfficacy/selfEfficacyConfig.js').SelfEfficacyHost} PreviewHost
 */

/**
 * A thumbnail card's compact preview, before and after its host is mounted.
 * @typedef {object} PreviewEntry
 * @property {HTMLElement} element - The preview container inside the card.
 * @property {object} config - The chart host descriptor the preview renders.
 * @property {object} data - The payload the host is initialized with.
 * @property {object} options - Descriptor options for this preview.
 * @property {string} vizModeOption - The descriptor option carrying the initial viz mode.
 * @property {PreviewHost|null} host - The mounted host, or null while the card is not visible.
 */

export class SlOverviewViewModule extends BaseViewModule {
    /** @type {SlDomainTableModule|null} */
    #domainTableModule = null;
    /** @type {SlClassTableModule|null} */
    #classTableModule = null;
    #subjectChartGridMounted = false;
    #classChartGridMounted = false;
    /** @type {SlDetailOverlayModule|null} */
    #detailOverlay = null;
    /** @type {Map<string, PreviewEntry>} Thumbnail previews keyed by preview container id. */
    #previewHosts = new Map();
    #previewHostCounter = 0;
    /** @type {Promise<void>} Serializes preview syncs: a pass tearing a host down must not overlap one still mounting it. */
    #previewSyncChain = Promise.resolve();
    /** @type {InfoBoxModule|null} */
    #subjectKastenModule = null;
    /** @type {InfoBoxModule|null} */
    #classKastenModule = null;

    // Persistent wrapper containers for each module (created once in #createDOM)
    /** @type {HTMLElement|null} */
    #domainTableContainer = null;
    /** @type {HTMLElement|null} */
    #classTableContainer = null;
    /** @type {HTMLElement|null} */
    #subjectChartsContainer = null;
    /** @type {HTMLElement|null} */
    #classChartsContainer = null;

    /**
     * Creates a new SlOverviewViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Get current view mode from global state
     * @returns {string} Current view mode
     */
    get #currentViewMode() {
        return this.options.appState?.getStateValue('viewMode') || VIEW_MODES.BY_SUBJECTS;
    }

    /**
     * Get current display mode from global state
     * @returns {string} Current display mode
     */
    get #currentDisplayMode() {
        return this.options.appState?.getStateValue('displayMode') || DISPLAY_MODES.CHARTS;
    }

    /**
     * Get current viz mode from global state
     * @returns {string} Current viz mode
     */
    get #currentVizMode() {
        return this.options.appState?.getStateValue('vizMode') || VIZ_MODES.STACKED_BAR;
    }

    /**
     * Render the overview view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        // Create DOM structure
        this.#createDOM();

        // Set up event listeners
        this.#setupEventListeners();

        // Initialize content based on current view mode
        await this.#updateContent();
    }

    /**
     * Creates the DOM structure for the overview view with persistent containers
     */
    #createDOM() {
        const container = this.container;
        if (!container) {
            return;
        }
        container.className = 'sl-overview-view view-base';
        container.innerHTML = '';

        // Create persistent wrapper divs for each module (hidden by default)
        this.#domainTableContainer = this.#createSectionContainer('overview-domain-table-wrapper');
        this.#classTableContainer = this.#createSectionContainer('overview-class-table-wrapper');
        this.#subjectChartsContainer = this.#createSectionContainer(
            'overview-subject-charts-wrapper',
        );
        this.#classChartsContainer = this.#createSectionContainer('overview-class-charts-wrapper');
    }

    /**
     * Create a section container and append to main container
     * @param {string} id - Container ID
     * @returns {HTMLElement} The created section element, already appended.
     */
    #createSectionContainer(id) {
        const div = document.createElement('div');
        div.id = id;
        this.container?.appendChild(div);
        return div;
    }

    /**
     * Sets up event listeners
     * Broadcasts events to children via view-mediated broadcasting
     */
    #setupEventListeners() {
        // The header's mode switches write app state; #updateContent reads it back.
        this.observeState('viewMode', () => {
            this.#requestContentUpdate('updating content after view-mode change');
        });

        this.observeState('displayMode', () => {
            this.#requestContentUpdate('updating content after display-mode change');
        });

        this.observeState('vizMode', (mode) => this.#applyVizMode(mode));
    }

    /**
     * Push a viz mode to everything that renders one. Children that do not
     * exist yet read it from their options when they are created.
     * @param {string} mode - 'stacked_bar' | 'boxplot'
     */
    #applyVizMode(mode) {
        this.#domainTableModule?.setState({ vizMode: mode });
        this.#classTableModule?.setState({ vizMode: mode });
        for (const entry of this.#previewHosts.values()) {
            entry.host?.setVizMode(mode);
        }
        this.#detailOverlay?.setVizMode(mode);
    }

    /**
     * Run the async content update from non-async event handlers with a local
     * error sink, so a failed lazy init does not become an unhandled rejection.
     * @param {string} action - Log-friendly action description
     */
    #requestContentUpdate(action) {
        void this.#updateContent().catch((error) => {
            console.error(`SlOverviewViewModule: Error ${action}:`, error);
        });
    }

    /**
     * Updates content area based on current modes.
     * Uses show/hide with lazy initialization instead of destroy/recreate.
     */
    async #updateContent() {
        if (!this.container) return;

        const isTable = this.#currentDisplayMode === DISPLAY_MODES.TABLE;
        const isBySubjects = this.#currentViewMode === VIEW_MODES.BY_SUBJECTS;

        // Show/hide containers BEFORE rendering so chart renderers measure correct
        // CSS-computed dimensions (layout is 0 when parent has display:none).
        this.#syncContainerState();

        // Lazy-initialize the active module (only on first show)
        if (isTable && isBySubjects && !this.#domainTableModule) {
            await this.#renderDomainTable(this.#domainTableContainer);
        } else if (isTable && !isBySubjects && !this.#classTableModule) {
            await this.#renderClassTable(this.#classTableContainer);
        } else if (!isTable && isBySubjects && !this.#subjectChartGridMounted) {
            await this.#renderSubjectCharts(this.#subjectChartsContainer);
        } else if (!isTable && !isBySubjects && !this.#classChartGridMounted) {
            await this.#renderClassCharts(this.#classChartsContainer);
        }

        if (!isTable) {
            await this.#syncPreviewHosts();
        }
    }

    /**
     * Publish the current overview mode state to CSS before lazy rendering.
     */
    #syncContainerState() {
        if (!this.container) return;

        this.container.dataset.displayMode = this.#currentDisplayMode;
        this.container.dataset.viewMode = this.#currentViewMode;
    }

    /**
     * Renders domain table
     * @param {HTMLElement|null} container - Container element
     */
    async #renderDomainTable(container) {
        if (!container) {
            return;
        }
        const dataStore = this.getOption('dataStore');
        const competenceLevelsData = dataStore?.getRawData(SL_DATA_KEYS.COMPETENCE_LEVELS) || [];
        const selfEfficacyByClass = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_BY_CLASS);
        const selfEfficacySchool = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_SCHOOL);
        const teachingQuality = dataStore?.getDataset(SL_DATA_KEYS.TEACHING_QUALITY);
        const levelDefinitions = dataStore?.getDataset(SL_DATA_KEYS.LEVEL_DEFINITIONS);
        const allDomainResults = dataStore?.getDataset(SL_DATA_KEYS.DOMAIN_RESULTS);

        this.#domainTableModule = new SlDomainTableModule('overview-domain-table', container, {
            ...this._childOptions(),
            glossaryKey: 'sl.overview.subject-view.table',
            vizMode: this.#currentVizMode,
            showModuleTitle: true,
        });

        await this.#domainTableModule.init({
            allDomainResults,
            levelDefinitions,
            competenceLevelsData,
            teachingQuality,
            selfEfficacyByClass,
            selfEfficacySchool,
        });

        this.registerChildModule(this.#domainTableModule);
    }

    /**
     * Renders class table
     * @param {HTMLElement|null} container - Container element
     */
    async #renderClassTable(container) {
        if (!container) {
            return;
        }
        const dataStore = this.getOption('dataStore');
        const selfEfficacyByClass = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_BY_CLASS);
        const selfEfficacySchool = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_SCHOOL);
        const teachingQuality = dataStore?.getDataset(SL_DATA_KEYS.TEACHING_QUALITY);
        const levelDefinitions = dataStore?.getDataset(SL_DATA_KEYS.LEVEL_DEFINITIONS);
        const classArray = dataStore?.getDataset(SL_DATA_KEYS.CLASS_RESULTS);

        this.#classTableModule = new SlClassTableModule('overview-class-table', container, {
            ...this._childOptions(),
            glossaryKey: 'sl.overview.class-view.table',
            vizMode: this.#currentVizMode,
            showModuleTitle: true,
        });

        await this.#classTableModule.init({
            classArray,
            levelDefinitions,
            teachingQuality,
            selfEfficacyByClass,
            selfEfficacySchool,
        });

        this.registerChildModule(this.#classTableModule);
    }

    /**
     * Renders the subject-based chart overview as a thumbnail card grid + Kasten.
     * Cards are clickable — clicking opens the SlDetailOverlayModule with the full chart.
     * @param {HTMLElement|null} container - Container element
     */
    async #renderSubjectCharts(container) {
        if (!container) {
            return;
        }
        const dataStore = this.getOption('dataStore');
        const selfEfficacyByClass = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_BY_CLASS);
        const selfEfficacySchool = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_SCHOOL);
        const teachingQuality = dataStore?.getDataset(SL_DATA_KEYS.TEACHING_QUALITY);
        const selfEfficacyPreviewData = [
            ...(selfEfficacyByClass || []),
            ...(selfEfficacySchool ? [selfEfficacySchool] : []),
        ];

        const chartGroups = prepareSubjectChartGroups(
            getCompetenceLevelIndex(dataStore),
            this.#resolvePreviewCardMeta.bind(this),
        );

        const grid = this.#createThumbnailGrid();

        // Self-efficacy card — first in the grid
        if (selfEfficacyByClass?.length || selfEfficacySchool) {
            const previewMeta = this.#resolvePreviewCardMeta('subject-view', 'preview-sw');
            const spCard = this.#createChartThumbnailCard({
                title: previewMeta?.title || MISSING_GLOSSARY_TITLE,
                tooltipText: previewMeta?.tooltipText ?? null,
                previewSelfEfficacyData: selfEfficacyPreviewData,
                onActivate: () => {
                    this.#openDetail({
                        detailKey: 'sp',
                        isSelfEfficacy: true,
                        selfEfficacyByClass,
                        selfEfficacySchool,
                    });
                },
            });
            grid.appendChild(spCard);
        }

        for (const group of chartGroups) {
            const card = this.#createChartThumbnailCard({
                title: group.title,
                tooltipText: group.tooltipText,
                previewGroup: group,
                previewTeachingQuality: teachingQuality,
                onActivate: () => {
                    this.#openDetail({
                        detailKey: `subject-${group.subjectName}`,
                        title: group.title,
                        chartGroups: [group],
                        selfEfficacyByClass,
                        selfEfficacySchool,
                        teachingQuality,
                        isByClass: false,
                    });
                },
            });

            grid.appendChild(card);
        }

        this.#subjectKastenModule = await this.#mountThumbnailGridWithKasten({
            container,
            grid,
            kastenId: `${this.id}-subject-kasten`,
            boxKey: 'overviewBySubjects',
        });

        this.#subjectChartGridMounted = true;
    }

    /**
     * Renders the class-based chart overview as a thumbnail card grid + Kasten.
     * Cards are clickable — clicking opens the SlDetailOverlayModule with the full chart.
     * @param {HTMLElement|null} container - Container element
     */
    async #renderClassCharts(container) {
        if (!container) {
            return;
        }
        const dataStore = this.getOption('dataStore');
        const selfEfficacyByClass = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_BY_CLASS);
        const selfEfficacySchool = dataStore?.getDataset(SL_DATA_KEYS.SELF_EFFICACY_SCHOOL);
        const teachingQuality = dataStore?.getDataset(SL_DATA_KEYS.TEACHING_QUALITY);

        const levelIndex = getCompetenceLevelIndex(dataStore);
        const previewCardMeta = this.#resolvePreviewCardMeta.bind(this);
        const chartGroups = [
            prepareSchoolOverviewChartGroup(levelIndex, previewCardMeta),
            ...prepareClassChartGroups(levelIndex, previewCardMeta),
        ].filter(Boolean);

        const grid = this.#createThumbnailGrid();

        for (const group of chartGroups) {
            const card = this.#createChartThumbnailCard({
                title: group.title,
                tooltipText: group.tooltipText,
                previewGroup: group,
                previewTeachingQuality: teachingQuality,
                onActivate: () => {
                    this.#openDetail({
                        detailKey: group.isSchoolOverview ? 'school' : `class-${group.className}`,
                        title: group.title,
                        chartGroups: [group],
                        selfEfficacyByClass,
                        selfEfficacySchool,
                        teachingQuality,
                        isByClass: true,
                        className: group.className ?? null,
                    });
                },
            });

            grid.appendChild(card);
        }

        this.#classKastenModule = await this.#mountThumbnailGridWithKasten({
            container,
            grid,
            kastenId: `${this.id}-class-kasten`,
            boxKey: 'overviewByClasses',
        });

        this.#classChartGridMounted = true;
    }

    #createThumbnailGrid() {
        return createElement('div', { className: 'thumbnail-grid' });
    }

    async #mountThumbnailGridWithKasten({ container, grid, kastenId, boxKey }) {
        const kastenDiv = createPlaceholder(kastenId, 'overview-kasten-card');

        container.innerHTML = '';
        appendChildren(container, [grid, kastenDiv]);
        this.#setThumbnailGridRowCount(grid);

        const kastenModule = new InfoBoxModule(kastenId, kastenDiv, {
            glossaryKey: 'sl.results',
            ...this._childOptions(),
            slData: slDataFromStore(this.getOption('dataStore')),
            boxKey,
        });
        await kastenModule.init();
        this.registerChildModule(kastenModule);

        return kastenModule;
    }

    /**
     * Build a thumbnail card for a chart group.
     *
     * When `previewGroup` is provided, records a compact preview behind the
     * title — the same chart host descriptor the detail overlay drives, so the
     * watermark matches the full chart mode.
     * Compact mode strips axes, legends, labels, and tooltips while keeping
     * the core chart geometry.
     * @param {object} args - The card's texts, its activation handler, and the preview it carries.
     * @param {string} args.title - Card title text
     * @param {string|null} [args.tooltipText] - Optional tooltip text shown on hover
     * @param {() => void} args.onActivate - Click/keyboard handler
     * @param {object | null} [args.previewGroup] - Chart group to render as watermark
     * @param {Array|null} [args.previewTeachingQuality] - TQ data passed to the preview renderer
     * @param {Array|null} [args.previewSelfEfficacyData] - Flattened self-efficacy rows for the preview renderer
     * @returns {HTMLElement} The card element.
     */
    #createChartThumbnailCard({
        title,
        tooltipText = null,
        onActivate,
        previewGroup = null,
        previewTeachingQuality = null,
        previewSelfEfficacyData = null,
    }) {
        const card = document.createElement('div');
        card.className = 'chart-thumbnail-card interactive-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', title);

        if (tooltipText) {
            card.dataset.tooltipText = tooltipText;
        }

        if (previewGroup || previewSelfEfficacyData?.length) {
            if (previewGroup) {
                this.#mountCompactPreview(card, previewGroup, previewTeachingQuality);
            } else {
                this.#mountSelfEfficacyPreview(card, previewSelfEfficacyData);
            }
        }

        const titleElement = document.createElement('span');
        titleElement.className = 'chart-thumbnail-card__title';
        titleElement.textContent = title;
        card.appendChild(titleElement);

        this.resources.trackDomListener(card, 'click', () => {
            onActivate();
        });
        this.resources.trackDomListener(card, 'keydown', (event) => {
            if (
                /** @type {KeyboardEvent} */ (event).key === 'Enter' ||
                /** @type {KeyboardEvent} */ (event).key === ' '
            ) {
                event.preventDefault();
                onActivate();
            }
        });

        return card;
    }

    /**
     * Keep the overview thumbnail grid at exactly two columns and divide the
     * available pane height evenly across the required number of rows.
     * @param {HTMLElement} grid - The thumbnail grid whose row count is set.
     */
    #setThumbnailGridRowCount(grid) {
        if (!(grid instanceof HTMLElement)) return;

        const rowCount = Math.max(1, Math.ceil(grid.childElementCount / 2));
        grid.style.setProperty('--thumbnail-row-count', String(rowCount));
    }

    /**
     * Append a preview wrapper to the card and record its competency preview.
     * The host is built later, by #syncPreviewHosts: the card is still detached
     * from the DOM here, and a chart cannot measure a container it cannot see.
     * @param {HTMLElement} card - The card the preview is appended to.
     * @param {object} group - The chart group the watermark renders.
     * @param {Array|null} teachingQuality - Unterrichtsqualität rows the preview renderer reads.
     */
    #mountCompactPreview(card, group, teachingQuality) {
        const preview = this.#appendPreviewContainer(card);

        this.#previewHosts.set(preview.id, {
            element: preview,
            config: competencyDetailSectionConfig,
            data: { ...group, teachingQuality: teachingQuality || null },
            options: {
                className: group.className || null,
                showOnlySchoolData: group.showOnlySchoolData === true,
            },
            vizModeOption: 'qualityVizMode',
            host: null,
        });
    }

    /**
     * Append a preview wrapper to the card and record its self-efficacy preview.
     * @param {HTMLElement} card - The card the preview is appended to.
     * @param {Array|null} data - Flattened self-efficacy rows for the preview renderer; the caller only mounts one when the list is non-empty.
     */
    #mountSelfEfficacyPreview(card, data) {
        const preview = this.#appendPreviewContainer(card);

        this.#previewHosts.set(preview.id, {
            element: preview,
            config: selfEfficacyConfig,
            data,
            options: {},
            vizModeOption: 'defaultVizMode',
            host: null,
        });
    }

    /**
     * Append the wrapper a card's watermark host renders into.
     * @param {HTMLElement} card - The card the preview belongs to.
     * @returns {HTMLElement} The appended wrapper, carrying the id its host takes.
     */
    #appendPreviewContainer(card) {
        const preview = document.createElement('div');
        preview.className = 'chart-thumbnail-card__preview';
        preview.id = `${this.id}-preview-${this.#previewHostCounter++}`;
        card.appendChild(preview);
        return preview;
    }

    /**
     * Whether a preview container is currently visible and can be measured.
     * @param {HTMLElement} container - The preview host to test.
     * @returns {boolean} True when it is in the DOM and has a non-zero box.
     */
    #isPreviewContainerVisible(container) {
        return container.isConnected && container.getClientRects().length > 0;
    }

    /**
     * Mount a chart host behind every visible thumbnail and tear down the hosts
     * of thumbnails that are no longer visible. Hidden chart grids are skipped
     * because their containers measure as zero, and a chart cannot lay itself
     * out there.
     *
     * Mounted hosts are seeded with the current viz mode at construction, and
     * later changes reach them through the view's `vizMode` observer
     * (#applyVizMode) — nothing to re-apply here.
     *
     * Passes run one after another: `show()` and the display-mode toggle both start
     * one without waiting, and a pass that finds a card hidden tears its host down —
     * which must not land while an earlier pass is still mounting that same host.
     * @returns {Promise<void>} Resolves once this pass has mounted the visible previews.
     */
    #syncPreviewHosts() {
        const run = this.#previewSyncChain.then(() => this.#runPreviewSync());
        this.#previewSyncChain = run.catch(() => {});
        return run;
    }

    /**
     * One sync pass — see #syncPreviewHosts.
     * @returns {Promise<void>} Resolves once the visible previews are mounted.
     */
    async #runPreviewSync() {
        if (this.destroyed) {
            return;
        }

        // Measure every card before mounting any: a mount dirties layout, and a
        // probe after it would force a fresh reflow per card.
        const entries = [...this.#previewHosts.values()];
        const visible = entries.map((entry) => this.#isPreviewContainerVisible(entry.element));
        const mounting = [];

        entries.forEach((entry, index) => {
            if (!visible[index]) {
                entry.host = this.destroyAndUnregister(entry.host, entry.element);
                return;
            }

            if (entry.host) {
                return;
            }

            const host = new ChartHostModule(entry.element.id, entry.element, entry.config, {
                ...this._childOptions(),
                compact: true,
                // A watermark is not a card of its own, not an export target, and
                // it does not wait for a settled box: the thumbnail card around it
                // already owns the border, the background and the size.
                showModuleCard: false,
                enableModuleExport: false,
                waitForStableLayout: false,
                [entry.vizModeOption]: this.#currentVizMode,
                ...entry.options,
            });

            // Claim the slot and register before init: a viz-mode change during
            // init has to reach this host. The previews are independent, so they
            // mount together rather than one after another.
            // The constructor returns the bare host; `entry.config` binds `setVizMode`
            // onto it at init, which `#applyVizMode` calls.
            entry.host = /** @type {PreviewHost} */ (host);
            this.registerChildModule(host);
            mounting.push(host.init(entry.data));
        });

        await Promise.all(mounting);
    }

    /**
     * Open the detail overlay for a given chart group.
     *
     * Every card shares one SlDetailOverlayModule instance, so `params.detailKey`
     * is what keeps the cards apart downstream: the overlay folds it into its
     * panel ids, which become the export target ids. Without it every card
     * would register the same target and share one tick and one capture.
     * @param {object} params - Parameters forwarded to SlDetailOverlayModule.show()
     */
    #openDetail(params) {
        if (!this.#detailOverlay) {
            this.#detailOverlay = new SlDetailOverlayModule(`${this.id}-detail-overlay`, {
                ...this._childOptions(),
            });
        }
        this.#detailOverlay.show({
            ...params,
            vizMode: this.#currentVizMode,
        });
    }

    /**
     * Title and tooltip for one preview card, from the glossary.
     * @param {string} sectionKey - The overview section the card sits in.
     * @param {string|null} previewKey - The card's glossary key; without one there is no meta to resolve.
     * @param {object} [replacements] - Tokens to substitute into the resolved strings.
     * @returns {object|null} The card's texts, or `null` when the glossary has no entry.
     */
    #resolvePreviewCardMeta(sectionKey, previewKey, replacements = {}) {
        if (!previewKey) return null;

        const entry =
            this.getOption('glossaryData')?.sl?.overview?.[sectionKey]?.['preview-cards']
                ?.element_texts?.[previewKey];
        if (!entry) return null;

        return {
            title: applyTemplateTokens(entry.title ?? '', replacements),
            description: applyTemplateTokens(entry.description ?? '', replacements),
            tooltipText: applyTemplateTokens(entry.tooltip ?? '', replacements),
        };
    }

    /**
     * Tear down all content modules and preview renderers.
     */
    #cleanupContentModules() {
        for (const entry of this.#previewHosts.values()) {
            entry.host = this.destroyAndUnregister(entry.host, entry.element);
        }
        this.#previewHosts.clear();

        this.#domainTableModule = this.destroyAndUnregister(
            this.#domainTableModule,
            this.#domainTableContainer ?? undefined,
        );
        this.#classTableModule = this.destroyAndUnregister(
            this.#classTableModule,
            this.#classTableContainer ?? undefined,
        );

        this.#subjectKastenModule = this.destroyAndUnregister(this.#subjectKastenModule);
        this.#classKastenModule = this.destroyAndUnregister(this.#classKastenModule);

        this.#subjectChartGridMounted = false;
        this.#classChartGridMounted = false;
        if (this.#subjectChartsContainer) this.#subjectChartsContainer.innerHTML = '';
        if (this.#classChartsContainer) this.#classChartsContainer.innerHTML = '';
    }

    /**
     * @override
     */
    show() {
        super.show();
        this.#syncContainerState();

        if (this.#currentDisplayMode === DISPLAY_MODES.CHARTS) {
            void this.#syncPreviewHosts().catch((error) => {
                console.error('SlOverviewViewModule: Error mounting thumbnail previews:', error);
            });
        }
    }

    /**
     * @override
     */
    destroy() {
        this.#cleanupContentModules();
        if (this.#detailOverlay) {
            this.#detailOverlay.destroy();
            this.#detailOverlay = null;
        }
        super.destroy();
    }
}
