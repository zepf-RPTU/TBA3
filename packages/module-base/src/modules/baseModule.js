/**
 * BaseModule — base class for every view building block.
 *
 * For composite modules (controls, mixed components) that need neither a chart nor a
 * table: a chart goes through ChartHostModule with a config descriptor, a table extends
 * TableModule. `resizeService` resolves from constructor options with a singleton
 * default, so a test can pass a mock. Tooltips are not this class's concern.
 */

import { resizeService as defaultResizeService } from '../services/resizeService.js';
import { ResourceTracker } from '../utils/resourceTracker.js';
import { waitForLayout } from '../utils/waitForLayout.js';

import { ModuleChildRegistry } from './internal/moduleChildRegistry.js';

/**
 * Fail-safe cap for whenSubtreeSettled(). Generous enough for a large Tabulator
 * build on a slow machine, short enough that a module which never reports
 * settled cannot leave a view stuck behind its loading placeholder.
 */
const SETTLE_TIMEOUT_MS = 3000;

class BaseModule {
    // ========================================================================
    // PRIVATE FIELDS
    // ========================================================================

    // Identity & DOM
    #id;
    #container;
    #element;

    // Lifecycle & state
    #mounted;
    #initialized;
    #destroyed;
    /** @type {{[key: string]: any}} */
    #options;
    #data;
    #visible;

    // Callbacks & children
    #callbacks; // eventName → Function[]
    #childRegistry;

    // DI-resolved services
    #resizeService;

    // Resource tracking (composed — see ResourceTracker)
    #resources;

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    /**
     * Creates a new BaseModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement|null} [container] - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options (resizeService, and subclass-specific keys)
     */
    constructor(id, container = null, options = {}) {
        if (!id) {
            throw new Error('BaseModule requires an id parameter');
        }

        // Identity & DOM
        this.#id = id;
        this.#container =
            typeof container === 'string'
                ? document.getElementById(container) || document.querySelector(container)
                : container;
        this.#element = null;

        // Lifecycle & state
        this.#mounted = false;
        this.#initialized = false;
        this.#destroyed = false;
        this.#options = { ...options };
        this.#data = null;
        this.#visible = false; // Start hidden — must explicitly call show()

        // Callbacks & children
        this.#callbacks = new Map();
        this.#childRegistry = new ModuleChildRegistry(id);

        // DI-resolved services: injectable via options, fall back to the real singleton
        this.#resizeService = options.resizeService ?? defaultResizeService;

        // Resource tracking (composed)
        this.#resources = new ResourceTracker(id);
    }

    get id() {
        return this.#id;
    }
    get container() {
        return this.#container;
    }
    get options() {
        return this.#options;
    }
    get visible() {
        return this.#visible;
    }

    get element() {
        return this.#element;
    }
    set element(value) {
        this.#element = value;
    }

    get initialized() {
        return this.#initialized;
    }

    get mounted() {
        return this.#mounted;
    }

    get destroyed() {
        return this.#destroyed;
    }

    /**
     * Resource tracker for DOM listeners, timeouts, rAFs, subscriptions, and disposables.
     * Use `this.resources.trackX()` in subclasses to register resources for automatic cleanup.
     * @returns {ResourceTracker} The tracker owning this module's listeners, timers and subscriptions.
     */
    get resources() {
        return this.#resources;
    }

    /**
     * The DI-resolved resize service (see the constructor's `options.resizeService`).
     * Subclasses that observe elements themselves MUST go through this rather than
     * importing the singleton: destroy() releases this module's observations with
     * `this.#resizeService.removeByScope(id)`, so an observation registered on a
     * different instance is never released.
     * @protected
     * @returns {typeof import('../services/resizeService.js').resizeService} The DI-resolved service this module registers its observations with.
     */
    get resizeService() {
        return this.#resizeService;
    }

    /**
     * Get registered child modules (read-only view)
     * Used by onThemeChanged() and whenSubtreeSettled() to walk the subtree.
     * @protected
     * @returns {Set<BaseModule>} A read-only view of the registered children, in registration order.
     */
    get childModules() {
        return this.#childRegistry.children;
    }

    // ========================================================================
    // OPTIONS & DATA
    // ========================================================================

    /**
     * Set module options (merges with existing options)
     * @param {object} options - Options to merge
     * @protected
     */
    setOptions(options) {
        this.#options = { ...this.#options, ...options };
    }

