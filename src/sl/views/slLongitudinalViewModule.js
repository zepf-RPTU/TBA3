/**
 * SlLongitudinalViewModule — the SL "Entwicklung" view.
 *
 * Three independent chart hosts: Unterrichtsqualität, Selbstwirksamkeit and the
 * KS-Verteilung. Only a chart whose source data is present is created at all.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import {
    convertDomainToTimeline,
    convertSelfEfficacyToTimeline,
    convertTeachingQualityToTimeline,
    ParallelCoordinatesChart,
    selfEfficacyLongConfig,
    slKsDistributionConfig,
    teachingQualityConfig,
} from '@tba3/modules/charts/longitudinal';
import { detectHistorySurveyScales } from '@tba3/modules/sl-domain';
import { buildDomainOptions, groupDomainResultsBySubjectDomain } from '../utils/slDomainResults.js';
import { SL_DATA_KEYS } from '../slDataKeys.js';
import './slLongitudinalViewModule.css';

// Module-specific constants
const CONFIG = {
    teachingQualityId: 'sl-long-teaching-quality',
    selfEfficacyId: 'sl-long-self-efficacy',
    ksDistributionId: 'sl-long-ks-distribution',
};

/**
 * The largest share any of the three parallel-coordinate cards can show, over every
 * Bereich, rounded up to the axis tick. `null` when there is nothing to show.
 * @param {{domainArray: Array, history: Array}} chartData - The view's shared payload.
 * @returns {number|null} The shared y maximum in percent.
 */
function computeSharedYMax(chartData) {
    const timelines = [
        convertSelfEfficacyToTimeline(chartData.history),
        ...(chartData.domainArray ?? []).flatMap((domainGroup) => [
            convertDomainToTimeline(domainGroup, chartData.history),
            convertTeachingQualityToTimeline(domainGroup, chartData.history),
        ]),
    ];
    let max = 0;
    for (const timeline of timelines) {
        for (const entry of timeline) {
            for (const value of Object.values(entry.categories ?? {})) {
                if (Number.isFinite(value) && value > max) max = value;
            }
        }
    }
    if (max <= 0) return null;
    const step = ParallelCoordinatesChart.TICK_INTERVAL;
    return Math.ceil(max / step) * step;
}

