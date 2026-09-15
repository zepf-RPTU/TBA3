/**
 * MaLayoutViewBase — shared base for the MA views that switch layout mode.
 *
 * Owns the layout-mode management (both, table-only, chart-only) and the focus-chart
 * lifecycle that MaItemViewModule and MaStudentViewModule have in common.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { LAYOUT_MODES } from '../maConstants.js';
import { appendChildren, createElement, createPlaceholder, queryEl } from '@tba3/module-base';
import { taskRingFocusConfig } from '@tba3/modules/charts/task-ring-focus';
import {
    getTaskRingChartDefinitions,
    remountChartHost,
    resolveDefaultDomain,
    taskRingGridConfig,
    updateTaskRingHostIfReusable,
} from '@tba3/modules/charts/task-ring-grid';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { getMaDomains } from '../utils/maDomains.js';
import './maLayoutViewBase.css';

/**
 * @typedef {object} LayoutConfig
 * @property {string} focusChartContainerId - Container ID for focus charts
 * @property {string} contentContainerSelector - CSS selector for main content container
 */

/**
 * @typedef {import('../../common/modules/baseViewModule.js').ViewModuleOptions & {
 *   focusGlossaryKey?: string
 * }} MAViewModuleOptions
 */

/**
 * Reuse probe for the focus chart: unlike the ring grid it renders one Leitidee at a
 * time, so any live host can take any domain through a plain update — there is no
 * cheaper selection-only path and nothing to compare beyond "is it still alive".
 * @param {import('@tba3/modules/common/charts/host/chartHostModule.js').ChartHostModule|null|undefined} module - The mounted focus host, if there is one.
 * @param {object} data - The focus chart data to render.
 * @returns {Promise<string>} `update` when the host took the data, `rebuild` otherwise.
 */
async function reuseLiveFocusChart(module, data) {
    if (!module?.initialized || module.destroyed) return 'rebuild';
    await module.update(data);
    return 'update';
}

export class MaLayoutViewBase extends BaseViewModule {
    /** @type {string} Current layout mode */
    _currentLayoutMode = LAYOUT_MODES.BOTH;

    /** @type {string|null} Last mode for which table widths were updated */
    _lastTableWidthMode = null;

    /** @type {Map<string, import('@tba3/modules/common/charts/host/chartHostModule.js').ChartHostModule>} Focus chart instances by domain */
    _focusChartInstances = new Map();

    /** @type {boolean} Flag to prevent duplicate renders during chart-only initialization */
    _chartOnlyInitializing = false;

    /** @type {import('@tba3/modules/ma/modules/charts/taskRing/taskRingGridConfig.js').TaskRingGridHost|null} Task ring module for chart-only mode */
    _taskRingChartOnlyModule = null;

    /**
     * Monotonic tokens identifying the newest host swap of each kind. A swap that
     * finds its token superseded abandons itself rather than mounting a host the
     * view has already moved on from.
     * @type {number}
     */
    _chartOnlyRequestId = 0;

    /** @type {number} */
    _focusChartRequestId = 0;

    /**
     * Get layout configuration - subclasses must override
     * @abstract
     * @returns {LayoutConfig} The class names and container ids this view's scaffold is built from.
     * @protected
     */
    _getLayoutConfig() {
        throw new Error(`${this.constructor.name}: _getLayoutConfig() must be implemented`);
    }

    /**
     * Get the content container selector for layout changes
     * Subclasses can override for different DOM structures
     * @returns {string} A CSS selector for the element layout changes are applied to.
     * @protected
     */
    _getContentContainerSelector() {
        return this._getLayoutConfig().contentContainerSelector || '.view-content';
    }

    /**
     * Get current layout mode
     * @returns {string} The mode the view is currently rendered in.
     */
    get currentLayoutMode() {
        return this._currentLayoutMode;
    }

    // ========================================================================
    // SPLIT-VIEW DOM SCAFFOLD
    // ========================================================================

