/**
 * MaAppModule — coordinator of the Mathe 3 dashboard.
 *
 * Supplies BaseAppModule with MA's view map, initial state and per-view header
 * configs; it renders no content of its own beyond the app chrome.
 */

import { BaseAppModule } from '../common/app/appModule.js';
import { createReportViewConfig } from '../common/views/report/reportViewConfig.js';
import { acquireDataset } from '../common/services/datasetAcquisition.js';
import { GROUP_ENDPOINTS } from '../common/services/datasetEndpoints.js';
import { navigateToClass, resolveSelectedDataset } from '../common/app/classSearchParams.js';
import { buildMaViewHeaderConfigs } from './maHeaderControls.js';
import { MA_DATASET_OPTIONS, MA_DATA_KEYS } from './maConstants.js';
import { defineMaDatasets } from './maDatasets.js';
import { buildItemComparisonAverages } from './utils/maItemDataAdapter.js';
import { competenceLevelComparisonIds } from './utils/maComparisonGroups.js';
import { getScaleLevels } from '@tba3/modules/domain';
import { resolveClassKsThresholds } from './utils/maClassKsThresholds.js';
import { maGlossary as glossaryMa } from './maGlossary.js';
import { setExportDataset } from '../common/export/exportDataset.js';
import './maAppModule.css';

// Unified configuration with viewConfig structure. Each entry's `load` is the
// view's lazy import, resolved to its exported class (loaded on demand).
const CONFIG = {
    headerContainerId: 'ma-shared-header',
    defaultView: 'welcome',
    viewConfig: {
        welcome: {
            containerId: 'ma-welcome-container',
            buttonId: 'welcomeViewButton',
            icon: 'home',
            navigationGlossaryPath: 'ma.nav-cards.element_texts.nav-welcome',
            skeleton: 'stack',
            load: () => import('./views/maWelcomeViewModule.js').then((m) => m.MaWelcomeViewModule),
        },
        overview: {
            containerId: 'ma-overview-container',
            buttonId: 'overviewViewButton',
            icon: 'bar_chart',
            navigationGlossaryPath: 'ma.nav-cards.element_texts.nav-overview',
            skeleton: 'split',
            load: () =>
                import('./views/maOverviewViewModule.js').then((m) => m.MaOverviewViewModule),
        },
        class: {
            containerId: 'ma-class-container',
            buttonId: 'combinedViewButton',
            icon: 'groups',
            navigationGlossaryPath: 'ma.nav-cards.element_texts.nav-class',
            skeleton: 'rows',
            load: () => import('./views/maClassViewModule.js').then((m) => m.MaClassViewModule),
        },
        item: {
            containerId: 'ma-item-container',
            buttonId: 'itemViewButton',
            icon: 'list_alt',
            navigationGlossaryPath: 'ma.nav-cards.element_texts.nav-item',
            skeleton: 'split',
            load: () => import('./views/maItemViewModule.js').then((m) => m.MaItemViewModule),
        },
        student: {
            containerId: 'ma-student-container',
            buttonId: 'studentViewButton',
            icon: 'person',
            navigationGlossaryPath: 'ma.nav-cards.element_texts.nav-student',
            skeleton: 'split',
            load: () => import('./views/maStudentViewModule.js').then((m) => m.MaStudentViewModule),
        },
        report: createReportViewConfig('ma'),
        help: {
            containerId: 'ma-help-container',
            buttonId: 'helpViewButton',
            icon: 'menu_book',
            sidebarPinBottom: true,
            navigationGlossaryPath: 'ma.nav-cards.element_texts.nav-help',
            skeleton: 'grid',
            load: () => import('./views/maHelpViewModule.js').then((m) => m.MaHelpViewModule),
        },
    },
    sidebarConfig: {
        title: 'VERA',
    },
};

// Initial state for MA app
const INITIAL_STATE = {
    currentView: null,
    currentStudentId: null,
    layoutMode: 'both',
    // The Leitidee focused in the chart-only layout, shared by the item and
    // student views; null until a ring is selected.
    chartOnlyDomainId: null,
    // Filled once the class is loaded — see initializeComponents step 2c.
    comparisonState: {},
};

// ============================================================================
// CLASS CONFIGURATION & URL PARAMETER
// ============================================================================

const DEFAULT_DATASET_ID = '3a_mid';

/**
 * The class the URL asked for, falling back to the default when it names none.
 * @returns {{id: string, label: string, scope?: string, folder?: string}} The dataset descriptor to load.
 */
function getSelectedDataset() {
    return resolveSelectedDataset(MA_DATASET_OPTIONS, DEFAULT_DATASET_ID);
}

/**
 * What MA acquires (no aggregation.json — MA has no style dimension).
 * @type {import('../common/services/datasetAcquisition.js').DatasetAcquisitionSpec}
 */
const MA_ACQUISITION = {
    endpoints: GROUP_ENDPOINTS,
    subject: 'ma',
    folderBase: 'data/ma/',
    scaleDocument: 'competence-levels.json',
    itemScaleDocument: 'items.json',
    storeKeys: {
        'students_competence-levels.json': MA_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS,
        'students_aggregation.json': MA_DATA_KEYS.STUDENTS_AGGREGATION,
        'competence-levels.json': MA_DATA_KEYS.COMPETENCE_LEVELS_CLASS,
        'items_aggregation.json': MA_DATA_KEYS.ITEM_AGGREGATION,
    },
    itemsSplit: { document: 'items.json', classKey: MA_DATA_KEYS.ITEMS },
};

