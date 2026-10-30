/**
 * SlAppModule — coordinator of the Schulleitung dashboard.
 */

import { BaseAppModule } from '../common/app/appModule.js';
import { REPORT_VIEW_CONFIG, REPORT_VIEW_KEY } from '../common/views/report/reportViewConfig.js';
import { NavCardModule, viewNavCardItems } from '../common/modules/navCard/navCardModule.js';
import { slGlossary as glossary } from './slGlossary.js';
import { noticeCallout, resizeService } from '@tba3/module-base';
import {
    DEFAULT_SUMMARY_METRIC_ID,
    hasSlResults,
    MATERIAL_TYPE_OPTIONS,
    SL_DATASETS,
    VIZ_MODES,
} from '@tba3/modules/sl-domain';
import { SCHOOL_REQUESTS } from '@tba3/modules/documents';
import { buildSlViewHeaderControls } from './slHeaderControls.js';
import {
    DETAILS_GROUPINGS,
    DISPLAY_MODES,
    LONGITUDINAL_CHART_TYPES,
    LONGITUDINAL_VIEW_MODES,
} from './slConstants.js';
import './slAppModule.css';

/** @type {{[viewType: string]: import('../common/app/appModule.js').ViewConfigEntry}} */
const VIEWS = {
    summary: {
        icon: 'home',
        skeleton: 'rows',
        load: () => import('./views/slSummaryViewModule.js').then((m) => m.SlSummaryViewModule),
    },
    matrix: {
        icon: 'category',
        skeleton: 'split',
        load: () => import('./views/slMatrixViewModule.js').then((m) => m.SlMatrixViewModule),
    },
    details: {
        icon: 'bar_chart',
        skeleton: 'grid',
        load: () => import('./views/slDetailsViewModule.js').then((m) => m.SlDetailsViewModule),
    },
    comparison: {
        tour: true,
        icon: 'balance',
        skeleton: 'split',
        load: () =>
            import('./views/slComparisonViewModule.js').then((m) => m.SlComparisonViewModule),
    },
    longitudinal: {
        icon: 'trending_up',
        skeleton: 'rows',
        load: () =>
            import('./views/slLongitudinalViewModule.js').then((m) => m.SlLongitudinalViewModule),
    },
    material: {
        icon: 'description',
        skeleton: 'stack',
        load: () => import('./views/slMaterialViewModule.js').then((m) => m.SlMaterialViewModule),
    },
    [REPORT_VIEW_KEY]: REPORT_VIEW_CONFIG,
};

const NAV_CARDS_CONTAINER_ID = 'sl-shared-nav-cards';

/**
 * SL's app state: the shell's keys plus every header control's value. The modes are
 * the values the controls offer (slHeaderControls.js).
 * @typedef {import('../common/app/appModule.js').ShellState & {
 *   summaryMetric: string,
 *   detailsGrouping: string,
 *   displayMode: string,
 *   vizMode: string,
 *   selectedDomainIndex: number,
 *   longitudinalViewMode: string,
 *   longitudinalChartType: import('./slConstants.js').LongitudinalChartType,
 *   materialType: string,
 *   materialSubject: string,
 * }} SlState
 */

/**
 * SL's own state keys with each header control's start value; the shell adds the view
 * and student keys.
 * @type {import('../common/app/appModule.js').AppSpec<SlState>['initialState']}
 */
const INITIAL_STATE = {
    summaryMetric: DEFAULT_SUMMARY_METRIC_ID,
    detailsGrouping: DETAILS_GROUPINGS.BY_SUBJECTS,
    displayMode: DISPLAY_MODES.CHARTS,
    vizMode: VIZ_MODES.STACKED_BAR,
    selectedDomainIndex: 0,
    longitudinalViewMode: LONGITUDINAL_VIEW_MODES.NORMAL,
    longitudinalChartType: LONGITUDINAL_CHART_TYPES.LINES,
    materialType: MATERIAL_TYPE_OPTIONS[0].value,
    // No Fach is known before the data is: `onDataReady` writes the dataset's first.
    materialSubject: '',
};

// ============================================================================
// SCHOOL DATASET
// ============================================================================

/**
 * info-boxes.json carries prose and placeholders, no numbers, so it is a site file for
 * every dataset, API-backed or not; a missing one fails the load.
 * @type {import('@tba3/modules/documents').DatasetRequest}
 */
