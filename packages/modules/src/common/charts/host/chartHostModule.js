/**
 * ChartHostModule — config-driven adapter presenting any ChartRenderer as a
 * BaseModule-compatible component.
 *
 * A chart type is a config descriptor handed to this host, never a subclass of it.
 * Renderers created inside a host take `scopeId: host.id`, which is what lets the
 * host tear down their tooltips and resize observers when it is destroyed.
 */

import { waitForStableElementBox } from '@tba3/module-base/utils/waitForLayout.js';
import { ContentModule } from '@tba3/module-base/modules/contentModule.js';

/**
 * @typedef {object} ChartHostConfig
 * @property {function(ChartHostModule, object): (object | object[] | null)} createRenderer
 *     Factory that receives `(host, data)` and returns a renderer, array of renderers, or null.
 * @property {string} [glossaryPath] - Dot-notation path into glossary.json for the module's title/subtitle/tour copy
 * @property {function(ChartHostModule, object[], object): Promise<void>} [onUpdate]
 *     Custom update logic `(host, charts, data)`. Without it, `update()` only warns.
 * @property {function(ChartHostModule, object[], object): (void | Promise<void>)} [prepareLayout]
 *     Optional pre-render hook for layout-affecting DOM work before first chart measurement.
 * @property {function(ChartHostModule, object[], object): (void | Promise<void>)} [onRendered]
 *     Optional post-create hook `(host, charts, data)` for work that can only be
 *     measured off a drawn chart.
 * @property {function(ChartHostModule): void} [onCleanup] - Extra cleanup before chart destruction
 * @property {{[method: string]: (host: ChartHostModule, ...args: any[]) => any}} [publicAPI]
 *     Named methods exposed on the instance. Each receives (host, ...callerArgs).
 * @property {object} [defaultOptions] - Default options merged under caller options
 * @property {function(ChartHostModule): (string|Array<string|number|null|undefined>|null)} [getExportIdentity]
 *     What the host currently shows, folded into its export target id. Required
 *     of any chart type whose host is re-pointed at a different entity in place
 *     (a Leitidee, a student), or its captures share one id — see
 *     `ContentModule#getExportIdentity`.
 */

const OPTIONAL_FUNCTION_HOOKS = Object.freeze([
    'onUpdate',
    'prepareLayout',
    'onRendered',
    'onCleanup',
    'getExportIdentity',
]);

/**
 * Throw unless `value` is a plain object.
 * Config mistakes have to fail at construction: a malformed descriptor that survives
 * this check surfaces much later as a missing chart, with nothing pointing back here.
 * @param {*} value - The config member being validated.
 * @param {string} message - Error text naming the host and the offending key.
 */
function assertPlainObject(value, message) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(message);
    }
}

/**
 * Throw unless `value` is a plain object whose every member is a function.
 * @param {string} hostId - Host id, so the error names the module that carries the bad config.
 * @param {string} configKey - Which config key is being validated, e.g. `publicAPI`.
 * @param {*} value - The map to validate.
 */
function assertFunctionMap(hostId, configKey, value) {
    assertPlainObject(value, `ChartHostModule[${hostId}]: config.${configKey} must be an object`);

    for (const [name, handler] of Object.entries(value)) {
        if (typeof handler !== 'function') {
            throw new Error(
                `ChartHostModule[${hostId}]: config.${configKey}.${name} must be a function`,
            );
        }
    }
}

/**
 * Validate a chart config descriptor before any of it is used.
 * @param {string} hostId - Host id, used in every error message.
 * @param {object} config - The descriptor to validate.
 */
function validateChartHostConfig(hostId, config) {
    assertPlainObject(config, `ChartHostModule[${hostId}]: config must be an object`);

    if (typeof config.createRenderer !== 'function') {
        throw new Error(`ChartHostModule[${hostId}]: config.createRenderer is required`);
    }

    for (const key of OPTIONAL_FUNCTION_HOOKS) {
        if (config[key] !== undefined && typeof config[key] !== 'function') {
            throw new Error(
                `ChartHostModule[${hostId}]: config.${key} must be a function when provided`,
            );
        }
    }

    if (config.defaultOptions !== undefined) {
        assertPlainObject(
            config.defaultOptions,
            `ChartHostModule[${hostId}]: config.defaultOptions must be an object`,
        );
    }
    if (config.publicAPI !== undefined) {
        assertFunctionMap(hostId, 'publicAPI', config.publicAPI);
    }
}

