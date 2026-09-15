/**
 * MaItemViewModule — the MA Aufgaben view: the item table left, the task-ring charts
 * right, and a focus chart in chart-only mode.
 *
 * Extends MaLayoutViewBase for the layout-mode switching both MA views share.
 */

import { MaLayoutViewBase } from './maLayoutViewBase.js';
import { getMaDomains } from '../utils/maDomains.js';
import { createPlaceholder, waitForStableElementBox } from '@tba3/module-base';
import {
    ChartHostModule,
    comparisonSeriesLabel,
    comparisonSeriesVisual,
} from '@tba3/modules/charts';
import { itemSuccessLollipopConfig } from '@tba3/modules/charts/item-success-lollipop';
import { taskRingGridConfig } from '@tba3/modules/charts/task-ring-grid';
import { resolveAverageRole } from '@tba3/modules/domain';
import { MaItemTableModule } from '@tba3/modules/tables/ma-item';
import { itemPreviewOverlay } from '../../common/modules/overlays/itemPreviewOverlay.js';
import { mapItemComparisonAverageData } from '../utils/maItemDataAdapter.js';
import './maItemViewModule.css';

// Module-specific constants
const CONFIG = {
    // Distinct from the MaItemTableModule's own id ('ma-item-table') — see the note
    // on the class view's tableContainerId.
    tableContainerId: 'ma-item-table-container',
    lollipopContainerId: 'ma-item-lollipop',
    chartContainerId: 'ma-item-taskRing',
    chartOnlyContainerId: 'ma-item-taskRing-chartOnly',
    focusChartContainerId: 'ma-item-focus',
};

const reportedMissingAverageValues = new Set();

/**
 * Warn once per (group, item) that a comparison group carries no value for an item the
 * chart draws. Deduplicated because the chart re-renders on every filter change, and a
 * repeated warning would drown the console rather than inform it.
 * @param {{id: string, name?: string}} average - The comparison group with the gap.
 * @param {string} iqbId - The item it has no value for.
 */
function warnMissingAverageValue(average, iqbId) {
    const key = `${average.id}:${iqbId}`;
    if (reportedMissingAverageValues.has(key)) return;
    reportedMissingAverageValues.add(key);
    console.warn(
        `MaItemViewModule: Missing comparison value for ${average.name} (${average.id}) item ${iqbId}; marker omitted.`,
    );
}

export class MaItemViewModule extends MaLayoutViewBase {
    /** @type {MaItemTableModule|null} */
    #itemTableModule = null;
    /** @type {import('@tba3/modules/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopConfig.js').ItemSuccessLollipopHost|null} */
    #lollipopModule = null;
    /** @type {import('@tba3/modules/ma/modules/charts/taskRing/taskRingGridConfig.js').TaskRingGridHost|null} */
    #taskRingModule = null;

