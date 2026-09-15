/**
 * ChartRenderer — base class for the D3 chart renderers.
 *
 * Provides the common lifecycle, responsive behaviour and drawing utilities; tooltips
 * and resize handling come from the shared services, and export controls belong to the
 * host or content module rather than to a renderer. Every instance must be wrapped in a
 * ChartHostModule for its resources to be managed. For stacked bars, extend
 * BarChartRenderer instead.
 *
 * Subclasses keep cleanable state on `this.chartState`. The base `destroy()` disconnects
 * the chart from resize observers and tooltips and clears the container DOM; property
 * nulling is intentionally omitted — once the parent releases the reference (through
 * `ChartHostModule.#destroyCharts`), the whole instance is collected.
 *
 * `setElementVisibility()` toggles opacity *and* pointer-events together, so a hidden
 * element cannot answer a hover. An element whose tooltip is wired through
 * `wireTooltipEvents()` takes its `isVisible` option to guard on the same state.
 * @abstract
 */

import { resizeService as defaultResizeService } from '@tba3/module-base/services/resizeService.js';
import { tooltipService } from '../../services/tooltipService.js';
import { glossaryAnnotator } from '../../glossary/glossaryAnnotator.js';
import { ResourceTracker } from '@tba3/module-base/utils/resourceTracker.js';
import { HIDDEN_LEGEND_OPACITY } from '../markerSymbols.js';
import { getThemeColors } from '../../services/themeService.js';
import { applyReactiveState } from '@tba3/module-base/utils/reactiveStateMixin.js';
import { AXIS_DEFAULTS, DEFAULT_DIMENSIONS, TICK_PADDING } from '../chartDefaults.js';
import { prefersReducedMotion } from '../motionPreference.js';
import { getResponsiveChartDimensions } from './internal/chartDimensions.js';
import {
    chartTextSizeCssValue,
    probeFontSizePx,
    resolveContainerFontSize,
} from './internal/chartTypography.js';
import { computeChartLayout } from './internal/chartLayout.js';
import {
    applyHoverEffect as applyChartHoverEffect,
    createOpacityHoverEffect,
    DEFAULT_CHART_HOVER_OPACITY,
    wireTooltipEvents as wireChartTooltipEvents,
} from './internal/chartInteractionUtils.js';
import {
    appendWrappedTspans,
    measureSvgTexts,
    measureWrappedSvgTexts,
} from './internal/chartTextMeasurement.js';
import { LegendRenderer } from './internal/legendRenderer.js';
import { GridRenderer } from './internal/gridRenderer.js';
import { HtmlLegendController } from '../legend/htmlLegendController.js';
import * as d3 from 'd3';
import './chartRenderer.css';

export { createOpacityHoverEffect, DEFAULT_CHART_HOVER_OPACITY };

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base styles for user-facing messages (no data, errors)
 */
const MESSAGE_STYLES = {
    base: {
        'text-align': 'center',
        padding: '20px',
    },
    noData: {
        get color() {
            return getThemeColors().chrome.textSecondary;
        },
    },
    error: { color: 'red' },
};

const DEFAULT_RENDER_DIMENSION_TOLERANCE = 0.5;

/**
 * Whether two measured lengths are the same to within a pixel tolerance.
 * Guards the resize path: sub-pixel jitter from layout must not trigger a redraw.
 * @param {number} a - One measured length in px.
 * @param {number} b - The other measured length in px.
 * @param {number} tolerance - Largest difference still treated as unchanged.
 * @returns {boolean} True when the two differ by no more than `tolerance`.
 */
function dimensionsAreClose(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
}

// ============================================================================
// CHART RENDERER CLASS
// ============================================================================

export class ChartRenderer {
    /** Default transition duration for optimized updates (ms) */
    static TRANSITION_DURATION = 300;

    // DI-resolved service references
    #resizeService;
    #resources;
    #tooltipAbortController = new AbortController();
    #destroyed = false;
    /**
     * Whether the owner has called `create()`. A renderer that has not been created
     * owns no drawn container yet, so a `setState`/`refresh()` that reaches it early
     * must stay a pure state update — the pending `create()` draws it.
     */
    #created = false;
    #refreshQueued = false;
    /** @type {Promise<void>|null} Settles when the active render pass (plus any queued follow-up) is done */
    #renderSettled = null;
    /** @type {Map<string, number>} Per-render cache for #resolveScopedFontSize probes */
    #scopedFontSizeCache = new Map();
    #lastRenderedWidth = 0;
    #lastRenderedHeight = 0;
    /** @type {d3.Selection<SVGSVGElement, any, any, any>|null} */
    #offscreenSVG = null; // Pooled offscreen SVG for text measurement

    // Late-bound fields set by the reactive-state mixin and/or subclasses.
    // Declared here so checkJs recognizes them on the base type; types come from
    // the mixin's ReactiveStateHost so there is a single source of truth.
    /** @type {import('@tba3/module-base/utils/reactiveStateMixin.js').ReactiveStateHost['_state']} */
    _state;
    /** @type {import('@tba3/module-base/utils/reactiveStateMixin.js').ReactiveStateHost['setState']} */
    setState;
    /** @type {import('@tba3/module-base/utils/reactiveStateMixin.js').ReactiveStateHost['getState']} */
    getState;
    /** @type {*} Per-chart visibility state (shape defined by subclasses) */
    visibilityState;
    /** @type {*} Comparison-mode descriptors (set by subclasses) */
    comparisonModes;
    /** @type {*} Main chart <g> selection (set by subclasses) */
    mainGroup;

    /**
     * @typedef {HTMLElement & { _chartInstance?: *, _chartData?: * }} ChartContainerEl
     */

    /**
     * Creates a new ChartRenderer instance
     * @param {string} containerId - ID of the container element
     * @param {{[key: string]: any}} [options={}] - Configuration options (scopeId, resizeService, layout, autoResize, …)
     */
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = /** @type {ChartContainerEl} */ (
            this.#bindLiveContainer(document.getElementById(containerId))
        );

        if (!this.container) {
            throw new Error(`[ChartRenderer] Container with ID '${containerId}' not found`);
        }

        // Scope ID for proper cleanup - auto-generate from containerId if not provided
        this.scopeId = options.scopeId || containerId;

        // Resolve services via DI with singleton defaults
        this.#resizeService = options.resizeService ?? defaultResizeService;
        this.#resources = new ResourceTracker(this.scopeId);

        /** @type {{[key: string]: any}} */
        this.options = {
            defaultWidth: DEFAULT_DIMENSIONS.width,
            defaultHeight: DEFAULT_DIMENSIONS.height,
            autoResize: true,
            animationDuration: 200,
            ...options,
        };

        this.dimensions = null;
        this.isRendering = false;
        this.containerSelector = `#${containerId}`;
        this._dimensionWarned = false;

        // State container for automatic cleanup - subclasses store all
        // cleanable state here (caches, render state, scales, etc.)
        /** @type {{[key: string]: any}} */
        this.chartState = {};

        // Reactive state container for declarative updates
        // Subclasses define shape via getInitialState()
        applyReactiveState(this, this.getInitialState());

        // D3 selections
        this.svg = null;
        this.g = null;

        /** @type {object | null} Reference to host ChartHostModule (set by ChartHostModule before create()) */
        this.host = null;

        /** @type {LegendRenderer} SVG legend creation, measurement, and adaptive layout collaborator. */
        this.legend = new LegendRenderer(this);