export class MaAppModule extends BaseAppModule {
    /** @type {{id: string, label: string, scope?: string, folder?: string}} */
    #currentDataset = getSelectedDataset();
    constructor(id, container, options = {}) {
        super(id, container, { ...options, glossaryData: glossaryMa });
        this.configure(CONFIG);
        // Export target ids are scoped by dataset (switching dataset is a full
        // reload while the cart survives in localStorage), so the export layer
        // must know which dataset this page shows before any module registers.
        setExportDataset(this.#currentDataset);
        this.setViewHeaderConfigs(buildMaViewHeaderConfigs(this.#headerControlContext()));
        // Declare the derived MA datasets before anything can ask for them;
        // computation stays lazy until the raw payloads are acquired.
        defineMaDatasets(this.dataStore);
    }

    /**
     * The accessor bundle MA's header-control factories close over — plain
     * functions and values only, so maHeaderControls.js stays testable with a
     * stub instead of an app instance.
     * @returns {import('./maHeaderControls.js').MaHeaderControlContext} The state accessors and dataset navigation the controls need.
     */
    #headerControlContext() {
        return /** @type {import('./maHeaderControls.js').MaHeaderControlContext} */ (
            this._buildHeaderControlContext({
                datasetOptions: MA_DATASET_OPTIONS,
                currentDataset: this.#currentDataset,
                navigate: navigateToClass,
            })
        );
    }

    // ========================================================================
    // BASEAPPMODULE OVERRIDES
    // ========================================================================

    /**
     * Acquire class data, build appData.
     * @override
     */
    async initializeComponents() {
        // 1. Acquire the class the URL selected: fetch, register the competence-level
        //    scales, split items.json into value-group buckets, and populate the
        //    DataStore's raw keys.
        const { documents, items } =
            /** @type {import('../common/services/datasetAcquisition.js').AcquiredSplitDataset} */ (
                await acquireDataset(this.#currentDataset, MA_ACQUISITION, this.dataStore)
            );

        // 2. Item, student, and raw student records — declared in maDatasets.js,
        //    computed here from the raw payloads just acquired.
        const itemArray = this.dataStore.getDataset(MA_DATA_KEYS.ITEM_RECORDS);
        const nrItems = itemArray.length;
        const studentArray = this.dataStore.getDataset(MA_DATA_KEYS.STUDENT_RECORDS);
        const rawStudentArray = this.dataStore.getDataset(MA_DATA_KEYS.RAW_STUDENT_RECORDS);

        // 2b. Build comparison averages with payload identity plus iqbId → percentage maps.
        const schoolAverages = buildItemComparisonAverages(items.schoolItems);
        const stateAverages = buildItemComparisonAverages(items.stateItems);
        const otherAverages = buildItemComparisonAverages(items.otherItems);

        // 2c. Every comparison population this class ships starts visible. The
        //     competence-level groups and the item averages share their ids
        //     (`school`, `state`, …), so the one comparisonState the ⌀ header toggles
        //     write from here on drives the KS chart and the item lollipop alike.
        //     Both id sources throw on a comparison row that carries no id.
        this.appState.seedComparisonState([
            ...competenceLevelComparisonIds(documents['competence-levels.json']),
            ...[...schoolAverages, ...stateAverages, ...otherAverages].map((average) => average.id),
        ]);

        // 3. The band scale in play. Read from the data rather than assumed: the six
        //    VERA-8 states publish four different maths vocabularies, so nothing may
        //    hardcode `I…V` and still be right outside the VERA-3 fixtures.
        const ksLevels = getScaleLevels(documents['competence-levels.json']);

        // 4. Class-level Schwellenwerte off the class's own row — a booklet-level
        //    fact, resolved once here so nothing pool-scoped ever feeds it.
        const classKsThresholds = resolveClassKsThresholds(documents['competence-levels.json']);

        // 5. The app payload every view reads through getData(); the MA domains are
        //    derived lazily from MA_DATA_KEYS.ITEMS instead (getMaDomains).
        this.setData({
            studentArray,
            itemArray,
            rawStudentArray,
            nrItems,
            ksLevels,
            classKsThresholds,
            schoolAverages,
            stateAverages,
            otherAverages,
        });

        // 6. Initialize header and other base components
        await super.initializeComponents();
    }

    /**
     * Inject MA glossary data.
     * @override
     */
    getViewModuleOptions(viewType) {
        return {
            ...super.getViewModuleOptions(viewType),
            glossaryData: glossaryMa,
            currentClassId: this.#currentDataset.id,
        };
    }

    /** @override */
    getInitialState() {
        return { ...INITIAL_STATE };
    }

    /**
     * Class prefix of MA's containers, and its glossary namespace.
     * @override
     */
    getContainerClassPrefix() {
        return 'ma';
    }

    /**
     * Apply a layout mode requested with the navigation (nav cards open the
     * item/student views chart-only). Done here rather than in a showView()
     * override because this hook runs at dispatch time — a queued navigation
     * applies its own viewMode when it actually runs, never the in-flight one's.
     * @override
     */
    async beforeShowView(viewType, options) {
        if (options.viewMode) {
            this.appState.updateState({ layoutMode: options.viewMode });
        }
        await super.beforeShowView(viewType, options);
    }

    /**
     * Notify help view of the previous view each time it becomes active.
     * @override
     */
    afterShowView(viewType, context) {
        super.afterShowView(viewType, context);
        if (viewType === 'help') {
            const helpView = this.getViewModule('help');
            /** @type {any} */ (helpView)?.setPreviousView(context.previousView);
        }
    }
}