    /**
     * Creates a new MaItemViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('./maLayoutViewBase.js').MAViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
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
            contentContainerSelector: '.item-view-content',
        };
    }

    /**
     * Render the item view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        this.#createDOM();
        this.#setupEventListeners();
        this.#constructModules();
        this.#mountModules();
        await this.#hydrateModules();
    }

    /**
     * Creates the DOM structure for the item view
     */
    #createDOM() {
        this._renderTaskRingSplitView({
            viewClassName: 'ma-item-view',
            contentClassName: 'item-view-content',
            leftSectionClassName: 'item-table-section',
            leftSectionChildren: [
                createPlaceholder(
                    `${CONFIG.lollipopContainerId}-wrapper`,
                    'lollipop-wrapper lollipop-section',
                ),
                createPlaceholder(CONFIG.tableContainerId, 'table-container'),
            ],
            chartContainerId: CONFIG.chartContainerId,
            chartOnlyContainerId: CONFIG.chartOnlyContainerId,
            focusChartContainerId: CONFIG.focusChartContainerId,
            chartOnlyContainerClassName: 'item-chart-only-content',
        });
    }

    /**
     * Sets up event listeners
     */
    #setupEventListeners() {
        // Use base class layout event listeners
        this._setupLayoutEventListeners();
        // The ⌀ toggles write the app's comparison state; the lollipop's averages follow it.
        this.observeActiveComparisons((activeModes) => {
            this.#lollipopModule?.setActiveModes(activeModes);
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
        this.#createChartOnlyView().catch((error) => {
            console.error('MaItemViewModule: Error creating chart-only view:', error);
        });
    }

    /**
     * The item table, once Tabulator has built it.
     * @override
     * @returns {object|null} The item table module
     * @protected
     */
    _getLayoutTableModule() {
        return this.#itemTableModule?.table ? this.#itemTableModule : null;
    }

    /**
     * Construct all child modules (sync)
     */
    #constructModules() {
        const data = this.getData();
        if (!data) {
            console.warn('MaItemViewModule: No data available');
            return;
        }

        // Item table
        const tableContainer = document.getElementById(CONFIG.tableContainerId);
        if (tableContainer) {
            this.#itemTableModule = new MaItemTableModule('ma-item-table', tableContainer, {
                showModuleTitle: true,
                glossaryKey: 'ma.items.item-table',
                ...this._childOptions(),
                onItemPreview: (task) => itemPreviewOverlay.show(task),
            });
            this.registerChildModule(this.#itemTableModule);
        }

        // Lollipop chart
        const lollipopWrapper = document.getElementById(`${CONFIG.lollipopContainerId}-wrapper`);
        if (lollipopWrapper) {
            const averages = MaItemViewModule.#buildAveragesConfig(data);

            const lollipopHost = new ChartHostModule(
                CONFIG.lollipopContainerId,
                lollipopWrapper,
                itemSuccessLollipopConfig,
                {
                    ...this._childOptions(),
                    averages,
                },
            );
            // The constructor returns the bare host; the config binds its verbs onto it at
            // init. Naming the config's host type once here is what lets `tsc` check every
            // verb call, instead of a cast per call.
            this.#lollipopModule =
                /** @type {import('@tba3/modules/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopConfig.js').ItemSuccessLollipopHost} */ (
                    lollipopHost
                );
            this.registerChildModule(this.#lollipopModule);
        }

        // Task Ring chart
        const taskRingContainer = document.getElementById(CONFIG.chartContainerId);
        if (taskRingContainer) {
            const taskRingHost = new ChartHostModule(
                CONFIG.chartContainerId,
                taskRingContainer,
                taskRingGridConfig,
                {
                    ...this._childOptions(),
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
     * Mount all child modules (sync — builds DOM shells)
     */
    #mountModules() {
        const data = this.getData();

        this.#itemTableModule?.mount({ itemsData: data.itemArray });
        this.#lollipopModule?.mount({ itemArray: data.itemArray });
        this.#taskRingModule?.mount({
            itemArray: data.itemArray,
            studentArray: data.studentArray,
            domains: getMaDomains(this.getOption('dataStore')),
            selectedStudents: null,
        });
    }

    /**
     * Hold the table's hydration until its container has a width to build against.
     * @param {HTMLElement|null} container - The table's container.
     * @returns {Promise<void>} Resolves once the box is usable, or once the frame budget is spent.
     */
    async #waitForTableContainerWidth(container) {
        if (!container || container.offsetWidth > 0) {
            return;
        }

        // Ten frames at the helper's 50 ms cap, matching the 500 ms this used to allow
        // a hand-rolled ResizeObserver. Fonts are not waited for: the width the table
        // builds against does not depend on them, and the caller re-checks `destroyed`.
        await waitForStableElementBox(container, {
            stableFrames: 1,
            waitForFonts: false,
            maxFrames: 10,
        });
    }

    /**
     * Hydrate all child modules in parallel.
     * Table waits for a stable container box if needed,
     * but lollipop and taskRing are independent.
     * @returns {Promise<void>}
     */
    async #hydrateModules() {
        // Table may need to wait for a stable container box
        const hydrateTable = async () => {
            if (!this.#itemTableModule) return;
            const container = this.#itemTableModule.container;
            await this.#waitForTableContainerWidth(container);
            if (this.destroyed) return;
            await this.#itemTableModule.hydrate();
        };

        await Promise.all([
            hydrateTable(),
            this.#lollipopModule?.hydrate(),
            this.#taskRingModule?.hydrate(),
        ]);
    }

    /**
     * Build averages config array from the payload's comparison groups.
     * Each entry provides a generator closure that maps chart data items
     * to the group's percentage via iqbId lookup.
     * @param {object} data - App data carrying `schoolAverages`, `stateAverages` and `otherAverages`
     * @returns {Array|undefined} Averages config array, or undefined to use defaults
     */
    static #buildAveragesConfig(data) {
        // Comparison populations the client has no specific styling for come last, after
        // the two it names — they are additions to the familiar pair, not replacements.
        const averages = [...data.schoolAverages, ...data.stateAverages, ...data.otherAverages]
            .filter((average) => average?.means?.size)
            .map((average) => ({
                id: average.id,
                // The bare name for the ⌀ dropdown, like every other app's menu.
                name: average.name,
                // This chart has no legend: the tooltip is where the ordinal decodes
                // the marker shade, so it belongs in the label.
                label: comparisonSeriesLabel(average),
                // The role name; the chart resolves it against the theme at paint time.
                color: resolveAverageRole(average.type),
                typeIndex: average.typeIndex ?? 0,
                shape: comparisonSeriesVisual(average).symbol,
                generator: (chartData) =>
                    mapItemComparisonAverageData(average, chartData, warnMissingAverageValue),
            }));

        return averages.length > 0 ? averages : undefined;
    }

    /**
     * Creates chart-only view
     */
    async #createChartOnlyView() {
        const data = this.getData();
        if (!data?.itemArray || !data?.studentArray) return;

        const domains = getMaDomains(this.getOption('dataStore'));

        // Set flag to prevent duplicate render from domain selection event
        this._chartOnlyInitializing = true;

        try {
            // Create task ring grid for chart-only mode using base class method
            await this._createTaskRingGridForChartOnly({
                containerId: CONFIG.chartOnlyContainerId,
                domains: domains,
                selectedStudents: [],
            });

            // Create focus chart using base class method
            await this._createFocusChart();
        } finally {
            // Clear flag after initialization completes
            this._chartOnlyInitializing = false;
        }
    }
}