        /** @type {GridRenderer} Gridline-drawing collaborator (stateless). */
        this.grid = new GridRenderer();

        /** @type {HtmlLegendController} HTML legend panel collaborator — pills, visibility state, panel lifecycle. */
        this.htmlLegend = new HtmlLegendController(this);
    }

    // ========================================================================
    // ABSTRACT METHODS - Must be implemented by subclasses
    // ========================================================================

    /**
     * Validate chart data before rendering
     * @returns {boolean} True if data is valid
     */
    validateData() {
        return true;
    }

    /**
     * Render the chart - must be implemented by subclasses
     * @abstract
     */
    renderChart() {
        throw new Error('renderChart() must be implemented');
    }

    /**
     * Install header-action buttons (zoom toggle, etc.) into the host's
     * header-actions container BEFORE the first `_render()` runs. Subclasses
     * override this when they need header controls — installing them up front
     * keeps the chart body's measured height stable across the first render.
     * No-op by default.
     */
    installHeaderActions() {}

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * Create and render the chart.
     *
     * This empties the container first, so the render that follows must actually
     * repaint it — `refresh()`, not `_render()`: it clears the last-rendered
     * dimensions (whose "nothing changed" skip is a resize-dedup guard, not a
     * create guard) and queues behind an in-flight pass instead of dropping this
     * one. A `_render()` here would leave the cleared container permanently blank.
     */
    async create() {
        if (!this.#resolveLiveContainer()) return;

        this.clearContainer();

        if (!this.#resolveLiveContainer()) return;

        this.#created = true;

        try {
            if (!this.validateData()) {
                this.showNoDataMessage();
                return;
            }

            await this.refresh();

            if (this.options.autoResize) {
                this.#resources.trackAnimationFrame(() => {
                    if (this.#destroyed) return;
                    this.#resources.trackAnimationFrame(() => {
                        const container = this.#resolveLiveContainer();
                        if (this.#destroyed || !container) return;
                        this.#resizeService.observe(container, () => this._render(), {
                            scopeId: this.scopeId,
                        });
                    });
                });
            }
        } catch (error) {
            console.error(`[ChartRenderer] Error in '${this.containerId}':`, error);
            this.showErrorMessage();
        }
    }

    /**
     * Refresh the chart without changing data.
     *
     * Resolves once the resulting render pass has run — which means it must never
     * be awaited from inside `renderChart()`: the queued pass cannot start until
     * the active one returns, so such a call waits on itself forever.
     */
    async refresh() {
        this.#lastRenderedWidth = 0;
        this.#lastRenderedHeight = 0;

        if (this.isRendering) {
            // A render pass is in flight — queue a follow-up pass and resolve only
            // once it has run, so `await refresh()` callers still observe the
            // re-rendered chart (min-height measurement, export, sequential
            // ChartHostModule.refreshCharts()).
            this.#refreshQueued = true;
            await this.#renderSettled;
            return;
        }

        await this._render();
    }

    /**
     * Whether this chart has been destroyed.
     * @returns {boolean} True once `destroy()` has run; further work should be skipped.
     */
    get destroyed() {
        return this.#destroyed;
    }

    /**
     * Destroy the chart and clean up resources.
     *
     * Disconnects the chart from external systems:
     * - Resize observers and tooltips registered under this chart's scopeId
     * - Container DOM children (cleared)
     * - Container references `_chartInstance` and `_chartData` (deleted)
     *
     * Property nulling is intentionally omitted — once the parent releases
     * the chart reference (ChartHostModule clears its #charts array), the
     * entire instance and all its properties become eligible for GC.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;

        // Tracked resources (listeners, timeouts, rAFs, subscriptions, disposables)
        this.#resources.destroy();

        // Disconnect from scoped services.
        this.#resizeService.removeByScope(this.scopeId);
        this.#tooltipAbortController.abort();

        // Clear back-references on the container DOM element to prevent
        // the old ChartRenderer instance from being retained if the container
        // is reused for a new chart.
        if (this.container) {
            delete this.container._chartInstance;
            delete this.container._chartData;
        }

        this.#releaseOffscreenSVG();
        this.htmlLegend.reset();
        this.clearContainer();
    }

    // ========================================================================
    // REACTIVE STATE MANAGEMENT
    // ========================================================================

    /**
     * Returns the initial reactive state for this chart.
     * Override in subclasses to define chart-specific state shape.
     * @returns {object} Initial state object
     */
    getInitialState() {
        return {};
    }

    // setState() and getState() are provided by applyReactiveState() mixin.
    // See @tba3/module-base/utils/reactiveStateMixin.js

    /**
     * React to state changes. Override in subclasses for optimized updates.
     * Default handles `activeModes` changes via visibility system; falls back to refresh().
     * @param {string[]} changedKeys - Keys that changed
     * @param {object} prevState - Previous state snapshot
     */
    // eslint-disable-next-line no-unused-vars
    _onStateChanged(changedKeys, prevState) {
        if (changedKeys.includes('activeModes') && this.visibilityState && this.comparisonModes) {
            this.visibilityState = this.updateVisibilityFromModes(
                this._state.activeModes,
                this.comparisonModes,
                this.visibilityState,
            );
            if (this.svg) {
                this.applyVisibilityTransitions(this._getVisibilityConfig());
            }
            return;
        }
        this.refresh();
    }

    // ========================================================================
    // DATA MANAGEMENT
    // ========================================================================

    getData() {
        const container = /** @type {ChartContainerEl} */ (
            this.#resolveLiveContainer() || this.container
        );
        return container?._chartData;
    }

    setData(data) {
        const container = /** @type {ChartContainerEl} */ (
            this.#resolveLiveContainer() || this.container
        );
        if (container) {
            container._chartData = data;
        }
    }

    // ========================================================================
    // ELEMENT VISIBILITY
    // ========================================================================

    /**
     * Set element visibility with proper pointer-events management.
     * Always use this method (or the isVisible option in wireTooltipEvents)
     * to toggle visibility, as it ensures hidden elements don't respond to hover.
     * @param {d3.Selection} selection - D3 selection to toggle
     * @param {boolean} visible - Whether element should be visible
     * @param {number} [duration=0] - Transition duration in ms (0 for immediate)
     * @param {number} [visibleOpacity=1] - Opacity when visible (default 1, some elements use 0.8)
     * @returns {d3.Selection} The selection for chaining
     * @example
     * // Hide markers with transition
     * this.setElementVisibility(this.svg.selectAll('.marker'), false, 300);
     *
     * // Show with custom opacity
     * this.setElementVisibility(markers, true, 300, 0.8);
     */
    setElementVisibility(selection, visible, duration = 0, visibleOpacity = 1) {
        const sel = duration > 0 ? this.transition(selection, duration) : selection;
        sel.style('opacity', visible ? visibleOpacity : 0).style(
            'pointer-events',
            visible ? 'auto' : 'none',
        );
        return selection;
    }

    // ========================================================================
    // COMPARISON VISIBILITY
    // ========================================================================

    /**
     * Initialize visibility state from the app's comparison toggles.
     * Call in subclass constructors that support comparison markers.
     * @param {string[]} comparisonModes - Toggleable mode keys (e.g. ['school','state'])
     * @param {string[]|null} activeModes - The mode keys currently toggled on, as a list so
     *   this base never depends on one host's state object. `null` means the host has no
     *   comparison state and every mode the payload carries starts visible.
     * @param {object} [options] - Which visibility keys to include beyond the comparison modes.
     * @param {boolean} [options.includeStudent=true] - Include student visibility key
     * @param {boolean} [options.includeClass=true]   - Include class visibility key
     * @returns {object} Visibility state object (e.g. { school: true, state: false })
     */
    initVisibilityState(comparisonModes, activeModes, options = {}) {
        const { includeStudent = true, includeClass = true } = options;

        // Keyed by the mode ids themselves, so a payload carrying several comparison
        // groups gets one toggle each. A group the payload does not carry gets no key
        // at all — and therefore no marker. It must not default to visible: that is how
        // an untoggleable state marker used to render on datasets with no state group.
        // Which is why `null` can mean "all" here: the loop is already limited to the
        // modes this payload carries.
        const state = {};
        for (const modeId of comparisonModes) {
            state[modeId] = activeModes === null ? true : activeModes.includes(modeId);
        }

        if (includeStudent) state.student = true;
        if (includeClass) state.class = true;

        return state;
    }

    /**
     * Derive new visibility state from an activeModes array.
     * Pure function — returns a new object without mutating currentState.
     * @param {string[]|null} activeModes - Currently active comparison mode keys; null means all.
     * @param {string[]} comparisonModes - Which modes are toggleable
     * @param {object} currentState - Current visibility state
     * @returns {object} Updated visibility state
     */
    updateVisibilityFromModes(activeModes, comparisonModes, currentState) {
        const newState = { ...currentState };

        if ('student' in newState) newState.student = true;
        if ('class' in newState) newState.class = true;
        for (const modeId of comparisonModes) {
            newState[modeId] = activeModes === null ? true : activeModes.includes(modeId);
        }

        return newState;
    }

    /**
     * Get visibility transition config. Override in subclasses to map
     * CSS selectors to visibility keys.
     * @protected
     * @returns {object} Config for {@link applyVisibilityTransitions}
     */
    _getVisibilityConfig() {
        return { visibilityState: this.visibilityState };
    }

    /**
     * Apply animated visibility transitions to chart elements and legends.
     * @param {object} config - What to fade, to which state, and how fast.
     * @param {{[type: string]: d3.Selection}} [config.elements={}] - type→selection map for chart elements
     * @param {{[type: string]: d3.Selection}} [config.legends={}]  - type→selection map for legend items
     * @param {object} config.visibilityState - Current visibility state
     * @param {number} [config.duration] - Transition ms (default: TRANSITION_DURATION)
     * @param {number} [config.hiddenOpacity] - Legend opacity when hidden (default: HIDDEN_LEGEND_OPACITY)
     * @param {number} [config.visibleOpacity=1] - Element opacity when visible
     */
    applyVisibilityTransitions(config) {
        const {
            elements = {},
            legends = {},
            visibilityState,
            duration = ChartRenderer.TRANSITION_DURATION,
            hiddenOpacity = HIDDEN_LEGEND_OPACITY,
            visibleOpacity = 1,
        } = config;

        Object.entries(elements).forEach(([type, selection]) => {
            if (selection && visibilityState[type] !== undefined) {
                this.setElementVisibility(
                    selection,
                    visibilityState[type],
                    duration,
                    visibleOpacity,
                );
            }
        });

        Object.entries(legends).forEach(([type, selection]) => {
            if (selection && visibilityState[type] !== undefined) {
                this.transition(selection, duration).style(
                    'opacity',
                    visibilityState[type] ? 1 : hiddenOpacity,
                );
            }
        });
    }

    // ========================================================================
    // GLOSSARY ANNOTATION
    // ========================================================================

    /**
     * Stamp glossary attributes on an SVG element for tooltip glossary popups.
     * No-op when the glossary annotator is not initialized.
     * @param {d3.Selection} selection - D3 selection (typically an SVG <text>)
     * @param {string|null|undefined} glossaryKey - Key in `shared.element_texts`, or one
     *        supplied by the payload. Null is a no-op, so a caller may pass the result of
     *        a lookup that legitimately finds nothing rather than guarding first.
     */
    stampGlossaryAttr(selection, glossaryKey) {
        glossaryAnnotator.stampGlossaryAttr(selection, glossaryKey);
    }

    /**
     * Split plain text into glossary-aware text runs.
     * @param {string} text - Plain text to split.
     * @param {object} [options] - Which glossary terms to consider.
     * @param {Set<string>} [options.excludeKeys] - Glossary keys to leave unannotated.
     * @returns {Array<{ text: string, glossaryKey: string|null }>} One run per stretch of text, each either plain or carrying a glossary key.
     */
    getGlossaryTextSegments(text, options = {}) {
        return glossaryAnnotator.getTextSegments(text, options);
    }

    /**
     * Replace an SVG text/tspan node with glossary-aware tspans.
     * @param {d3.Selection} selection - The text or tspan node to replace.
     * @param {string} text - Text to render.
     * @param {object} [options] - Pre-computed segments, and whether to rebuild regardless.
     * @param {Array<{ text: string, glossaryKey: string|null }>} [options.segments] - Reuse these runs instead of re-splitting `text`.
     * @param {boolean} [options.force=false] - Rebuild as tspans even when no run carries a glossary key.
     * @returns {boolean} True when tspans were built; false when the node was set as plain text.
     */
    renderGlossaryTextSegments(selection, text, options = {}) {
        const { segments = null, force = false } = options;
        const textValue = typeof text === 'string' ? text : String(text ?? '');
        const resolvedSegments = segments ?? this.getGlossaryTextSegments(textValue);
        const hasGlossarySegments = resolvedSegments.some((segment) => segment.glossaryKey);

        if (!force && !hasGlossarySegments) {
            selection.text(textValue);
            return false;
        }

        selection.text(null);
        resolvedSegments.forEach((segment) => {
            const tspan = selection.append('tspan').text(segment.text);
            if (segment.glossaryKey) {
                this.stampGlossaryAttr(tspan, segment.glossaryKey);
            }
        });

        return hasGlossarySegments;
    }

    // ========================================================================
    // SVG MANAGEMENT
    // ========================================================================

    /**
     * Clear the container contents.
     *
     * The `svg`/`g` handles go with the nodes they pointed at. Subclasses guard their
     * incremental-update paths on those two (`if (!this.svg || !this.g) return false`),
     * and a handle left bound to a detached node passes that guard: the D3 join then
     * lands outside the document and the card stays blank with no error. Every render
     * path reassigns both from `initializeSVG()` right after clearing.
     */
    clearContainer() {
        const container = /** @type {ChartContainerEl} */ (
            this.#resolveLiveContainer() || this.container
        );

        if (container) {
            // Interrupt active D3 transitions before removing elements to
            // prevent orphaned timers accumulating in D3's scheduler.
            d3.select(container).selectAll('*').interrupt().remove();
        }

        this.svg = null;
        this.g = null;
    }

    /**
     * Rebind cached container references when the DOM node behind containerId changes.
     * @param {HTMLElement|null} liveContainer - The node currently behind `containerId`.
     * @returns {HTMLElement|null} The bound container, or null when the argument was not an element.
     */
    #bindLiveContainer(liveContainer) {
        if (!(liveContainer instanceof HTMLElement)) {
            return null;
        }

        const previousContainer = this.container;
        const previousData = previousContainer?._chartData;

        if (previousContainer && previousContainer !== liveContainer) {
            delete previousContainer._chartInstance;
            delete previousContainer._chartData;
        }

        this.container = liveContainer;
        this.container._chartInstance = this;

        if (this.container._chartData === undefined) {
            this.container._chartData = previousData ?? null;
        }

        this.container.classList.add('chart-container');
        return this.container;
    }

    /**
     * Resolve a scoped CSS font-size value to pixels, cached per render pass.
     * @param {string} fontSizeCssValue - A CSS length, as read from the scoped custom property.
     * @returns {number} The size in px, or NaN when it cannot be resolved.
     */
    #resolveScopedFontSize(fontSizeCssValue) {
        const cached = this.#scopedFontSizeCache.get(fontSizeCssValue);
        if (cached !== undefined) {
            return cached;
        }
        const scope = this.#resolveLiveContainer() || this.container || document.body;
        const probedFontSize = probeFontSizePx(scope, fontSizeCssValue);
        if (Number.isFinite(probedFontSize)) {
            this.#scopedFontSizeCache.set(fontSizeCssValue, probedFontSize);
        }
        return probedFontSize;
    }

    /**
     * Resolve and bind the current live DOM node for this renderer's container id.
     * @returns {HTMLElement|null} The live container node, or null when it is no longer in the document.
     */
    #resolveLiveContainer() {
        return this.#bindLiveContainer(document.getElementById(this.containerId));
    }

    /**
     * Get the chart font family from CSS variable
     * @returns {string} Font family string
     */
    getChartFont() {
        return getThemeColors().chrome.fontFamily;
    }

    /**
     * Resolve the live chart font size from CSS in px.
     * @returns {number} Font size in px
     */
    getChartFontSize() {
        return resolveContainerFontSize(
            /** @type {ChartContainerEl} */ (this.#resolveLiveContainer() || this.container),
        );
    }

    /**
     * Get the CSS variable value for a chart text size token.
     * @param {'sm'|'base'|'lg'} [size='base'] - Which chart text token to read.
     * @returns {string} CSS font-size value
     */
    getChartTextSizeCssValue(size = 'base') {
        return chartTextSizeCssValue(size);
    }

    /**
     * Resolve a chart text size token from CSS in px.
     * @param {'sm'|'base'|'lg'} [size='base'] - Which chart text token to read.
     * @returns {number} Text size in px
     */
    resolveChartTextSize(size = 'base') {
        const fontSize = this.#resolveScopedFontSize(this.getChartTextSizeCssValue(size));

        if (Number.isFinite(fontSize) && fontSize > 0) {
            return fontSize;
        }

        return this.getChartFontSize();
    }

    /**
     * Resolve the shared chart text size for measurement-only calculations.
     * Visible chart text should inherit from the chart SVG root unless a token-sized exception is requested.
     * @param {object} [options] - Overrides that bypass the inherited size.
     * @param {number} [options.fontSize] - Explicit px size, bypassing the token scale; for a caller that already resolved one.
     * @param {'sm'|'base'|'lg'} [options.textSize] - Token-sized chart text override.
     * @returns {number} Resolved chart text size in px.
     */
    getChartTextMeasureSize(options = {}) {
        return options.fontSize ?? this.resolveChartTextSize(options.textSize ?? 'base');
    }

    /**
     * Resolve the shared axis label size for measurement-only calculations.
     * Visible axis labels should inherit from the chart SVG root unless a token-sized exception is requested.
     * @param {object} [options] - Overrides that bypass the inherited size.
     * @param {number} [options.fontSize] - Explicit px size, bypassing the token scale; for a caller that already resolved one.
     * @param {'sm'|'base'|'lg'} [options.textSize] - Token-sized axis label override.
     * @returns {number} Resolved axis label size in px.
     */
    getAxisLabelMeasureSize(options = {}) {
        return options.fontSize ?? this.resolveChartTextSize(options.textSize ?? 'base');
    }

    /**
     * Apply a chart text size token to visible SVG text.
     * @param {d3.Selection} selection - Visible SVG text to size.
     * @param {'sm'|'base'|'lg'} [size='base'] - Which chart text token to apply.
     * @returns {d3.Selection} The same selection, for chaining.
     */
    applyChartTextSize(selection, size = 'base') {
        if (!selection) return selection;
        return selection.style('font-size', this.getChartTextSizeCssValue(size));
    }

    /**
     * Remove library-injected SVG font attributes so chart text inherits from the SVG root.
     * @param {d3.Selection} [selection] - Subtree to normalise; defaults to this renderer’s SVG root.
     * @param {object} [options] - Optional token-sized override for text descendants.
     * @param {'sm'|'base'|'lg'} [options.textSize] - Optional token-sized override for text descendants.
     * @returns {d3.Selection|null} The same selection, or the nullish value it was given.
     */
    normalizeSvgTypography(selection = this.svg, options = {}) {
        if (!selection) return selection;

        selection.attr('font-size', null).attr('font-family', null);
        selection.selectAll('[font-size]').attr('font-size', null);
        selection.selectAll('[font-family]').attr('font-family', null);

        if (options.textSize) {
            this.applyChartTextSize(selection.selectAll('text'), options.textSize);
        }

        return selection;
    }

    /**
     * Create a bare SVG element with standard font and color.
     * Use this when you need custom group positioning (e.g., centered rings,
     * non-standard margins) but still want the standard SVG setup.
     * @param {number} width - SVG width
     * @param {number} height - SVG height
     * @param {object} [options] - How the SVG scales.
     * @param {boolean} [options.useViewBox=false] - Use viewBox for responsive scaling instead of fixed dimensions
     * @returns {d3.Selection} The created SVG selection
     */
    createSVGElement(width, height, options = {}) {
        this.clearContainer();
        const font = this.getChartFont();
        const colors = getThemeColors();
        const svgId = `${this.containerId}-svg-root`;

        const svg = d3
            .select(this.containerSelector)
            .append('svg')
            .attr('id', svgId)
            .style('font-family', font)
            .style('font-size', 'var(--fs-base)')
            .style('color', colors.chrome.text);

        if (options.useViewBox) {
            svg.attr('viewBox', `0 0 ${width} ${height}`)
                .attr('preserveAspectRatio', 'xMidYMid meet')
                .style('width', '100%')
                .style('height', '100%');
        } else {
            svg.attr('width', width).attr('height', height);
        }

        return svg;
    }

    /**
     * Initialize a standard single SVG with margins.
     *
     * Uses the layout system to translate the main group to the chart area
     * origin computed by computeLayout().
     * @param {object} [layoutOverrides] - Optional overrides passed to computeLayout()
     * @param {object} [layoutOverrides.axisOverrides] - Per-side axis space (px)
     * @param {Array<object>} [layoutOverrides.legendConfigs] - Legend configs for measurement,
     * including optional stacked legend descriptors
     * @returns {object} { svg, g, dimensions, layout? }
     */
    initializeSVG(layoutOverrides = {}) {
        const dims = this.dimensions || this.calculateDimensions();

        const svg = this.createSVGElement(dims.containerWidth, dims.containerHeight);

        let mainGroup;
        if (!this.options.layout) {
            throw new Error(`${this.constructor.name} requires options.layout`);
        }

        const layout = this.computeLayout(
            layoutOverrides.axisOverrides || {},
            layoutOverrides.legendConfigs || [],
        );
        mainGroup = svg
            .append('g')
            .attr('transform', `translate(${layout.chart.x}, ${layout.chart.y})`);

        // Auto-patch dimensions with layout-computed chart area and margins
        dims.chartWidth = layout.chart.width;
        dims.chartHeight = layout.chart.height;
        dims.margins = {
            top: layout.chart.y,
            right: dims.containerWidth - layout.chart.x - layout.chart.width,
            bottom: dims.containerHeight - layout.chart.y - layout.chart.height,
            left: layout.chart.x,
        };

        this.dimensions = dims;
        return { svg, g: mainGroup, dimensions: dims, layout };
    }

    // ========================================================================
    // DIMENSION CALCULATIONS
    // ========================================================================

    calculateDimensions() {
        const { width: containerWidth, height: containerHeight } = getResponsiveChartDimensions(
            this.containerId,
            this.options.defaultWidth,
            this.options.defaultHeight,
        );

        // Warn once if container dimensions are suspiciously small
        if (!this._dimensionWarned && (containerWidth < 50 || containerHeight < 50)) {
            console.warn(
                `[ChartRenderer] Container '${this.containerId}' has small dimensions (${containerWidth}x${containerHeight}px). This may indicate a layout issue.`,
            );
            this._dimensionWarned = true;
        }

        // Margins start at zero; actual space allocation is computed by
        // computeLayout() in initializeSVG() for layout-driven charts.
        const margins = { top: 0, right: 0, bottom: 0, left: 0 };

        const chartWidth = containerWidth - margins.left - margins.right;
        const chartHeight = containerHeight - margins.top - margins.bottom;

        const geometryScale = Math.min(containerWidth, containerHeight) / 40;

        return {
            containerWidth,
            containerHeight,
            margins,
            chartWidth,
            chartHeight,
            elements: {
                // The head is the primary datum: never smaller than a comparison
                // marker, so it stays the mark the eye lands on with ⌀ groups shown.
                circleRadius: Math.max(5, Math.min(9, geometryScale * 0.35)),
                circleRadiusHover: Math.max(6.5, Math.min(11, geometryScale * 0.45)),
                lineStrokeWidth: Math.max(1, Math.min(3, geometryScale * 0.15)),
                barStrokeWidth: Math.max(1, Math.min(2, geometryScale * 0.1)),
            },
            geometryScale,
        };
    }

    // ========================================================================
    // LAYOUT SYSTEM — content-driven space allocation
    // ========================================================================

    /**
     * Default layout configuration.
     * Charts override via `options.layout` to control axis/legend/padding allocation.
     * @returns {object} Merged layout config
     */
    #resolveLayout() {
        const userLayout = this.options.layout || {};
        const p = { top: 0, right: 0, bottom: 0, left: 0, ...userLayout.padding };
        return {
            legends: userLayout.legends || [],
            axis: { top: 0, right: 0, bottom: 0, left: 0, ...userLayout.axis },
            axisExtra: { top: 0, right: 0, bottom: 0, left: 0, ...userLayout.axisExtra },
            padding: {
                top: Math.max(4, p.top),
                right: Math.max(4, p.right),
                bottom: Math.max(4, p.bottom),
                left: Math.max(4, p.left),
            },
            aspectRatio: userLayout.aspectRatio ?? null,
        };
    }

    /**
     * Returns the pooled offscreen SVG, creating it on first use.
     * Children are NOT cleared automatically — callers should append into a group
     * and remove that group when done.
     * @returns {d3.Selection} The hidden, zero-sized measuring SVG, shared by this renderer.
     */
    #getOffscreenSVG() {
        if (!this.#offscreenSVG) {
            this.#offscreenSVG = d3
                .select(document.body)
                .append('svg')
                .attr('width', 0)
                .attr('height', 0)
                .style('position', 'absolute')
                .style('visibility', 'hidden')
                .style('pointer-events', 'none');
        }
        return this.#offscreenSVG;
    }

    /** Removes the pooled offscreen SVG from the DOM and resets the reference. */
    #releaseOffscreenSVG() {
        if (this.#offscreenSVG) {
            this.#offscreenSVG.remove();
            this.#offscreenSVG = null;
        }
    }

    /**
     * Measure rendered text dimensions using an offscreen SVG.
     * Uses a pooled offscreen SVG, renders text elements, and measures via getBBox().
     * @param {string[]} texts - Array of text strings to measure
     * @param {object} [options] - Font and offset overrides used for the measurement only.
     * @param {number} [options.fontSize] - Compatibility font size in px for measurement
     * @param {'sm'|'base'|'lg'} [options.textSize] - Token-sized text override (forwarded to getChartTextMeasureSize)
     * @param {string} [options.fontFamily] - Font family (defaults to chart font)
     * @param {number} [options.rotation=0] - Text rotation in degrees (for angled axis labels)
     * @param {string|number|null} [options.fontWeight] - Font weight for measurement
     * @param {string|number} [options.dx] - Horizontal offset applied before measuring
     * @param {string|number} [options.dy] - Vertical offset applied before measuring
     * @returns {{ maxWidth: number, maxHeight: number, totalWidth: number, totalHeight: number }} Largest and summed dimensions across all measured strings.
     */
    measureTexts(texts, options = {}) {
        if (!texts || texts.length === 0)
            return { maxWidth: 0, maxHeight: 0, totalWidth: 0, totalHeight: 0 };

        const fontSize = this.getChartTextMeasureSize(options);
        const fontFamily = options.fontFamily ?? this.getChartFont();

        return measureSvgTexts(this.#getOffscreenSVG(), texts, {
            fontSize,
            fontFamily,
            fontWeight: options.fontWeight ?? null,
            rotation: options.rotation ?? 0,
            dx: options.dx ?? null,
            dy: options.dy ?? null,
        });
    }

    /**
     * Measure wrapped text dimensions using the same word-wrapping strategy used
     * by chart-local label rendering.
     *
     * Each entry can be a string or an object with a per-entry width:
     *   - 'Label text'
     *   - { text: 'Label text', width: 120 }
     * @param {Array<string|{text: string, width?: number}>} texts - Wrapped labels to measure
     * @param {object} [options] - Wrapping widths and font overrides used for the measurement only.
     * @param {number} [options.width] - Default wrapping width in px
     * @param {number[]} [options.widths] - Per-entry widths in px (by index)
     * @param {number} [options.fontSize] - Compatibility font size in px for measurement
     * @param {string} [options.fontFamily] - Font family (defaults to chart font)
     * @param {string|number} [options.fontWeight] - Font weight
     * @param {number} [options.lineHeightEm=1.1] - Line height in ems between wrapped lines
     * @returns {{ maxWidth: number, maxHeight: number, totalWidth: number, totalHeight: number }} Largest and summed dimensions across all wrapped labels.
     */
    measureWrappedTexts(texts, options = {}) {
        if (!texts || texts.length === 0) {
            return { maxWidth: 0, maxHeight: 0, totalWidth: 0, totalHeight: 0 };
        }

        const fontSize = this.getChartTextMeasureSize(options);
        const fontFamily = options.fontFamily ?? this.getChartFont();

        return measureWrappedSvgTexts(this.#getOffscreenSVG(), texts, {
            fontSize,
            fontFamily,
            fontWeight: options.fontWeight ?? null,
            lineHeightEm: options.lineHeightEm ?? 1.1,
            width: options.width,
            widths: options.widths,
        });
    }

    /**
     * Measure axis label dimensions for space allocation.
     * Renders tick labels offscreen and returns the space needed for the axis.
     * @param {'left'|'right'|'top'|'bottom'} side - Which axis side
     * @param {string[]|number[]} tickValues - The tick values to render
     * @param {import('../chartAxisUtils.js').AxisMeasureOptions} [options] - Formatting, rotation and title metrics that affect the space needed; tick-selection keys are ignored here.
     * @returns {number} Space needed in px for this axis
     */
    measureAxisSpace(side, tickValues, options = {}) {
        const formatter = options.formatter || String;
        const tickPadding = options.tickPadding ?? TICK_PADDING;
        const axisLabelMeasureSize = this.getAxisLabelMeasureSize(options);

        const texts = tickValues.map((v) => String(formatter(v)));
        const measured = this.measureTexts(texts, {
            fontSize: axisLabelMeasureSize,
            fontWeight: options.fontWeight,
            rotation: options.rotation,
            dx: options.dx,
            dy: options.dy,
        });

        // Compute axis title space — measure actual text when provided, else use legacy number
        let titleSpace = 0;
        if (options.axisTitleText) {
            const titleMeasureSize = options.axisTitleFontSize ?? axisLabelMeasureSize;
            const titleGap = options.axisTitleGap ?? AXIS_DEFAULTS.titleGap;
            // For left/right: title is rotated 90°, so its line height (≈ fontSize) is the horizontal cost
            // For top/bottom: title sits horizontally, line height is the vertical cost
            const titleMeasured = this.measureTexts([options.axisTitleText], {
                fontSize: titleMeasureSize,
            });
            titleSpace = titleGap + titleMeasured.maxHeight;
        }

        // For left/right axes, we need the widest label + tick padding + axis title
        if (side === 'left' || side === 'right') {
            return measured.maxWidth + tickPadding + titleSpace;
        }
        // For top/bottom, we need the tallest label + tick padding + axis title
        return measured.maxHeight + tickPadding + titleSpace;
    }

    /**
     * Render an axis title, auto-positioned within the space allocated by computeLayout().
     * Call after initializeSVG() so that this.layout is available.
     * @param {d3.Selection} target - The SVG group to append the title to (usually the main `g`)
     * @param {'left'|'right'|'top'|'bottom'} side - Which axis the title belongs to
     * @param {string} text - The title text
     * @param {object} [options] - Typography and glossary options for the title text.
     * @param {number} [options.fontSize] - Compatibility font size in px for positioning
     * @param {'sm'|'base'|'lg'} [options.textSize] - Token-sized text override
     * @param {string} [options.fill] - Text fill color
     * @param {string} [options.fontWeight] - Font weight
     * @param {string} [options.className] - CSS class name
     * @param {string} [options.glossaryKey] - Key for glossary stamp
     * @returns {d3.Selection} The appended text element
     */
    renderAxisTitle(target, side, text, options = {}) {
        const layout = this.layout;
        if (!layout) return target.append('text');
        const fontSize = this.getAxisLabelMeasureSize(options);
        const textSize = options.textSize ?? 'base';
        const chartW = layout.chart.width;
        const chartH = layout.chart.height;
        const className = options.className === undefined ? 'axis-label' : options.className;
        const fontWeight = options.fontWeight === undefined ? 'bold' : options.fontWeight;

        const titleEl = target.append('text').attr('text-anchor', 'middle').text(text);

        if (options.fill) titleEl.attr('fill', options.fill);
        if (fontWeight) titleEl.style('font-weight', fontWeight);
        if (options.fontSize != null) titleEl.style('font-size', `${fontSize}px`);
        else if (textSize !== 'base') this.applyChartTextSize(titleEl, textSize);
        if (className) titleEl.attr('class', className);
        if (options.glossaryKey) this.stampGlossaryAttr(titleEl, options.glossaryKey);

        if (side === 'left') {
            titleEl
                .attr('transform', 'rotate(-90)')
                .attr('x', -chartH / 2)
                .attr('y', -(layout.axes.left - fontSize));
        } else if (side === 'right') {
            titleEl
                .attr('transform', 'rotate(90)')
                .attr('x', chartH / 2)
                .attr('y', -(chartW + layout.axes.right - fontSize));
        } else if (side === 'bottom') {
            titleEl.attr('x', chartW / 2).attr('y', chartH + layout.axes.bottom - fontSize / 2);
        } else if (side === 'top') {
            titleEl.attr('x', chartW / 2).attr('y', -(layout.axes.top - fontSize));
        }

        return titleEl;
    }

    /**
     * Compute the full chart layout — axis space, legend space, chart area.
     *
     * Flow:
     *   1. Get container content dimensions (already subtracts CSS padding)
     *   2. Subtract internal padding (usually 0)
     *   3. Subtract axis space per side
     *   4. Subtract legend space per legend entry (sequentially)
     *   5. Apply aspectRatio constraint if set, centering in remaining space
     *   6. Store result in this.layout
     * @param {object} [axisOverrides] - Per-side axis space overrides (px).
     *   Use when axis data (tick values) is available at layout time.
     *   Keys: top, right, bottom, left. Values override the layout.axis config.
     * @param {Array<object>} [legendConfigs] - Legend config objects for measurement.
     *   If provided, measures each legend and uses its dimensions for space allocation.
     *   Supports optional stacked legend descriptors via `legendConfigs[i].stacked`.
     *   Falls back to layout.legends entries for position/gap defaults.
     * @returns {object} The computed layout: { chart, legends, legendStackLayouts, axes, container, dimensions }
     */
    computeLayout(axisOverrides = {}, legendConfigs = []) {
        const dims = this.dimensions || this.calculateDimensions();
        const layoutConfig = this.#resolveLayout();
        const legendGap =
            parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--chart-legend-gap'),
            ) || 8;

        const { chartTooSmall, ...layout } = computeChartLayout(
            {
                container: { width: dims.containerWidth, height: dims.containerHeight },
                layoutConfig,
                axisOverrides,
                legendConfigs,
                legendGap,
            },
            (legendConfig, { position, availWidth, availHeight }) => {
                if (legendConfig?.stacked) {
                    const stackOptions = legendConfig.stackOptions || {};
                    const stackLayout = this.legend.resolveStackedLegendLayout(
                        legendConfig.stacked,
                        {
                            gap: stackOptions.gap,
                            maxWidth: Number.isFinite(stackOptions.maxWidth)
                                ? stackOptions.maxWidth
                                : position === 'top' || position === 'bottom'
                                  ? availWidth
                                  : undefined,
                            maxHeight: Number.isFinite(stackOptions.maxHeight)
                                ? stackOptions.maxHeight
                                : position === 'left' || position === 'right'
                                  ? availHeight
                                  : undefined,
                        },
                    );
                    return {
                        width: stackLayout.size.width,
                        height: stackLayout.size.height,
                        stackLayout,
                    };
                }
                const measured = this.legend.measureLegendSize(legendConfig);
                return { width: measured.width, height: measured.height, stackLayout: null };
            },
        );

        // Warn when axis allocation exceeds 60% of available space
        const totalAxisW = layout.axes.left + layout.axes.right;
        const totalAxisH = layout.axes.top + layout.axes.bottom;
        if (totalAxisW > dims.containerWidth * 0.6 || totalAxisH > dims.containerHeight * 0.6) {
            console.warn(
                `[ChartRenderer] Axes consume >60% of container '${this.containerId}' ` +
                    `(H: ${totalAxisW}/${dims.containerWidth}px, V: ${totalAxisH}/${dims.containerHeight}px). ` +
                    `Consider shorter labels or smaller fonts.`,
            );
        }

        this._chartTooSmall = chartTooSmall;
        this.layout = { ...layout, dimensions: dims };
        return this.layout;
    }

    // ========================================================================
    // TOOLTIP METHODS - Convenience wrappers for tooltipService singleton
    // ========================================================================

    /**
     * Create a tooltip for this chart.
     * Automatically removed when the chart is destroyed (via AbortSignal).
     * @param {string} [id] - Optional ID suffix
     * @param {object} [options] - Additional options passed to tooltipService.create()
     * @param {boolean} [options.interactive=false] - Enable delayed-hide so users can hover into the tooltip
     * @returns {d3.Selection} The tooltip selection
     */
    createTooltip(id, options = {}) {
        const fullId = id ? `${this.containerId}-${id}` : this.containerId;
        return tooltipService.create({
            id: fullId,
            signal: this.#tooltipAbortController.signal,
            variantClass: 'tooltip-chart',
            ...options,
        });
    }

    /**
     * Show a tooltip.
     * @param {d3.Selection} tooltip - The tooltip selection.
     * @param {MouseEvent} event - Mouse event supplying the cursor position.
     * @param {string | object} content - Content to display.
     * @returns {void} Nothing; the tooltip service owns the element.
     */
    showTooltip(tooltip, event, content) {
        return tooltipService.show(tooltip, event, content);
    }

    /**
     * Move a tooltip.
     * @param {d3.Selection} tooltip - The tooltip selection.
     * @param {MouseEvent} event - Mouse event supplying the new cursor position.
     * @returns {void} Nothing; the tooltip service owns the element.
     */
    moveTooltip(tooltip, event) {
        return tooltipService.move(tooltip, event);
    }

    /**
     * Hide a tooltip.
     * @param {d3.Selection} tooltip - The tooltip selection.
     * @returns {void} Nothing; the tooltip service owns the element.
     */
    hideTooltip(tooltip) {
        return tooltipService.hide(tooltip);
    }

    /**
     * Build structured HTML for tooltips.
     * Output is rendered as-is for cursor-following tooltips and is not
     * glossary-annotated automatically.
     * @param {object} content - Content configuration
     * @returns {string} HTML string
     */
    buildTooltipHTML(content) {
        return tooltipService.buildHTML(content);
    }

    // ========================================================================
    // ABSTRACT TOOLTIP CONTENT METHOD
    // ========================================================================

    /**
     * Format tooltip content for a data element.
     * Subclasses MUST override this method to provide chart-specific tooltip content.
     * @abstract
     * @param {object} segment - The data segment being hovered
     * @param {object} [context={}] - Additional context (e.g., totalStudents, groupName)
     * @returns {string} HTML content for tooltip
     * @example
     * // In a subclass:
     * formatTooltipContent(segment, context) {
     *     return this.buildTooltipHTML({
     *         title: segment.label,
     *         rows: [
     *             { label: 'Value', value: segment.value },
     *             { label: 'Percentage', value: `${segment.percentage.toFixed(1)}%` }
     *         ]
     *     });
     * }
     */
    // eslint-disable-next-line no-unused-vars
    formatTooltipContent(segment, context = {}) {
        throw new Error(
            `[ChartRenderer] Subclass must implement formatTooltipContent(). Chart: ${this.containerId}`,
        );
    }

    // ========================================================================
    // UNIFIED TOOLTIP EVENT WIRING
    // ========================================================================

    /**
     * Apply hover effect attributes/styles to an element.
     * Protected wrapper for subclass access (e.g., LollipopChartRenderer).
     * @protected
     * @param {HTMLElement} element - DOM element.
     * @param {object} effectConfig - Effect configuration with attrs/styles.
     * @param {object} d - Data bound to element.
     * @param {boolean} useTransition - Whether to use transition.
     * @param {number} [duration] - Custom transition duration.
     * @returns {*} The element the effect was applied to, or null when there was no effect config.
     */
    _applyHoverEffect(element, effectConfig, d, useTransition, duration) {
        return applyChartHoverEffect(element, effectConfig, d, {
            useTransition,
            duration,
            transition: (selection, transitionDuration) =>
                this.transition(selection, transitionDuration),
        });
    }

    /**
     * Wire tooltip events to a D3 selection with configurable hover effects.
     * Public facade over shared interaction helpers for mouseenter, mousemove,
     * mouseleave, click, tooltip, and hover-effect behavior.
     * @param {d3.Selection} selection - D3 selection to attach events to
     * @param {object} options - Configuration options
     * @param {Function} options.getTooltipContent - (d, context) => string|HTMLContent
     * @param {object} [options.context={}] - Context passed to getTooltipContent
     * @param {object} [options.hoverEffect] - Hover effect configuration
     * @param {object} [options.hoverEffect.enter] - Attributes/styles to apply on mouseenter
     * @param {object} [options.hoverEffect.leave] - Attributes/styles to apply on mouseleave
     * @param {boolean} [options.hoverEffect.useTransition=false] - Whether to use chart transition
     * @param {number} [options.hoverEffect.duration] - Custom transition duration
     * @param {Function} [options.isVisible] - (d) => boolean - Guard function for hover interactions.
     *        When provided, mouseenter will skip tooltip/effect if this returns false.
     *        Use this for elements that can be hidden (e.g., average markers with visibility toggles).
     * @param {string} [options.tooltipId] - Custom tooltip ID suffix
     * @param {Function} [options.onClick] - Optional click handler (d, event, element) => void
     * @param {string|null} [options.cursor] - Cursor style; omitted means 'pointer' when `onClick` is set, `null` leaves whatever the caller already painted.
     * @param {boolean} [options.interactive=false] - Enable delayed-hide so users can hover into the tooltip
     * @returns {d3.Selection} The selection for chaining
     * @example
     * // Simple case with opacity hover
     * this.wireTooltipEvents(arcs, {
     *     getTooltipContent: (d) => this.formatTooltipContent(d),
     *     hoverEffect: {
     *         enter: { opacity: 0.8 },
     *         leave: { opacity: 1 }
     *     }
     * });
     * @example
     * // With visibility guard for toggleable elements
     * this.wireTooltipEvents(markers, {
     *     getTooltipContent: (d) => this.formatTooltipContent(d),
     *     isVisible: () => this.chartState.visibility.state,
     *     hoverEffect: { ... }
     * });
     * @example
     * // Circle with transition and data-dependent color
     * this.wireTooltipEvents(circles, {
     *     getTooltipContent: (d) => this.formatTooltipContent(d),
     *     hoverEffect: {
     *         enter: { r: hoverRadius, fill: (d) => d3.color(getColor(d)).darker(0.3) },
     *         leave: { r: normalRadius, fill: (d) => getColor(d) },
     *         useTransition: true
     *     },
     *     onClick: (d, event) => this.handleClick(d),
     *     cursor: 'pointer'
     * });
     */
    wireTooltipEvents(selection, options = /** @type {any} */ ({})) {
        return wireChartTooltipEvents(selection, options, {
            createTooltip: (tooltipId, tooltipOptions) =>
                this.createTooltip(tooltipId, tooltipOptions),
            showTooltip: (tooltip, event, content) => this.showTooltip(tooltip, event, content),
            moveTooltip: (tooltip, event) => this.moveTooltip(tooltip, event),
            hideTooltip: (tooltip) => this.hideTooltip(tooltip),
            transition: (transitionSelection, duration) =>
                this.transition(transitionSelection, duration),
        });
    }

    /**
     * Replace the chart with a sentence saying there is nothing to draw — and, from the
     * glossary, what to change. Callers that know the cause pass their own sentence.
     * @param {string} [message] - The sentence; defaults to `general.messages.no-data`.
     */
    showNoDataMessage(
        message = glossaryAnnotator.getRequiredEntryText('general.messages.no-data'),
    ) {
        this.clearContainer();
        const div = d3.select(this.containerSelector).append('div');
        const styles = { ...MESSAGE_STYLES.base, ...MESSAGE_STYLES.noData };
        Object.entries(styles).forEach(([key, value]) => div.style(key, value));
        div.text(message);
    }

    /**
     * Replace the chart with the failure sentence. The exception itself belongs in the
     * console (the callers log it), never in the card: a reader cannot act on it.
     * @param {string} [message] - The sentence; defaults to `general.messages.chart-error`.
     */
    showErrorMessage(
        message = glossaryAnnotator.getRequiredEntryText('general.messages.chart-error'),
    ) {
        this.clearContainer();
        const div = d3.select(this.containerSelector).append('div');
        const styles = { ...MESSAGE_STYLES.base, ...MESSAGE_STYLES.error };
        Object.entries(styles).forEach(([key, value]) => div.style(key, value));
        div.text(message);
    }

    /**
     * Remove a previously rendered "no data" overlay.
     * @param {any} [target] - Container to clear; defaults to this renderer’s own container.
     * @param {string} [className] - Class identifying the overlay element to remove.
     */
    clearNoDataOverlay(target = null, className = 'no-data-overlay') {
        const selection = target || this.mainGroup || this.g || this.svg;
        if (!selection) return;
        const primaryClass = String(className).split(/\s+/)[0];
        selection.selectAll(`.${primaryClass}`).remove();
    }

    renderNoDataOverlay(target, options = {}) {
        const {
            // `no-data-short`, not `no-data`: this lands in a single centred SVG <text>,
            // which the long "change the selection" sentence does not fit. Defaulting from
            // the glossary the way showNoDataMessage/showErrorMessage above already do.
            message = glossaryAnnotator.getRequiredEntryText('general.messages.no-data-short'),
            className = 'no-data-overlay',
            width = this.layout?.chart?.width ?? this.dimensions?.chartWidth ?? 0,
            height = this.layout?.chart?.height ?? this.dimensions?.chartHeight ?? 0,
            x = width / 2,
            y = height / 2,
            clear = true,
            fill = getThemeColors().chrome.textSecondary,
        } = options;

        const selection = target || this.mainGroup || this.g;
        if (!selection) return null;

        if (clear) this.clearNoDataOverlay(selection, className);

        const overlay = selection.append('g').attr('class', className);

        overlay
            .append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .style('fill', fill)
            .text(message);

        return overlay;
    }

    /**
     * Create a transition with configured duration
     * @param {d3.Selection} selection - Selection to transition
     * @param {number|null} [duration] - Override duration
     * @returns {d3.Transition|d3.Selection} Transition or selection
     */
    transition(selection, duration = null) {
        if (prefersReducedMotion()) {
            return selection;
        }
        return selection
            .transition()
            .duration(duration || this.options.animationDuration)
            .ease(d3.easeLinear);
    }

    /**
     * Wrap text to fit within width
     * @param {d3.Selection} selection - Text selection
     * @param {number} width - Maximum width
     * @param {number} [lineHeight=1.1] - Line height multiplier
     */
    wrapText(selection, width, lineHeight = 1.1) {
        selection.each(function () {
            const text = d3.select(this);
            appendWrappedTspans(text, text.text(), {
                x: text.attr('x') || 0,
                y: text.attr('y'),
                firstDyEm: parseFloat(text.attr('dy') || '0'),
                lineHeightEm: lineHeight,
                width,
            });
        });
    }

    /**
     * Internal render handler
     * @private
     */
    async _render() {
        // Guard: a renderer whose owner has not called create() yet must not draw.
        // A host installs its renderers before awaiting the layout settle, so a
        // sibling's sync verb can reach one through `host.chart` in that window;
        // rendering here would be overwritten by the pending create() anyway, and
        // it latches #lastRenderedWidth/Height — which used to make that create()
        // clear the container and then decline to repaint it.
        if (!this.#created) return;

        // Guard: bail out if chart was destroyed (e.g., resize callback fired after destroy)
        if (this.#destroyed) return;

        if (this.isRendering) return;

        // Guard: skip rendering when container is hidden (e.g., view switched away).
        // ResizeObserver fires when container goes to display:none (size→0).
        // Re-rendering with 0 dimensions wastes CPU and can thrash host-level UI sync.
        if (this.container && this.container.offsetParent === null) return;

        // Pre-compute dimensions once per render cycle so all downstream calls
        // (measureTexts, measureAxisSpace, measureLegendSize, computeLayout)
        // hit the cache instead of recalculating getBoundingClientRect + getComputedStyle.
        // Keep the measurement local until we know a rerender is needed; otherwise
        // a skipped render would overwrite layout-adjusted chart dimensions with
        // raw container dimensions from calculateDimensions().
        const nextDimensions = this.calculateDimensions();

        // Skip render when container dimensions haven't changed.
        // This eliminates the redundant second render triggered by ResizeObserver's
        // initial callback (fires immediately after observe()) and any resize events
        // where the container size is unchanged.
        const cw = nextDimensions.containerWidth;
        const ch = nextDimensions.containerHeight;
        const hasRendered = this.#lastRenderedWidth > 0 && this.#lastRenderedHeight > 0;
        if (
            hasRendered &&
            dimensionsAreClose(cw, this.#lastRenderedWidth, DEFAULT_RENDER_DIMENSION_TOLERANCE) &&
            dimensionsAreClose(ch, this.#lastRenderedHeight, DEFAULT_RENDER_DIMENSION_TOLERANCE)
        ) {
            return;
        }

        this.dimensions = nextDimensions;

        this.isRendering = true;
        let settleRender = () => {};
        this.#renderSettled = new Promise((resolve) => {
            settleRender = resolve;
        });
        // Font tokens can change with the theme; probe fresh once per render pass.
        this.#scopedFontSizeCache.clear();

        try {
            if (!document.getElementById(this.containerId)) return;
            if (!this.validateData()) {
                this.showNoDataMessage();
                return;
            }

            await this.renderChart();
            this.normalizeSvgTypography();
            this.#lastRenderedWidth = cw;
            this.#lastRenderedHeight = ch;
        } catch (error) {
            console.error(`[ChartRenderer] Render error in '${this.containerId}':`, error);
            this.showErrorMessage();
        } finally {
            const runQueuedRefresh = this.#refreshQueued && !this.#destroyed;
            this.#refreshQueued = false;
            this.#releaseOffscreenSVG();
            this.isRendering = false;

            if (runQueuedRefresh) {
                this.#lastRenderedWidth = 0;
                this.#lastRenderedHeight = 0;
                // Never let the queued pass reject out of this `finally` — that would
                // replace the outer pass's error/return and leave refresh() awaiters
                // hanging on #renderSettled.
                await this._render().catch((error) => {
                    console.error(
                        `[ChartRenderer] Queued refresh error in '${this.containerId}':`,
                        error,
                    );
                });
            }

            settleRender();
        }
    }
}
