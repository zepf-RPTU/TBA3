/**
 * ResizeService — one shared ResizeObserver for every module and chart renderer.
 *
 * Observations are tagged with a `scopeId` (a module's id), so `removeByScope(id)`
 * tears down everything that module registered when it is destroyed. The owning class
 * makes that call, rather than each caller tracking its own elements.
 */

// ============================================================================
// RESIZE SERVICE SINGLETON
// ============================================================================

class ResizeService {
    /** @type {ResizeService|null} */
    static #instance = null;

    /** @type {ResizeObserver|null} Created on the first observation, never before. */
    #observer = null;

    /** @type {Map<Element, {callback: Function, debounceMs: number, timeoutId: number|null, scopeId: string|null}>} */
    #callbacks = new Map();

    /** @type {Map<string, Set<Element>>} - Maps scopeId to Set of observed elements */
    #scopeRegistry = new Map();

    /**
     * Private constructor - use getInstance() instead
     */
    constructor() {
        if (ResizeService.#instance) {
            throw new Error('ResizeService is a singleton. Use resizeService export instead.');
        }
    }

    /**
     * Get the singleton instance
     * @returns {ResizeService} The shared instance, created on first call.
     */
    static getInstance() {
        if (!ResizeService.#instance) {
            ResizeService.#instance = new ResizeService();
        }
        return ResizeService.#instance;
    }

    /**
     * The shared ResizeObserver, built on first use.
     *
     * Deferred because the singleton is created at import time and `ResizeObserver` is a
     * browser global: constructing it eagerly makes the whole package unimportable
     * anywhere without a DOM, which is the opposite of what a framework-free kit promises.
     * @returns {ResizeObserver} The observer every observation is registered on.
     */
    #resolveObserver() {
        if (this.#observer) return this.#observer;
        this.#observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const config = this.#callbacks.get(entry.target);
                if (!config) continue;

                // Debounce the callback
                if (config.timeoutId !== null) {
                    clearTimeout(config.timeoutId);
                }

                config.timeoutId = window.setTimeout(async () => {
                    config.timeoutId = null;
                    if (!config.callback) return;
                    try {
                        // Callbacks that redraw are async (ChartRenderer._render,
                        // the task-ring grid's rerender). Awaiting is what keeps a
                        // failed resize redraw inside this catch — without it the
                        // rejection escapes to `unhandledrejection` and the global
                        // handler reports a chart's problem as a page failure.
                        await config.callback(entry);
                    } catch (error) {
                        console.error('[ResizeService] Callback error:', error);
                    }
                }, config.debounceMs);
            }
        });
        return this.#observer;
    }

    /**
     * Observe an element for resize events
     * @param {Element} element - DOM element to observe
     * @param {Function} callback - Callback function to invoke on resize
     * @param {object} [options] - Configuration options
     * @param {string} [options.scopeId] - Scope ID for grouped cleanup (e.g., module ID)
     * @param {number} [options.debounceMs=100] - Debounce delay in milliseconds
     * @returns {boolean} True if observation started successfully
     */
    observe(element, callback, options = {}) {
        const { scopeId = null, debounceMs = 100 } = options;

        const resolvedElement = element;
        if (!resolvedElement) {
            console.error('[ResizeService] Element not found:', element);
            return false;
        }

        if (typeof callback !== 'function') {
            console.error('[ResizeService] Callback must be a function');
            return false;
        }

        // Clean up any existing observation for this element
        this.unobserve(resolvedElement);

        // Register callback
        this.#callbacks.set(resolvedElement, {
            callback,
            debounceMs,
            timeoutId: null,
            scopeId,
        });

        // Register in scope registry for grouped cleanup
        if (scopeId) {
            let scopeSet = this.#scopeRegistry.get(scopeId);
            if (!scopeSet) {
                scopeSet = new Set();
                this.#scopeRegistry.set(scopeId, scopeSet);
            }
            scopeSet.add(resolvedElement);
        }

        this.#resolveObserver().observe(resolvedElement);

        return true;
    }

    /**
     * Stop observing an element
     * @param {Element} element - DOM element to stop observing
     * @returns {boolean} True if element was being observed
     */
    unobserve(element) {
        const resolvedElement = element;
        if (!resolvedElement) {
            return false;
        }

        const config = this.#callbacks.get(resolvedElement);
        if (!config) {
            return false;
        }

        // Clear any pending timeout
        if (config.timeoutId !== null) {
            clearTimeout(config.timeoutId);
        }

        // Remove from scope registry
        if (config.scopeId) {
            const scopeElements = this.#scopeRegistry.get(config.scopeId);
            if (scopeElements) {
                scopeElements.delete(resolvedElement);
                if (scopeElements.size === 0) {
                    this.#scopeRegistry.delete(config.scopeId);
                }
            }
        }

        // Stop observing
        this.#callbacks.delete(resolvedElement);
        this.#observer?.unobserve(resolvedElement);

        return true;
    }

    /**
     * Remove all observations for a given scope
     * Called automatically when a module is destroyed
     * @param {string} scopeId - The scope ID to clean up
     * @returns {number} Number of elements unobserved
     */
    removeByScope(scopeId) {
        const elements = this.#scopeRegistry.get(scopeId);
        if (!elements || elements.size === 0) {
            return 0;
        }

        let count = 0;
        // Create array copy since unobserve modifies the set
        const elementsArray = Array.from(elements);

        for (const element of elementsArray) {
            if (this.unobserve(element)) {
                count++;
            }
        }

        // Ensure scope is removed from registry
        this.#scopeRegistry.delete(scopeId);

        return count;
    }
}

/**
 * Singleton ResizeService instance
 * @type {ResizeService}
 */
export const resizeService = ResizeService.getInstance();