class ChartHostModule extends ContentModule {
    /** @type {object} Config descriptor for this chart host */
    #config;

    /** @type {Array} Array of active chart renderer instances (always an array, even for single charts) */
    #charts;

    /** @type {object} Config-scoped state namespace — cleaned automatically on cleanup */
    #configState = {};

    /** @type {boolean} Whether first hydrate should wait for expand */
    #deferredHydrationPending = false;

    /** @type {Promise<void>|null} In-flight first-expand hydrate */
    #deferredHydrationPromise = null;

    /** @type {number} Monotonic token used to discard stale async render work */
    #renderCycle = 0;

    /**
     * Creates a new ChartHostModule instance.
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {object} config - Chart configuration descriptor
     * @param {function(ChartHostModule, object): (object | object[] | null)} config.createRenderer
     *     Factory that receives `(host, data)` and returns a renderer instance, an array of
     *     renderer instances, or `null` (for procedural/external charts). Called from `_doRender()`.
     * @param {string} [config.glossaryPath] - Dot-notation path into glossary.json for the module's title/subtitle/tour copy
     * @param {function(ChartHostModule, object[], object): Promise<void>} [config.onUpdate]
     *     Custom update logic `(host, charts, data)`. When absent, `update()` only warns.
     * @param {function(ChartHostModule): void} [config.onCleanup]
     *     Extra cleanup logic called before standard chart destruction
     * @param {{[method: string]: (host: ChartHostModule, ...args: any[]) => any}} [config.publicAPI]
     *     Named methods exposed directly on the instance. Each receives `(host, ...callerArgs)`.
     * @param {object} [config.defaultOptions] - Default options merged under caller options
     * @param {{[key: string]: any}} [options={}] - Standard BaseModule options plus chart-host options
     *     (glossaryKey, glossaryData, showModuleTitle, deferHydrationUntilExpand, …).
     */
    constructor(id, container, config, options = {}) {
        super(id, container, options);

        validateChartHostConfig(id, config);

        this.#config = config;
        this.#charts = [];

        // Apply config-level defaults (only sets keys not already in options)
        if (config.defaultOptions) {
            this.setDefaults(config.defaultOptions);
        }

        // Bridge config.glossaryPath to BaseModule glossaryKey for auto-loading in init()
        // Options-level glossaryKey takes precedence over config-level glossaryPath
        if (config.glossaryPath && !this.glossaryKey) {
            this.glossaryKey = config.glossaryPath;
        }

        // Expose publicAPI methods directly on the instance
        if (config.publicAPI) {
            this.#bindPublicAPI(config.publicAPI);
        }
    }

    /**
     * Refresh in place on a KS color-theme switch: rebuild the renderer(s) via
     * a fresh createRenderer() call so construction/render-time color reads pick
     * up the new palette (the color cache was invalidated by applyKsTheme). No
     * view teardown involved.
     * @override
     */
    onThemeChanged() {
        const data = this.getData();
        if (this.initialized && data !== undefined) {
            void this.rerender(data).catch((error) =>
                console.error(`ChartHostModule[${this.id}]: theme refresh failed:`, error),
            );
        }
        super.onThemeChanged();
    }

    // ========================================================================
    // CONTAINER HELPERS
    // ========================================================================

    /**
     * Default assignId to true for all chart host modules.
     * @override
     */
    validateContainer({ assignId = true } = {}) {
        return super.validateContainer({ assignId });
    }

    // ========================================================================
    // CHART ACCESSORS
    // ========================================================================

    /**
     * Primary chart renderer (first element of the charts array).
     * Convenience accessor for the common case of a host managing a single chart.
     * @returns {object | null} The first renderer, or null when the host manages none.
     */
    get chart() {
        return this.#charts[0] ?? null;
    }

    /**
     * All chart renderer instances managed by this host.
     * @returns {Array} Every renderer this host owns, in creation order.
     */
    get charts() {
        return this.#charts;
    }

    /**
     * Refresh all managed charts (e.g. after a container resize).
     * Calls `refresh()` on each chart that supports it.
     * @returns {Promise<void>}
     */
    async refreshCharts() {
        for (const chart of this.#charts) {
            if (chart && typeof chart.refresh === 'function') {
                await chart.refresh();
            }
        }
    }

    /**
     * Config-scoped state namespace.
     * Configs should store per-instance data here instead of as expando properties.
     * Automatically reset to `{}` on cleanup.
     * @returns {object} The per-instance scratch namespace, reset to `{}` on cleanup.
     */
    get configState() {
        return this.#configState;
    }

