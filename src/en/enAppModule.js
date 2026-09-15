/**
 * EnAppModule — coordinator of the Englisch 8 dashboard.
 *
 * Supplies BaseAppModule with EN's view map, initial state and per-view header
 * configs; it renders no content of its own beyond the app chrome.
 */

import { BaseAppModule } from '../common/app/appModule.js';
import { createReportViewConfig } from '../common/views/report/reportViewConfig.js';
import { acquireDataset } from '../common/services/datasetAcquisition.js';
import { GROUP_ENDPOINTS } from '../common/services/datasetEndpoints.js';
import { navigateToClass, resolveSelectedDataset } from '../common/app/classSearchParams.js';
import { EN_DATA_KEYS, EN_DATASET_OPTIONS } from './enConstants.js';
import { buildEnViewHeaderConfigs } from './enHeaderControls.js';
import { defineEnDatasets } from './enDatasets.js';
import { getEnConfig } from './enConfig.js';
import { buildItemComparisonGroups } from './utils/enItemDataAdapter.js';
import { enGlossary as glossary } from './enGlossary.js';
import { setExportDataset } from '../common/export/exportDataset.js';
import './enAppModule.css';

// Unified configuration with viewConfig structure. Each entry's `load` is the
// view's lazy import, resolved to its exported class (loaded on demand).
const CONFIG = {
    headerContainerId: 'en-shared-header',
    defaultView: 'welcome',
    viewConfig: {
        welcome: {
            containerId: 'en-welcome-container',
            buttonId: 'welcomeViewButton',
            icon: 'home',
            navigationGlossaryPath: 'en.nav-cards.element_texts.nav-welcome',
            skeleton: 'stack',
            load: () => import('./views/enWelcomeViewModule.js').then((m) => m.EnWelcomeViewModule),
        },
        overview: {
            containerId: 'en-overview-container',
            buttonId: 'overviewViewButton',
            icon: 'bar_chart',
            navigationGlossaryPath: 'en.nav-cards.element_texts.nav-overview',
            skeleton: 'triple',
            load: () =>
                import('./views/enOverviewViewModule.js').then((m) => m.EnOverviewViewModule),
        },
        class: {
            containerId: 'en-class-container',
            buttonId: 'classViewButton',
            icon: 'groups',
            navigationGlossaryPath: 'en.nav-cards.element_texts.nav-class',
            skeleton: 'rows',
            load: () => import('./views/enClassViewModule.js').then((m) => m.EnClassViewModule),
        },
        item: {
            containerId: 'en-item-container',
            buttonId: 'itemViewButton',
            icon: 'list_alt',
            navigationGlossaryPath: 'en.nav-cards.element_texts.nav-item',
            skeleton: 'rows',
            load: () => import('./views/enItemViewModule.js').then((m) => m.EnItemViewModule),
        },
        student: {
            containerId: 'en-student-container',
            buttonId: 'studentViewButton',
            icon: 'person',
            navigationGlossaryPath: 'en.nav-cards.element_texts.nav-student',
            skeleton: 'split',
            load: () => import('./views/enStudentViewModule.js').then((m) => m.EnStudentViewModule),
        },
        report: createReportViewConfig('en'),
    },
    sidebarConfig: {
        title: 'VERA',
    },
};

// ============================================================================
// CLASS CONFIGURATION & URL PARAMETER
// ============================================================================

const DEFAULT_DATASET_ID = '8a_mid';

/**
 * The class the URL asked for, falling back to the default when it names none.
 * @returns {{id: string, label: string, scope?: string, folder?: string}} The dataset descriptor to load.
 */
function getSelectedDataset() {
    return resolveSelectedDataset(EN_DATASET_OPTIONS, DEFAULT_DATASET_ID);
}

/**
 * What EN acquires.
 * @type {import('../common/services/datasetAcquisition.js').DatasetAcquisitionSpec}
 */
const EN_ACQUISITION = {
    endpoints: GROUP_ENDPOINTS,
    subject: 'en',
    folderBase: 'data/en/',
    scaleDocument: 'competence-levels.json',
    itemScaleDocument: 'items.json',
    // The students_*/plain naming inversion (COMPETENCE_LEVELS <-
    // students_competence-levels.json, AGGREGATION <- aggregation.json) is
    // historical and documented on EN_DATA_KEYS; the key strings are pinned
    // there. Do NOT "fix" it here.
    storeKeys: {
        'students_competence-levels.json': EN_DATA_KEYS.COMPETENCE_LEVELS,
        'students_aggregation.json': EN_DATA_KEYS.STYLE_AGGREGATION,
        'aggregation.json': EN_DATA_KEYS.AGGREGATION,
        'competence-levels.json': EN_DATA_KEYS.COMPETENCE_LEVELS_CLASS,
        'items_aggregation.json': EN_DATA_KEYS.ITEM_AGGREGATION,
    },
    itemsSplit: { document: 'items.json', classKey: EN_DATA_KEYS.ITEMS },
};

