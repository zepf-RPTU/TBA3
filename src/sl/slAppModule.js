/**
 * SlAppModule — coordinator of the Schulleitung dashboard.
 *
 * Supplies BaseAppModule with SL's view map, initial state and per-view header
 * configs, and owns the shared HeaderModule and NavCardModule instances. It renders
 * no content of its own beyond the app chrome.
 */

import { BaseAppModule } from '../common/app/appModule.js';
import { createReportViewConfig } from '../common/views/report/reportViewConfig.js';
import { NavCardModule } from '../common/modules/navCard/navCardModule.js';
import { navigateToClass, resolveSelectedDataset } from '../common/app/classSearchParams.js';
import { SL_DATASET_OPTIONS } from './slConstants.js';
import { slGlossary as glossary } from './slGlossary.js';
import { buildDomainOptions } from './utils/slDomainResults.js';
import { iconSvg } from '@tba3/module-base';
import {
    DEFAULT_SUMMARY_METRIC_ID,
    deriveMaterialSubjectOptions,
    deriveSummaryAverages,
    detectHistorySurveyScales,
} from '@tba3/modules/sl-domain';
import { buildSlViewHeaderConfigs } from './slHeaderControls.js';
import { fetchSlData, defineSlDatasets, getSurveyRows, hasSlResults } from './slDataService.js';
import { SL_DATA_KEYS } from './slDataKeys.js';
import { setExportDataset } from '../common/export/exportDataset.js';
import './slAppModule.css';

// Unified configuration with viewConfig structure (includes extended fields for
// nav cards). Each entry's `load` is the view's lazy import, resolved to its
// exported class (loaded on demand).
const CONFIG = {
    headerContainerId: 'sl-shared-header',
    navCardsContainerId: 'sl-shared-nav-cards',
    defaultView: 'summary',
    viewConfig: {
        summary: {
            containerId: 'sl-summary-container',
            buttonId: 'summaryViewButton',
            icon: 'home',
            navigationGlossaryPath: 'sl.nav-cards.element_texts.nav-summary',
            skeleton: 'rows',
            load: () => import('./views/slSummaryViewModule.js').then((m) => m.SlSummaryViewModule),
        },
        welcome: {
            containerId: 'sl-welcome-container',
            buttonId: 'welcomeViewButton',
            icon: 'list_alt',
            navigationGlossaryPath: 'sl.nav-cards.element_texts.nav-welcome',
            skeleton: 'split',
            load: () => import('./views/slWelcomeViewModule.js').then((m) => m.SlWelcomeViewModule),
        },
        overview: {
            containerId: 'sl-overview-container',
            buttonId: 'overviewViewButton',
            icon: 'bar_chart',
            navigationGlossaryPath: 'sl.nav-cards.element_texts.nav-overview',
            skeleton: 'grid',
            load: () =>
                import('./views/slOverviewViewModule.js').then((m) => m.SlOverviewViewModule),
        },
        comparison: {
            containerId: 'sl-comparison-container',
            buttonId: 'comparisonViewButton',
            icon: 'balance',
            navigationGlossaryPath: 'sl.nav-cards.element_texts.nav-comparison',
            skeleton: 'split',
            load: () =>
                import('./views/slComparisonViewModule.js').then((m) => m.SlComparisonViewModule),
        },
        longitudinal: {
            containerId: 'sl-longitudinal-container',
            buttonId: 'longitudinalViewButton',
            icon: 'trending_up',
            navigationGlossaryPath: 'sl.nav-cards.element_texts.nav-longitudinal',
            skeleton: 'rows',
            load: () =>
                import('./views/slLongitudinalViewModule.js').then(
                    (m) => m.SlLongitudinalViewModule,
                ),
        },
        material: {
            containerId: 'sl-material-container',
            buttonId: 'materialViewButton',
            icon: 'description',
            navigationGlossaryPath: 'sl.nav-cards.element_texts.nav-material',
            skeleton: 'stack',
            load: () =>
                import('./views/slMaterialViewModule.js').then((m) => m.SlMaterialViewModule),
        },
        report: createReportViewConfig('sl'),
    },
    sidebarConfig: {
        title: 'VERA',
    },
};

// Nav cards follow the same order as the sidebar and the router: the key order
// of CONFIG.viewConfig above is the single place view order is defined. Views
// pinned to the sidebar bottom are utilities, not destinations to advertise.
const NAV_CARD_VIEW_ORDER = Object.keys(CONFIG.viewConfig).filter(
    (viewType) => !CONFIG.viewConfig[viewType].sidebarPinBottom,
);

