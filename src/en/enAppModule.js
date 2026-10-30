/**
 * EnAppModule — coordinator of the Englisch 8 dashboard.
 */

import { BaseAppModule } from '../common/app/appModule.js';
import { REPORT_VIEW_CONFIG, REPORT_VIEW_KEY } from '../common/views/report/reportViewConfig.js';
import { WELCOME_VIEW_CONFIG } from '../common/views/welcomeSplashViewConfig.js';
import { buildEnViewHeaderControls } from './enHeaderControls.js';
import { enGlossary as glossary } from './enGlossary.js';
import { GROUP_REQUESTS } from '@tba3/modules/documents';
import { EN_DATASETS } from '@tba3/modules/en-domain';

/** @type {{[viewType: string]: import('../common/app/appModule.js').ViewConfigEntry}} */
const VIEWS = {
    welcome: { ...WELCOME_VIEW_CONFIG, tour: true },
    overview: {
        tour: true,
        icon: 'bar_chart',
        skeleton: 'triple',
        load: () => import('./views/enOverviewViewModule.js').then((m) => m.EnOverviewViewModule),
    },
    group: {
        tour: true,
        icon: 'groups',
        skeleton: 'rows',
        load: () => import('./views/enGroupViewModule.js').then((m) => m.EnGroupViewModule),
    },
    item: {
        tour: true,
        icon: 'list_alt',
        skeleton: 'rows',
        load: () => import('./views/enItemViewModule.js').then((m) => m.EnItemViewModule),
    },
    student: {
        tour: true,
        icon: 'person',
        skeleton: 'split',
        load: () => import('./views/enStudentViewModule.js').then((m) => m.EnStudentViewModule),
    },
    [REPORT_VIEW_KEY]: REPORT_VIEW_CONFIG,
};

/**
 * The options are the hand-made fixtures under `data/en/`, each a `folder` named by
 * its scope; any other group opens by `?scope=groups/<id>` against a running API.
 * @type {import('../common/app/appModule.js').AppDatasetSpec}
 */
const EN_DATASET = {
    options: [
        { id: 'groups/8a_mid', label: 'Lerngruppe 8a', folder: '8a_mid' },
        { id: 'groups/8b_good', label: 'Lerngruppe 8b', folder: '8b_good' },
        { id: 'groups/8c_bad', label: 'Lerngruppe 8c', folder: '8c_bad' },
    ],
    defaultId: 'groups/8a_mid',
    requests: GROUP_REQUESTS.en,
};

/**
 * EN's app state: the shell's keys plus the Domäne switch.
 * @typedef {import('../common/app/appModule.js').ShellState & {
 *   currentMode: string,
 * }} EnState
 */

/** @type {import('../common/app/appModule.js').AppSpec<EnState>['initialState']} */
const INITIAL_STATE = {
    currentMode: 'all',
};

/** @augments {BaseAppModule<EnState>} */
export class EnAppModule extends BaseAppModule {
    /** @override */
    static defaultOptions = {
        glossaryData: glossary,
        dataset: EN_DATASET,
        views: VIEWS,
        defaultView: 'welcome',
        initialState: INITIAL_STATE,
        headerControls: buildEnViewHeaderControls,
        comparisonIds: EN_DATASETS.COMPARISON_IDS,
        // The app name in the welcome header is the payload's Fach.
        headerTokens: (
            /** @type {import('@tba3/modules/documents').DocumentStore} */ documents,
        ) => ({
            Fach: documents.getDataset(EN_DATASETS.CONFIG).subjectName,
        }),
        students: { records: EN_DATASETS.STUDENT_RECORDS, view: 'student' },
    };
}

customElements.define('tba-en-app', EnAppModule);
