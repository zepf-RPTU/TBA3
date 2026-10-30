/**
 * MaAppModule — coordinator of the Mathe 3 dashboard.
 */

import { BaseAppModule } from '../common/app/appModule.js';
import { REPORT_VIEW_CONFIG, REPORT_VIEW_KEY } from '../common/views/report/reportViewConfig.js';
import { WELCOME_VIEW_CONFIG } from '../common/views/welcomeSplashViewConfig.js';
import { buildMaViewHeaderControls } from './maHeaderControls.js';
import { LAYOUT_MODES, MA_DATASET_OPTIONS } from './maConstants.js';
import { GROUP_REQUESTS } from '@tba3/modules/documents';
import { LEITIDEE_GROUPING, MA_DATASETS } from '@tba3/modules/ma-domain';
import { maGlossary as glossaryMa } from './maGlossary.js';

/** The item and student welcome cards open their view chart-only. */
const CHART_ONLY = { layoutMode: LAYOUT_MODES.CHART_ONLY };

/** @type {{[viewType: string]: import('../common/app/appModule.js').ViewConfigEntry}} */
const VIEWS = {
    welcome: WELCOME_VIEW_CONFIG,
    overview: {
        icon: 'bar_chart',
        skeleton: 'split-wide',
        load: () => import('./views/maOverviewViewModule.js').then((m) => m.MaOverviewViewModule),
    },
    group: {
        tour: true,
        icon: 'groups',
        skeleton: 'rows',
        load: () => import('./views/maGroupViewModule.js').then((m) => m.MaGroupViewModule),
    },
    item: {
        tour: true,
        icon: 'list_alt',
        skeleton: 'split',
        navCard: { statePatch: CHART_ONLY },
        load: () => import('./views/maItemViewModule.js').then((m) => m.MaItemViewModule),
    },
    student: {
        tour: true,
        icon: 'person',
        skeleton: 'split',
        navCard: { statePatch: CHART_ONLY },
        load: () => import('./views/maStudentViewModule.js').then((m) => m.MaStudentViewModule),
    },
    [REPORT_VIEW_KEY]: REPORT_VIEW_CONFIG,
    help: {
        icon: 'menu_book',
        sidebarPinBottom: true,
        skeleton: 'grid',
        load: () => import('./views/maHelpViewModule.js').then((m) => m.MaHelpViewModule),
    },
};

/**
 * MA's app state: the shell's keys plus the item and student views' layout, the
 * grouping every item-ring grid follows, and the ring they focus in the chart-only
 * layout.
 * @typedef {import('../common/app/appModule.js').ShellState & {
 *   layoutMode: import('./maConstants.js').LayoutMode,
 *   itemRingGrouping: string,
 *   chartOnlyRingId: string | null,
 * }} MaState
 */

/** @type {import('../common/app/appModule.js').AppSpec<MaState>['initialState']} */
const INITIAL_STATE = {
    layoutMode: LAYOUT_MODES.BOTH,
    itemRingGrouping: LEITIDEE_GROUPING,
    // Null until a ring is selected.
    chartOnlyRingId: null,
};

/** @type {import('../common/app/appModule.js').AppDatasetSpec} */
const MA_DATASET = {
    options: MA_DATASET_OPTIONS,
    defaultId: 'groups/3a_mid',
    requests: GROUP_REQUESTS.ma,
};

/** @augments {BaseAppModule<MaState>} */
export class MaAppModule extends BaseAppModule {
    /** @override */
    static defaultOptions = {
        glossaryData: glossaryMa,
        dataset: MA_DATASET,
        views: VIEWS,
        defaultView: 'welcome',
        initialState: INITIAL_STATE,
        headerControls: buildMaViewHeaderControls,
        comparisonIds: MA_DATASETS.COMPARISON_IDS,
        students: { records: MA_DATASETS.STUDENT_RECORDS, view: 'student' },
    };
}

customElements.define('tba-ma-app', MaAppModule);
