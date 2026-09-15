/**
 * MaStudentViewModule — the MA Schüler:in view: selector and info table in a
 * full-width top bar, the data table left, the task-ring charts right.
 *
 * Extends MaLayoutViewBase for the layout-mode switching both MA views share.
 */

import { MaLayoutViewBase } from './maLayoutViewBase.js';
import { getMaDomains } from '../utils/maDomains.js';
import { createPlaceholder } from '@tba3/module-base';
import {
    remountChartHost,
    taskRingGridConfig,
    updateTaskRingHostIfReusable,
} from '@tba3/modules/charts/task-ring-grid';
import { MaStudentTablesModule } from '../modules/maStudentTables/maStudentTablesModule.js';
import { MaStudentTopBarModule } from '../modules/maStudentTopBar/maStudentTopBarModule.js';
import './maStudentViewModule.css';

// Module-specific constants
const CONFIG = {
    chartContainerId: 'student-taskRing',
    focusChartContainerId: 'student-taskRingFocus',
    delays: {
        cleanup: 50,
    },
};

export class MaStudentViewModule extends MaLayoutViewBase {
    /** @type {string|null} */
    #currentStudentId = null;
    /** @type {MaStudentTablesModule|null} */
    #studentTableModule = null;
    /** @type {MaStudentTopBarModule|null} */
    #topBarModule = null;
    /** @type {import('@tba3/modules/common/charts/host/chartHostModule.js').ChartHostModule|null} */
    #taskRingGridModule = null;
    #chartsCreationInProgress = false;
    /** @type {string|null} */
    #pendingStudentId = null;

