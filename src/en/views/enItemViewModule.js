/**
 * EnItemViewModule — the EN Aufgaben view: item table, item lollipop and the detail
 * panel in a 2×2 grid.
 *
 * Observes `currentMode` and `comparisonState`. Wires the item table's `onDataSync`
 * to the lollipop, and its `onItemSelected` to the detail panel.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { itemLollipopConfig } from '@tba3/modules/charts/item-lollipop';
import { EnItemDetailModule } from '@tba3/modules/en-item-detail';
import { EnItemTableModule } from '@tba3/modules/tables/en-item';
import { itemPreviewOverlay } from '../../common/modules/overlays/itemPreviewOverlay.js';
import { EN_DATA_KEYS } from '../enConstants.js';
import { getEnConfig } from '../enConfig.js';
import { createIdStore } from '../utils/enIdStore.js';
import './enItemViewModule.css';

// Module-specific constants
const CONFIG = {
    itemLollipopChartContainerId: 'item-itemLollipop',
    itemTableContainerId: 'item-table',
    itemDetailContainerId: 'item-detail',
};

export class EnItemViewModule extends BaseViewModule {
    /** @type {EnItemTableModule|null} */
    #itemTableModule = null;
    /** @type {import('@tba3/modules/en/modules/charts/itemLollipop/itemLollipopConfig.js').ItemLollipopHost|null} */
    #itemLollipopChartModule = null;
    /** @type {EnItemDetailModule|null} */
    #itemDetailModule = null;
    /** @type {any[]|null} */
    #itemArray = null;
    /**
     * Id-indexed item records shared by this view's table (writer) and lollipop
     * (reader), so the table → chart sync can carry iqbId arrays alone. Owned by the
     * view and passed through options, so it dies with the view rather than outliving it.
     * @type {ReturnType<typeof createIdStore>}
     */
    #itemStore = createIdStore('iqbId');

    /**
     * Creates a new EnItemViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Render the item view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        // Retrieve item records from the DataStore (computed once, cached;
        // declared in enDatasets.js)
        const dataStore = this.getOption('dataStore');
        this.#itemArray = dataStore.getDataset(EN_DATA_KEYS.ITEM_RECORDS);

        this.#createDOM();
        this.#setupEventListeners();
        this.#constructModules();
        await this.#hydrateModules();
    }

    /**
     * Creates the DOM structure for the 2x2 grid layout
     */
    #createDOM() {
        const container = this.container;
        if (!container) return;
        container.className = 'en-item-view view-base';
        container.innerHTML = `
            <div class="chart-section" id="${CONFIG.itemLollipopChartContainerId}"></div>
            <div class="table-section" id="${CONFIG.itemTableContainerId}"></div>
            <div class="detail-section" id="${CONFIG.itemDetailContainerId}"></div>
        `;
    }

    /**
     * Observe the app-state keys the children follow.
     */
    #setupEventListeners() {
        // The header's Domäne switch writes app state; push it to the item table.
        this.observeState('currentMode', (mode) => {
            this.#itemTableModule?.setState({ mode });
        });

        // The ⌀ toggles write the app's comparison state; the lollipop follows it.
        this.observeActiveComparisons((activeModes) => {
            this.#itemLollipopChartModule?.setActiveModes(activeModes);
        });
    }

    /**
     * Construct all child modules (sync — no DOM or data work)
     */
    #constructModules() {
        const chartContainer = this.getContainer(CONFIG.itemLollipopChartContainerId, 'Chart');
        const tableContainer = this.getContainer(CONFIG.itemTableContainerId, 'Table');
        const detailContainer = this.getContainer(CONFIG.itemDetailContainerId, 'Detail');

        if (chartContainer) {
            const lollipopHost = new ChartHostModule(
                CONFIG.itemLollipopChartContainerId,
                chartContainer,
                itemLollipopConfig,
                {
                    ...this._childOptions(),
                    glossaryKey: 'en.item.lollipop',
                    enConfig: getEnConfig(this.getOption('dataStore')),
                    itemStore: this.#itemStore,
                },
            );
            // The constructor returns the bare host; `itemLollipopConfig` binds its verbs
            // onto it at init. Naming the config's host type once here is what lets `tsc`
            // check every verb call, instead of a cast per call.
            this.#itemLollipopChartModule =
                /** @type {import('@tba3/modules/en/modules/charts/itemLollipop/itemLollipopConfig.js').ItemLollipopHost} */ (
                    lollipopHost
                );
            // Hydrated in its own batch before the table (see #hydrateModules).
            this.registerChildModule(this.#itemLollipopChartModule);
        }

        if (tableContainer) {
            this.#itemTableModule = new EnItemTableModule(
                CONFIG.itemTableContainerId,
                tableContainer,
                {
                    ...this._childOptions(),
                    glossaryKey: 'en.item.item-table',
                    enConfig: getEnConfig(this.getOption('dataStore')),
                    domainMode: this.options.appState?.getStateValue('currentMode'),
                    showModuleTitle: true,
                    itemStore: this.#itemStore,
                    onDataSync: (data) => {
                        void this.#itemLollipopChartModule?.applySync(data);
                    },
                    onItemSelected: (payload) => {
                        void this.#itemDetailModule?.onItemSelected(payload);
                    },
                    onItemPreview: (task) => itemPreviewOverlay.show(task),
                },
            );
            this.registerChildModule(this.#itemTableModule);
        }

        if (detailContainer) {
            this.#itemDetailModule = new EnItemDetailModule(
                CONFIG.itemDetailContainerId,
                detailContainer,
                {
                    ...this._childOptions(),
                    glossaryKey: 'en.item.item-details',
                    showModuleTitle: true,
                    onStudentSelected: (studentId) => this._openStudent(studentId),
                },
            );
            this.registerChildModule(this.#itemDetailModule);
        }
    }

    /**
     * Mount + hydrate the children in two batches: the lollipop chart defers
     * its render to the table's first sync, so it must be prepared before
     * the table hydrates. Table and detail are independent.
     * @returns {Promise<void>}
     */
    async #hydrateModules() {
        const { itemComparisonGroups } = this.getData();

        await this._hydrateChildren([
            [
                this.#itemLollipopChartModule,
                {
                    itemsData: this.#itemArray,
                    itemComparisonGroups,
                },
            ],
        ]);
        await this._hydrateChildren([
            [this.#itemTableModule, { itemsData: this.#itemArray }],
            [this.#itemDetailModule, {}],
        ]);
    }
}
