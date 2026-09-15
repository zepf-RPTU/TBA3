/**
 * StyleChartConfig — ChartHostModule descriptor for the EN Teilkompetenzen card.
 *
 * One card drawing either a spider (student view, mode `all`) or a lollipop (class
 * view, and the student view's per-domain modes). Everything arrives through verbs:
 * `applySync` for the class table's ids, `setStudent` for the selection, and
 * `setDomainMode` / `setActiveModes` for the mode and the comparison groups.
 */

import { StyleSpiderChart } from './styleSpiderChart.js';
import { StyleLollipopChart } from './styleLollipopChart.js';
import { ensureComparisonModeDropdown } from '../../../../common/charts/host/comparisonModeControl.js';
import { hasSameActiveModes } from '../../../../common/charts/host/comparisonSync.js';
import { calculateStyleAveragesForStudents } from '../../../utils/enStyleAggregation.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import './styleChartConfig.css';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';

/**
 * @typedef {object} StyleChartData
 * @property {any[]} studentData - The student rows the averages are computed over.
 * @property {string|null} studentId - The selected student, or `null` for the class view.
 * @property {string|null} displayName - Label for the selected student's series.
 * @property {boolean} useWidth - Whether the chart sizes itself to the available width.
 * @property {string[]} comparisonModes - Ids of the comparison groups currently toggled on.
 * @property {any} [styleAverages] - Pre-computed averages from a filtered table; falls back to the class averages when absent.
 */

// ============================================================================
// CONTROLLER
// ============================================================================

class StyleChartController {
    #currentMode = 'all';
    /** @type {StyleSpiderChart|null} */
    #spiderChart = null;
    /** @type {StyleLollipopChart|null} */
    #lollipopChart = null;
    /** @type {HTMLElement|null} */
    #spiderHost = null;
    /** @type {HTMLElement|null} */
    #lollipopHost = null;
    /** @type {StyleChartData|null} */
    #currentData = null;
    #useSpiderChart = false;
    /** @type {Promise<void>|null} */
    #renderInFlight = null;
    #pendingRender = false;

    /**
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host this controller drives.
     */
    constructor(host) {
        this.host = host;
        // Seed the mode from the host's option (a view opened while the app was
        // already in a domain mode); setDomainMode moves it afterwards.
        this.#currentMode = host.getOption('domainMode') || this.#currentMode;
    }

    // ========================================================================
    // HOST HOOKS
    // ========================================================================

