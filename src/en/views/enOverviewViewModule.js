/**
 * EnOverviewViewModule — the EN Überblick view: the scatterplot of student performance
 * above the two GER distribution charts, Hören left and Lesen right.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { enKsDistributionConfig } from '@tba3/modules/charts/en-ks-distribution';
import { scatterplotConfig } from '@tba3/modules/charts/scatterplot';
import { getEnConfig, getEnStyleAverages } from '../enConfig.js';
import { EN_DATA_KEYS } from '../enConstants.js';
import './enOverviewViewModule.css';

// Module-specific constants
const CONFIG = {
    leftChartContainerId: 'en-overview-left-chart',
    scatterplotContainerId: 'en-overview-scatterplot',
    rightChartContainerId: 'en-overview-right-chart',
};

export class EnOverviewViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/en/modules/charts/ksDistribution/enKsDistributionConfig.js').EnKsDistributionHost|null} */
    #leftChartModule = null;
    /** @type {import('@tba3/modules/en/modules/charts/scatterplot/scatterplotConfig.js').ScatterplotHost|null} */
    #scatterplotModule = null;
    /** @type {import('@tba3/modules/en/modules/charts/ksDistribution/enKsDistributionConfig.js').EnKsDistributionHost|null} */
    #rightChartModule = null;
    /** @type {any[]|null} */
    #studentArray = null;
    /** @type {import('../../common/services/dataStore.js').DataStore} */
    #dataStore;

    /**
     * Creates a new EnOverviewViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
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
        this.#dataStore = this.getOption('dataStore');
        this.#studentArray = this.#dataStore.getDataset(EN_DATA_KEYS.STUDENT_RECORDS);
        this.#createDOM();
        this.#setupEventListeners();
        await this.#initializeModules();
    }

    /**
     * Creates the DOM structure for the overview view
     */
    #createDOM() {
        const container = this.container;
        if (!container) return;
        container.className = 'en-overview-view view-base';
        container.innerHTML = `
            <div id="${CONFIG.leftChartContainerId}" class="en-overview-left"></div>
            <div id="${CONFIG.scatterplotContainerId}" class="en-overview-center"></div>
            <div id="${CONFIG.rightChartContainerId}" class="en-overview-right"></div>
        `;
    }

    /**
     * Sets up event listeners for comparison toggle
     */
    #setupEventListeners() {
        // The ⌀ toggles write the app's comparison state; every chart here follows it.
        this.observeActiveComparisons((activeModes) => {
            this.#scatterplotModule?.setActiveModes(activeModes);
            this.#leftChartModule?.setActiveModes(activeModes);
            this.#rightChartModule?.setActiveModes(activeModes);
        });
    }

    /**
     * Initialize all child modules
     * @returns {Promise<void>}
     */
    async #initializeModules() {
        this.#constructModules();
        // Left is the first domain, right the second, whatever ids the payload gives them.
        const [d0, d1] = getEnConfig(this.#dataStore).domainIds;
        await this._hydrateChildren([
            [this.#leftChartModule, this.#ksChartData(d0)],
            // Without student records the scatterplot has nothing to draw.
            [this.#studentArray ? this.#scatterplotModule : null, this.#scatterplotData()],
            [this.#rightChartModule, this.#ksChartData(d1)],
        ]);
    }

    /**
     * Construct all child module instances (no init/render yet)
     */
    #constructModules() {
        const enConfig = getEnConfig(this.getOption('dataStore'));
        const scatterplotContainer = this.getContainer(
            CONFIG.scatterplotContainerId,
            'Scatterplot',
        );
        if (scatterplotContainer) {
            const scatterHost = new ChartHostModule(
                CONFIG.scatterplotContainerId,
                scatterplotContainer,
                scatterplotConfig,
                {
                    ...this._childOptions(),
                    enConfig,
                    domainTitles: (() => {
                        const [d0, d1] = enConfig.domainIds;
                        return { [d0]: enConfig.domainLabels[0], [d1]: enConfig.domainLabels[1] };
                    })(),
                    startZoomed: true,
                    onStudentSelected: (studentId) => this._openStudent(studentId),
                },
            );
            // The constructor returns the bare host; the config binds its verbs onto it at
            // init. Naming the config's host type once here is what lets `tsc` check every
            // verb call, instead of a cast per call.
            this.#scatterplotModule =
                /** @type {import('@tba3/modules/en/modules/charts/scatterplot/scatterplotConfig.js').ScatterplotHost} */ (
                    scatterHost
                );
            this.registerChildModule(this.#scatterplotModule);
        }

        const leftChartContainer = this.getContainer(CONFIG.leftChartContainerId, 'LeftChart');
        if (leftChartContainer) {
            const leftHost = new ChartHostModule(
                CONFIG.leftChartContainerId,
                leftChartContainer,
                enKsDistributionConfig,
                {
                    ...this._childOptions(),
                    glossaryKey: 'en.overview.ks-distribution.h',
                    yAxisSide: 'left',
                    enableSegmentClick: false,
                },
            );
            this.#leftChartModule =
                /** @type {import('@tba3/modules/en/modules/charts/ksDistribution/enKsDistributionConfig.js').EnKsDistributionHost} */ (
                    leftHost
                );
            this.registerChildModule(this.#leftChartModule);
        }

        const rightChartContainer = this.getContainer(CONFIG.rightChartContainerId, 'RightChart');
        if (rightChartContainer) {
            const rightHost = new ChartHostModule(
                CONFIG.rightChartContainerId,
                rightChartContainer,
                enKsDistributionConfig,
                {
                    ...this._childOptions(),
                    glossaryKey: 'en.overview.ks-distribution.l',
                    yAxisSide: 'right',
                    enableSegmentClick: false,
                },
            );
            this.#rightChartModule =
                /** @type {import('@tba3/modules/en/modules/charts/ksDistribution/enKsDistributionConfig.js').EnKsDistributionHost} */ (
                    rightHost
                );
            this.registerChildModule(this.#rightChartModule);
        }
    }

    #scatterplotData() {
        return {
            studentArray: this.#studentArray,
            styleAverages: getEnStyleAverages(this.getOption('dataStore')),
        };
    }

    /**
     * @param {string} domainId - The domain whose competence-level rows the chart shows.
     * @returns {Array<object>} The competence-level rows the KS distribution host aggregates for that domain.
     */
    #ksChartData(domainId) {
        return this.#dataStore
            .getRawData(EN_DATA_KEYS.COMPETENCE_LEVELS_CLASS)
            .filter((entry) => entry.domain?.id === domainId);
    }
}