    /**
     * Render the MA task-ring split-view scaffold used by the item and student views.
     * This stays app-specific on purpose: left content differs by view, while the
     * chart and chart-only hosts follow one stable structure.
     * @protected
     * @param {object} config - What differs between the views that share this scaffold.
     * @param {string} config.viewClassName - Class on the view root.
     * @param {string} config.contentClassName - Class on the split-view content element.
     * @param {string} config.leftSectionClassName - Class on the left column.
     * @param {Array<HTMLElement>} config.leftSectionChildren - The view's own left-column content, appended in order.
     * @param {string} config.chartContainerId - Id of the split-view chart host.
     * @param {string} config.chartOnlyContainerId - Id of the host used when the chart takes the full view.
     * @param {string} config.focusChartContainerId - Id of the host the focus chart is mounted into.
     * @param {string} config.chartOnlyContainerClassName - Class on the chart-only host.
     * @param {string|null} [config.outerWrapperClassName] - Extra wrapper around the whole scaffold, when the view needs one.
     * @param {Array<HTMLElement>} [config.topChildren] - Content placed above the split, e.g. a toolbar.
     */
    _renderTaskRingSplitView({
        viewClassName,
        contentClassName,
        leftSectionClassName,
        leftSectionChildren,
        chartContainerId,
        chartOnlyContainerId,
        focusChartContainerId,
        chartOnlyContainerClassName,
        outerWrapperClassName = null,
        topChildren = [],
    }) {
        const container = this.container;
        if (!container) return;
        container.className = `${viewClassName} view-base`;
        container.innerHTML = '';

        const leftColumn = createElement(
            'div',
            {
                className: ['left-column', 'view-section', leftSectionClassName],
            },
            leftSectionChildren,
        );

        const chartOnlyContainer = createElement(
            'div',
            { className: ['ma-chart-only-content', chartOnlyContainerClassName] },
            [
                createPlaceholder(chartOnlyContainerId, 'task-ring-chart-container'),
                createPlaceholder(focusChartContainerId, 'task-ring-focus-container'),
            ],
        );

        // The mode class (toggled by _updateLayoutMode) sits alongside the
        // stable layout classes; only the initial mode is set here.
        const content = createElement(
            'div',
            {
                className: [
                    'ma-split-view-content',
                    contentClassName,
                    `layout-mode-${LAYOUT_MODES.BOTH}`,
                ],
            },
            [
                leftColumn,
                createPlaceholder(
                    chartContainerId,
                    'right-column view-section task-ring-chart-container',
                ),
                chartOnlyContainer,
            ],
        );

        const rootChildren = [...topChildren, content];
        if (outerWrapperClassName) {
            container.appendChild(
                createElement('div', { className: outerWrapperClassName }, rootChildren),
            );
            return;
        }

        appendChildren(container, rootChildren);
    }

    // ========================================================================
    // EVENT SETUP
    // ========================================================================

    /**
     * Sets up common layout event listeners
     * Call this from subclass's event setup method
     * @protected
     */
    _setupLayoutEventListeners() {
        // The header's layout switch (and a navigation's viewMode) write the
        // app-state key; show() covers a change that happened while hidden.
        this.observeState('layoutMode', (mode) => {
            if (mode) {
                this._updateLayoutMode(mode);
            }
        });

        // The focused Leitidee is shared by the item and student views: a ring
        // click writes the key, both views follow it (a hidden one on resume).
        this.observeState('chartOnlyDomainId', (domainId) => {
            this.#applyChartOnlyDomain(domainId);
        });
    }

    /**
     * A ring click (or the grid's default selection) in the chart-only task-ring
     * host, wired through its `onDomainSelected` option. Only writes the shared
     * key; the view's own observer renders it. A seeded grid reports the seed
     * back, which `updateState` drops as unchanged.
     * @param {string} domainId - The selected Leitidee
     */
    #onDomainSelected(domainId) {
        if (this._currentLayoutMode !== LAYOUT_MODES.CHART_ONLY || !domainId) return;