    /**
     * Set default option values (only sets keys not already present)
     * Use in subclass constructors to declare defaults without overriding
     * values passed via the constructor's options parameter.
     * @param {object} defaults - Default option values
     * @protected
     */
    setDefaults(defaults) {
        for (const [key, value] of Object.entries(defaults)) {
            if (this.#options[key] === undefined) {
                this.#options[key] = value;
            }
        }
    }

    /**
     * Get a specific option value
     * @param {string} key - Option key
     * @param {*} defaultValue - Default value if option not found
     * @returns {*} Option value or default
     */
    getOption(key, defaultValue = undefined) {
        return this.#options[key] !== undefined ? this.#options[key] : defaultValue;
    }

    /**
     * The option bundle every child module is constructed with — the shared
     * `appState`, the navigation callback, the data store and the glossary.
     * One canonical set rather than a hand-picked subset per call site: an
     * option a child never reads is inert, whereas a child that cannot reach
     * the app state because its view forgot to pass it fails only at runtime.
     * @protected
     * @param {object} [extras={}] - The child's own options; they win over the bundle.
     * @returns {object} Constructor options for a child module.
     */
    _childOptions(extras = {}) {
        return {
            appState: this.getOption('appState'),
            onNavigate: this.getOption('onNavigate'),
            dataStore: this.getOption('dataStore'),
            glossaryData: this.getOption('glossaryData'),
            ...extras,
        };
    }

    /**
     * Set module data
     * @param {*} data - Data to store
     * @protected
     */
    setData(data) {
        this.#data = data;
    }

    /**
     * Get module data
     * @returns {*} Stored data
     */
    getData() {
        return this.#data;
    }

    /**
     * Register a callback for a specific event
     * @param {string} eventName - Name of the event
     * @param {Function} handler - Callback function
     * @protected
     */
    registerCallback(eventName, handler) {
        if (typeof handler !== 'function') {
            console.warn(
                `BaseModule[${this.#id}]: Cannot register non-function callback for '${eventName}'`,
            );
            return;
        }

        if (!this.#callbacks.has(eventName)) {
            this.#callbacks.set(eventName, []);
        }
        this.#callbacks.get(eventName).push(handler);
    }

    /**
     * Trigger callbacks for a specific event
     * @param {string} eventName - Name of the event
     * @param {...*} args - Arguments to pass to the callbacks
     * @protected
     */
    triggerCallback(eventName, ...args) {
        const handlers = this.#callbacks.get(eventName) || [];
        handlers.forEach((handler) => {
            try {
                handler(...args);
            } catch (error) {
                console.error(`BaseModule[${this.#id}]: Error in callback '${eventName}':`, error);
            }
        });
    }

    // ========================================================================
    // CHILD MODULE MANAGEMENT
    // ========================================================================

    /**
     * Register a child module for automatic cleanup.
     * @param {BaseModule} childModule - Child module to register
     * @protected
     */
    registerChildModule(childModule) {
        this.#childRegistry.register(childModule);
    }

    /**
     * Unregister a child module (e.g., if manually destroyed before parent)
     * @param {BaseModule} childModule - Child module to unregister
     * @protected
     */
    unregisterChildModule(childModule) {
        this.#childRegistry.unregister(childModule);
    }

    /**
     * Destroy and unregister a single child module, optionally clearing its container.
     * Returns null so callers can reset their reference in one statement:
     *   this.#ref = this.destroyAndUnregister(this.#ref, container);
     * @param {BaseModule|null} childModule - Child module to destroy (null-safe)
     * @param {HTMLElement} [container] - Optional container to clear after destruction
     * @returns {null} Always null, so the caller can clear its reference in the same statement.
     * @protected
     */
    destroyAndUnregister(childModule, container) {
        return this.#childRegistry.destroyAndUnregister(childModule, container);
    }

    /**
     * Destroy and unregister all modules in a collection, then clear it.
     * Accepts Set or Map (iterates .values() for Map).
     * @param {Set|Map} collection - Collection of child modules
     * @param {HTMLElement} [container] - Optional container to clear after destruction
     * @protected
     */
    destroyAndUnregisterAll(collection, container) {
        this.#childRegistry.destroyAndUnregisterAll(collection, container);
    }

    // ========================================================================
    // CONTAINER HELPERS
    // ========================================================================

    /**
     * Validate that a container exists.
     * Called automatically by the render() wrapper — no need to call explicitly in subclasses.
     * TableModule and ChartModule override the default to also assign the
     * module ID to the container element (needed by Tabulator / D3 lookups).
     * @param {object} [options={}] - Whether the container should be given this module’s id.
     * @param {boolean} [options.assignId=false] - When true, sets container.id = this.id if missing
     * @protected
     * @returns {HTMLElement} The validated container element
     * @throws {Error} If no container element is available
     */
    validateContainer({ assignId = false } = {}) {
        if (!this.#container) {
            throw new Error(`${this.constructor.name}[${this.#id}]: No container element found`);
        }
        if (assignId && !this.#container.id) {
            this.#container.id = this.#id;
        }
        return this.#container;
    }