    /**
     * Creates a new MaStudentViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('./maLayoutViewBase.js').MAViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(
            id,
            container,
            /** @type {import('./maLayoutViewBase.js').MAViewModuleOptions} */ ({
                ...options,
                focusGlossaryKey: 'ma.student.task-ring-focus',
            }),
        );
    }

    /**
     * Get layout configuration for the base class
     * @override
     * @returns {import('./maLayoutViewBase.js').LayoutConfig} The class names and container ids this view's scaffold is built from.
     * @protected
     */
    _getLayoutConfig() {
        return {
            focusChartContainerId: CONFIG.focusChartContainerId,
            contentContainerSelector: '.student-view-content',
        };
    }

    /**
     * Render the student view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        this.#createDOM();
        this.#setupEventListeners();
        await this.#initializeAllModules();
    }

    /**
     * Creates the DOM structure for the student view
     */
    #createDOM() {
        this._renderTaskRingSplitView({
            viewClassName: 'ma-student-view',
            outerWrapperClassName: 'student-view-shell',
            topChildren: [createPlaceholder('student-top-bar', 'student-top-bar-container')],
            contentClassName: 'student-view-content',
            leftSectionClassName: 'student-table-section',
            leftSectionChildren: [
                createPlaceholder('student-tables-wrapper', 'student-tables-wrapper'),
            ],
            chartContainerId: CONFIG.chartContainerId,
            chartOnlyContainerId: `${CONFIG.chartContainerId}-chart-only`,
            focusChartContainerId: CONFIG.focusChartContainerId,
            chartOnlyContainerClassName: 'student-chart-only-content',
        });
    }

    /**
     * Sets up event listeners
     */
    #setupEventListeners() {
        // Use base class layout event listeners
        this._setupLayoutEventListeners();

        // Student selection is app state: the header selector, the class table
        // and this view's own top bar write it. A change that lands while this
        // view is hidden is delivered on resume.
        this.observeState('currentStudentId', (studentId) => {
            if (!studentId || studentId === this.#currentStudentId) return;
            // setStudent is a no-op when the top bar was the source (same id).
            void this.#topBarModule?.setStudent(studentId).catch((error) => {
                console.error('MaStudentViewModule: Error syncing top bar student:', error);
            });
            this.#updateStudent(studentId);
        });
    }

    // ========================================================================
    // LAYOUT MODE HOOKS (Override base class)
    // ========================================================================

    /**
     * Hook called when chart-only mode is entered
     * @override
     * @protected
     */
    _onChartOnlyModeEntered() {
        if (this.#currentStudentId) {
            this.#createChartOnlyView().catch((error) => {
                console.error('MaStudentViewModule: Error creating chart-only view:', error);
            });
        }
    }

    /**
     * Hook called when domain is selected in chart-only mode
     * Override to use current student data
     * @override
     * @param {object} domain - Selected domain
     * @protected
     */
    _onDomainSelectedInChartOnly(domain) {
        const data = this.getData();
        if (!this.#currentStudentId || !data) return;

        this._createFocusChart(domain, [this.#currentStudentId]);
    }

    /**
     * The student tables module.
     * @override
     * @returns {object|null} The student tables module
     * @protected
     */
    _getLayoutTableModule() {
        return this.#studentTableModule ?? null;
    }

    /**
     * Initialize all modules after DOM is ready
     * @returns {Promise<void>}
     */
    async #initializeAllModules() {
        const data = this.getData();
        if (!data) {
            console.warn('MaStudentViewModule: No data available');
            return;
        }

        if (!data.studentArray || !data.rawStudentArray) {
            console.warn('MaStudentViewModule: Missing student data');
            return;
        }

        const firstStudentId =
            this.options.appState?.getStateValue('currentStudentId') ||
            data.studentArray[0]?.studentId;
        const moduleData = {
            studentArray: data.studentArray,
            rawStudentArray: data.rawStudentArray,
            studentId: firstStudentId,
            totalItems: data.itemArray?.length || 0,
        };
        this.#constructTopBarModule(data);
        this.#constructStudentTableModule();

        await this._hydrateChildren([
            [this.#topBarModule, moduleData],
            [this.#studentTableModule, moduleData],
        ]);

        // Create charts for the first student
        if (this.#studentTableModule && firstStudentId) {
            this.#currentStudentId = firstStudentId;
            await this.#createSingleStudentCharts(firstStudentId);
        }
    }

    /**
     * Construct the top bar module (student selector and info table)
     * @param {object} data - App data
     */
    #constructTopBarModule(data) {
        const container = this.container;
        if (!container) return;
        const topBarContainer = /** @type {HTMLElement|null} */ (
            container.querySelector('#student-top-bar')
        );
        if (!topBarContainer) return;

        this.#topBarModule = new MaStudentTopBarModule('student-top-bar', topBarContainer, {
            ...this._childOptions(),
            totalItems: data.itemArray?.length || 0,
            sortByName: true,
            onStudentSelected: (studentId) =>
                this.options.appState?.updateState({ currentStudentId: studentId }),
        });
    }

    /**
     * Construct the student tables module
     */
    #constructStudentTableModule() {
        const container = this.container;
        if (!container) return;
        const wrapperContainer = /** @type {HTMLElement|null} */ (
            container.querySelector('#student-tables-wrapper')
        );
        if (!wrapperContainer) {
            console.warn('MaStudentViewModule: Wrapper container not found');
            return;
        }

        this.#studentTableModule = new MaStudentTablesModule(
            'student-view-module',
            /** @type {HTMLElement} */ (wrapperContainer),
            {
                ...this._childOptions(),
                showModuleTitle: true,
                glossaryKey: 'ma.student.student-item-table',
                onSelectionChanged: (studentId) => {
                    this.#currentStudentId = studentId;
                    this.#createSingleStudentCharts(studentId);
                    void this.#syncChartOnlyStudentSelection(studentId).catch((error) => {
                        console.error(
                            'MaStudentViewModule: Error syncing chart-only student selection:',
                            error,
                        );
                    });
                },
            },
        );
    }

    /**
     * Update student (called when student selection changes)
     * @param {string} studentId - New student ID
     */
    #updateStudent(studentId) {
        if (!this.#studentTableModule) {
            this.#currentStudentId = studentId;
            return;
        }

        // Update student in the table module (which will trigger onSelectionChanged callback)
        this.#studentTableModule.setSelectedStudentId(studentId);
    }

    /**
     * Creates charts for the selected student from the app payload as it is now: a
     * selection callback or a queued retry must not draw the records it was set up with.
     * @param {string} studentId - Student ID
     */
    async #createSingleStudentCharts(studentId) {
        const { itemArray, studentArray } = this.getData() ?? {};
        if (!studentId || !itemArray || !studentArray) {
            console.warn('MaStudentViewModule: Missing data for chart creation');
            return;
        }

        const chartData = {
            itemArray,
            studentArray,
            domains: getMaDomains(this.getOption('dataStore')),
            selectedStudents: [studentId],
        };

        if (this.#chartsCreationInProgress) {
            this.#pendingStudentId = studentId;
            return;
        }

        this.#chartsCreationInProgress = true;
        this.#pendingStudentId = null;

        try {
            const result = await remountChartHost({
                owner: this,
                module: this.#taskRingGridModule,
                data: chartData,
                containerId: CONFIG.chartContainerId,
                config: taskRingGridConfig,
                reuseProbe: updateTaskRingHostIfReusable,
                cleanupDelay: CONFIG.delays.cleanup,
                hasPendingRequest: () =>
                    this.#pendingStudentId && this.#pendingStudentId !== studentId,
                moduleOptions: {
                    ...this._childOptions(),
                    glossaryKey: 'ma.student.item-donuts',
                },
            });
            this.#taskRingGridModule = result.module;
        } finally {
            this.#chartsCreationInProgress = false;

            // Process pending request if any
            if (this.#pendingStudentId) {
                const pending = this.#pendingStudentId;
                this.#pendingStudentId = null;
                this.#createSingleStudentCharts(pending);
            }
        }
    }

    async #syncChartOnlyStudentSelection(schuelerId) {
        if (!this._taskRingChartOnlyModule?.initialized) {
            return;
        }

        this._taskRingChartOnlyModule.updateSelectedStudentsOptimized([schuelerId]);

        if (this.currentLayoutMode !== 'chart-only') {
            return;
        }

        const selectedDomainId = this._taskRingChartOnlyModule.getSelectedDomain();
        const domain = selectedDomainId
            ? (getMaDomains(this.getOption('dataStore')).find(
                  (entry) => entry.domain === selectedDomainId,
              ) ?? null)
            : null;

        await this._createFocusChart(domain, [schuelerId]);
    }

    /**
     * Creates chart-only view
     */
    async #createChartOnlyView() {
        const data = this.getData();
        if (!this.#currentStudentId || !data?.itemArray || !data?.studentArray) return;

        const domains = getMaDomains(this.getOption('dataStore'));

        // Set flag to prevent duplicate render from domain selection event
        this._chartOnlyInitializing = true;

        try {
            // Create task ring grid for chart-only mode using base class method
            await this._createTaskRingGridForChartOnly({
                containerId: `${CONFIG.chartContainerId}-chart-only`,
                domains: domains,
                selectedStudents: [this.#currentStudentId],
            });

            // Create focus chart using base class method
            await this._createFocusChart(null, [this.#currentStudentId]);
        } finally {
            // Clear flag after initialization completes
            this._chartOnlyInitializing = false;
        }
    }
}