    /**
     * Render pass. The student view hands its renderer back so the host creates
     * it on the normal path — a spider at mode 'all', a lollipop when the app was
     * already in a domain mode before this view was first opened. The class view
     * creates nothing on its first pass and defers to the first `applySync`
     * from the class table (which is why the view must prepare this card before
     * the table).
     *
     * The host runs this again on every re-render (a KS theme switch), having
     * destroyed every renderer it tracks first, and hands back the mount-time
     * payload. So a re-render releases the dead renderer references and rebuilds
     * from what the controller holds — the selected student, the table's filtered
     * rows and averages, the current mode — rather than from that stale payload.
     * @param {object} options - The view's payload for this card.
     * @returns {StyleSpiderChart|StyleLollipopChart|null} The renderer the current mode calls for, or `null` when creation is deferred.
     */
    prepare(options = {}) {
        const previous = this.#currentData;
        this.#dropRenderers();

        const currentData = previous ?? this.#adoptInitialData(options);
        if (!currentData) return null;

        // Add the per-module comparison (average) toggle to the module header.
        // Works for both modes and before any chart exists (lollipop mode defers
        // its chart to the first `applySync`): the comparison groups are whole
        // populations that pass through the selection unchanged, so the class
        // averages already name exactly what either renderer paints.
        ensureComparisonModeDropdown(this.host, this.host.getOption('comparisonState'), () =>
            this.host.getOption('styleAverages').comparisonGroups.map((group) => ({
                id: group.id,
                label: group.name,
            })),
        );

        // Nothing to draw yet: the class view's first pass waits for the table's
        // first `applySync`, and a re-render under the empty-state
        // placeholder waits for the table's next non-empty selection. A
        // re-render that already holds synced rows must redraw now, or the card
        // stays blank until the next table event.
        if (!this.#useSpiderChart && (!previous || this.#showingEmptyState())) return null;

        return this.#useSpiderChart && this.#currentMode === 'all'
            ? this.#buildSpiderChart()
            : this.#buildLollipopChart();
    }

    /**
     * Post-create: the lollipop's minimum height can only be read back off a
     * chart that has drawn, so the host calls this once its create loop is done.
     * @returns {void}
     */
    onRendered() {
        if (this.#lollipopChart && this.#lollipopHost?.isConnected) {
            this.#applyChartMinHeight();
        }
    }

    /**
     * What this card currently shows. The student view keeps one spider chart and
     * re-points it at whichever student is selected; both views re-render on a
     * domain switch. Either way the capture shows something else, so both belong
     * in the export id.
     * @returns {Array<string|null|undefined>} The selected student and the current mode.
     */
    exportIdentity() {
        return [this.#currentData?.studentId, this.#currentMode];
    }

    /**
     * Drop both renderers and both host divs. The host destroys the renderers it
     * tracks, so this only has to release the DOM and the local references.
     * @returns {void}
     */
    cleanup() {
        this.#dropRenderers();
    }

    // ========================================================================
    // EVENT HANDLERS
    // ========================================================================

    /**
     * Comparison toggle — repaint the visible chart's average series.
     * @param {string[]} activeModes - The comparison group ids to show.
     * @returns {void}
     */
    setActiveModes(activeModes) {
        if (!Array.isArray(activeModes)) return;

        const chart =
            this.#useSpiderChart && this.#currentMode === 'all' && this.#spiderChart
                ? this.#spiderChart
                : this.#lollipopChart;
        if (!chart || hasSameActiveModes(chart, activeModes)) return;
        chart.setState({ activeModes: [...activeModes] });
    }

    /**
     * Domain switch — only the student view flips renderer on this; the class
     * view is always a lollipop and follows the table instead.
     * @param {string} mode - The new mode.
     * @returns {void}
     */
    setDomainMode(mode) {
        if (!this.#useSpiderChart) return;
        if (!mode) return;

        // Record the mode even before data arrives, so the first render uses it.
        this.#currentMode = mode;
        if (!this.#currentData) return;
        this.#renderChart();
    }

    /**
     * Id lists from the class table — lollipop mode only.
     * @param {object} data - `{ visibleIds, selectedIds?, mode }` from the table.
     * @returns {void}
     */
    applySync(data) {
        if (this.#useSpiderChart) return;
        this.#handleTableUpdate(data);
    }

    /**
     * Student selection (spider mode / student view). The style aggregation is
     * immutable and already held from mount — only the selected student (and its
     * display label) change, so no data is re-pushed.
     * @param {object} data - `{ studentId, displayName? }`.
     * @returns {void}
     */
    setStudent(data) {
        if (!this.#useSpiderChart || !this.host.initialized) return;
        const studentId = data?.studentId;
        if (!studentId || !this.#currentData) return;

        this.#currentData = {
            ...this.#currentData,
            studentId,
            displayName: data.displayName ?? null,
        };
        this.#renderChart();
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Adopt the view's first payload as this controller's state.
     * @param {object} options - The view's payload for this card.
     * @returns {StyleChartData|null} The adopted state, or `null` when the payload carries no usable student data.
     */
    #adoptInitialData(options) {
        const {
            studentData,
            studentId = null,
            displayName = null,
            useWidth = false,
            comparisonModes = this.host.getOption('enConfig').comparisonModeIds,
            useSpiderChart = false,
        } = options;

        if (!studentData || !Array.isArray(studentData) || studentData.length === 0) {
            console.error(`StyleChartConfig[${this.host.id}]: Invalid or missing studentData`);
            return null;
        }

        this.#useSpiderChart = useSpiderChart;

        this.#currentData = {
            studentData,
            studentId,
            displayName,
            useWidth,
            comparisonModes,
        };
        return this.#currentData;
    }

    /**
     * Whether the "no students match" placeholder is the current body content —
     * where the class view sits between an empty table selection and the next
     * non-empty one. `#ensureChartHost` drops it again when a chart is mounted.
     * @returns {boolean} True while the empty-state placeholder is mounted.
     */
    #showingEmptyState() {
        return this.host.contentContainer?.querySelector('.chart-empty-state') != null;
    }

    /**
     * Release both renderers and both host divs. The host destroys the renderers
     * it tracks, so this only has to drop the DOM and the local references —
     * keeping them would hand a later mode switch a dead instance to "reuse".
     * @returns {void}
     */
    #dropRenderers() {
        this.#spiderChart = null;
        this.#lollipopChart = null;
        this.#spiderHost?.remove();
        this.#spiderHost = null;
        this.#lollipopHost?.remove();
        this.#lollipopHost = null;
    }

    /**
     * Resolve an id-list payload from the table into records and locally computed
     * aggregates, then update the lollipop.
     * @param {object} eventData - Event data from the table (inner data object).
     * @returns {void}
     */
    #handleTableUpdate(eventData) {
        if (!this.#currentData) return;

        const ids =
            eventData.selectedIds?.length > 0
                ? eventData.selectedIds
                : (eventData.visibleIds ?? []);
        // Read unguarded: only the class view wires `applySync`, and it supplies the store.
        const students = this.host.getOption('studentStore').getByIds(ids);

        if (students.length === 0) {
            this.#showEmptyState();
            return;
        }

        const mode = eventData.mode ?? this.#currentMode;
        const modeChanged = mode !== this.#currentMode;
        this.#currentMode = mode;

        const styleAverages = calculateStyleAveragesForStudents(students, mode, {
            enConfig: this.host.getOption('enConfig'),
            styleAverages: this.host.getOption('styleAverages'),
        });

        this.#currentData = {
            ...this.#currentData,
            studentData: students,
            styleAverages,
        };

        // Incremental update: reuse existing lollipop instance when mode is unchanged
        if (this.#lollipopChart && !modeChanged) {
            this.#lollipopChart.studentData = students;
            this.#lollipopChart.styleAverages = this.#resolveStyleAverages(styleAverages);
            this.#lollipopChart.setState({
                styleData: {
                    classAverages: styleAverages.classAverages,
                    comparisonGroups: styleAverages.comparisonGroups,
                    categoryPerformance: this.#lollipopChart.categoryPerformance,
                },
            });
            return;
        }

        this.#renderChart();
    }