/**
 * One nav-card descriptor for the welcome view.
 * @param {string} viewTarget - The view the card navigates to.
 * @returns {object} The card descriptor.
 */
function createNavCardItem(viewTarget) {
    const viewData = CONFIG.viewConfig[viewTarget];

    // Title and description come from the entry the sidebar is named by: the
    // last segment of the view's navigation path is its `sl.nav-cards` sub-key.
    return {
        labelIcon: viewData.icon,
        viewTarget,
        glossarySubKey: viewData.navigationGlossaryPath.split('.').pop(),
    };
}

// Standard navigation card configuration (references viewConfig for metadata)
const NAV_CARD_CONFIG = {
    items: NAV_CARD_VIEW_ORDER.map(createNavCardItem),
};

// Initial state for SL app
const INITIAL_STATE = {
    currentView: null,
    viewMode: 'by_subjects',
    displayMode: 'charts',
    vizMode: 'stacked_bar',
    summaryMetric: DEFAULT_SUMMARY_METRIC_ID,
    // Seeded from the delivered reference averages once the dataset is loaded.
    comparisonState: {},
};

// ============================================================================
// SCHOOL DATASET CONFIGURATION & URL PARAMETER
// ============================================================================

const DEFAULT_DATASET_ID = 'sl';

/**
 * The school the URL asked for, falling back to the default when it names none.
 * @returns {{id: string, label: string, scope?: string, folder?: string}} The dataset descriptor to load.
 */
function getSelectedDataset() {
    return resolveSelectedDataset(SL_DATASET_OPTIONS, DEFAULT_DATASET_ID);
}

export class SlAppModule extends BaseAppModule {
    // SL-specific: NavCardModule (no equivalent in EN/MA)
    /** @type {NavCardModule|null} */
    #navCardModule = null;
    /** @type {{id: string, label: string, scope?: string, folder?: string}} */
    #currentDataset = getSelectedDataset();

