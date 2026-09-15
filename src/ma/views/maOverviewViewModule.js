/**
 * MaOverviewViewModule - Composite module for the MA Overview View
 * Manages the overview view with:
 * - KS Distribution chart on the left
 * - Task Ring charts on the right
 *
 * Extends BaseViewModule and follows the modular architecture pattern
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { maKsDistributionConfig } from '@tba3/modules/charts/ma-ks-distribution';
import { taskRingGridConfig } from '@tba3/modules/charts/task-ring-grid';
import { getMaDomains } from '../utils/maDomains.js';
import { MA_DATA_KEYS } from '../maConstants.js';
import './maOverviewViewModule.css';

// Module-specific constants
const CONFIG = {
    ksChartContainerId: 'ma-overview-ksDistribution',
    taskRingContainerId: 'ma-overview-taskRing',
};

export class MaOverviewViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/ma/modules/charts/ksDistribution/maKsDistributionConfig.js').MaKsDistributionHost|null} */
    #ksDistributionModule = null;
    /** @type {import('@tba3/modules/ma/modules/charts/taskRing/taskRingGridConfig.js').TaskRingGridHost|null} */
    #taskRingModule = null;

    /**
     * Creates a new MaOverviewViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('./maLayoutViewBase.js').MAViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Render the overview view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        this.#createDOM();
        this.#setupEventListeners();
        this.#constructModules();
        await this.#hydrateModules();
    }

    /**
     * Creates the DOM structure for the overview view
     */
    #createDOM() {
        const container = this.container;
        if (!container) return;
        container.className = 'ma-overview-view view-base';
        container.innerHTML = `
            <div class="overview-charts-section">
                <div id="${CONFIG.ksChartContainerId}" class="overview-ks-chart-container"></div>
                <div id="${CONFIG.taskRingContainerId}" class="overview-task-ring-chart-container"></div>
            </div>
        `;
    }

    /**
     * Sets up event listeners
     */
    #setupEventListeners() {
        // The ⌀ toggles write the app's comparison state; the KS chart follows it.
        this.observeActiveComparisons((activeModes) => {
            this.#ksDistributionModule?.setActiveModes(activeModes);
        });
    }

    /**
     * Construct all child modules (sync)
     */
    #constructModules() {
        const data = this.getData();
        if (!data) {
            console.warn('MaOverviewViewModule: No data available for charts');
            return;
        }

        // KS Distribution chart
        const ksContainer = this.getContainer(CONFIG.ksChartContainerId, 'KS Distribution');
        if (ksContainer) {
            const ksHost = new ChartHostModule(
                CONFIG.ksChartContainerId,
                ksContainer,
                maKsDistributionConfig,
                {
                    ...this._childOptions(),
                    collapsible: false,
                    isHorizontal: false,
                    // Segment click → the task-ring grid highlights that level's students.
                    onLevelSelected: (level) => this.#taskRingModule?.setKsLevelFilter(level),
                },
            );
            // The constructor returns the bare host; the config binds its verbs onto it at
            // init. Naming the config's host type once here is what lets `tsc` check every
            // verb call, instead of a cast per call.
            this.#ksDistributionModule =
                /** @type {import('@tba3/modules/ma/modules/charts/ksDistribution/maKsDistributionConfig.js').MaKsDistributionHost} */ (
                    ksHost
                );
            this.registerChildModule(this.#ksDistributionModule);
        }

        // Task Ring chart
        const taskRingContainer = this.getContainer(CONFIG.taskRingContainerId, 'Task Ring');
        if (taskRingContainer) {
            const taskRingHost = new ChartHostModule(
                CONFIG.taskRingContainerId,
                taskRingContainer,
                taskRingGridConfig,
                {
                    defaultInnerRingVisible: false,
                    ...this._childOptions(),
                    glossaryKey: 'ma.overview.simple-task-rings',
                },
            );
            this.#taskRingModule =
                /** @type {import('@tba3/modules/ma/modules/charts/taskRing/taskRingGridConfig.js').TaskRingGridHost} */ (
                    taskRingHost
                );
            this.registerChildModule(this.#taskRingModule);
        }
    }

    /**
     * Mount + hydrate both charts (independent, so in parallel).
     * @returns {Promise<void>}
     */
    async #hydrateModules() {
        const data = this.getData();
        const competenceLevels = this.getOption('dataStore').getRawData(
            MA_DATA_KEYS.COMPETENCE_LEVELS_CLASS,
        );

        await this._hydrateChildren([
            [this.#ksDistributionModule, competenceLevels],
            [
                this.#taskRingModule,
                {
                    itemArray: data.itemArray,
                    studentArray: data.studentArray,
                    domains: getMaDomains(this.getOption('dataStore')),
                },
            ],
        ]);
    }

    destroy() {
        this.#ksDistributionModule = null;
        this.#taskRingModule = null;
        super.destroy();
    }
}