const INFO_BOXES_REQUEST = {
    file: 'info-boxes.json',
    site: 'data/sl/',
    documents: ['info-boxes.json'],
};

/**
 * The options are the demo fixtures under `data/sl/`; any other school opens by
 * `?scope=schools/<id>` against a running API.
 * @type {import('../common/app/appModule.js').AppDatasetSpec}
 */
const SL_DATASET = {
    options: [
        { id: 'schools/sl', label: 'Beispielschule (Demo)', folder: 'sl' },
        {
            id: 'schools/sl-testhefte',
            label: 'Beispielschule mit mehreren Testheften (Demo)',
            folder: 'sl-testhefte',
        },
    ],
    defaultId: 'schools/sl',
    requests: [...SCHOOL_REQUESTS, INFO_BOXES_REQUEST],
};

/** @augments {BaseAppModule<SlState>} */
export class SlAppModule extends BaseAppModule {
    /** @override */
    static defaultOptions = {
        glossaryData: glossary,
        dataset: SL_DATASET,
        views: VIEWS,
        defaultView: 'summary',
        initialState: INITIAL_STATE,
        headerControls: buildSlViewHeaderControls,
        comparisonIds: SL_DATASETS.COMPARISON_IDS,
    };

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    async initializeComponents() {
        await super.initializeComponents();
        await this.#initializeNavCards();
        this.#publishHeaderBlockSize();
    }

    /**
     * Publish the shared header's height as `--sl-header-block-size`: at the stacked tier
     * the header sticks over the scrolling content, and the scroll container keeps that
     * much room above whatever takes focus (`scroll-padding-top`, slAppModule.css), so a
     * reverse Tab never lands under it (WCAG 2.4.11).
     */
    #publishHeaderBlockSize() {
        const header = this.querySelector('.sl-shared-header-container');
        if (!(header instanceof HTMLElement)) return;
        const publish = () =>
            this.style.setProperty('--sl-header-block-size', `${header.offsetHeight}px`);
        publish();
        this.resources.trackSubscription(resizeService.observe(header, publish));
    }

    /**
     * Open the Materialien on the dataset's first Fach, and say once, under the header,
     * when the dataset came back without results.
     * @override
     */
    async onDataReady() {
        await super.onDataReady();
        const subjects = this.context.documents.getDataset(SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS);
        // Only while the chosen Fach is none of the dataset's: a navigation's state patch
        // written before the data landed keeps the Fach it named.
        if (subjects[0] && !subjects.includes(this.appState.materialSubject.peek())) {
            this.appState.materialSubject.value = subjects[0];
        }
        if (!hasSlResults(this.context.documents)) this.#renderNoResultsNotice();
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * One notice above the views for a dataset the API answered with no value groups at all
     * (see `hasSlResults`). The views still mount and show their own "Keine Daten"
     * placeholders; the notice gives the reason once, under the header.
     */
    #renderNoResultsNotice() {
        this._showNotice(
            noticeCallout({
                message: this.context.glossary.getRequiredEntryText('sl.app.messages.no-results'),
                role: 'status',
                className: 'sl-no-results-notice',
            }),
        );
    }

    async #initializeNavCards() {
        const navCards = NavCardModule.create(NAV_CARDS_CONTAINER_ID, {
            items: viewNavCardItems(this.viewConfig, 'labelIcon'),
            onNavigate: (viewTarget, statePatch) => this.showView(viewTarget, { statePatch }),
            interactivePreset: 'subtle',
            showModuleCard: false,
            // The cards sit directly under the page's <h1>, not inside a module card.
            previewLabelTag: 'h2',
            glossaryKey: 'sl.nav-cards',
            context: this.context,
        });
        navCards.className = 'sl-shared-nav-cards-container';
        // The current card follows the committed view, as the sidebar does.
        navCards.currentView = this.appState.currentView.peek();
        this.onChange(
            () => this.appState.currentView.value,
            (view) => {
                navCards.currentView = view;
            },
        );
        // Appended after the view containers: the row sits below every view.
        this.append(navCards);
        await navCards.contentComplete;
    }
}

customElements.define('tba-sl-app', SlAppModule);
