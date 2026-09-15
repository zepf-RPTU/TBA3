/**
 * EnStudentViewModule — the EN Schüler:in view: spider chart, student info and data
 * tables, and the item detail panel.
 *
 * Observes `currentStudentId`, `currentMode` and `comparisonState`. Both the header
 * selector and the item detail's student grid write `currentStudentId`; the data
 * table's `onItemSelected` is wired to the detail panel.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { styleChartConfig } from '@tba3/modules/charts/style';
import { EnItemDetailModule } from '@tba3/modules/en-item-detail';
import { EnStudentTablesModule } from '../modules/enStudentTables/enStudentTablesModule.js';
import { EN_DATA_KEYS } from '../enConstants.js';
import { getEnConfig, getEnStyleAverages } from '../enConfig.js';
import { buildStudentItemRecords } from '../utils/enItemDataAdapter.js';
import './enStudentViewModule.css';

// Module-specific constants
const CONFIG = {
    spiderChartContainerId: 'student-spider',
    studentTablesContainerId: 'student-tables',
    itemDetailContainerId: 'student-detail',
};

export class EnStudentViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/en/modules/charts/style/styleChartConfig.js').StyleChartHost|null} */
    #spiderChartModule = null;
    /** @type {EnStudentTablesModule|null} */
    #studentTableModule = null;
    /** @type {EnItemDetailModule|null} */
    #itemDetailModule = null;
    /** @type {string|null} */
    #currentStudentId = null;

    /**
     * Creates a new EnStudentViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Render the student view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        const dataStore = this.getOption('dataStore');

        // Retrieve shared datasets from the DataStore (computed once, cached;
        // declared in enDatasets.js)
        const studentArray = dataStore.getDataset(EN_DATA_KEYS.STUDENT_RECORDS);
        const itemArray = dataStore.getDataset(EN_DATA_KEYS.ITEM_RECORDS);

        // Store transformed data + raw style aggregation reference for spider chart
        this.setData({
            studentArray,
            itemArray,
            studentStyleAggregation: dataStore.getRawData(EN_DATA_KEYS.STYLE_AGGREGATION),
        });

        this.#createDOM();
        this.#resolveInitialStudent();
        this.#constructModules();
        await this.#hydrateModules();
        this.#setupEventListeners();
    }

    /**
     * Creates the DOM structure for the student view layout
     */
    #createDOM() {
        const container = this.container;
        if (!container) return;
        container.className = 'en-student-view view-base';
        container.innerHTML = `
            <div class="content-grid">
                <div class="view-section left-column">
                    <div class="student-tables-section" id="${CONFIG.studentTablesContainerId}"></div>
                </div>
                <div class="view-section right-column">
                    <div class="chart-section" id="${CONFIG.spiderChartContainerId}"></div>
                    <div class="detail-section" id="${CONFIG.itemDetailContainerId}"></div>
                </div>
            </div>
        `;
    }

    /**
     * Resolve initial student ID from appState or first student in array
     */
    #resolveInitialStudent() {
        if (!this.#currentStudentId) {
            const appData = this.getData();
            const studentArray = appData?.studentArray || [];
            const stateStudentId = this.options.appState?.getStateValue('currentStudentId');
            this.#currentStudentId =
                stateStudentId || (studentArray.length > 0 ? studentArray[0].studentId : null);
        }
    }

    /**
     * Construct all child modules (sync — no DOM or data work)
     */
    #constructModules() {
        const chartContainer = this.getContainer(CONFIG.spiderChartContainerId, 'Spider chart');
        const tablesContainer = this.getContainer(
            CONFIG.studentTablesContainerId,
            'Student tables',
        );
        const detailContainer = this.getContainer(CONFIG.itemDetailContainerId, 'Item detail');
        // Children are seeded with the current Domäne mode and follow it through the observer.
        const domainMode = this.options.appState?.getStateValue('currentMode');

        if (chartContainer) {
            const spiderHost = new ChartHostModule(
                CONFIG.spiderChartContainerId,
                chartContainer,
                styleChartConfig,
                {
                    ...this._childOptions(),
                    showModuleTitle: true,
                    glossaryKey: 'en.student.spider-lollipop',
                    enConfig: getEnConfig(this.getOption('dataStore')),
                    styleAverages: getEnStyleAverages(this.getOption('dataStore')),
                    domainMode,
                },
            );
            // The constructor returns the bare host; `styleChartConfig` binds its verbs
            // onto it at init. Naming the config's host type once here is what lets `tsc`
            // check every verb call, instead of a cast per call.
            this.#spiderChartModule =
                /** @type {import('@tba3/modules/en/modules/charts/style/styleChartConfig.js').StyleChartHost} */ (
                    spiderHost
                );
            // Only register if we have the data needed for spider chart
            const appData = this.getData();
            if (appData?.studentStyleAggregation && this.#currentStudentId) {
                this.registerChildModule(this.#spiderChartModule);
            }
        }

        if (tablesContainer) {
            this.#studentTableModule = new EnStudentTablesModule(
                'student-tables',
                tablesContainer,
                {
                    ...this._childOptions(),
                    showModuleTitle: true,
                    title: 'Schülerübersicht',
                    domainMode,
                    infoGlossaryKey: 'en.student.student-row',
                    dataGlossaryKey: 'en.student.student-item-table',
                    onItemSelected: (payload) => {
                        void this.#itemDetailModule?.onItemSelected(payload);
                    },
                    onStudentSelected: (studentId) => this.#selectStudent(studentId),
                },
            );
            this.registerChildModule(this.#studentTableModule);
        }

        if (detailContainer) {
            this.#itemDetailModule = new EnItemDetailModule(
                CONFIG.itemDetailContainerId,
                detailContainer,
                {
                    ...this._childOptions(),
                    glossaryKey: 'en.student.item-details',
                    showModuleTitle: true,
                    onStudentSelected: (studentId) => this.#selectStudent(studentId),
                },
            );
            this.registerChildModule(this.#itemDetailModule);
        }
    }

    /**
     * Mount + hydrate all child modules (independent, so in parallel). The
     * spider chart and the tables need a selected student; without one they
     * stay constructed but empty.
     * @returns {Promise<void>}
     */
    async #hydrateModules() {
        const appData = this.getData();
        const studentId = this.#currentStudentId;
        const student = appData?.studentArray?.find((s) => s.studentId === studentId);

        await this._hydrateChildren([
            [
                appData?.studentStyleAggregation && studentId ? this.#spiderChartModule : null,
                {
                    studentData: appData?.studentStyleAggregation,
                    studentId,
                    displayName: student ? `${student.lastName}, ${student.firstName}` : null,
                    useWidth: false,
                    comparisonModes: getEnConfig(this.getOption('dataStore')).comparisonModeIds,
                    useSpiderChart: true,
                },
            ],
            [
                studentId ? this.#studentTableModule : null,
                {
                    studentArray: appData?.studentArray,
                    rawStudentArray: studentId ? this.#buildStudentItemRecordsFor(studentId) : [],
                    itemArray: appData?.itemArray,
                    studentId,
                },
            ],
            [this.#itemDetailModule, {}],
        ]);
    }

    /**
     * Observe the app-state keys the children follow.
     */
    #setupEventListeners() {
        // Student selection is app state: this view's own selector and the item
        // detail write it (#selectStudent), other views write it and navigate here.
        this.observeState('currentStudentId', (studentId) => {
            this.#handleStudentSelected(studentId);
        });

        // The ⌀ toggles write the app's comparison state; the style chart follows it.
        this.observeActiveComparisons((activeModes) => {
            this.#spiderChartModule?.setActiveModes(activeModes);
        });

        // The header's Domäne switch writes app state; push it to the tables and the chart host.
        this.observeState('currentMode', (mode) => {
            this.#studentTableModule?.setDomainMode(mode);
            this.#spiderChartModule?.setDomainMode(mode);
        });
    }

    /**
     * A selection made inside this view: write the app state the observer follows.
     * @param {string} studentId - The selected student
     */
    #selectStudent(studentId) {
        this.options.appState?.updateState({ currentStudentId: studentId });
    }

    /**
     * Follow `currentStudentId`: re-point the spider chart and the tables.
     * @param {string|null} studentId - The selected student
     */
    #handleStudentSelected(studentId) {
        if (!studentId || studentId === this.#currentStudentId) return;

        this.#currentStudentId = studentId;

        // The spider chart already holds the immutable style aggregation from
        // mount, so only the selected student changes — no data is re-pushed.
        // Without the displayName the legend falls back to the generic
        // "Schüler:in" label.
        this.#spiderChartModule?.setStudent({
            studentId,
            displayName: this.#resolveDisplayName(studentId),
        });

        // Rebuild per-student item records and update tables
        if (this.#studentTableModule) {
            const appData = this.getData();
            const studentItemRecords = this.#buildStudentItemRecordsFor(studentId);
            const updatedData = { ...appData, rawStudentArray: studentItemRecords };
            this.#studentTableModule.updateStudent(studentId, updatedData);
        }
    }

    /**
     * Build the per-student item records for one student — the single place
     * this view names the adapter's raw inputs and argument order.
     * @param {string} studentId - Student id
     * @returns {ReturnType<typeof buildStudentItemRecords>} One record per item for that student.
     */
    #buildStudentItemRecordsFor(studentId) {
        const dataStore = this.getOption('dataStore');
        return buildStudentItemRecords(
            dataStore.getRawData(EN_DATA_KEYS.ITEMS),
            dataStore.getRawData(EN_DATA_KEYS.STYLE_AGGREGATION),
            dataStore.getRawData(EN_DATA_KEYS.ITEM_AGGREGATION),
            studentId,
        );
    }

    /**
     * Resolve a student's "Nachname, Vorname" label from the class records —
     * same format the spider chart is mounted with.
     * @param {string} studentId - Student id
     * @returns {string|null} Display name, or null when the student is unknown
     */
    #resolveDisplayName(studentId) {
        const student = this.getData()?.studentArray?.find((s) => s.studentId === studentId);
        return student ? `${student.lastName}, ${student.firstName}` : null;
    }
}