        this.options.appState.updateState({ chartOnlyDomainId: domainId });
    }

    /**
     * Bring the chart-only grid and focus chart to the shared Leitidee.
     * @param {string|null} domainId - The app-state Leitidee
     */
    #applyChartOnlyDomain(domainId) {
        // A running chart-only creation seeds itself from the same key.
        if (this._chartOnlyInitializing) return;
        if (this._currentLayoutMode !== LAYOUT_MODES.CHART_ONLY || !domainId) return;

        // Resolve the domain id against the same source the task-ring grid was
        // built from, so the override still receives the full domain object.
        const domain = getMaDomains(this.getOption('dataStore')).find((d) => d.domain === domainId);
        if (!domain) return;

        this._taskRingChartOnlyModule?.selectDomain(domainId);
        if (this._focusChartInstances.has(domainId)) return;

        this._onDomainSelectedInChartOnly(domain);
    }

    /**
     * Hook called when domain is selected in chart-only mode
     * Subclasses should override to update focus chart with appropriate data
     * @param {object} domain - Selected domain
     * @protected
     */
    _onDomainSelectedInChartOnly(domain) {
        // Default implementation - update focus for all students
        this._createFocusChart(domain);
    }

    // ========================================================================
    // LAYOUT MODE MANAGEMENT
    // ========================================================================

    /**
     * Update layout mode (called when mode changes from header control)
     * @param {string} mode - New layout mode
     * @protected
     */
    _updateLayoutMode(mode) {
        // Guard: Skip if already in this mode
        if (this._currentLayoutMode === mode) {
            return;
        }

        const contentSelector = this._getContentContainerSelector();
        const contentContainer = queryEl(this.container, contentSelector);
        if (!contentContainer) return;

        // Hide during transition
        contentContainer.style.visibility = 'hidden';

        // Update layout
        this._currentLayoutMode = mode;

        // Update class for CSS styling. Remove the known mode classes by name
        // rather than regex-stripping every `layout-mode-*` token, so a sibling
        // class that merely contains that substring can't be clobbered.
        contentContainer.classList.remove(
            `layout-mode-${LAYOUT_MODES.BOTH}`,
            `layout-mode-${LAYOUT_MODES.TABLE_ONLY}`,
            `layout-mode-${LAYOUT_MODES.CHART_ONLY}`,
        );
        contentContainer.classList.add(`layout-mode-${mode}`);

        // Trigger chart-only creation after the mode class is applied.
        if (mode === LAYOUT_MODES.CHART_ONLY) {
            this._onChartOnlyModeEntered();
        }

        // Defer table column width updates until after the layout class is applied.
        this.resources.trackAnimationFrame(() => {
            this._updateTableColumnWidths(mode);
        });

        // Handle resize/reveal
        this._handleLayoutTransition(mode, contentContainer);
    }

    /**
     * Handle layout transition animation/reveal
     * @param {string} mode - Layout mode
     * @param {HTMLElement} contentContainer - Content container element
     * @protected
     */
    _handleLayoutTransition(mode, contentContainer) {
        if (mode === LAYOUT_MODES.BOTH) {
            // Reveal content immediately - charts will resize via ResizeObserver
            contentContainer.style.visibility = 'visible';

            // Targeted chart refresh after layout paint (instead of global window resize)
            this.resources.trackTimeout(() => {
                this._refreshChildCharts();
            }, 50);
        } else if (mode === LAYOUT_MODES.CHART_ONLY) {
            // Content revealed after charts created (handled in chart creation)
            // Safety fallback: reveal even if chart creation fails or aborts
            this.resources.trackTimeout(() => {
                if (this.destroyed) return;
                if (contentContainer.style.visibility === 'hidden') {
                    contentContainer.style.visibility = 'visible';
                }
            }, 500);
        } else {
            this.resources.trackTimeout(() => {
                contentContainer.style.visibility = 'visible';
            }, 50);
        }
    }

    /**
     * Hook called when chart-only mode is entered - subclasses must implement
     * @abstract
     * @protected
     */
    _onChartOnlyModeEntered() {
        // Subclasses implement to create chart-only view
    }

    /**
     * The table module whose column widths follow the layout mode, or null while
     * it does not exist yet.
     * @returns {{container: HTMLElement|null, redraw: () => void}|null} The view's table module
     * @protected
     */
    _getLayoutTableModule() {
        return null;
    }

    /**
     * Redraws the view's table once per layout mode, so Tabulator remeasures its
     * columns against the width the new mode gives it.
     * @param {string} mode - Layout mode
     * @protected
     */
    _updateTableColumnWidths(mode) {
        if (this._lastTableWidthMode === mode) {
            return;
        }

        const tableModule = this._getLayoutTableModule();
        if (!tableModule) {
            return;
        }

        // A container with no measurable box would make Tabulator compute zero
        // widths; the next mode switch redraws it instead.
        const tableContainer = tableModule.container;
        if (
            tableContainer &&
            (tableContainer.offsetWidth === 0 || tableContainer.offsetHeight === 0)
        ) {
            return;
        }

        tableModule.redraw();
        this._lastTableWidthMode = mode;
    }

    // ========================================================================
    // FOCUS CHART MANAGEMENT
    // ========================================================================

    /**
     * Creates focus chart for a domain
     * @param {object | null} domain - Domain object (or null to use first domain)
     * @param {Array|null} [selectedStudents] - Optional selected student IDs for tick rendering
     * @returns {Promise<void>}
     * @protected
     */
    async _createFocusChart(domain = null, selectedStudents = null) {
        const config = this._getLayoutConfig();
        const data = this.getData();
        if (!data?.itemArray || !data?.studentArray) return;

        const domains = getMaDomains(this.getOption('dataStore'));
        const activeFocusModule = this._focusChartInstances.values().next().value ?? null;
        const container =
            activeFocusModule?.container || document.getElementById(config.focusChartContainerId);
        if (!container) return;

        if (domains.length === 0) {
            this._cleanupFocusCharts({ preserveHost: true });
            container.innerHTML = `<p class="task-ring-empty-state">${glossaryAnnotator.getRequiredEntryText('ma.items.task-ring-focus.messages.no-domains')}</p>`;
            return;
        }

        // Default to the Leitidee the ring grid has selected (seeded from app state),
        // so the highlighted ring and the focus chart never disagree; without a live
        // grid, the ring it would select — domains[0] may be a Leitidee without tasks.
        const defaultDomainId =
            this._taskRingChartOnlyModule?.getSelectedDomain() ??
            resolveDefaultDomain(getTaskRingChartDefinitions(domains, data.itemArray), null);
        const targetDomain =
            domain || domains.find((entry) => entry.domain === defaultDomainId) || domains[0];
        const domainItems = data.itemArray.filter((item) => item.domain === targetDomain.domain);
        const focusChartData = {
            domainItems,
            studentArray: data.studentArray,
            domain: targetDomain,
            selectedStudents,
        };

        // Re-key to the domain now in focus, but keep the live host in the map while
        // the swap runs: this method is called unawaited from domain-selection events,
        // and a call arriving during the await has to find that host and reuse it. An
        // empty map reads as "nothing mounted", so it would build a second host into
        // the same container and wipe this one's DOM out from under it.
        const requestId = ++this._focusChartRequestId;
        this._focusChartInstances.clear();
        if (activeFocusModule) {
            this._focusChartInstances.set(targetDomain.domain, activeFocusModule);
        }

        const { module: focusModule } = await remountChartHost({
            owner: this,
            module: activeFocusModule,
            data: focusChartData,
            containerId: config.focusChartContainerId,
            config: taskRingFocusConfig,
            reuseProbe: reuseLiveFocusChart,
            hasPendingRequest: () => this._focusChartRequestId !== requestId,
            moduleOptions: {
                glossaryData: this.getOption('glossaryData'),
                ...(this.options.focusGlossaryKey
                    ? { glossaryKey: this.options.focusGlossaryKey }
                    : {}),
            },
        });

        // A newer call owns the map by now, and its host is the one on screen. Writing
        // this one back would leave the map pointing at a module whose DOM the newer
        // swap already cleared — the next domain switch would "reuse" it and render
        // into a detached node.
        if (this._focusChartRequestId !== requestId) return;

        this._focusChartInstances.clear();
        if (focusModule) {
            this._focusChartInstances.set(targetDomain.domain, focusModule);
        }
    }

    /**
     * Cleanup focus chart instances
     * @param {object} [options] - How much of the DOM to keep.
     * @param {boolean} [options.preserveHost] - Keep the host element in place (emptied) instead of letting the teardown remove it, so a following render can reuse the same node and position.
     * @returns {HTMLElement|null} The host container, or `null` when there was none.
     * @protected
     */
    _cleanupFocusCharts({ preserveHost = false } = {}) {
        const activeFocusModule = this._focusChartInstances.values().next().value ?? null;
        const container =
            activeFocusModule?.container ||
            document.getElementById(this._getLayoutConfig().focusChartContainerId);
        const containerParent = preserveHost ? container?.parentNode : null;
        const containerNext = preserveHost ? container?.nextSibling : null;

        this.destroyAndUnregisterAll(this._focusChartInstances);

        if (
            preserveHost &&
            container instanceof HTMLElement &&
            containerParent instanceof HTMLElement
        ) {
            container.innerHTML = '';
            containerParent.insertBefore(container, containerNext);
        }

        return container;
    }

    /**
     * Reveal content container after chart-only view is created
     * @param {number} [delay=180] - Delay in ms before reveal
     * @protected
     */
    _revealContentAfterChartCreation(delay = 180) {
        this.resources.trackTimeout(() => {
            if (this.destroyed) return;
            const contentContainer = queryEl(this.container, this._getContentContainerSelector());
            if (contentContainer) {
                contentContainer.style.visibility = 'visible';
            }
        }, delay);
    }

    // ========================================================================
    // CHART-ONLY MODE TASK RING GRID
    // ========================================================================

    /**
     * Creates task ring grid for chart-only mode
     * @param {object} options - Options for grid creation
     * @param {string} options.containerId - Container ID
     * @param {Array} options.domains - Domain array
     * @param {Array} [options.selectedStudents=[]] - Selected student IDs
     * @returns {Promise<void>}
     * @protected
     */
    async _createTaskRingGridForChartOnly({ containerId, domains, selectedStudents = [] }) {
        const data = this.getData();
        const taskRingData = {
            itemArray: data?.itemArray,
            studentArray: data?.studentArray,
            domains,
            selectedStudents,
            // The Leitidee the other layout view may have focused meanwhile.
            selectedDomain: this.options.appState?.getStateValue('chartOnlyDomainId') ?? null,
        };

        const requestId = ++this._chartOnlyRequestId;
        const { module, status } = await remountChartHost({
            owner: this,
            module: this._taskRingChartOnlyModule,
            data: taskRingData,
            containerId,
            config: taskRingGridConfig,
            reuseProbe: updateTaskRingHostIfReusable,
            hasPendingRequest: () => this._chartOnlyRequestId !== requestId,
            moduleOptions: {
                ...this._childOptions(),
                enableDomainSelection: true,
                onDomainSelected: (domainId) => this.#onDomainSelected(domainId),
            },
        });

        // Null on the abandoned and missing-container paths, where the old host is
        // already gone — the view must not keep pointing at it. The swap helper hands back
        // the bare host; `taskRingGridConfig` is what binds the grid verbs onto it, and
        // naming that here is what lets `tsc` check the verb calls below.
        this._taskRingChartOnlyModule =
            /** @type {import('@tba3/modules/ma/modules/charts/taskRing/taskRingGridConfig.js').TaskRingGridHost|null} */ (
                module
            );

        if (status === 'aborted' || status === 'missing-container') return;

        if (status === 'rebuild') {
            this._revealContentAfterChartCreation();
        } else {
            this._revealContentAfterChartCreation(status === 'noop' ? 0 : 120);
        }
    }

    // ========================================================================
    // SHOW/CLEANUP HOOKS
    // ========================================================================

    /**
     * Common show behavior for layout views
     * Syncs layout mode with global state and handles resize. Column and
     * chart-only-panel visibility is CSS-owned through the layout-mode-* class,
     * so BaseModule.show() can clear child inline display without a JS repair.
     * @override
     */
    show() {
        super.show();

        // Sync layout mode with global state.
        const globalLayoutMode = this.options.appState?.getStateValue('layoutMode');
        let layoutSynced = false;
        if (globalLayoutMode && globalLayoutMode !== this._currentLayoutMode) {
            this._updateLayoutMode(globalLayoutMode);
            layoutSynced = true;
        }

        // Reset width mode tracker to force recalculation on next layout change
        this._lastTableWidthMode = null;

        // Targeted chart refresh after layout settles — skip if _updateLayoutMode
        // already triggered _refreshChildCharts via _handleLayoutTransition
        if (!layoutSynced) {
            this.resources.trackTimeout(() => {
                this._refreshChildCharts();
            }, 150);
        }
    }

    /**
     * Refresh only this view's chart modules instead of broadcasting a global resize.
     * Iterates child modules to find ChartHostModules and calls redraw/refresh.
     * @protected
     */
    _refreshChildCharts() {
        // Refresh focus chart instances (only if visible)
        if (this._focusChartInstances) {
            this._focusChartInstances.forEach((chartModule) => {
                if (chartModule?.initialized && chartModule.visible) {
                    chartModule.refreshCharts?.();
                }
            });
        }

        // Refresh chart-only grid module (only if visible)
        if (this._taskRingChartOnlyModule?.initialized && this._taskRingChartOnlyModule.visible) {
            this._taskRingChartOnlyModule.refreshCharts?.();
        }

        // Refresh any other registered child modules that are ChartHostModules (only if visible)
        const focusChartSet = new Set(this._focusChartInstances?.values() ?? []);
        for (const child of /** @type {Set<any>} */ (this.childModules)) {
            if (
                child !== this._taskRingChartOnlyModule &&
                !focusChartSet.has(child) &&
                child.initialized &&
                child.visible &&
                typeof child.refreshCharts === 'function'
            ) {
                child.refreshCharts();
            }
        }
    }

    /**
     * @override
     */
    destroy() {
        this._cleanupFocusCharts();
        super.destroy();
    }
}