    /**
     * No student matches the current filter: drop both charts and show the
     * placeholder. The innerHTML wipe takes the host divs with it, which
     * `#render` notices through their `isConnected` flag.
     * @returns {void}
     */
    #showEmptyState() {
        this.host.replaceChart(null);
        this.#spiderChart = null;
        this.#lollipopChart = null;
        this.#spiderHost = null;
        this.#lollipopHost = null;

        if (this.host.contentContainer) {
            this.host.contentContainer.innerHTML = `
                <div class="chart-empty-state">
                    ${iconSvg('query_stats', { className: 'chart-empty-state-icon', size: 48 })}
                    <span>${glossaryAnnotator.getRequiredEntryText('general.messages.no-data')}</span>
                </div>
            `;
        }
    }

    /**
     * Render the chart the current mode calls for. Queues a re-render if one is
     * already in flight, so the latest data always wins even when events fire
     * faster than a render completes.
     * @returns {Promise<void>}
     */
    async #renderChart() {
        if (!this.#currentData || this.host.destroyed) return;

        if (this.#renderInFlight) {
            this.#pendingRender = true;
            return;
        }

        this.#pendingRender = false;
        this.#renderInFlight = this.#render();

        try {
            await this.#renderInFlight;
        } finally {
            this.#renderInFlight = null;
        }

        if (this.#pendingRender && !this.host.destroyed) {
            await this.#renderChart();
        }
    }

    /**
     * The style averages a lollipop draws: the table's filtered values where it
     * supplied them, over the class-level parse. Merged rather than swapped because
     * calculateStyleAveragesForStudents returns values only — the class name the
     * chart labels its own series with lives on the class-level parse.
     * @param {object} [styleAverages] - Averages over the current table selection, if the table has synced.
     * @returns {object} One object for the chart, so no renderer resolves this precedence itself.
     */
    #resolveStyleAverages(styleAverages) {
        const classStyleAverages = this.host.getOption('styleAverages');
        return styleAverages ? { ...classStyleAverages, ...styleAverages } : classStyleAverages;
    }

    /**
     * Execute a render with the current data, keeping both instances alive:
     * toggling 'all' ⇄ 'domain0/1' only flips which host div is visible. Each
     * type is created on first use; full destroy only happens on cleanup or the
     * empty state.
     * @returns {Promise<void>}
     */
    async #render() {
        if (!this.#currentData) return;

        // Drop stale instances/hosts left behind by an empty-state innerHTML wipe.
        if (this.#spiderHost && !this.#spiderHost.isConnected) {
            this.#spiderChart?.destroy();
            this.#spiderChart = null;
            this.#spiderHost = null;
        }
        if (this.#lollipopHost && !this.#lollipopHost.isConnected) {
            this.#lollipopChart?.destroy();
            this.#lollipopChart = null;
            this.#lollipopHost = null;
        }

        if (this.#useSpiderChart && this.#currentMode === 'all') {
            await this.#renderSpider();
        } else {
            await this.#renderLollipop();
        }
    }

    /**
     * Show the spider, reusing the instance when it is already mounted.
     * @returns {Promise<void>}
     */
    async #renderSpider() {
        const { studentData, studentId, displayName } = /** @type {StyleChartData} */ (
            this.#currentData
        );

        // Hide lollipop host (keep instance alive for fast switch-back).
        this.#setHostVisibility('lollipop', false);
        // Clear any min-height left over from a prior lollipop render — it doesn't apply to spider mode.
        if (this.host.container) this.host.container.style.minHeight = '';

        if (this.#spiderChart) {
            this.#setHostVisibility('spider', true);
            this.#spiderChart.studentData = studentData;
            this.#spiderChart.studentId = studentId;
            this.#spiderChart.displayName = displayName;
            await this.#spiderChart.refresh();
            this.host.syncExportControls();
            return;
        }

        const chart = this.#buildSpiderChart();
        if (!chart) return;
        this.host.addChart(chart);
        chart.host = this.host;
        await chart.create();
        this.host.syncExportControls();
    }

    /**
     * Show the lollipop, reusing the instance when it is already mounted.
     * @returns {Promise<void>}
     */
    async #renderLollipop() {
        const { studentData, studentId, styleAverages } = /** @type {StyleChartData} */ (
            this.#currentData
        );
        const domain = this.#currentMode === 'all' ? null : this.#currentMode;

        // Hide spider host (keep instance alive for fast switch-back).
        this.#setHostVisibility('spider', false);

        if (this.#lollipopChart) {
            this.#setHostVisibility('lollipop', true);
            this.#lollipopChart.studentData = studentData;
            this.#lollipopChart.studentId = studentId;
            if (styleAverages)
                this.#lollipopChart.styleAverages = this.#resolveStyleAverages(styleAverages);

            // Domain change needs full layout rebuild; data-only uses D3 joins
            const domainChanged = this.#lollipopChart.domain !== domain;
            if (domainChanged) {
                this.#lollipopChart.setState({ domain });
            } else if (styleAverages) {
                this.#lollipopChart.setState({
                    styleData: {
                        classAverages: styleAverages.classAverages,
                        comparisonGroups: styleAverages.comparisonGroups,
                        categoryPerformance: this.#lollipopChart.categoryPerformance,
                    },
                });
            } else {
                await this.#lollipopChart.refresh();
            }
            this.#applyChartMinHeight();
            this.host.syncExportControls();
            return;
        }

        const chart = this.#buildLollipopChart();
        if (!chart) return;
        this.host.addChart(chart);
        chart.host = this.host;
        await chart.create();
        this.#applyChartMinHeight();
        this.host.syncExportControls();
    }

    /**
     * Construct the spider renderer into its own host div. Creation is left to the
     * caller: the first one is created by the host's renderer lifecycle, a later
     * one by `#renderSpider` after a switch back.
     * @returns {StyleSpiderChart|null} The renderer, or `null` when no host div could be mounted.
     */
    #buildSpiderChart() {
        const { studentData, studentId, displayName, useWidth, comparisonModes } =
            /** @type {StyleChartData} */ (this.#currentData);
        const hostEl = this.#ensureChartHost('spider');
        if (!hostEl) return null;
        this.#setHostVisibility('spider', true);

        this.#spiderChart = new StyleSpiderChart(hostEl.id, studentData, studentId, displayName, {
            useWidth,
            comparisonModes,
            comparisonState: this.host.getOption('comparisonState'),
            enConfig: this.host.getOption('enConfig'),
            classStyleAverages: this.host.getOption('styleAverages'),
        });
        return this.#spiderChart;
    }

    /**
     * Construct the lollipop renderer into its own host div, for the current
     * mode's domain. Creation is left to the caller, as with the spider.
     * @returns {StyleLollipopChart|null} The renderer, or `null` when no host div could be mounted.
     */
    #buildLollipopChart() {
        const { studentData, studentId, comparisonModes, styleAverages } =
            /** @type {StyleChartData} */ (this.#currentData);
        const hostEl = this.#ensureChartHost('lollipop');
        if (!hostEl) return null;
        this.#setHostVisibility('lollipop', true);

        this.#lollipopChart = new StyleLollipopChart(
            hostEl.id,
            studentData,
            studentId,
            this.#currentMode === 'all' ? null : this.#currentMode,
            {
                comparisonModes,
                comparisonState: this.host.getOption('comparisonState'),
                styleAverages: this.#resolveStyleAverages(styleAverages),
                enConfig: this.host.getOption('enConfig'),
            },
        );
        return this.#lollipopChart;
    }

    /**
     * Ensure a dedicated child host element exists for the requested chart type.
     * Both spider and lollipop instances can co-exist in separate host divs so
     * mode toggles only swap visibility instead of destroying and recreating
     * the chart (which forces a full D3 + ResizeObserver setup each time).
     * @param {'spider'|'lollipop'} type - Which chart the host belongs to.
     * @returns {HTMLElement|null} The host element, or null if contentContainer is unavailable.
     */
    #ensureChartHost(type) {
        const contentContainer = this.host.contentContainer;
        if (!contentContainer) return null;
        const baseId = contentContainer.id;
        if (!baseId) return null;
        const suffix = type === 'spider' ? 'styleSpider' : 'styleLollipop';
        const existing = type === 'spider' ? this.#spiderHost : this.#lollipopHost;
        if (existing?.isConnected) return existing;
        const hostEl = document.createElement('div');
        hostEl.id = `${baseId}-${suffix}`;
        hostEl.className = `style-chart-host style-chart-host-${type}`;
        hostEl.style.width = '100%';
        hostEl.style.height = '100%';
        // A prior empty state replaced the body with its placeholder — drop it
        // rather than mounting the chart underneath it.
        contentContainer.querySelector('.chart-empty-state')?.remove();
        contentContainer.appendChild(hostEl);
        if (type === 'spider') this.#spiderHost = hostEl;
        else this.#lollipopHost = hostEl;
        return hostEl;
    }

    /**
     * Toggle the display of a chart host without destroying its chart instance.
     * @param {'spider'|'lollipop'} type - Which chart's host to flip.
     * @param {boolean} visible - Whether the host should be shown.
     * @returns {void}
     */
    #setHostVisibility(type, visible) {
        const hostEl = type === 'spider' ? this.#spiderHost : this.#lollipopHost;
        if (!hostEl) return;
        hostEl.style.display = visible ? '' : 'none';
    }

    /**
     * Apply the lollipop chart's computed minimum row-layout height to the host's
     * own container (the `.chart-section` grid item), including the header chrome,
     * so the CSS grid row it lives in won't shrink the chart below the point where
     * its rows can no longer fit their own minimum size.
     * @returns {void}
     */
    #applyChartMinHeight() {
        const chartMinHeight = this.#lollipopChart?.getRequiredMinHeight();
        const container = this.host.container;
        if (chartMinHeight == null || !container) return;
        const headerHeight =
            container.querySelector('.content-module-header')?.getBoundingClientRect().height ?? 0;
        container.style.minHeight = `${Math.ceil(chartMinHeight + headerHeight)}px`;
    }
}

