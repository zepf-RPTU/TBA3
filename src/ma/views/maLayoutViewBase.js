/**
 * MaLayoutViewBase — base of an MA view with a layout switch: the render order, the
 * split-view scaffold, the three layout modes and the chart-only hosts. A subclass
 * names its scaffold and the student the rings mark.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { LAYOUT_MODES } from '../maConstants.js';
import { html, nothing, render } from 'lit';
import { computed } from '@preact/signals-core';
import { ChartHostModule } from '@tba3/modules/charts';
import { itemRingFocusConfig } from '@tba3/modules/charts/item-ring-focus';
import { itemRingGridConfig } from '@tba3/modules/charts/item-ring-grid';
import { MA_DATASETS, resolveGrouping } from '@tba3/modules/ma-domain';
import './maLayoutViewBase.css';

/**
 * What differs between the views that share the split-view scaffold. Every module in it
 * follows what it shows itself; the base only places them.
 * @typedef {object} SplitViewSpec
 * @property {string} prefix - Names the view's root class, content class and ring-host ids.
 * @property {Array<import('@tba3/module-base').BaseModule<any>>} left - The split panel's left column, placed when the panel first fills.
 * @property {import('@tba3/module-base').BaseModule<any>} [top] - Above the split, shown in every mode.
 * @property {string} [gridGlossaryKey] - Glossary entry of both ring grids; the grid's own when absent.
 * @property {import('@preact/signals-core').ReadonlySignal<string|null>} [student] - The one student all three ring hosts mark; none draws the group figures.
 */

/** @typedef {import('@tba3/modules/charts/item-ring-grid').ItemRingGridHost} ItemRingGridHost */
/** @typedef {import('@tba3/modules/charts/item-ring-focus').ItemRingFocusChartHost} ItemRingFocusChartHost */

/**
 * @abstract
 * @augments {BaseViewModule<import('../maAppModule.js').MaState>}
 */
export class MaLayoutViewBase extends BaseViewModule {
    /** @type {import('../maConstants.js').LayoutMode} */
    #layoutMode = LAYOUT_MODES.BOTH;

    /** @type {SplitViewSpec|null} The subclass's scaffold, kept for the re-render a mode switch makes */
    #spec = null;

    /** @type {ItemRingGridHost|null} The split panel's ring grid, its right column. */
    #splitGrid = null;
    /** @type {ItemRingGridHost|null} */
    #chartOnlyGrid = null;
    /** @type {ItemRingFocusChartHost|null} One host serves every ring in turn */
    #focusChart = null;

    /**
     * The split panel's first fill; null until a mode first shows the panel.
     * @type {Promise<unknown>|null}
     */
    #splitReady = null;

    /**
     * The chart-only hosts' first fill; null until chart-only mode is first entered.
     * @type {Promise<unknown>|null}
     */
    #chartOnlyReady = null;

    /**
     * Whether a table shows its competence columns: only in table-only mode, since
     * beside the ring grid it keeps to its narrower columns.
     * @returns {import('@preact/signals-core').ReadonlySignal<boolean>}
     * @protected
     */
    _showCompetences() {
        return computed(() => this.options.appState.layoutMode.value === LAYOUT_MODES.TABLE_ONLY);
    }

    // ========================================================================
    // RENDER ORDER
    // ========================================================================

    /**
     * The scaffold renders in the stored layout mode before the observers register, and
     * that mode's panel fills before the view shows.
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.#spec = this._splitView();
        this.#buildScaffoldHosts(this.#spec);
        this.#layoutMode = this.options.appState.layoutMode.value;
        this.#renderScaffold();
        this.#observeLayout();
        await this.#fillModePanel();
    }

    /**
     * The view's scaffold, built once: the subclass creates its own modules here.
     * @abstract
     * @protected
     * @returns {SplitViewSpec}
     */
    _splitView() {
        throw new Error(`${this.constructor.name} must implement _splitView()`);
    }

    // ========================================================================
    // SPLIT-VIEW DOM SCAFFOLD
    // ========================================================================

    /**
     * Render the scaffold in the current layout mode, with the modules of every filled
     * panel. Called again on a mode switch (moves the mode class) and on a panel's first
     * fill (places its modules).
     */
    #renderScaffold() {
        const { prefix, left, top } = /** @type {SplitViewSpec} */ (this.#spec);
        this.classList.add(`ma-${prefix}-view`);
        const modeClass = `layout-mode-${this.#layoutMode}`;
        const chartOnly = this.#chartOnlyReady
            ? html`${this.#chartOnlyGrid}${this.#focusChart}`
            : nothing;
        const content = html`<div
            class="layout-grid ma-split-view-content ${prefix}-view-content ${modeClass}"
        >
            <div class="left-column view-section">${this.#splitReady ? left : nothing}</div>
            ${this.#splitReady ? this.#splitGrid : nothing}
            <div class="layout-grid ma-chart-only-content">${chartOnly}</div>
        </div>`;
        render(
            top
                ? html`<div class="layout-stack ma-split-view-shell">${top}${content}</div>`
                : content,
            this,
        );
    }

