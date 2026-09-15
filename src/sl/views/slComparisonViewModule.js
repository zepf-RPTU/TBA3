/**
 * SlComparisonViewModule — the SL Vergleich view: the group comparison chart with its
 * title and description.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { groupComparisonConfig } from '@tba3/modules/charts/group-comparison';
import { buildComparisonInfoBoxSummaryNamespace, InfoBoxModule } from '@tba3/modules/info-box';
import { slDataFromStore } from '../slDataPort.js';
import { SL_DATA_KEYS } from '../slDataKeys.js';
import './slComparisonViewModule.css';

// Module-specific constants
const CONFIG = {
    groupComparisonContainerId: 'sl-comparison-group-chart',
    textId: 'sl-comparison-text',
};

/**
 * Which info-box entry describes the comparison currently on screen — the measure family
 * decides the wording, so the key follows `metricMode` rather than the chart type.
 * @param {Record<string, any>|null} [summary] - The comparison summary.
 * @returns {string|null} The info-box key, or `null` when the summary names no known family.
 */
function resolveComparisonInfoBoxKey(summary = null) {
    const metricMode =
        typeof summary?.metricMode === 'string' ? summary.metricMode.trim().toLowerCase() : '';

    if (metricMode === 'competency') {
        return 'comparisonCompetency';
    }

    if (metricMode === 'rating') {
        return 'comparisonRating';
    }

    if (metricMode === 'points') {
        return 'comparisonPoints';
    }

    return 'comparison';
}

export class SlComparisonViewModule extends BaseViewModule {
    /** @type {ChartHostModule|null} */
    #groupComparisonModule = null;
    /** @type {InfoBoxModule|null} */
    #textModule = null;
    /** @type {Record<string, any>|null} */
    #latestComparisonSummary = null;

    /**
     * Creates a new SlComparisonViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Render the comparison view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        // Create DOM structure
        this.#createDOM();

        // Initialize all child modules
        await this.#initializeModules();
    }

    /**
     * Creates the DOM structure for the comparison view
     */
    #createDOM() {
        const container = this.container;
        if (!container) {
            return;
        }
        container.className = 'sl-comparison-view view-base';
        container.innerHTML = '';

        const section = document.createElement('div');
        section.className = 'view-section comparison-section';

        const row = document.createElement('div');
        row.className = 'sl-charts-row comparison-charts-row';

        row.insertAdjacentHTML(
            'beforeend',
            `<div class="sl-charts-row-card sl-charts-row-card--chart comparison-chart-card" id="${CONFIG.groupComparisonContainerId}"></div>`,
        );
        row.insertAdjacentHTML(
            'beforeend',
            `<div class="sl-charts-row-card sl-charts-row-card--text comparison-text-card" id="${CONFIG.textId}"></div>`,
        );

        section.appendChild(row);
        container.appendChild(section);
    }

    /**
     * Initialize all child modules
     * @returns {Promise<void>}
     */
    async #initializeModules() {
        const moduleOpts = {
            ...this._childOptions(),
            onComparisonSummaryChanged: (summary) => this.#handleComparisonSummaryChanged(summary),
        };

        const chartData = await this.#initializeGroupComparisonModule(moduleOpts);
        this.#initText(moduleOpts);

        // Two batches: the chart's first render fires onComparisonSummaryChanged,
        // which updates the text module — so the text must be live before then.
        await this._hydrateChildren([[this.#textModule, this.#getTextModuleData()]]);
        await this._hydrateChildren([[chartData ? this.#groupComparisonModule : null, chartData]]);

        if (this.#groupComparisonModule && chartData) {
            this.#latestComparisonSummary =
                this.#groupComparisonModule.chart?.getCurrentSummary?.() ??
                this.#latestComparisonSummary;
        }

        await this.#applyComparisonSummaryToText();
    }

    /**
     * Initialize the group comparison chart module
     * @param {object} opts - Options shared by this view's child modules.
     * @returns {Promise<object|null>} The created module, or `null` when its container is not in the DOM.
     */
    async #initializeGroupComparisonModule(opts) {
        // Verify container exists (getContainer logs warning if missing)
        if (!this.getContainer(CONFIG.groupComparisonContainerId, 'GroupComparison')) return null;

        const dataStore = this.getOption('dataStore');

        this.#groupComparisonModule = new ChartHostModule(
            CONFIG.groupComparisonContainerId,
            CONFIG.groupComparisonContainerId,
            groupComparisonConfig,
            opts,
        );
        this.#groupComparisonModule.mount();

        const domainResults = dataStore?.getDataset(SL_DATA_KEYS.DOMAIN_RESULTS);
        const comparisonSP = dataStore?.getDataset(SL_DATA_KEYS.COMPARISON_SELF_EFFICACY);
        const comparisonTQ = dataStore?.getDataset(SL_DATA_KEYS.COMPARISON_TEACHING_QUALITY);

        return {
            domainResults,
            comparisonSP,
            comparisonTQ,
            comparisonPoints: dataStore?.getDataset(SL_DATA_KEYS.COMPARISON_POINTS) ?? null,
        };
    }

    #initText(opts) {
        this.#textModule = new InfoBoxModule(CONFIG.textId, CONFIG.textId, {
            ...opts,
            slData: slDataFromStore(this.getOption('dataStore')),
            glossaryKey: 'sl.comparison.results',
        });
        this.#textModule.mount(this.#getTextModuleData());
    }

    #getTextModuleData() {
        return {
            boxKey: resolveComparisonInfoBoxKey(this.#latestComparisonSummary),
            placeholderContext: {
                summaries: {
                    comparison: buildComparisonInfoBoxSummaryNamespace(
                        this.#latestComparisonSummary,
                    ),
                },
            },
        };
    }

    #handleComparisonSummaryChanged(summary) {
        this.#latestComparisonSummary = summary ?? null;
        if (!this.#textModule) {
            return;
        }

        void this.#applyComparisonSummaryToText();
    }

    async #applyComparisonSummaryToText() {
        if (!this.#textModule || !this.#latestComparisonSummary) {
            return;
        }

        await this.#textModule.update(this.#getTextModuleData());
    }
}
