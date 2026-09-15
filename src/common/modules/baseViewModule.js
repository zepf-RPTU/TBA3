/**
 * BaseViewModule — base class for the top-level view of a dashboard.
 *
 * A view owns a screen's module tree and its app-state observation, and seeds its
 * children from explicit options rather than letting them read state themselves.
 * Subclasses implement `_renderView()`, never `_doRender()`: that is final here
 * because it wraps the render in the cover/reveal sequence.
 */

import { BaseModule } from '@tba3/module-base';
import { showViewSkeleton, hideViewSkeleton, waitForSkeletonHold } from '../app/viewSkeleton.js';

/**
 * @typedef {object} ViewModuleOptions
 * @property {Function} [onNavigate] - Callback for navigation
 * @property {import('../app/appState.js').AppState} [appState] - The app's shared state
 * @property {import('../services/dataStore.js').DataStore} [dataStore] - Shared data store instance
 * @property {{[key: string]: object}} [glossaryData] - Glossary payload passed through to child modules
 * @property {string} [skeleton] - Loading placeholder shape key (see app/viewSkeleton.js)
 * @property {{[key: string]: object}} [viewConfig] - The app's viewConfig map (view labels, icons, sidebar order)
 */

export class BaseViewModule extends BaseModule {
    #stateObservers = new Map(); // app-state key -> { handler, unsubscribe } (for suspend/resume)
    #pendingStateChanges = new Map(); // app-state key -> latest value changed while suspended, in order of last arrival
    #suspended = false;
    #renderToken = 0; // Bumped per beginViewRender(); lets revealView() detect a superseded render
    /** @type {{promise: Promise<void>, resolve: () => void}|null} Open while a render window is covered; see whenRevealed() */
    #revealWaiters = null;
    static RENDERING_ATTRIBUTE = 'data-view-rendering';

    /**
     * Creates a new BaseViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    // ========================================================================
    // SUSPEND / RESUME (automatic on view switch)
    // ========================================================================

    /**
     * Whether this view is currently suspended.
     * @returns {boolean} True while the view is off-screen and not receiving broadcasts.
     */
    get isSuspended() {
        return this.#suspended;
    }