    /**
     * Build the scaffold's three ring hosts. The split grid is the right column; the
     * chart-only grid and focus chart fill the chart-only panel and follow the shared
     * ring.
     * @param {SplitViewSpec} spec
     */
    #buildScaffoldHosts({ prefix, gridGlossaryKey, student }) {
        const { itemRingGrouping, chartOnlyRingId } = this.options.appState;
        // Both grids show the same rings for the same view, so they share their copy,
        // and every grid of the app follows the one grouping.
        const gridOptions = {
            ...(gridGlossaryKey && { glossaryKey: gridGlossaryKey }),
            ringGrouping: itemRingGrouping,
            student,
        };
        const splitGrid = ChartHostModule.createChart(
            `ma-${prefix}-itemRing`,
            itemRingGridConfig,
            this._childOptions(gridOptions),
        );
        splitGrid.className = 'right-column view-section item-ring-chart-container';
        this.#splitGrid = splitGrid;

        const grid = ChartHostModule.createChart(
            `ma-${prefix}-itemRing-chartOnly`,
            itemRingGridConfig,
            {
                ...this._childOptions(gridOptions),
                ringId: chartOnlyRingId,
                onRingSelected: (ringId) => this.#onRingSelected(ringId),
            },
        );
        grid.className = 'item-ring-chart-container';
        this.#chartOnlyGrid = grid;

        const focus = ChartHostModule.createChart(`ma-${prefix}-focus`, itemRingFocusConfig, {
            ...this._childOptions(),
            ringGrouping: itemRingGrouping,
            ringId: chartOnlyRingId,
            student,
            onStudentSelected: (studentId) => this._openStudent(studentId),
        });
        focus.className = 'item-ring-focus-container';
        this.#focusChart = focus;
    }

    // ========================================================================
    // EVENT HANDLERS
    // ========================================================================

    #observeLayout() {
        const { layoutMode, itemRingGrouping, chartOnlyRingId } = this.options.appState;
        this.watch(layoutMode, (mode) => this.#updateLayoutMode(mode));

        // Another grouping has other rings: the focus starts over at its first. The
        // hosts follow the grouping and the ring themselves. Only a key the grouping does
        // not know is dropped: a hidden view gets the grouping change late, after a ring
        // of the new grouping may have been clicked.
        this.watch(itemRingGrouping, (grouping) => {
            if (
                chartOnlyRingId.value !== null &&
                !this.#groupingRings(grouping).some((ring) => ring.id === chartOnlyRingId.value)
            ) {
                chartOnlyRingId.value = null;
            }
        });
    }

    /**
     * A ring click in the chart-only grid. Only writes the shared key, which every
     * chart-only host follows.
     * @param {string} ringId
     */
    #onRingSelected(ringId) {
        if (!ringId) return;

        this.options.appState.chartOnlyRingId.value = ringId;
    }

    // ========================================================================
    // LAYOUT MODE MANAGEMENT
    // ========================================================================

    /**
     * Apply a layout mode from app state: the mode class moves first, so every module
     * re-checks its visibility against the new layout; then the mode's panel fills
     * under the view's cover.
     * @param {import('../maConstants.js').LayoutMode|null} mode - None keeps the current one
     */
    #updateLayoutMode(mode) {
        if (!mode || this.#layoutMode === mode) return;

        this.#layoutMode = mode;
        this.#renderScaffold();
        this.refreshVisibility();
        // A watch handler: a failed fill has no caller to reach, so it is reported here.
        void this.coverWhile(this.#fillModePanel()).catch((error) => {
            console.error(`${this.constructor.name}: Error filling the ${mode} panel:`, error);
        });
    }

    /**
     * Fill the current mode's panel the first time it is needed: place its modules. Their
     * content passes start on placement, which the returned promise waits for.
     * @returns {Promise<unknown>} Resolves once the panel's modules have built their content.
     */
    #fillModePanel() {
        if (this.#layoutMode === LAYOUT_MODES.CHART_ONLY) {
            if (!this.#chartOnlyReady) {
                this.#chartOnlyReady = contentOf([this.#chartOnlyGrid, this.#focusChart]);
                this.#renderScaffold();
            }
            return this.#chartOnlyReady;
        }
        if (!this.#splitReady) {
            const { left } = /** @type {SplitViewSpec} */ (this.#spec);
            this.#splitReady = contentOf([...left, this.#splitGrid]);
            this.#renderScaffold();
        }
        return this.#splitReady;
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * The rings a grouping offers for selection.
     * @param {string} grouping
     * @returns {Array<{id: string, isEmpty: boolean}>} Its rings, without "Gesamt".
     */
    #groupingRings(grouping) {
        return resolveGrouping(
            this.options.context.documents.getDataset(MA_DATASETS.ITEM_RINGS),
            grouping,
        ).rings;
    }
}

/**
 * @param {Array<import('@tba3/module-base').BaseModule<any>|null>} modules - Created, placed right after.
 * @returns {Promise<unknown>} Resolves once every module has built its first content.
 */
function contentOf(modules) {
    return Promise.all(modules.map((module) => module?.contentComplete));
}