export class SlLongitudinalViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/sl/modules/charts/longitudinal/teachingQualityConfig.js').TeachingQualityHost|null} */
    #teachingQualityModule = null;
    /** @type {import('@tba3/modules/sl/modules/charts/longitudinal/selfEfficacyLongConfig.js').SelfEfficacyLongHost|null} */
    #selfEfficacyModule = null;
    /** @type {import('@tba3/modules/sl/modules/charts/longitudinal/longitudinalKsShareConfig.js').LongitudinalKsShareHost|null} */
    #ksDistributionModule = null;

    #domainOptions = [];
    #selectedDomainIndex = 0;
    #isStacked = false;
    #chartType = 'parallel'; // 'parallel' or 'boxplot'

    // Track which data slices are available (controls which charts are shown)
    #hasTeachingQuality = false;
    #hasSelfEfficacy = false;
    #hasDomainData = false;

    /**
     * Creates a new SlLongitudinalViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Override show() to re-apply boxplot-mode visibility after the base class
     * unconditionally shows all registered child modules.
     *
     * BaseModule.show() cascades show() to every registered child by design.
     * Re-hiding #selfEfficacyModule here runs in the same synchronous task, so
     * the intermediate (wrongly-visible) state is never painted. Repairing it
     * owner-side is deliberate: the alternative is reworking BaseModule.show()
     * for one view's mode-dependent child.
     * @override
     */
    show() {
        super.show();
        // If we were in boxplot mode before navigating away, the base show() will
        // have re-shown #selfEfficacyModule. Re-hide it to match the persisted state.
        this.#applyChartTypeLayout();
    }

    /**
     * Render the longitudinal view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        this.#detectAvailableData();

        // Build chart data once and cache for this render cycle
        const chartData = this.#getChartData();
        this.#domainOptions = buildDomainOptions(chartData.domainResults);

        // Push domain options + data availability into app state so the header
        // controls' injectState (slHeaderControls.js) populates them correctly
        // on the next header render
        this.#syncStateToApp();

        // Create DOM structure (empty chart containers)
        this.#createDOM();

        // Create and init child chart host modules
        await this.#initializeModules(chartData);
        this.#observeHeaderState();
    }

    // ─── DOM ────────────────────────────────────────────────────────────────

    /**
     * Creates the DOM structure — a `.longitudinal-charts-row` with one
     * chart-card placeholder per available data slice.
     */
    #createDOM() {
        const container = this.container;
        if (!container) {
            return;
        }
        container.className = 'sl-longitudinal-view view-base';
        container.innerHTML = '';

        const chartsRow = document.createElement('div');
        chartsRow.className = 'sl-charts-row longitudinal-charts-row';

        if (this.#hasTeachingQuality) {
            chartsRow.insertAdjacentHTML(
                'beforeend',
                `<div class="longitudinal-chart-card" id="${CONFIG.teachingQualityId}"></div>`,
            );
        }
        if (this.#hasSelfEfficacy) {
            chartsRow.insertAdjacentHTML(
                'beforeend',
                `<div class="longitudinal-chart-card" id="${CONFIG.selfEfficacyId}"></div>`,
            );
        }
        if (this.#hasDomainData) {
            chartsRow.insertAdjacentHTML(
                'beforeend',
                `<div class="longitudinal-chart-card" id="${CONFIG.ksDistributionId}"></div>`,
            );
        }

        container.appendChild(chartsRow);
    }

    // ─── State synchronisation ──────────────────────────────────────────────

    /**
     * Push local data-derived state into the app so the declarative header
     * controls can be populated via their injectState (slHeaderControls.js).
     */
    #syncStateToApp() {
        const appState = this.options.appState;
        if (!appState) return;

        // Data availability is deliberately not published here: the header reads it off
        // the DataStore itself, so it is answerable before this view has ever rendered.
        appState.updateState({
            domainOptions: this.#domainOptions,
            selectedDomainIndex: this.#selectedDomainIndex,
            longitudinalViewMode: this.#isStacked ? 'stacked' : 'normal',
            longitudinalChartType: this.#chartType,
        });
    }

    // ─── State observers (the declarative header controls write app state) ──

    /**
     * Observe the header controls' state keys and push each value to the
     * chart hosts that draw it.
     */
    #observeHeaderState() {
        this.observeState('selectedDomainIndex', (index) => {
            this.#selectedDomainIndex = index;
            this.#teachingQualityModule?.setDomainIndex(index);
            this.#ksDistributionModule?.setDomainIndex(index);
        });

        this.observeState('longitudinalViewMode', (viewMode) => {
            const isStacked = viewMode === 'stacked';
            this.#isStacked = isStacked;
            this.#teachingQualityModule?.setStacked(isStacked);
            this.#selfEfficacyModule?.setStacked(isStacked);
            this.#ksDistributionModule?.setStacked(isStacked);
        });

        this.observeState('longitudinalChartType', (chartType) => {
            this.#syncChartTypeToChildren(chartType);
        });
    }

    /**
     * Apply the chart-type layout and push it to the chart host that draws it.
     * @param {string} chartType - Current longitudinal chart type
     */
    #syncChartTypeToChildren(chartType) {
        this.#chartType = chartType;
        this.#applyChartTypeLayout();
        this.#teachingQualityModule?.setChartType(chartType);
    }

    /**
     * Apply local layout changes for parallel vs. boxplot mode.
     */
    #applyChartTypeLayout() {
        const chartsRow = this.container?.querySelector('.longitudinal-charts-row');
        if (chartsRow) {
            chartsRow.classList.toggle(
                'longitudinal-charts-row--boxplot-mode',
                this.#chartType === 'boxplot',
            );
        }

        if (!this.#selfEfficacyModule) return;
        if (this.#chartType === 'boxplot') {
            this.#selfEfficacyModule.hide();
        } else {
            this.#selfEfficacyModule.show();
        }
    }

    // ─── Data helpers ───────────────────────────────────────────────────────

    /**
     * Detect which data slices are present so we only create relevant modules.
     */
    #detectAvailableData() {
        const dataStore = this.options.dataStore;
        const clData = dataStore?.getRawData(SL_DATA_KEYS.COMPETENCE_LEVELS) ?? [];

        // The survey cards draw from history.json, so they exist iff it carries their
        // timeline. The header's chart-type toggle asks the same probe, so the cards that
        // exist and the control that switches between them can never disagree.
        const { hasTeachingQuality, hasSelfEfficacy } = detectHistorySurveyScales(
            dataStore?.getRawData(SL_DATA_KEYS.LONGITUDINAL_HISTORY),
        );

        this.#hasTeachingQuality = hasTeachingQuality;
        this.#hasSelfEfficacy = hasSelfEfficacy;
        this.#hasDomainData = clData.length > 0;
    }

    // ─── Child modules ──────────────────────────────────────────────────────

    /**
     * Build the shared data payload passed to each ChartHostModule.
     *
     * `history` is the whole timeline document, handed on raw: which years exist, which
     * are measured and every year's numbers are the payload's to state, not this view's
     * to derive. Each card takes the slice it needs through `historyAdapter.js`.
     * @returns {object} The per-domain series plus the raw history document.
     */
    #getChartData() {
        const dataStore = this.options.dataStore;
        const domainResults = dataStore?.getDataset(SL_DATA_KEYS.DOMAIN_RESULTS);

        return {
            domainResults,
            domainArray: groupDomainResultsBySubjectDomain(domainResults),
            history: dataStore?.getRawData(SL_DATA_KEYS.LONGITUDINAL_HISTORY) ?? [],
        };
    }

    /**
     * Initialize child ChartHostModules for every available data slice.
     * @param {object} chartData - The shared payload every card reads its slice from.
     */
    async #initializeModules(chartData) {
        const moduleOpts = {
            ...this._childOptions(),
            showSubtitle: false,
            // The three cards sit in one row as one comparison, so a line at 20 % is
            // the same height in every card: one y maximum over everything any card
            // can show, whichever Bereich is selected.
            yMax: computeSharedYMax(chartData),
        };

        const modules = [];

        if (this.#hasTeachingQuality) {
            // `#createModule` hands back the bare host; each config binds its own verbs
            // onto it at init. Naming the config's host type at the assignment is what lets
            // `tsc` check the verb calls in the state observers above.
            this.#teachingQualityModule =
                /** @type {import('@tba3/modules/sl/modules/charts/longitudinal/teachingQualityConfig.js').TeachingQualityHost} */ (
                    this.#createModule(
                        CONFIG.teachingQualityId,
                        teachingQualityConfig,
                        moduleOpts,
                        chartData,
                    )
                );
            modules.push(this.#teachingQualityModule);
        }
        if (this.#hasSelfEfficacy) {
            this.#selfEfficacyModule =
                /** @type {import('@tba3/modules/sl/modules/charts/longitudinal/selfEfficacyLongConfig.js').SelfEfficacyLongHost} */ (
                    this.#createModule(
                        CONFIG.selfEfficacyId,
                        selfEfficacyLongConfig,
                        moduleOpts,
                        chartData,
                    )
                );
            modules.push(this.#selfEfficacyModule);
        }
        if (this.#hasDomainData) {
            this.#ksDistributionModule =
                /** @type {import('@tba3/modules/sl/modules/charts/longitudinal/longitudinalKsShareConfig.js').LongitudinalKsShareHost} */ (
                    this.#createModule(
                        CONFIG.ksDistributionId,
                        slKsDistributionConfig,
                        moduleOpts,
                        chartData,
                    )
                );
            modules.push(this.#ksDistributionModule);
        }

        await this._hydrateChildren(modules.map((mod) => [mod]));
    }

    /**
     * Helper — create and mount a single ChartHostModule. Mounted here so the
     * chart body class is on the shell before it renders.
     * @param {string} containerId - Id of the element the card mounts in.
     * @param {object} config - The chart config descriptor driving it.
     * @param {object} opts - Options shared by every card's host.
     * @param {object} data - This card's data slice.
     * @returns {ChartHostModule} The mounted, not yet hydrated host.
     */
    #createModule(containerId, config, opts, data) {
        const mod = new ChartHostModule(containerId, containerId, config, opts);
        mod.mount(data);
        mod.contentContainer.classList.add('longitudinal-chart-body');
        return mod;
    }
}