    /**
     * Suspend the view — observed app-state keys stop reaching their handlers
     * while the view is hidden; only the latest value per key is kept for
     * resume() to deliver. Called automatically by BaseAppModule during view switches.
     */
    suspend() {
        if (this.#suspended) return;
        this.#suspended = true;
    }

    /**
     * Resume the view — delivers the latest value of every observed key that
     * changed while suspended, in order of last change. Values are absolute
     * state (a mode, a student id, the comparison set), so the last one per
     * key is enough; nothing is delivered when nothing changed, so a plain
     * revisit does not re-render or re-animate anything.
     *
     * Called automatically by BaseAppModule when switching back to this view,
     * after show() — handlers may test `this.visible`.
     */
    resume() {
        if (!this.#suspended) return;
        this.#suspended = false;

        this.#flushPendingStateChanges();
    }

    /**
     * Deliver the latest value of every observed key that changed while
     * hidden, in order of last change.
     */
    #flushPendingStateChanges() {
        const pending = Array.from(this.#pendingStateChanges);
        this.#pendingStateChanges.clear();
        for (const [key, value] of pending) {
            const handler = this.#stateObservers.get(key)?.handler;
            if (!handler) continue;
            try {
                handler(value);
            } catch (error) {
                console.error(
                    `BaseViewModule[${this.id}]: Error applying "${key}" on resume:`,
                    error,
                );
            }
        }
    }

    /**
     * Resume work that is not an observed app-state key.
     *
     * Observed keys that changed while the view was hidden are delivered by
     * resume() through the view's own handlers, so a view needs no code for
     * those. This hook is for the rest: state that reaches the view outside
     * app state (a service's own listener gated on isSuspended), or a status
     * line to clear.
     *
     * Called by BaseAppModule only for a view that was genuinely suspended —
     * never on first show, where _renderView() already applied the current state.
     * Default: nothing to do.
     *
     * Not the place for show()-type work: show() also runs on the first reveal
     * and is for re-measuring charts and tables that could not size themselves
     * while hidden.
     */
    onResume() {}

    /**
     * Adjust this view's derived guided-walkthrough steps.
     *
     * `buildTourSteps()` derives a step for the view header and for every
     * registered module that has glossary tutorial copy, in document order —
     * which is the whole tour for most views. Override only for steps the
     * module tree genuinely cannot declare: an anchor that is not a module, or
     * content whose element does not exist while the tour is running.
     *
     * Called with the derived steps before the shared closing cards are
     * appended; return the list to use.
     * @param {Array<import('./tutorial/tutorialController.js').TourStep>} steps - The derived steps, before the shared closing cards are appended.
     * @returns {Array<import('./tutorial/tutorialController.js').TourStep>} The steps to actually run; the derived list unchanged by default.
     */
    customizeTourSteps(steps) {
        return steps;
    }

    /**
     * Observe one app-state key and react with plain child verbs: a header
     * control (or a clicking view) writes the key, this handler pushes the
     * value to whichever children render it.
     *
     * Follows suspend/resume: while the view is hidden the latest value per key
     * is kept and delivered on resume(). Released with the view's other
     * resources on destroy. Observe from _renderView(), not the constructor: a
     * view's handlers touch children and view DOM, and at construction time
     * neither exists yet. Observing late loses nothing — state set before the
     * render is read directly by _renderView() (`getStateValue`), so the first
     * render already reflects it.
     * @param {string} key - The app-state key
     * @param {(value: *) => void} handler - Receives the new value
     * @returns {(() => void)|null} Unsubscribe function, or null without an observable app state
     */
    observeState(key, handler) {
        const appState = this.options.appState;
        if (typeof appState?.observe !== 'function') {
            console.warn(
                `BaseViewModule[${this.id}]: no observable appState — cannot observe "${key}"`,
            );
            return null;
        }

        // One observer per key: a second observer replaces the first. Warned
        // because the replacement is otherwise silent — note that
        // observeActiveComparisons() occupies the 'comparisonState' slot.
        if (this.#stateObservers.has(key)) {
            console.warn(
                `BaseViewModule[${this.id}]: replacing the existing observer for "${key}"`,
            );
            this.#stateObservers.get(key).unsubscribe();
        }
        const unsubscribe = appState.observe(key, (value) => {
            if (this.#suspended) {
                this.#pendingStateChanges.delete(key);
                this.#pendingStateChanges.set(key, value);
                return;
            }
            handler(value);
        });
        // The returned remover also drops the observer entry and any value
        // recorded while suspended, so an unsubscribed handler cannot be
        // invoked by the resume flush. Guarded so it cannot evict a successor.
        const remove = () => {
            unsubscribe();
            if (this.#stateObservers.get(key)?.unsubscribe === remove) {
                this.#stateObservers.delete(key);
                this.#pendingStateChanges.delete(key);
            }
        };
        this.#stateObservers.set(key, { handler, unsubscribe: remove });
        this.resources.trackSubscription(remove);
        return remove;
    }

    /**
     * Observe the app's comparison state and receive the active group ids —
     * what every averaging chart's `setActiveModes` takes.
     * @param {(activeModes: string[]) => void} handler - Receives the active comparison ids
     * @returns {(() => void)|null} Unsubscribe function, or null without an observable app state
     */
    observeActiveComparisons(handler) {
        return this.observeState('comparisonState', () => {
            handler(this.options.comparisonState.getActiveModes());
        });
    }

    /**
     * Children get the comparison-state port alongside what the kit threads. It is a
     * VERA concept, so it is added here rather than in the kit's own child options.
     * @param {object} [extras] - Per-child options; these win over the defaults.
     * @returns {object} Options for a child module constructor.
     * @protected
     */
    _childOptions(extras = {}) {
        return {
            comparisonState: this.getOption('comparisonState'),
            ...super._childOptions(extras),
        };
    }

    /**
     * Register, mount and hydrate child modules in the order sibling wiring
     * needs: every child is registered and mounted before any of them hydrates,
     * so a sync callback one child fires while hydrating reaches its siblings.
     * A hydrate-order dependency (a chart that must be live before the table
     * publishes) is two calls, one per batch. Null/undefined entries (an
     * optional child that was not built) are skipped. A child already
     * registered is not registered twice, and mount() is idempotent, so a view
     * may mount a child early to tweak its shell before handing it over.
     * @param {Array<[import('@tba3/module-base/modules/baseModule.js').BaseModule|null|undefined, object?]>} entries - `[module, mountData?]` per child
     * @returns {Promise<void>}
     * @protected
     */
    async _hydrateChildren(entries) {
        const live = /** @type {Array<[BaseModule, object?]>} */ (
            entries.filter(([module]) => module)
        );
        for (const [module, data] of live) {
            if (!this.childModules.has(module)) this.registerChildModule(module);
            module.mount(data);
        }
        // hydrate(data) too: a child the view mounted early (mount() is a
        // no-op the second time) must still receive the entry's payload.
        await Promise.all(live.map(([module, data]) => module.hydrate(data)));
    }

    /**
     * Default notes-panel link targets: every registered child that renders its
     * own title bar (`showModuleTitle`) becomes linkable, labeled with the exact
     * same title text it shows on screen (glossary title, falling back to an
     * explicit `title` option — same precedence ContentModule itself uses).
     * Children without a title bar (filters, nav-only wrappers, plain text)
     * are excluded automatically, no per-view bookkeeping required.
     * Override in a view when this default is ambiguous or wrong (e.g. two
     * children that render the same title).
     *
     * Called for any live view, not just the visible one: the notes drawer
     * lists the modules of every view opened this session.
     * @returns {Array<{id: string, label: string, element: HTMLElement}>} One entry per child that renders its own title bar, labelled with the title it shows on screen.
     */
    getNotesLinkTargets() {
        return Array.from(this.childModules)
            .filter((child) => child.getOption('showModuleTitle') && child.element)
            .map((child) => ({
                id: child.id,
                label: /** @type {any} */ (child).glossaryTitle || child.getOption('title'),
                element: child.element,
            }))
            .filter((target) => target.label);
    }

    // ========================================================================
    // RENDER TEMPLATE — cover, render the view's own content, reveal
    // ========================================================================

    /**
     * Render the view behind its cover. Final for views: the cover protocol
     * (beginViewRender before anything is built, revealView once everything
     * is) lives here, so a view cannot forget half of it. Views implement
     * _renderView(). A throw inside it leaves the view covered; the caller
     * that owns the instance (initializeView() in appModule.js) destroys it,
     * and destroy() takes the cover down.
     * @override
     * @param {object} data - Data for rendering
     * @returns {Promise<void>}
     */
    async _doRender(data) {
        this.beginViewRender();
        await this._renderView(data);
        this.revealView();
    }

    /**
     * Build the view's DOM, subscriptions and child modules. Runs while the
     * container is covered, so intermediate render steps are never on screen.
     * @param {object} data - Data for rendering
     * @returns {Promise<void>}
     * @abstract
     * @protected
     */
    // eslint-disable-next-line no-unused-vars
    async _renderView(data) {
        throw new Error(
            `${this.constructor.name}[${this.id}]: _renderView() must be implemented by subclass`,
        );
    }

    // ========================================================================
    // BATCH REVEAL — hide during render, reveal after all children hydrate.
    // Driven by _doRender() above; a view never calls these itself.
    // ========================================================================

    /**
     * Hide the view while its initial DOM and child modules mount, and put a
     * skeleton placeholder in its place.
     * Uses visibility instead of display/opacity so layout can settle without
     * exposing the intermediate render steps to the user.
     * @protected
     */
    beginViewRender() {
        if (!this.container) return;
        this.#renderToken += 1;
        this.container.setAttribute(BaseViewModule.RENDERING_ATTRIBUTE, 'true');
        this.container.setAttribute('aria-busy', 'true');
        // One promise per covered window, shared by every render that supersedes
        // another inside it — the reveal that finally uncovers resolves it.
        if (!this.#revealWaiters) {
            /** @type {() => void} */
            let resolve = () => {};
            /** @type {Promise<void>} */
            const promise = new Promise((r) => {
                resolve = () => r();
            });
            this.#revealWaiters = { promise, resolve };
        }
        // No-op when the app already mounted one for the lazy-import window.
        showViewSkeleton(this.container, this.getOption('skeleton'));
    }

    /**
     * Resolves once the view is uncovered — i.e. when the render window opened by
     * beginViewRender() has been closed by revealView() (or by destroy()). Resolves
     * at once when no window is open. This is the moment the reveal already knows
     * exactly; exposing it lets the app schedule work "after the first reveal"
     * (the other views' module prefetch, the notes drawer's chip navigation)
     * without polling the rendering attribute against a hand-summed timeout.
     * @returns {Promise<void>}
     */
    whenRevealed() {
        return this.#revealWaiters?.promise ?? Promise.resolve();
    }

    /**
     * Reveal the view once its content has stopped moving.
     *
     * A child's `_doRender()` resolving does not mean its content is on screen:
     * a Tabulator builds, redraws and measures columns over later frames. So we
     * wait for the whole subtree to report settled, then for a layout pass,
     * before uncovering the view. The skeleton stays up for that entire window,
     * which is the point — the user sees a placeholder instead of a table
     * assembling itself.
     * @protected
     */
    revealView() {
        if (!this.container) return;

        // The settle wait can span seconds, so a second render can start before
        // this one resolves. Uncovering then would expose the *new* render
        // mid-build and tear down the skeleton it just re-asserted.
        const token = this.#renderToken;
        const stillCurrent = () => !this.destroyed && this.container && token === this.#renderToken;

        this.whenSubtreeSettled()
            .then(() => this.waitForLayout())
            .then(() => {
                if (!stillCurrent()) return null;
                // Let the placeholder serve out its minimum display time while
                // the view is still covered. Uncovering first would show the
                // finished content underneath a placeholder that is still
                // fading in, which reads as a flicker.
                return waitForSkeletonHold(this.container);
            })
            .then(() => {
                const container = this.container;
                if (!container || !stillCurrent()) return;
                // Uncover and drop the placeholder in the same task so the two
                // land in one paint — no frame showing content under a
                // placeholder, and none showing an empty view after it.
                container.removeAttribute(BaseViewModule.RENDERING_ATTRIBUTE);
                container.removeAttribute('aria-busy');
                hideViewSkeleton(container);
                this.#settleRevealWaiters();
            });
    }

    /** Resolve and clear the current render window's whenRevealed() promise. */
    #settleRevealWaiters() {
        const waiters = this.#revealWaiters;
        this.#revealWaiters = null;
        waiters?.resolve();
    }

    /**
     * Tear down the view, including a render window it may still be inside.
     *
     * beginViewRender() both mounts a placeholder and hides the container behind
     * it; only revealView() undoes that pair. A view destroyed mid-render (e.g.
     * initializeView()'s catch in appModule.js) never gets there, and
     * BaseModule.destroy() cannot help: the overlay is a *sibling* of the
     * container, so clearing the container leaves it — and its resize
     * observation — standing. Undo it here rather than depending on a specific
     * caller's cleanup sequence.
     */
    destroy() {
        hideViewSkeleton(this.container);
        this.container?.removeAttribute(BaseViewModule.RENDERING_ATTRIBUTE);
        this.container?.removeAttribute('aria-busy');
        // A waiter on a view torn down mid-render must not hang.
        this.#settleRevealWaiters();
        // The observers are tracked resources; super.destroy() releases them.
        this.#stateObservers.clear();
        this.#pendingStateChanges.clear();
        super.destroy();
    }

    // ========================================================================
    // CONTAINER HELPERS
    // ========================================================================

    /**
     * Helper to get a container by ID with error logging
     * @param {string} containerId - Container ID to fetch
     * @param {string} name - Name for error messages
     * @returns {HTMLElement|null} The element, or null after warning that it is missing.
     * @protected
     */
    getContainer(containerId, name) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`${this.constructor.name}: ${name} container '${containerId}' not found`);
        }
        return container;
    }

    /**
     * Navigate to another view
     * Calls the onNavigate callback if provided in options.
     * @param {string} viewTarget - Target view identifier
     * @param {object} [options={}] - Navigation options (e.g., viewMode)
     * @protected
     */
    navigate(viewTarget, options = {}) {
        if (this.options.onNavigate) {
            this.options.onNavigate(viewTarget, options);
        }
    }

    /**
     * Select a student and open the student view — the shared body for every
     * `onStudentSelected` wire that means "open". State first, so a freshly
     * built student view seeds from it, then navigate.
     * @param {string} studentId - Id of the selected student
     * @protected
     */
    _openStudent(studentId) {
        this.options.appState?.updateState({ currentStudentId: studentId });
        this.navigate('student');
    }
}