    constructor(id, container, options = {}) {
        super(id, container, { ...options, glossaryData: glossary });
        this.configure(CONFIG);
        // Export target ids are scoped by dataset (switching dataset is a full
        // reload while the cart survives in localStorage), so the export layer
        // must know which dataset this page shows before any module registers.
        setExportDataset(this.#currentDataset);
        this.setViewHeaderConfigs(buildSlViewHeaderConfigs(this.#headerControlContext()));
        // Declare the derived SL datasets before anything can ask for them;
        // computation stays lazy until the raw payloads are fetched.
        defineSlDatasets(this.dataStore);
    }

    /**
     * The accessor bundle SL's header-control factories close over — plain
     * functions and values only, so slHeaderControls.js stays testable with a
     * stub instead of an app instance.
     * @returns {import('./slHeaderControls.js').SlHeaderControlContext} The state accessors, dataset navigation and survey-scale probes the controls need.
     */
    #headerControlContext() {
        return /** @type {import('./slHeaderControls.js').SlHeaderControlContext} */ (
            this._buildHeaderControlContext({
                datasetOptions: SL_DATASET_OPTIONS,
                currentDataset: this.#currentDataset,
                navigate: navigateToClass,
                getHistorySurveyScales: () =>
                    detectHistorySurveyScales(
                        this.dataStore.getRawData(SL_DATA_KEYS.LONGITUDINAL_HISTORY),
                    ),
                getSurveyRows: () => getSurveyRows(this.dataStore),
                getLongitudinalDomainOptions: () => this.#getLongitudinalDomainOptions(),
                getMaterialSubjectOptions: () => this.#getMaterialSubjectOptions(),
            })
        );
    }

    // ========================================================================
    // BASEAPPMODULE OVERRIDES
    // ========================================================================

    /** @override */
    getInitialState() {
        return { ...INITIAL_STATE };
    }

    /**
     * Create shared nav card container after view containers.
     * @override
     */
    getContainerClassPrefix() {
        return 'sl';
    }

    /** @override */
    createFooterElements() {
        const navCardsContainer = document.createElement('div');
        navCardsContainer.id = CONFIG.navCardsContainerId;
        navCardsContainer.className = 'sl-shared-nav-cards-container';
        navCardsContainer.style.display = 'none';
        this.container?.appendChild(navCardsContainer);
    }

    /**
     * Initialize header (via base) + SL-specific nav cards + JSON data.
     * @override
     */
    async initializeComponents() {
        // Fetch the dataset the URL selected (resolved at construction) and populate
        // the DataStore (EN pattern). The derived datasets declared in the
        // constructor compute lazily from these raw payloads on first getDataset.
        await fetchSlData(this.dataStore, this.#currentDataset);

        // Every reference average the dataset delivers starts visible. The ⌀ toggles in
        // the Überblick cards write this one state (BaseAppModule.setComparisonMode),
        // keyed by the same `state:<id>` ids `buildSummaryRows` plots by.
        this.appState.seedComparisonState(
            deriveSummaryAverages(
                this.dataStore.getRawData(SL_DATA_KEYS.COMPETENCE_LEVELS) ?? [],
            ).map((average) => average.id),
        );

        await super.initializeComponents(); // initializes header
        await this.#initializeNavCards();

        // After the header, so the dataset selector stays usable next to the notice.
        if (!hasSlResults(this.dataStore)) {
            this.#renderNoResultsNotice();
        }
    }

    /**
     * One notice above the views for a dataset the API answered with no rows at all
     * (see `hasSlResults`). The views still mount and show their own "Keine Daten"
     * placeholders; this says why, once, where the reader looks first.
     */
    #renderNoResultsNotice() {
        const headerContainer = document.getElementById(CONFIG.headerContainerId);
        if (!headerContainer) return;
        const notice = document.createElement('div');
        notice.className = 'sl-no-results-notice notice-callout';
        notice.setAttribute('role', 'status');
        notice.innerHTML = `
            <span class="notice-callout-icon" aria-hidden="true">
                ${iconSvg('warning')}
            </span>
            <div class="notice-callout-copy">
                <p class="notice-callout-message">Für diese Schule liegen keine Ergebnisse vor. Der Landesschnitt wird nur zusammen mit eigenen Ergebnissen ausgewiesen; bitte wählen Sie oben eine andere Schule.</p>
            </div>
        `;
        headerContainer.insertAdjacentElement('afterend', notice);
    }

    /**
     * Update header + nav cards before showing view.
     * @override
     */
    async beforeShowView(viewType, options) {
        await super.beforeShowView(viewType, options); // updates header
        this.#updateNavCardsForView(viewType);

        const navCardsContainer = document.getElementById(CONFIG.navCardsContainerId);
        if (navCardsContainer) navCardsContainer.style.display = '';
    }

    // ========================================================================
    // STATE MANAGEMENT (SL-specific helpers)
    // ========================================================================

    getNavCardConfig() {
        return {
            ...NAV_CARD_CONFIG,
            onNavigate: (viewTarget) => this.showView(viewTarget),
        };
    }

    // ========================================================================
    // HEADER HOOKS (BaseAppModule contract)
    // ========================================================================

    // `initializeComponents` awaits `fetchSlData` before the header renders, so the
    // competence levels are always loaded by the time a control asks for them.
    #getMaterialSubjectOptions() {
        return deriveMaterialSubjectOptions(
            this.dataStore?.getRawData(SL_DATA_KEYS.COMPETENCE_LEVELS) ?? [],
        );
    }

    #getLongitudinalDomainOptions() {
        const domainOptions = this.appState.getStateValue('domainOptions');
        if (domainOptions?.length) {
            return domainOptions;
        }

        const domainResults = this.dataStore.getDataset(SL_DATA_KEYS.DOMAIN_RESULTS);
        return domainResults?.length ? buildDomainOptions(domainResults) : [];
    }

    // ========================================================================
    // SL-SPECIFIC: NAV CARDS
    // ========================================================================

    async #initializeNavCards() {
        const navCardsContainer = document.getElementById(CONFIG.navCardsContainerId);
        if (!navCardsContainer) {
            console.error('SlAppModule: Nav cards container not found');
            return;
        }

        this.#navCardModule = new NavCardModule(CONFIG.navCardsContainerId, navCardsContainer, {
            ...this.getNavCardConfig(),
            interactivePreset: 'subtle',
            // The cards sit directly under the page's <h1>, not inside a module card.
            previewLabelTag: 'h2',
            glossaryKey: 'sl.nav-cards',
            glossaryData: glossary,
        });

        await this.#navCardModule.init();
        this.registerChildModule(this.#navCardModule);
    }

    #updateNavCardsForView(viewType) {
        if (!this.#navCardModule) return;
        this.#navCardModule.setCurrentView(viewType);
    }
}
