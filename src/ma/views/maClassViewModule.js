/**
 * MaClassViewModule — the MA Klasse view: the KS distribution bar above the
 * Aufgabenpool selector and the class table, which is scoped to the active pool.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { applyTemplateTokens } from '@tba3/module-base';
import { ChartHostModule } from '@tba3/modules/charts';
import { simpleKsBarConfig } from '@tba3/modules/charts/ks-bar';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { MaClassTableModule } from '@tba3/modules/tables/ma-class';
import { MA_DATA_KEYS } from '../maConstants.js';
import { getMaDomains } from '../utils/maDomains.js';
import { buildTaskPools } from '../utils/maTaskPools.js';
import { buildScopedStudentRecords } from '../utils/maStudentDataAdapter.js';
import './maClassViewModule.css';

// Module-specific constants
const CONFIG = {
    ksBarContainerId: 'ma-class-ks-bar',
    poolSelectorId: 'ma-class-pool-selector',
    poolHintId: 'ma-class-pool-hint',
    // Distinct from the MaClassTableModule's own id ('ma-class-table'): ContentModule
    // moves a container id onto its body div when the two match, which would put
    // the module header outside the id it is looked up by.
    tableContainerId: 'ma-class-table-container',
};

/**
 * Resolve the student array + item total for a task pool. The 'all' pool reuses
 * the whole-booklet records; Leitidee pools recompute per-student counts over
 * just that content area's items.
 * `ksLevels` is the band scale the data reports on; it names the Kompetenzstufe filter
 * and does not vary by pool, so it is passed through unchanged.
 * @param {{studentArray: Array, itemArray: Array, nrItems: number, ksLevels?: string[], classKsThresholds?: number[]|null}} data - The whole-booklet records, before scoping.
 * @param {import('../utils/maTaskPools.js').MaTaskPool} pool - The pool to scope to; the `all` pool passes the records through.
 * @returns {{ studentArray: Array, nrItems: number, ksLevels?: string[], classKsThresholds?: number[]|null }} The rows the table renders for this pool, and the item total they are shares of.
 */
function scopeStudentData(data, pool) {
    // `classKsThresholds` is a booklet-level fact and deliberately NOT pool-scoped:
    // the ±Schwellenwert presets it feeds are dropped on Leitidee pools anyway.
    if (!pool || pool.type === 'all') {
        return {
            studentArray: data.studentArray,
            nrItems: data.nrItems,
            ksLevels: data.ksLevels,
            classKsThresholds: data.classKsThresholds,
        };
    }
    return {
        studentArray: buildScopedStudentRecords(data.studentArray, data.itemArray, pool.iqbIds),
        nrItems: pool.nrItems,
        ksLevels: data.ksLevels,
        classKsThresholds: data.classKsThresholds,
    };
}