/**
 * Build initial state. Runs at construction (before data load). Comparison
 * toggles are seeded in `initializeComponents` once the dataset says which
 * comparison groups it delivers — every one starts shown, as in MA and SL.
 * @returns {object} The app state every view reads from.
 */
function buildInitialState() {
    return {
        currentView: null,
        currentMode: 'all',
        comparisonState: {},
        currentStudentId: null,
    };
}

export class EnAppModule extends BaseAppModule {
    /** @type {{id: string, label: string, scope?: string, folder?: string}} */
    #currentDataset = getSelectedDataset();

    constructor(id, container, options = {}) {
        super(id, container, { ...options, glossaryData: glossary });
        this.configure(CONFIG);
        // Export target ids are scoped by dataset (switching dataset is a full
        // reload while the cart survives in localStorage), so the export layer
        // must know which dataset this page shows before any module registers.
        setExportDataset(this.#currentDataset);
        // Declare the derived EN datasets before anything can ask for them;
        // computation stays lazy until the raw payloads are acquired.
        defineEnDatasets(this.dataStore);
        // View header configs are set in initializeComponents() after DataStore is populated,
        // so that domain display names are correctly resolved.
    }

    // ========================================================================
    // BASEAPPMODULE OVERRIDES
    // ========================================================================

    /**
     * Acquire class data, build appData + header configs, init glossary.
     * @override
     */
    async initializeComponents() {
        // 1. Acquire the class the URL selected (resolved at construction): fetch,
        //    register the competence-level scales, split items.json into value-group
        //    buckets, and populate the DataStore's raw keys.
        const { items } =
            /** @type {import('../common/services/datasetAcquisition.js').AcquiredSplitDataset} */ (
                await acquireDataset(this.#currentDataset, EN_ACQUISITION, this.dataStore)
            );

        // 2. Every comparison group items.json carries, with its per-item means, for
        //    the item-view comparison markers — including ones drawn with the catch-all
        //    marker and ones aggregation.json does not list: the chart decides how to
        //    render a group, but it can only render one it was given data for.
        const itemComparisonGroups = buildItemComparisonGroups(items.comparisonItems);
        this.setData({ itemComparisonGroups });

        // 3. Eagerly compute the shared datasets declared in enDatasets.js
        // (views would trigger the same builds lazily; doing it here keeps the
        // cost out of the first view render).
        this.dataStore.getDataset(EN_DATA_KEYS.STUDENT_RECORDS);
        this.dataStore.getDataset(EN_DATA_KEYS.ITEM_RECORDS);

        // 4. Every comparison population the class ships starts visible — the
        //    competence-level groups and the item averages share their ids, so the one
        //    comparisonState the ⌀ header toggles write drives every chart alike.
        this.appState.seedComparisonState([
            ...getEnConfig(this.dataStore).comparisonGroups.map((group) => group.id),
            ...itemComparisonGroups.map((group) => group.id),
        ]);

        // 5. Build view header configs now that config is available
        this.setViewHeaderConfigs(
            buildEnViewHeaderConfigs(this.#headerControlContext(), getEnConfig(this.dataStore)),
        );

        // 6. Initialize header and other base components
        await super.initializeComponents();
    }

    /**
     * Inject EN-specific glossary data and the current class id.
     * @override
     */
    getViewModuleOptions(viewType) {
        return {
            ...super.getViewModuleOptions(viewType),
            glossaryData: glossary,
            currentClassId: this.#currentDataset.id,
        };
    }

    /** @override */
    getInitialState() {
        return buildInitialState();
    }

    /**
     * Set up EN-specific event listeners.
     * @override
     */
    getContainerClassPrefix() {
        return 'en';
    }

    // ========================================================================
    // HEADER HOOKS (BaseAppModule contract)
    // ========================================================================

    /**
     * The accessor bundle EN's header-control factories close over — plain
     * functions and values only, so enHeaderControls.js stays testable with a
     * stub instead of an app instance.
     * @returns {import('./enHeaderControls.js').EnHeaderControlContext} The state accessors, publisher and dataset navigation the controls need.
     */
    #headerControlContext() {
        return /** @type {import('./enHeaderControls.js').EnHeaderControlContext} */ (
            this._buildHeaderControlContext({
                datasetOptions: EN_DATASET_OPTIONS,
                currentDataset: this.#currentDataset,
                navigate: navigateToClass,
            })
        );
    }
}