    // ========================================================================
    // THEME
    // ========================================================================

    /**
     * Refresh after a KS color-theme switch.
     *
     * The app calls this on the active view (viewLifecycle.refreshThemeInCurrentView);
     * the default forwards it recursively to registered children, so composite
     * modules pass it through to their table/chart grandchildren. Leaves that
     * render themed colors override it — refresh first, then call
     * super.onThemeChanged() so their own children still catch up. A module that
     * captures theme colors (e.g. into child options) should do the same.
     *
     * Each child is isolated: one failing refresh must not abort its siblings
     * or the view transition that triggered the cascade.
     */
    onThemeChanged() {
        for (const child of this.childModules) {
            try {
                child.onThemeChanged?.();
            } catch (error) {
                console.error(
                    `BaseModule[${this.id}]: onThemeChanged failed for child "${child.id}":`,
                    error,
                );
            }
        }
    }

    // ========================================================================
    // LIFECYCLE (mount / hydrate / init / render / update)
    // ========================================================================

    /**
     * Mount the module — synchronous phase of initialization.
     * Stores data, validates the container, and sets the default element.
     * After mount(), the module occupies its space in the DOM but has not
     * rendered any content yet. Subclasses (e.g. ContentModule) override
     * this to build structural DOM (title wrapper, empty body) synchronously.
     *
     * mount() is idempotent — calling it again is a no-op.
     * @param {object} [data] - Initialization data
     */
    mount(data) {
        if (this.#mounted) return;

        if (data !== undefined) {
            this.setData(data);
        }

        if (this.container) {
            this.validateContainer();
        }

        // Default element to container so show()/hide() work after mount
        if (!this.#element && this.#container) {
            this.#element = this.#container;
        }

        this.#mounted = true;
    }

    /**
     * Hydrate the module — asynchronous phase of initialization.
     * Renders the expensive content (charts, tables) into the container
     * that was prepared by mount(). Requires mount() to have been called.
     *
     * After hydrate(), the module is fully initialized.
     * @param {object} [data] - Initialization data (merged with any data from mount)
     * @returns {Promise<void>}
     */
    async hydrate(data) {
        if (this.#initialized) {
            console.warn(`BaseModule[${this.#id}]: Already initialized, calling update instead`);
            return this.update(data);
        }

        if (!this.#mounted) {
            console.warn(
                `BaseModule[${this.#id}]: hydrate() called before mount(), calling mount() first`,
            );
            this.mount(data);
        }

        // Allow hydrate-time data to override mount-time data
        if (data !== undefined) {
            this.setData(data);
        }

        // Render the module — container already validated by mount()
        await this._doRender(this.getData());

        // Bail out if destroyed during render
        if (this.#destroyed) return;

        this.#initialized = true;
    }

    /**
     * Initialize the module — convenience entry point equivalent to
     * mount(data) followed by hydrate(data). Callers that need to interleave
     * mounting and async hydration (e.g. parallel hydration) call those directly.
     * @param {object} [data] - Initialization data
     * @returns {Promise<void>}
     */
    async init(data) {
        if (this.#initialized) {
            console.warn(`BaseModule[${this.#id}]: Already initialized, calling update instead`);
            return this.update(data);
        }

        // Store initial data
        if (data !== undefined) {
            this.setData(data);
        }

        // Mount (sync) — validate container, set element
        if (!this.#mounted) {
            this.mount(data);
        }

        // Hydrate (async) — render content
        await this.hydrate(data);
    }

    /**
     * Render the module — public entry point.
     * Validates the container (if present) then delegates to _doRender().
     * External callers and parent modules should always call render(), never _doRender() directly.
     * Do not override; implement _doRender() instead.
     * @param {object} [data] - Data to render
     * @returns {Promise<*>} Whatever _doRender() resolves to.
     */
    async render(data) {
        if (this.container) {
            this.validateContainer();
        }
        return await this._doRender(data);
    }

    /**
     * Module rendering implementation (abstract — must be overridden by subclasses).
     * Called by render() after container validation.
     * Override this instead of render() in all BaseModule subclasses.
     * @param {object} data - Data to render
     * @returns {*} A DOM element, a Promise, or void — depends on the subclass.
     * @abstract
     * @protected
     */
    // eslint-disable-next-line no-unused-vars
    _doRender(data) {
        throw new Error(`BaseModule[${this.#id}]: _doRender() must be implemented by subclass`);
    }

    /**
     * Update the module with new data. The base only stores the payload;
     * subclasses override this to re-render from it. `init()` and `hydrate()`
     * fall back here when the module is already initialized.
     * @param {object} data - New data to update with
     * @returns {Promise<void>}
     */
    async update(data) {
        if (this.#destroyed) return;
        if (!this.#initialized) {
            console.warn(`BaseModule[${this.#id}]: Cannot update - not initialized`);
            return;
        }

        // Store data if provided
        if (data !== undefined) {
            this.#data = data;
        }
    }

    /**
     * Waits for two animation frames (layout completion)
     * Use when DOM needs to be fully rendered and laid out before proceeding
     * @returns {Promise<void>}
     * @protected
     */
    waitForLayout() {
        return waitForLayout();
    }

    /**
     * Resolves once this module's own content has finished settling.
     *
     * `_doRender()` resolving is not the same as the content being on screen:
     * a Tabulator instance is constructed synchronously but builds, redraws and
     * measures its columns over later frames. Modules with that kind of
     * post-render work override this so callers can wait for the real thing.
     *
     * Default: nothing to wait for.
     * @returns {Promise<void>}
     * @protected
     */
    whenSettled() {
        return Promise.resolve();
    }

    /**
     * Resolves once this module and every registered descendant have settled.
     *
     * Used by BaseViewModule.revealView() to hold a view behind its skeleton
     * until the content underneath has stopped moving.
     * @param {number} [timeoutMs] - Fail-safe cap; see SETTLE_TIMEOUT_MS
     * @returns {Promise<void>}
     * @protected
     */
    whenSubtreeSettled(timeoutMs = SETTLE_TIMEOUT_MS) {
        /** @type {Array<Promise<unknown>>} */
        const pending = [];
        /** @param {BaseModule} module - The module whose subtree is being walked. */
        const collect = (module) => {
            pending.push(module.whenSettled());
            module.childModules.forEach(collect);
        };
        collect(this);

        // A module that never settles (or throws on the way) must not strand
        // the view behind its placeholder forever — fall through on timeout.
        let failSafe;
        return Promise.race([
            Promise.all(pending)
                .then(() => undefined)
                .catch(() => undefined),
            new Promise((resolve) => {
                failSafe = setTimeout(resolve, timeoutMs);
            }),
        ]).then(() => {
            // Clear the timer on the happy path; leaving one armed per reveal
            // keeps the timer queue (and, under test runners, the event loop)
            // busy for the full fail-safe window after every render.
            clearTimeout(failSafe);
        });
    }

    // ========================================================================
    // VISIBILITY (show / hide)
    // ========================================================================

    /**
     * Show the module and all registered child modules
     */
    show() {
        if (this.#element && !this.#visible) {
            this.#element.style.display = '';
            this.#visible = true;
        }

        // Show all registered child modules
        this.#childRegistry.showAll();
    }

    /**
     * Hide the module
     */
    hide() {
        if (this.#element && this.#visible) {
            this.#element.style.display = 'none';
            this.#visible = false;
        }

        // Hide all registered child modules
        this.#childRegistry.hideAll();
    }

    /**
     * Destroy the module — tears down all active resources.
     *
     * Disconnects DOM listeners, timeouts, animation frames, resize observers,
     * child modules, event handlers, and removes the DOM element.
     * Idempotent — safe to call more than once.
     *
     * Subclasses should override and call `super.destroy()` at the end.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;

        // Resource tracking (listeners, timeouts, rAFs, subscriptions, disposables)
        this.#resources.destroy();

        // Resize observers scoped to this module
        this.#resizeService.removeByScope(this.#id);

        // Destroy all registered child modules
        this.#childRegistry.destroyAll();

        // Tear down the DOM element — but only DOM this module owns. A module
        // that never set its own element adopts its container as #element (see
        // mount()); it does not own that container, so removing it would detach a
        // node the parent still tracks (a view container in .main-content, or a
        // persistent wrapper a parent reuses). Clear its children instead, so the
        // rendered content is torn down without orphaning the shared node.
        // Modules that built their own element (#element !== #container) keep the
        // original remove() — they own it.
        if (this.#element) {
            if (this.#element === this.#container) {
                this.#element.innerHTML = '';
            } else {
                this.#element.remove();
            }
        }
    }
}

export { BaseModule };