export class MaClassViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/ma/modules/charts/ksBar/simpleKsBarConfig.js').SimpleKsBarHost|null} */
    #ksBarModule = null;
    /** @type {MaClassTableModule|null} */
    #classTableModule = null;
    /** @type {Array<import('../utils/maTaskPools.js').MaTaskPool>} */
    #pools = [];
    /** @type {string} id of the active task pool */
    #activePoolId = 'all';
    /** @type {boolean} True while a pool rebuild is in flight (blocks re-entrant switches) */
    #poolSwitchInFlight = false;

    /**
     * Creates a new MaClassViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('./maLayoutViewBase.js').MAViewModuleOptions} [options={}] - Configuration options
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
        this.#buildPools();
        this.#createDOM();
        this.#setupEventListeners();
        this.#constructModules();
        await this.#hydrateModules();
    }

    /**
     * Derive the task pools (Gesamt + one per Leitidee) for the current class.
     */
    #buildPools() {
        const dataStore = this.getOption('dataStore');
        const itemArray = this.getData()?.itemArray ?? [];
        const domains = getMaDomains(dataStore);
        this.#pools = buildTaskPools(itemArray, domains);
        // Reset to the whole-booklet pool on each (re)render.
        this.#activePoolId = 'all';
    }

    /**
     * @returns {import('../utils/maTaskPools.js').MaTaskPool} The active task pool (falls back to the first pool).
     */
    #getActivePool() {
        return this.#pools.find((p) => p.id === this.#activePoolId) ?? this.#pools[0];
    }

    /**
     * Resolve the student data + item total for a task pool.
     * The 'all' pool reuses the whole-booklet records; Leitidee pools recompute
     * per-student counts over just that content area's items.
     * @param {import('../utils/maTaskPools.js').MaTaskPool} pool - The pool to scope to.
     * @returns {{ studentArray: Array, nrItems: number, ksLevels?: string[], classKsThresholds?: number[]|null }} The rows the table renders for this pool, and the item total they are shares of.
     */
    #getScopedData(pool) {
        return scopeStudentData(this.getData(), pool);
    }

    /**
     * Creates the DOM structure for the class view
     */
    #createDOM() {
        const container = this.container;
        if (!container) return;
        container.className = 'ma-class-view view-base';
        container.innerHTML = `
            <div id="${CONFIG.ksBarContainerId}-wrapper" class="ks-bar-wrapper"></div>
            <div id="${CONFIG.tableContainerId}" class="table-container"></div>
        `;
    }

    /**
     * Whether the class table offers a task-pool choice. A single pool (only
     * "Gesamt", e.g. a booklet with no Leitidee split) means there is nothing
     * to scope, so no selector is rendered at all.
     * @returns {boolean} True when more than one pool exists.
     */
    #hasPoolChoice() {
        return this.#pools.length > 1;
    }

    /**
     * Populate the class table's subtitle slot with the task-pool selector
     * ("Aufgabenpool" dropdown) plus the subset hint.
     *
     * Called once, after the class table is mounted. Switching pools re-scopes the
     * table in place (see MaClassTableModule.setActivePool), so neither the module
     * nor this selector is ever rebuilt — only the active state and hint change.
     */
    #renderPoolSelector() {
        const host = document.getElementById(CONFIG.poolSelectorId);
        if (!host) return;
        host.innerHTML = '';
        if (!this.#hasPoolChoice()) return;

        host.appendChild(this.#buildPoolDropdown());

        const hint = document.createElement('p');
        hint.id = CONFIG.poolHintId;
        hint.className = 'ma-class-pool-hint';
        hint.hidden = true;
        host.appendChild(hint);

        this.#updatePoolHint(this.#getActivePool());
    }

    /**
     * Build the "Aufgabenpool" labelled dropdown.
     * @returns {HTMLElement} The wrapper holding the label and the select.
     */
    #buildPoolDropdown() {
        const wrapper = document.createElement('div');
        wrapper.className = 'ma-class-pool-dropdown';

        const select = document.createElement('select');
        select.id = `${CONFIG.poolSelectorId}-select`;
        select.className = 'domain-selector';
        select.dataset.poolSelect = '';
        for (const pool of this.#pools) {
            const option = document.createElement('option');
            option.value = pool.id;
            option.textContent = pool.label;
            option.selected = pool.id === this.#activePoolId;
            select.appendChild(option);
        }

        const label = document.createElement('label');
        label.className = 'ma-class-pool-label';
        label.setAttribute('for', select.id);
        label.textContent = glossaryAnnotator.getRequiredEntryText('ma.class.pool-selector.label');

        wrapper.append(label, select);
        return wrapper;
    }

    /**
     * Handle a task-pool selection: rebuild the class table scoped to the pool.
     * @param {string} poolId - The newly selected pool; re-selecting the active one is a no-op.
     * @returns {Promise<void>} Resolves once the table has been re-scoped.
     */
    async #onPoolChange(poolId) {
        if (poolId === this.#activePoolId) return;
        const pool = this.#pools.find((p) => p.id === poolId);
        if (!pool) return;

        // Record the selection immediately so the hint reflects it even while a
        // rebuild is still running — the native <select> has already moved to the
        // new option, so dropping the change here would desync it.
        this.#activePoolId = poolId;
        this.#updatePoolHint(pool);

        // A rebuild already in flight will coalesce to the latest #activePoolId.
        if (this.#poolSwitchInFlight) return;

        this.#poolSwitchInFlight = true;
        try {
            // Re-scope until the rendered table matches the latest selection. This
            // absorbs rapid switches without overlapping data swaps, and never
            // leaves the control out of sync with the table.
            let appliedId = null;
            while (!this.destroyed && appliedId !== this.#activePoolId) {
                const target = this.#getActivePool();
                appliedId = target.id;
                await this.#classTableModule?.setActivePool(target, this.#getScopedData(target));
            }
        } finally {
            this.#poolSwitchInFlight = false;
        }
    }

    /**
     * Show a subset-size note for Leitidee pools (few items → noisy Lösungsquote),
     * and remind that Kompetenzstufen are not defined per Leitidee.
     * @param {import('../utils/maTaskPools.js').MaTaskPool} pool - The pool now active.
     */
    #updatePoolHint(pool) {
        const hint = document.getElementById(CONFIG.poolHintId);
        if (!hint) return;

        if (pool && pool.type === 'leitidee') {
            const entry = pool.nrItems === 1 ? 'pool-hint-single-item' : 'pool-hint';
            hint.textContent = applyTemplateTokens(
                glossaryAnnotator.getRequiredEntryText(`ma.class.${entry}.body`),
                { pool: pool.label, count: pool.nrItems },
            );
            hint.hidden = false;
        } else {
            hint.hidden = true;
            hint.textContent = '';
        }
    }

    /**
     * Sets up event listeners
     * Broadcasts events to children via view-mediated broadcasting
     */
    #setupEventListeners() {
        // The pool selector lives in the class table's subtitle. Delegate from the
        // stable view container so the control stays wired regardless of how the
        // table module re-renders its shell.
        const container = this.container;
        if (!container) return;

        this.resources.trackDomListener(container, 'change', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const select = target.closest('select[data-pool-select]');
            if (select instanceof HTMLSelectElement) this.#onPoolChange(select.value);
        });
    }

    /**
     * Construct all child modules (sync)
     */
    #constructModules() {
        const data = this.getData();
        if (!data) {
            console.warn('MaClassViewModule: No data available');
            return;
        }

        // KS Bar
        const wrapper = document.getElementById(`${CONFIG.ksBarContainerId}-wrapper`);
        if (wrapper) {
            const ksBarHost = new ChartHostModule(
                CONFIG.ksBarContainerId,
                wrapper,
                simpleKsBarConfig,
                {
                    ...this._childOptions(),
                    startCollapsed: true,
                    deferHydrationUntilExpand: true,
                    // Segment click → table filter; the table's reset comes back
                    // through onKsFilterCleared below.
                    onLevelSelected: (level) => this.#classTableModule?.setKsLevelFilter(level),
                },
            );
            // The constructor returns the bare host; `simpleKsBarConfig` binds its verbs
            // onto it at init. Naming the config's host type once here is what lets `tsc`
            // check every verb call, instead of a cast per call.
            this.#ksBarModule =
                /** @type {import('@tba3/modules/ma/modules/charts/ksBar/simpleKsBarConfig.js').SimpleKsBarHost} */ (
                    ksBarHost
                );
            this.registerChildModule(this.#ksBarModule);
        }

        // Class Table (scoped to the active pool)
        this.#classTableModule = this.#createClassTableModule(this.#getActivePool());
    }

    /**
     * Construct + register the MaClassTableModule for the initial task pool.
     * Later pool switches re-scope this same module in place (setActivePool).
     * Mount/hydrate are driven by the caller (the initial render phases).
     * @param {import('../utils/maTaskPools.js').MaTaskPool} pool - The pool the table starts out scoped to.
     * @returns {MaClassTableModule|null} The registered module, or `null` when its container is not in the DOM.
     */
    #createClassTableModule(pool) {
        const container = document.getElementById(CONFIG.tableContainerId);
        if (!container) return null;

        const module = new MaClassTableModule('ma-class-table', container, {
            showModuleTitle: true,
            glossaryKey: 'ma.class.class-table',
            // The task-pool selector lives in the module's subtitle slot. We
            // hand the shell an empty host div and populate it with the live
            // controls after mount (see #renderPoolSelector).
            ...(this.#hasPoolChoice()
                ? {
                      showSubtitle: true,
                      subtitle: `<div id="${CONFIG.poolSelectorId}" class="ma-class-pool"></div>`,
                  }
                : {}),
            ...this._childOptions(),
            pool,
            onKsFilterCleared: () => this.#ksBarModule?.updateHighlight(null),
            onStudentSelected: (studentId) => this._openStudent(studentId),
        });
        this.registerChildModule(module);
        return module;
    }

    /**
     * Mount + hydrate both modules. The table is mounted first by hand: mount()
     * builds its shell, and the pool selector has to be placed in the subtitle
     * host before the table renders.
     * @returns {Promise<void>}
     */
    async #hydrateModules() {
        const competenceLevels = this.getOption('dataStore').getRawData(
            MA_DATA_KEYS.COMPETENCE_LEVELS_CLASS,
        );
        const scoped = this.#getScopedData(this.#getActivePool());

        this.#classTableModule?.mount({
            studentArray: scoped.studentArray,
            nrItems: scoped.nrItems,
            ksLevels: scoped.ksLevels,
            classKsThresholds: scoped.classKsThresholds,
        });
        this.#renderPoolSelector();

        await this._hydrateChildren([
            [this.#ksBarModule, competenceLevels],
            [this.#classTableModule],
        ]);
    }
}
