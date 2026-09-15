/**
 * EnClassViewModule — the EN Klasse view: the aggregate style chart beside the
 * filterable class table, whose header hosts the scatterplot-search button that opens
 * the student-selection modal.
 *
 * Observes `currentMode` and `comparisonState`; wires the table's `onDataSync` to the
 * style chart's `applySync`.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { resolveGlossaryTutorial } from '../../common/modules/tutorial/glossaryTutorial.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { ScatterplotFilterModule } from '@tba3/modules/charts/scatterplot';
import { styleChartConfig } from '@tba3/modules/charts/style';
import { TERM_CONSTANTS } from '@tba3/modules/domain';
import { EnClassTableModule, SCATTER_SEARCH_BUTTON_SELECTOR } from '@tba3/modules/tables/en-class';
import { EN_DATA_KEYS } from '../enConstants.js';
import { getEnConfig, getEnStyleAverages } from '../enConfig.js';
import { createIdStore } from '../utils/enIdStore.js';
import './enClassViewModule.css';

// Module-specific constants
const CONFIG = {
    spiderChartContainerId: 'en-class-spider-chart',
    classTableContainerId: 'en-class-table',
};

export class EnClassViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/en/modules/charts/style/styleChartConfig.js').StyleChartHost|null} */
    #chartModule = null;
    /** @type {EnClassTableModule|null} */
    #classTableModule = null;
    /** @type {{studentArray: any[]}|null} */
    #allStudentData = null; // Store original unfiltered data
    /**
     * Id-indexed student records shared by this view's table (writer) and style
     * chart (reader), so the table → chart sync can carry studentId arrays alone.
     * Owned by the view and passed through options, so it dies with the view rather
     * than outliving it.
     * @type {ReturnType<typeof createIdStore>}
     */
    #studentStore = createIdStore('studentId');

    // Filter state
    /** @type {ScatterplotFilterModule|null} */
    #filterModal = null;
    #selectedStudentIds = new Set();
    #isFilterActive = false;

    /**
     * Creates a new EnClassViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Render the class view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        const dataStore = this.getOption('dataStore');
        const studentArray = dataStore.getDataset(EN_DATA_KEYS.STUDENT_RECORDS);
        this.#allStudentData = { studentArray };

        this.#createDOM();
        this.#setupEventListeners();
        await this.#initializeModules();
    }

    /**
     * declare, both about the student filter:
     * - `en.class.filter` anchors to the scatter-search button in the class
     *   table's toolbar, which belongs to no module of its own;
     * - `en.class.scatterplot` describes the selection modal, which is closed
     *   while the tour runs, so it has no usable anchor and shows centered.
     * Everything else on this view (header, lollipop, class table) derives.
     * @override
     * @param {Array<import('../../common/modules/tutorial/tutorialController.js').TourStep>} steps - The steps derived from the view's modules.
     * @returns {Array<import('../../common/modules/tutorial/tutorialController.js').TourStep>} The same steps plus the two anchored by hand.
     */
    customizeTourSteps(steps) {
        const glossaryData = this.getOption('glossaryData');
        const tableEl = () => this.#classTableModule?.element ?? null;

        // The modal step carries no `getAnchor` at all: it is centered on
        // purpose, and a null-returning resolver would read as a lost anchor.
        const extras = [
            {
                path: 'en.class.filter',
                getAnchor: () => tableEl()?.querySelector(SCATTER_SEARCH_BUTTON_SELECTOR) ?? null,
            },
            { path: 'en.class.scatterplot' },
        ].flatMap(({ path, getAnchor }) => {
            const tutorial = resolveGlossaryTutorial(glossaryData, path);
            return tutorial ? [{ getAnchor, title: tutorial.title, html: tutorial.html }] : [];
        });

        return [...steps, ...extras];
    }

    /**
     * Creates the DOM structure for the class view
     */
    #createDOM() {
        const container = this.container;
        if (!container) return;
        container.className = 'en-class-view view-base';
        container.innerHTML = `
            <div class="chart-section" id="${CONFIG.spiderChartContainerId}"></div>
            <div class="table-section" id="${CONFIG.classTableContainerId}"></div>
        `;
    }

    /**
     * Sets up event listeners for comparison toggle and mode changes
     * Broadcasts events to children via view-mediated broadcasting
     */
    #setupEventListeners() {
        // The ⌀ toggles write the app's comparison state; the style chart follows it.
        this.observeActiveComparisons((activeModes) => {
            this.#chartModule?.setActiveModes(activeModes);
        });

        // The header's Domäne switch writes app state; push it to the table, whose
        // sync carries the mode on to the style chart.
        this.observeState('currentMode', (mode) => {
            this.#classTableModule?.setState({ mode });
        });
    }

    /**
     * Initialize all child modules
     * @returns {Promise<void>}
     */
    async #initializeModules() {
        this.#constructModules();

        const studentArray = this.#allStudentData?.studentArray || [];
        const hasStudents = studentArray.length > 0;
        if (this.#chartModule && !hasStudents) {
            this.#chartModule.mount();
            const chartContainer = this.#chartModule.container;
            if (chartContainer) {
                // The same empty state the style chart itself shows once mounted.
                chartContainer.innerHTML = `<div class="chart-empty-state">Keine ${TERM_CONSTANTS.STUDENTS}-Daten verfügbar</div>`;
            }
        }

        // Two batches: in lollipop mode the style chart defers its render to the
        // table's first sync, so it must be prepared before the table hydrates.
        await this._hydrateChildren([
            [
                hasStudents ? this.#chartModule : null,
                {
                    studentData: studentArray,
                    displayName: 'Klassenübersicht',
                    useWidth: true,
                },
            ],
        ]);
        await this._hydrateChildren([[this.#classTableModule, { studentArray }]]);
    }

    /**
     * Construct all child module instances (no init/render yet).
     * Children are seeded with the current Domäne mode; afterwards the table
     * follows it through the observer and the chart through the table's sync
     * (withDomainMode defaults a missing value to 'all').
     */
    #constructModules() {
        const domainMode = this.options.appState?.getStateValue('currentMode');
        const chartContainer = this.getContainer(CONFIG.spiderChartContainerId, 'Spider Chart');
        if (chartContainer) {
            const spiderHost = new ChartHostModule(
                CONFIG.spiderChartContainerId,
                chartContainer,
                styleChartConfig,
                {
                    ...this._childOptions(),
                    showModuleTitle: true,
                    glossaryKey: 'en.class.lollipop',
                    enConfig: getEnConfig(this.getOption('dataStore')),
                    styleAverages: getEnStyleAverages(this.getOption('dataStore')),
                    domainMode,
                    studentStore: this.#studentStore,
                },
            );
            // The constructor returns the bare host; `styleChartConfig` binds its verbs
            // onto it at init. Naming the config's host type once here is what lets `tsc`
            // check every verb call below, instead of a cast per call.
            this.#chartModule =
                /** @type {import('@tba3/modules/en/modules/charts/style/styleChartConfig.js').StyleChartHost} */ (
                    spiderHost
                );
            this.registerChildModule(this.#chartModule);
        }

        const tableContainer = this.getContainer(CONFIG.classTableContainerId, 'Class Table');
        if (tableContainer) {
            this.#classTableModule = new EnClassTableModule(
                CONFIG.classTableContainerId,
                tableContainer,
                {
                    ...this._childOptions(),
                    glossaryKey: 'en.class.class-table',
                    enConfig: getEnConfig(this.getOption('dataStore')),
                    domainMode,
                    showModuleTitle: true,
                    onOpenScatterSearch: () => this.#openFilterModal(),
                    onScatterFilterReset: () => this.#handleScatterFilterReset(),
                    onDataSync: (data) => this.#chartModule?.applySync(data),
                    onStudentSelected: (studentId) => this._openStudent(studentId),
                    studentStore: this.#studentStore,
                },
            );
            this.registerChildModule(this.#classTableModule);
        }
    }

    /**
     * Open the scatterplot filter modal
     */
    async #openFilterModal() {
        const studentArray = this.#allStudentData?.studentArray || [];

        // Create modal if it doesn't exist
        if (!this.#filterModal) {
            this.#filterModal = new ScatterplotFilterModule(
                'class-scatterplot-filter',
                document.body,
                {
                    ...this._childOptions(),
                    classId: this.getOption('currentClassId'),
                    enConfig: getEnConfig(this.getOption('dataStore')),
                    styleAverages: getEnStyleAverages(this.getOption('dataStore')),
                    studentArray,
                    selectedStudentIds: this.#selectedStudentIds,
                    onConfirm: (selectedIds) => this.#handleFilterConfirm(selectedIds),
                },
            );
            // NOT registered as child module — modals must not reopen when the
            // parent view's show() propagates to children on view switch.
            // Lifecycle is managed explicitly: created lazily here, destroyed in clear().
        } else {
            // Update modal data
            await this.#filterModal.update({
                studentArray,
                selectedStudentIds: this.#selectedStudentIds,
            });
        }

        // Show modal
        await this.#filterModal.show();
    }

    /**
     * Handle filter confirmation
     * @param {Set<string>} selectedIds - Set of selected student IDs
     */
    #handleFilterConfirm(selectedIds) {
        this.#selectedStudentIds = new Set(selectedIds);
        this.#isFilterActive = selectedIds.size > 0;

        // Apply filter to table
        if (this.#isFilterActive) {
            this.#handleFilterApplied(this.#selectedStudentIds);
        } else {
            this.#handleFilterCleared();
        }
    }

    /**
     * Handle filter applied - update table to show only selected students
     * @param {Iterable<string>} studentIds - Selected student IDs to keep visible
     */
    #handleFilterApplied(studentIds) {
        if (!this.#classTableModule || !studentIds) return;

        this.#classTableModule.applyExternalStudentFilter(studentIds);
    }

    /**
     * Handle filter cleared - restore full table
     */
    #handleFilterCleared() {
        if (!this.#classTableModule) return;

        this.#classTableModule.clearExternalStudentFilter();
    }

    /**
     * Reset selection state when the class table's Reset button clears the
     * scatterplot filter. The table has already cleared its own filter, so the
     * view only needs to drop its selection so a later modal open starts fresh.
     */
    #handleScatterFilterReset() {
        this.#selectedStudentIds.clear();
        this.#isFilterActive = false;
    }

    /**
     * @override
     */
    destroy() {
        // #filterModal is lazily created and not registered as a child module
        if (this.#filterModal) {
            this.#filterModal.destroy();
            this.#filterModal = null;
        }
        super.destroy();
    }
}
