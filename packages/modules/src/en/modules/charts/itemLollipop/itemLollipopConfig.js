/**
 * ItemLollipopConfig — ChartHostModule configuration for the EN item lollipop chart.
 *
 * Shows task performance with difficulty levels. Syncs with the item table —
 * always shows exactly what items are visible in the table. The table handles
 * mode filtering, and this chart mirrors its ids through the `applySync` verb.
 *
 */

import { ItemLollipopChart } from './itemLollipopChart.js';
import { withDomainPrefix } from '../../../utils/enDomainPrefix.js';
import { ensureComparisonModeDropdown } from '../../../../common/charts/host/comparisonModeControl.js';
import { setActiveModes } from '../../../../common/charts/host/comparisonSync.js';

// ============================================================================
// CONTROLLER
// ============================================================================

class ItemLollipopController {
    constructor(host) {
        this.host = host;
    }

    get state() {
        return this.host.configState;
    }

    prepare(data) {
        if (!document.getElementById(this.host.id)) {
            console.warn(
                `ItemLollipopConfig[${this.host.id}]: Container removed from DOM, skipping render`,
            );
            return null;
        }

        this.state.itemComparisonGroups =
            data.itemComparisonGroups ?? this.state.itemComparisonGroups ?? null;
        // The mount payload seeds the first pass only. The host runs this again on
        // every re-render (a KS theme switch) and hands back that same payload, so
        // adopting it a second time would swap the ids the table last synced for the
        // unfiltered set.
        if (!this.state.synced && data.itemsData) {
            this.state.currentItems = data.itemsData;
        }

        // First pass only: the table has not synced yet, so the chart is deferred to
        // its first `applySync` (which is why the view prepares this card before the
        // table). Every later pass must rebuild — the host destroyed the live
        // renderer, and nothing else would put one back until the table happens to
        // fire again. Keying this on `synced` rather than on the pass itself left a
        // theme switch in the startup window before that first sync with an empty
        // card, since it deferred a second time and the host kept no renderer.
        if (!this.state.prepared) {
            this.state.prepared = true;
            return null;
        }

        return this.#buildChart();
    }

    async applySync(data) {
        // Resolve the id payload synchronously (before any await) so the store
        // read can't race a later sync. selectedIds (when present) wins,
        // preserving the previous behaviour of showing only the selected items.
        const ids = data?.selectedIds?.length > 0 ? data.selectedIds : (data?.visibleIds ?? []);
        const records = this.host.getOption('itemStore').getByIds(ids);
        const mode = data?.mode ?? 'all';
        // From here on the table owns what this chart plots; `prepare` must stop
        // adopting the mount payload and must rebuild rather than defer.
        this.state.synced = true;
        // The chart labels each item by the same "H-01" rule the tables use.
        this.state.currentItems = records.map((item) => ({
            ...item,
            displayName: mode === 'all' ? withDomainPrefix(item.name, item.domainLabel) : item.name,
        }));
        this.state.groupMode = data?.groupMode || 'item';
        // The domain the table is in decides which items this chart plots, so it
        // is part of the export identity; this path never re-renders the host,
        // so it has to resync the export controls itself.
        this.state.mode = data?.mode ?? 'all';
        this.host.syncExportControls();

        if (!this.host.chart) {
            await this.#ensureChartCreated();
            return;
        }

        this.host.chart.setState({ items: this.state.currentItems });
    }

    async #ensureChartCreated() {
        if (!this.state.creationPromise) {
            this.state.creationPromise = this.#recreateChart().finally(() => {
                this.state.creationPromise = null;
            });
        }

        await this.state.creationPromise;

        if (this.host.chart) {
            this.host.chart.setState({ items: this.state.currentItems });
        }
    }

    async #recreateChart() {
        const chart = this.#buildChart();
        this.host.replaceChart(chart);
        await chart.create();
        this.ensureComparisonDropdown(chart);
    }

    /**
     * Construct a renderer over the items currently held. Used by both creation
     * paths: the table's first `applySync` (which owns `create()` itself) and the
     * host's re-render, which takes the instance back from `prepare` and creates it
     * on the normal path.
     * @returns {ItemLollipopChart} The renderer, not yet created.
     */
    #buildChart() {
        const chart = new ItemLollipopChart(this.host.id, this.state.currentItems, {
            comparisonState: this.host.getOption('comparisonState'),
            itemComparisonGroups: this.state.itemComparisonGroups,
            enConfig: this.host.getOption('enConfig'),
        });
        chart.host = this.host;
        return chart;
    }

    /**
     * The ⌀ menu offers the groups this render paints from — one absent from
     * items.json draws no marker, so it gets no toggle either.
     * @param {ItemLollipopChart} chart - The live renderer whose groups the menu lists.
     */
    ensureComparisonDropdown(chart) {
        ensureComparisonModeDropdown(this.host, this.host.getOption('comparisonState'), () =>
            chart.comparisonGroups.map((group) => ({ id: group.id, label: group.name })),
        );
    }
}

// ============================================================================
// CONTROLLER ACCESS
// ============================================================================

/**
 * The controller is created on first access and kept on the host's config state, so
 * every callback in the descriptor below reaches the same instance.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
 * @returns {ItemLollipopController} The host's controller.
 */
function getItemLollipopController(host) {
    if (!host.configState.controller) {
        host.configState.controller = new ItemLollipopController(host);
    }
    return host.configState.controller;
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it: `#bindPublicAPI` assigns the verbs below onto the
 * instance, so a view typing its field with this gets them checked instead of casting.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setActiveModes(activeModes: string[]): void,
 *     applySync(data: object): Promise<void>,
 * }} ItemLollipopHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const itemLollipopConfig = {
    glossaryPath: 'en.item.lollipop',

    defaultOptions: {
        showModuleTitle: true,
        enableModuleExport: true,
    },

    /**
     * Initial render — sets up the container but does NOT create a chart yet.
     * The chart is created lazily on the first `applySync` from the item table.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart will draw into.
     * @param {object} data - The view's initial payload for this card.
     * @returns {object|null} The prepared renderer, or `null` when the container has already left the DOM.
     */
    createRenderer(host, data) {
        return getItemLollipopController(host).prepare(data);
    },

    /**
     * The ⌀ menu lists the groups the live renderer paints, so it is wired once the
     * host's create loop has run — the rebuild path in `prepare` hands the renderer
     * back rather than creating it itself.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
     * @param {Array<object>} charts - The host's renderers; this config creates at most one.
     */
    onRendered(host, charts) {
        const chart = charts[0];
        if (chart) getItemLollipopController(host).ensureComparisonDropdown(chart);
    },

    /**
     * The chart mirrors the item table, so it shows a different domain's items
     * whenever the Hören/Lesen switch moves. The table filter is not part of
     * this — that narrows the same domain's chart, which stays one card.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
     * @returns {string|null} The current domain mode, which distinguishes one exported card from another.
     */
    getExportIdentity(host) {
        return getItemLollipopController(host).state.mode ?? null;
    },

    publicAPI: {
        setActiveModes,

        /**
         * Mirror the item table's current ids.
         *
         * The controller serializes early syncs during initialization and
         * reconciles with the latest table data after lazy chart creation.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
         * @param {object} data - The table's current ids, grouping and domain mode.
         * @returns {Promise<void>}
         */
        applySync(host, data) {
            return getItemLollipopController(host).applySync(data);
        },
    },
};