    /**
     * Whether this host uses ContentModule-owned export controls.
     * @returns {boolean} True when the ContentModule header owns the export controls rather than the chart.
     */
    #usesModuleExportControls() {
        return this.getOption('enableModuleExport', false) === true;
    }

    /** @override */
    getExportControlDefinition() {
        if (!this.#usesModuleExportControls()) {
            return null;
        }

        if (this.#deferredHydrationPending || this.#charts.length === 0) {
            return null;
        }

        return {
            id: this._buildExportTargetId(this.getExportIdentity()),
            title: this.#getCurrentExportTitle(),
            type: 'chart',
            container: this.#getDefaultExportTargetContainer(),
        };
    }

    /**
     * What this host currently shows, for its export target id.
     *
     * A chart type that owns the state declares it in its config descriptor,
     * like everything else about a chart; a host that shows one undivided thing
     * declares nothing and stays a bare module id.
     * @override
     */
    getExportIdentity() {
        return this.#config.getExportIdentity?.(this) ?? null;
    }

    /**
     * Replace the managed chart(s) with a new renderer (or array of renderers).
     * Destroys any previously tracked charts first.  Does NOT call `.create()`
     * on the new renderer(s) — the caller is responsible for creation.
     *
     * Use this from config event handlers or helpers that create charts
     * outside of the normal `createRenderer` lifecycle (deferred creation).
     * @param {object | object[] | null} renderer - A renderer, array, or null
     */
    replaceChart(renderer) {
        this.#destroyCharts();
        if (renderer == null) {
            this.#charts = [];
        } else if (Array.isArray(renderer)) {
            this.#charts = renderer;
        } else {
            this.#charts = [renderer];
        }

        this.syncExportControls();
    }

    /**
     * Track one more renderer alongside the ones already managed, without
     * destroying them. The append counterpart to `replaceChart`'s swap, for a
     * config that mounts a second renderer lazily and needs the first to stay
     * alive (EN's style charts keep spider and lollipop in sibling host divs and
     * toggle visibility, so a mode switch costs no D3 + ResizeObserver rebuild).
     *
     * Like `replaceChart`, this does NOT call `.create()` — the caller owns that.
     * @param {object} renderer - The renderer to start tracking; ignored when null.
     */
    addChart(renderer) {
        if (renderer == null) return;
        this.#charts.push(renderer);
        this.syncExportControls();
    }

    // ========================================================================
    // LIFECYCLE — render / update / cleanup
    // ========================================================================

    /**
     * Render the chart(s).
     * 1. Calls `config.createRenderer(host, data)` to obtain renderer(s)
     * 2. Installs renderer header/export controls that affect measured height
     * 3. Runs optional `config.prepareLayout(host, charts, data)`
     * 4. Waits for a stable content box
     * 5. Calls `.create()` on each renderer
     * @override
     * @param {object} data - Data payload from the parent view
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        const renderCycle = ++this.#renderCycle;

        // Store raw data
        this.setData(data);

        // Destroy any existing charts before re-render
        this.#destroyCharts();

        // Create renderer(s)
        const result = await this.#config.createRenderer(this, data);

        if (!this.#isRenderCycleCurrent(renderCycle)) {
            this.#destroyRendererResult(result);
            return;
        }

        // Normalize to array (supports single renderer, array, or null)
        if (result == null) {
            this.#charts = [];
        } else if (Array.isArray(result)) {
            this.#charts = result;
        } else {
            this.#charts = [result];
        }

        // Header/export controls affect the body height that renderers measure.
        // Install them before create() so first render uses the settled shell.
        for (const chart of this.#charts) {
            if (chart && typeof chart.installHeaderActions === 'function') {
                chart.host = this;
                chart.installHeaderActions();
            }
        }
        this.syncExportControls();

        if (typeof this.#config.prepareLayout === 'function') {
            await this.#config.prepareLayout(this, this.#charts, data);
        }

        if (!this.#isRenderCycleCurrent(renderCycle)) {
            this.#destroyCharts();
            return;
        }

        await this.#waitForStableContentLayout();

        if (!this.#isRenderCycleCurrent(renderCycle)) {
            this.#destroyCharts();
            return;
        }

        // Call create() on each renderer that hasn't been created yet.
        // Snapshot: a config that appends a renderer via addChart() while this
        // loop awaits owns that renderer's create() call, so creating it here
        // too would render it twice and register a second resize observer.
        for (const chart of [...this.#charts]) {
            if (!this.#isRenderCycleCurrent(renderCycle)) {
                this.#destroyCharts();
                return;
            }

            if (chart && typeof chart.create === 'function') {
                // Provide host reference so renderers can access headerActionsContainer
                chart.host = this;
                await chart.create();

                if (!this.#isRenderCycleCurrent(renderCycle)) {
                    this.#destroyCharts();
                    return;
                }
            }
        }

        // Post-create hook, for the work that can only be measured off a drawn
        // chart — a minimum height read back from its own layout, a control that
        // needs the renderer's registry to exist. The counterpart to
        // `prepareLayout`, which runs before the first measurement.
        if (typeof this.#config.onRendered === 'function') {
            await this.#config.onRendered(this, this.#charts, data);
        }
    }

    /**
     * Supports an opt-in deferred first hydrate for collapsible charts whose
     * content bodies start hidden. The structural shell is mounted immediately,
     * but the expensive first chart render is marked pending and only runs on
     * the first expand.
     * @override
     */
    async hydrate(data) {
        if (this.#shouldDeferHydration()) {
            if (!this.mounted) {
                this.mount(data);
            } else if (data !== undefined) {
                this.setData(data);
            }

            this.#deferredHydrationPending = true;
            return;
        }

        this.#deferredHydrationPending = false;
        return super.hydrate(data);
    }

    /** @override */
    expand() {
        const wasExpanded = this.isExpanded;
        const shouldHydrateOnExpand = this.#deferredHydrationPending && !this.initialized;

        super.expand();

        if (shouldHydrateOnExpand) {
            void this.#hydrateDeferredContent()?.catch((error) => {
                console.error(`ChartHostModule[${this.id}]: Deferred hydrate failed:`, error);
            });
        } else if (!wasExpanded && this.initialized) {
            void this.refreshCharts().catch((error) => {
                console.error(`ChartHostModule[${this.id}]: expand refresh failed:`, error);
            });
        }
    }

    /**
     * Re-render the chart(s) with new data.
     * Unlike `render()`, skips the `validateContainer()` call and does not
     * affect the `initialized` flag.  Use from `onUpdate` hooks that need
     * a full teardown + rebuild cycle.
     * @param {object} data - Data payload
     * @returns {Promise<void>}
     */
    async rerender(data) {
        return this._doRenderContent(data);
    }

    async #waitForStableContentLayout() {
        if (this.getOption('waitForStableLayout', true) === false || this.#charts.length === 0) {
            return;
        }

        const target =
            this.contentContainer instanceof HTMLElement ? this.contentContainer : this.container;
        if (!target) return;

        // A host inside a `display: none` subtree (a mode-hidden SL card on a theme
        // switch) has no offsetParent and no box that will ever become non-zero; the
        // renderer bails on the same test right after, so waiting the full maxFrames
        // here only delays that bail. The first render under the `visibility: hidden`
        // render cover keeps its offsetParent and is not affected.
        if (target.offsetParent === null) return;

        await waitForStableElementBox(target);
    }

    /**
     * Update the chart(s) with new data.
     *
     * Delegates entirely to `config.onUpdate` when provided.
     *
     * A host WITHOUT an `onUpdate` handler has no defined update behaviour: by
     * design, charts change which slice of their immutable data is shown via
     * reactive `setState` / the view-wired sync verbs, not by host-level data
     * replacement. The previous default (`setData(data) + refresh()`) was a
     * footgun — `setData()` writes to `container._chartData`, but most renderers
     * render from `chartState.data`/constructor fields, so the refresh appeared
     * to update data while silently re-rendering the original dataset.
     * @override
     * @param {object} data - New data payload
     * @returns {Promise<void>}
     */
    async update(data) {
        await super.update(data);
        if (this.destroyed) return;

        if (this.#config.onUpdate) {
            return this.#config.onUpdate(this, this.#charts, data);
        }

        // No onUpdate handler — fail loud rather than silently no-op.
        console.warn(
            `ChartHostModule[${this.id}]: update() called but config defines no onUpdate handler; ignoring. Change the displayed slice via setState/event-sync instead.`,
        );
    }

    /**
     * @override
     */
    destroy() {
        this.#renderCycle++;

        // Run config-specific cleanup first
        if (this.#config.onCleanup) {
            try {
                this.#config.onCleanup(this);
            } catch (error) {
                console.error(`ChartHostModule[${this.id}]: Error in config.onCleanup:`, error);
            }
        }

        // Destroy all chart renderer instances
        this.#destroyCharts();

        // Clear config-scoped state
        this.#configState = {};
        this.#deferredHydrationPending = false;
        this.#deferredHydrationPromise = null;

        super.destroy();
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Destroy all chart renderer instances and clear the array.
     */
    #destroyCharts() {
        for (const chart of this.#charts) {
            if (!chart) continue;
            try {
                if (typeof chart.destroy === 'function') {
                    chart.destroy();
                }
                chart.host = null;
            } catch (error) {
                console.error(`ChartHostModule[${this.id}]: Error destroying chart:`, error);
            }
        }
        this.#charts = [];
    }

    /**
     * Destroy renderer instances returned from a stale async createRenderer() call.
     * @param {object | object[] | null} result - Whatever the stale `createRenderer()` call resolved to.
     */
    #destroyRendererResult(result) {
        const charts = result == null ? [] : Array.isArray(result) ? result : [result];

        for (const chart of charts) {
            if (!chart) continue;
            try {
                if (typeof chart.destroy === 'function') {
                    chart.destroy();
                }
                chart.host = null;
            } catch (error) {
                console.error(`ChartHostModule[${this.id}]: Error destroying stale chart:`, error);
            }
        }
    }

    /**
     * Check whether an async render cycle is still current and attached to live DOM.
     * @param {number} renderCycle - The cycle the caller started in.
     * @returns {boolean} True when no newer render has begun and the container is still in the document.
     */
    #isRenderCycleCurrent(renderCycle) {
        const renderContainer =
            this.contentContainer instanceof HTMLElement ? this.contentContainer : this.container;

        return (
            renderCycle === this.#renderCycle &&
            !this.destroyed &&
            renderContainer instanceof HTMLElement &&
            renderContainer.isConnected
        );
    }

    /**
     * Complete a pending first hydrate once the chart host is expanded.
     * Leaves deferred hydration pending when initialization does not complete,
     * so a later expand can retry the first render.
     * @returns {Promise<void>|null} The in-flight hydrate, or null when there is nothing pending.
     */
    #hydrateDeferredContent() {
        if (this.#deferredHydrationPromise || this.destroyed || this.initialized) {
            return this.#deferredHydrationPromise;
        }

        this.#deferredHydrationPending = false;

        this.#deferredHydrationPromise = (async () => {
            try {
                await super.hydrate();
            } catch (error) {
                if (!this.destroyed && !this.initialized) {
                    this.#deferredHydrationPending = true;
                }

                throw error;
            } finally {
                this.#deferredHydrationPromise = null;
            }
        })();

        return this.#deferredHydrationPromise;
    }

    /**
     * Whether the first hydrate should wait for the first expand action.
     * @returns {boolean} True when the host is a collapsed, collapsible chart configured to wait for its first expand.
     */
    #shouldDeferHydration() {
        return (
            !this.initialized &&
            this.getOption('deferHydrationUntilExpand', false) &&
            this.getOption('collapsible', false) &&
            !this.isExpanded
        );
    }

    /**
     * Resolve the current visible title for export metadata.
     * Prefer the live DOM title so runtime title changes stay aligned.
     * @returns {string} The visible title, falling back to the glossary title, the option, then the id.
     */
    #getCurrentExportTitle() {
        const liveTitle = this.container
            ?.querySelector?.('.content-module-title')
            ?.textContent?.trim();
        if (liveTitle) return liveTitle;

        return this.glossaryTitle || this.getOption('title') || this.id;
    }

    /**
     * Resolve the capture target metadata for host-owned chart exports.
     * @returns {string|HTMLElement|null} The element or selector to capture, or null to let ExportService pick the module card.
     */
    #getDefaultExportTargetContainer() {
        if (this.contentContainer instanceof HTMLElement) {
            return this.contentContainer.id || this.contentContainer;
        }

        return null;
    }

    /**
     * Bind config.publicAPI methods directly onto the instance.
     * Each API function receives `(host, ...callerArgs)`.
     * Callers invoke as `host.myMethod(arg1, arg2)`.
     * @param {{[key: string]: Function}} api - methodName → function(host, ...args)
     */
    #bindPublicAPI(api) {
        for (const [name, fn] of Object.entries(api)) {
            if (name in this) {
                console.warn(
                    `ChartHostModule[${this.id}]: publicAPI '${name}' shadows an existing host property or method`,
                );
            }
            this[name] = (...args) => fn(this, ...args);
        }
    }
}

export { ChartHostModule };
