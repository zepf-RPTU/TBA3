/**
 * SlWelcomeViewModule — the SL landing view.
 *
 * Two modules side by side, placed directly in the view with no wrapper: the
 * competency distribution chart, and the InfoBox analysis text.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { competencyChartConfig } from '@tba3/modules/charts/competency-overview';
import { InfoBoxModule } from '@tba3/modules/info-box';
import { SL_DATA_KEYS } from '../slDataKeys.js';
import { slDataFromStore } from '../slDataPort.js';

// Module-specific constants
const CONFIG = {
    chartId: 'sl-welcome-chart',
    textId: 'sl-welcome-text',
};

export class SlWelcomeViewModule extends BaseViewModule {
    /** @type {ChartHostModule|null} */
    #chartModule = null;
    /** @type {InfoBoxModule|null} */
    #textModule = null;

    /**
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    /** @override */
    async _renderView(_data = {}) {
        this.#createDOM();
        await this.#initializeModules();
    }

    // ─── DOM ────────────────────────────────────────────────────────────────

    /**
     * Creates the DOM structure — a `.welcome-charts-row` with dedicated
     * placeholders for the chart and text cards.
     */
    #createDOM() {
        const container = this.container;
        if (!container) {
            return;
        }
        container.className = 'sl-welcome-view view-base';
        container.innerHTML = '';

        const row = document.createElement('div');
        row.className = 'sl-charts-row welcome-charts-row';

        row.insertAdjacentHTML(
            'beforeend',
            `<div class="sl-charts-row-card sl-charts-row-card--chart welcome-chart-card" id="${CONFIG.chartId}"></div>`,
        );
        row.insertAdjacentHTML(
            'beforeend',
            `<div class="sl-charts-row-card sl-charts-row-card--text welcome-text-card" id="${CONFIG.textId}"></div>`,
        );

        container.appendChild(row);
    }

    // ─── Child modules ──────────────────────────────────────────────────────

    async #initializeModules() {
        const dataStore = this.getOption('dataStore');
        const competenceLevels = dataStore?.getRawData(SL_DATA_KEYS.COMPETENCE_LEVELS);

        if (!competenceLevels?.length) {
            console.warn('SlWelcomeViewModule: No competence-levels data in DataStore');
            return;
        }

        const chartData = { competenceLevels };

        const moduleOpts = this._childOptions();

        this.#chartModule = new ChartHostModule(
            CONFIG.chartId,
            CONFIG.chartId,
            competencyChartConfig,
            {
                ...moduleOpts,
                glossaryKey: 'sl.welcome.overview',
                showModuleTitle: true,
            },
        );
        this.#textModule = new InfoBoxModule(CONFIG.textId, CONFIG.textId, {
            ...moduleOpts,
            title: 'Entwicklungspotentiale',
            boxKey: 'welcome',
            slData: slDataFromStore(dataStore),
        });

        await this._hydrateChildren([[this.#chartModule, chartData], [this.#textModule]]);
    }
}