// ============================================================================
// CONTROLLER ACCESS
// ============================================================================

/**
 * The controller is created on first access and kept on the host's config state, so
 * every callback in the descriptor below reaches the same instance.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
 * @returns {StyleChartController} The host's controller.
 */
function getStyleChartController(host) {
    if (!host.configState.controller) {
        host.configState.controller = new StyleChartController(host);
    }
    return host.configState.controller;
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verbs bound onto the instance.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setDomainMode(mode: string): void,
 *     setActiveModes(activeModes: string[]): void,
 *     applySync(data: object): void,
 *     setStudent(data: object): void,
 * }} StyleChartHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const styleChartConfig = {
    defaultOptions: {
        showModuleTitle: false,
        enableModuleExport: true,
    },

    /**
     * Initial render. Spider mode hands the renderer back for the host to create;
     * lollipop mode returns null and waits for the class table's first sync.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into.
     * @param {object} data - The view's initial payload for this card.
     * @returns {object|null} The prepared renderer, or `null` when creation is deferred.
     */
    createRenderer(host, data) {
        return getStyleChartController(host).prepare(data);
    },

    /**
     * The student view re-points one spider at whichever student is selected, and
     * both views re-render on a domain switch, so both belong in the export id.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
     * @returns {Array<string|null|undefined>} The selected student and current mode.
     */
    getExportIdentity(host) {
        return getStyleChartController(host).exportIdentity();
    },

    /**
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose charts have just been drawn.
     */
    onRendered(host) {
        getStyleChartController(host).onRendered();
    },

    publicAPI: {
        /**
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
         * @param {string} mode - The domain mode to switch to.
         */
        setDomainMode(host, mode) {
            getStyleChartController(host).setDomainMode(mode);
        },

        /**
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
         * @param {string[]} activeModes - Which comparison groups are active now.
         */
        setActiveModes(host, activeModes) {
            getStyleChartController(host).setActiveModes(activeModes);
        },

        /**
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
         * @param {object} data - The class table's current ids and mode.
         */
        applySync(host, data) {
            getStyleChartController(host).applySync(data);
        },

        /**
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
         * @param {object} data - The newly selected student: `{ studentId, displayName? }`.
         */
        setStudent(host, data) {
            getStyleChartController(host).setStudent(data);
        },
    },

    /**
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host being torn down.
     */
    onCleanup(host) {
        host.configState.controller?.cleanup();
    },
};
