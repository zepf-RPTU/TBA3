/**
 * ViewLifecycle — the view state machine of a dashboard app shell.
 *
 * Owns the per-view slot (its container, then its module), the hash router, lazy view
 * construction and placement, the transition lock with its single-slot navigation queue,
 * a navigation's state patch with its rollback after a failed switch, and the idle-time
 * import warm-up for unvisited views. The app hands it the options every view takes
 * (`viewOptions`) and its pre-show step; `currentView` stays in the app's state, which
 * the view indicators follow.
 */

import { writeState } from '@tba3/module-base';
import { BaseViewModule } from '../modules/baseViewModule.js';
import { showViewSkeleton, hideViewSkeleton } from './viewSkeleton.js';
import { ViewRouter } from './viewRouter.js';
import { DocumentShapeError } from '@tba3/modules/documents';
import { notifyFailure } from '../services/notificationService.js';

/** The longest the view-module prefetch waits for the tab to go idle. */
const PREFETCH_IDLE_TIMEOUT_MS = 2000;
/** The delay that stands in for idle where `requestIdleCallback` is missing. */
const PREFETCH_FALLBACK_DELAY_MS = 200;

/**
 * What a navigation asks of the view switch.
 * @typedef {object} ShowViewOptions
 * @property {boolean} [replaceHistory] - Replace the history entry instead of pushing one (initial load).
 * @property {boolean} [keepFocus] - Leave focus where it is instead of moving it to the new view's
 *           heading: the caller keeps the user in a control that stays on screen.
 * @property {{[key: string]: unknown}} [statePatch] - App state written as the switch dispatches, before the
 *           target view renders; a switch that fails and rolls back restores the keys it wrote, and a switch
 *           to the view already shown still writes it.
 */

/**
 * What every view of an app is handed, beside what the lifecycle adds per view (its key,
 * the resolved view config, its skeleton and a navigation callback).
 * @typedef {object} AppViewOptions
 * @property {import('@tba3/module-base').State<import('./appModule.js').ShellState>} appState - The app state; the lifecycle writes the view keys and a navigation's state patch into it
 * @property {import('@tba3/modules/charts').ComparisonState} comparisonState
 * @property {string|undefined} studentView - The view a student opens in
 * @property {import('./appContext.js').AppContext} context
 */

/**
 * @typedef {object} ViewLifecycleOptions
 * @property {string} ownerName - App class name, used as the log prefix
 * @property {{[viewType: string]: import('./appModule.js').LabelledViewConfigEntry}} viewConfig
 * @property {import('@tba3/module-base').ResourceTracker} resources - Tracks the idle/timeout handles
 * @property {AppViewOptions} viewOptions - What every view is handed
 * @property {(viewType: string) => Promise<void>} beforeShowView - The app's pre-show step (tour, header, data wait)
 * @property {(error: unknown) => boolean} isNamedInline - Whether a failure is the dataset load the app names above the views: a switch it fails raises no toast repeating it
 */

/**
 * Show or hide the shell a view container sits in.
 * @param {HTMLElement} container
 * @param {boolean} shown
 */
function setShellShown(container, shown) {
    /** @type {HTMLElement} */ (container.parentElement).style.display = shown ? '' : 'none';
}

export class ViewLifecycle {
    /** @type {ViewLifecycleOptions} */
    #deps;

    /** @type {ViewRouter} Mirrors the view on screen in the URL hash, and routes back/forward. */
    #router;

    // One element per configured view, populated by mount(): the view's placeholder
    // container until the view is built, then the view module, which takes the
    // container's place in the shell.
    /** @type {{[viewType: string]: HTMLElement}} */
    #viewContainers = {};

    #isTransitioning = false;

    // The queued navigation; `resolve` settles its showView() call once it ran or
    // was dropped.
    /** @type {{viewType: string, options: ShowViewOptions, resolve: () => void} | null} */
    #pendingView = null;

    /** The page's own title, which every view's title is prefixed to. */
    #pageTitle = '';

    /**
     * @param {ViewLifecycleOptions} options
     */
    constructor(options) {
        this.#deps = options;
        this.#pageTitle = document.title;
        this.#router = new ViewRouter(Object.keys(options.viewConfig), (viewType) =>
            this.showView(viewType),
        );
    }

    /** @returns {import('@tba3/module-base').State<import('./appModule.js').ShellState>} The app state. */
    get #state() {
        return this.#deps.viewOptions.appState;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Lay out one hidden shell per view in `parent` and resolve the view to start on:
     * the URL's, else `defaultView`, whose import starts at once, alongside the app's
     * data fetch.
     * @param {HTMLElement} parent - The app's main container
     * @param {string} defaultView - The view shown when the URL names none
     * @returns {string} The view to start on.
     */
    mount(parent, defaultView) {
        Object.entries(this.#deps.viewConfig).forEach(([viewType, viewData]) => {
            // The shell is the lifecycle's: it is what shows and hides.
            const shell = document.createElement('div');
            shell.className = 'view-shell';
            shell.style.display = 'none';
            if (viewData.fit) shell.dataset.viewFit = viewData.fit;
            const viewContainer = document.createElement('div');
            viewContainer.id = viewData.containerId;
            // The view's layout (padding, scrolling) is claimed before its content
            // exists, so the first build measures the box it will keep; views add their
            // own classes beside it.
            viewContainer.className = 'view-base';
            shell.appendChild(viewContainer);
            parent.appendChild(shell);
            this.#viewContainers[viewType] = viewContainer;
        });
        const initialView = this.#router.getViewFromLocation() || defaultView;
        this.#warmUpViewImport(initialView);
        return initialView;
    }

    /**
     * Route the URL and show the first view, replacing the history entry; once it is
     * uncovered, prefetch the other views' modules. The view is covered by its
     * placeholder synchronously, before this returns its promise.
     * @param {string} initialView - What `mount()` resolved.
     * @returns {Promise<void>} Resolves once the other views' prefetch is armed; rejects
     *   with a failure of the first view, which has no view to roll back to.
     */
    async start(initialView) {
        this.#router.start();
        await this.showView(initialView, { replaceHistory: true });
        // Only once the first view is uncovered: showView() resolves before revealView()
        // has settled, and an idle callback armed earlier could put the other views'
        // parse/evaluate on the main thread mid-reveal.
        await this.whenViewRevealed(initialView);
        this.#prefetchOtherViewModules(initialView);
    }

    /** Stop routing: the hash listener lives on window. */
    destroy() {
        this.#router.destroy();
    }

    /**
     * Whether a view is on screen and finished: no transition runs and its render cover
     * is off. A tour started before that would spotlight elements that are still being
     * built or not visible.
     * @param {string} viewType
     * @returns {boolean}
     */
    isSettled(viewType) {
        return (
            !this.#isTransitioning &&
            !this.#viewContainers[viewType]?.hasAttribute(BaseViewModule.RENDERING_ATTRIBUTE)
        );
    }

    /**
     * @param {string} viewType
     * @returns {BaseViewModule|null} The view module; null until the view is built.
     */
    getViewModule(viewType) {
        const view = this.#viewContainers[viewType];
        return view instanceof BaseViewModule ? view : null;
    }

    /**
     * Show a specific view. Resolves once the switch has happened — for a call that
     * arrives mid-transition, once its queued navigation ran, or at once when a later
     * one replaced it (the pattern of Vue Router's `router.push()`). The render cover
     * may still be up; whenViewRevealed() waits for that.
     * @param {string} viewType
     * @param {ShowViewOptions} [options]
     * @returns {Promise<void>}
     */
    async showView(viewType, options = {}) {
        const ownerName = this.#deps.ownerName;
        if (!this.#deps.viewConfig[viewType]) {
            console.error(`${ownerName}: Unknown view type:`, viewType);
            return;
        }

        // A navigation that arrives mid-transition is queued (single slot, last wins)
        // and dispatched in the finally, which also reconciles a hashchange
        // (back/forward) that lands here after the URL moved.
        if (this.#isTransitioning) {
            console.debug(
                `${ownerName}: View switch to '${viewType}' queued (already transitioning)`,
            );
            // A queued call the new one replaces is settled: its navigation is dropped.
            this.#pendingView?.resolve();
            return new Promise((resolve) => {
                this.#pendingView = { viewType, options, resolve };
            });
        }

        // A failed transition rolls back to it.
        const previousView = this.#currentView;
        if (previousView === viewType) {
            // Nothing to switch, but the navigation's state is still asked for.
            if (options.statePatch) this.#writeStatePatch(options.statePatch);
            console.debug(`${ownerName}: View switch blocked - already on '${viewType}'`);
            return;
        }

        this.#isTransitioning = true;

        // When true, this transition is leaving via a rethrow (cold-start or late
        // failure); the finally must then not dispatch a queued view.
        let errorPropagating = false;
        // Puts back the keys this navigation's patch wrote, should it roll back.
        let undoStatePatch = () => {};

        try {
            this.#hideCurrentView();

            // Show the view container early so it participates in layout.
            // For first-time init, beginViewRender() keeps it hidden until
            // the view has mounted and completed a layout pass.
            this.#showViewContainer(viewType);

            // Cover the container before anything awaited runs. Two windows need
            // it and the view's own beginViewRender() can cover neither: the
            // lazy import (the view class does not exist yet) and a revisit that
            // lands while an earlier render's revealView() still holds the view
            // at visibility: hidden. The pre-show hook below is awaited too, so
            // mounting after it would leave the empty container on screen for
            // the length of a header render.
            const viewContainer = this.#viewContainers[viewType];
            const skeletonShape = this.#deps.viewConfig[viewType].skeleton;
            const needsSkeleton =
                !this.getViewModule(viewType) ||
                viewContainer?.getAttribute(BaseViewModule.RENDERING_ATTRIBUTE) === 'true';
            if (needsSkeleton) {
                // Busy for the whole lazy-import + pre-show window, the longest one,
                // which the view's own render pass does not cover. beginViewRender()
                // sets it again; revealView() clears it on success,
                // #resetViewContainer() on failure.
                viewContainer?.setAttribute('aria-busy', 'true');
                showViewSkeleton(viewContainer, skeletonShape);
            }

            // At dispatch, not at queue time: a queued navigation writes its patch when it runs.
            if (options.statePatch) undoStatePatch = this.#writeStatePatch(options.statePatch);
            await this.#deps.beforeShowView(viewType);

            // The view's own beginViewRender() finds the placeholder already in
            // place and revealView() takes it down.
            if (!this.getViewModule(viewType)) {
                await this.#initializeView(viewType);
            }

            // Commit the view, then the URL hash; the initial load replaces the
            // history entry instead of pushing one.
            writeState(this.#state, { previousView, currentView: viewType });
            this.#router.syncUrl(viewType, { replace: options.replaceHistory === true });

            this.getViewModule(viewType)?.show();
            // The tab names the view, on the page load too, so a deep link's title and
            // history entry say where they lead. On a switch, not the load, focus moves
            // to its heading, so a keyboard or screen-reader user starts at the new view
            // instead of on <body> or on the link that was clicked.
            this.#announceView(viewType, {
                keepFocus: previousView === null || options.keepFocus === true,
            });
        } catch (error) {
            // A dataset the store rejected is not the view's fault, and reloading will
            // not fix it: say so instead of "the view could not load". The dataset load
            // itself is already named above the views.
            if (this.#deps.isNamedInline(error)) {
                console.error(`${ownerName}: Failed to show view '${viewType}':`, error);
            } else {
                notifyFailure(
                    this.#deps.viewOptions.context.glossary,
                    error instanceof DocumentShapeError
                        ? 'general.messages.data-malformed'
                        : 'general.messages.view-failed',
                    `${ownerName}: Failed to show view '${viewType}'`,
                    error,
                );
            }

            if (await this.#handleViewTransitionError(viewType, previousView, undoStatePatch)) {
                errorPropagating = true;
                throw error;
            }
        } finally {
            this.#isTransitioning = false;
            // Safety net for a failed import/init only — on the happy path the
            // view module exists and revealView() owns the teardown, which must
            // not be pre-empted here (see BaseViewModule.revealView).
            if (!this.getViewModule(viewType)) {
                hideViewSkeleton(this.#viewContainers[viewType]);
            }

            // Dispatch the queued navigation, unless this transition leaves via a
            // rethrow: a cold-start failure must reach the app's first render. History
            // is replaced so the intermediate view leaves no back entry.
            const pendingView = this.#pendingView;
            this.#pendingView = null;
            if (pendingView && errorPropagating) pendingView.resolve();
            if (pendingView && !errorPropagating) {
                // Not awaited: this transition settles now, the queued one runs next and
                // settles its own caller. Its failure is logged here — the caller that
                // queued it only waits.
                this.showView(pendingView.viewType, {
                    ...pendingView.options,
                    replaceHistory: true,
                })
                    .catch((error) =>
                        console.error(
                            `${ownerName}: Failed to dispatch queued view '${pendingView.viewType}':`,
                            error,
                        ),
                    )
                    .finally(pendingView.resolve);
            }
        }
    }

    /**
     * Resolves once the current view is uncovered. showView() resolves before
     * revealView() drops the render cover on a first render, and measuring a still
     * `visibility: hidden` view would scroll to the wrong place — so a caller that
     * needs geometry awaits showView() and then this. A view that is not current resolves at once: there is no reveal coming.
     * @param {string} viewType
     * @returns {Promise<void>}
     */
    whenViewRevealed(viewType) {
        if (this.#currentView !== viewType) return Promise.resolve();
        return this.getViewModule(viewType)?.whenRevealed() ?? Promise.resolve();
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Kick a view's dynamic import() early so it overlaps other startup work. The
     * module system caches the promise, so the later `await load()` in
     * #initializeView() resolves immediately; a rejection is swallowed here and
     * surfaces there.
     * @param {string} viewType
     */
    #warmUpViewImport(viewType) {
        this.#deps.viewConfig[viewType].load().catch(() => {});
    }

    /**
     * Idle-prefetch every view module except the one already loaded, so a later
     * switch to any of them issues no module requests. The timeout
     * bounds the idle wait: a tab that never goes idle would otherwise skip the
     * prefetch and pay the import cost on every first navigation. The handle is
     * tracked, so it is cancelled if the app is destroyed first.
     * @param {string} loadedView - The view already imported (skipped)
     */
    #prefetchOtherViewModules(loadedView) {
        const pending = Object.keys(this.#deps.viewConfig).filter(
            (viewType) => viewType !== loadedView,
        );
        if (pending.length === 0) return;

        const warmAll = () => pending.forEach((viewType) => this.#warmUpViewImport(viewType));

        if (typeof window.requestIdleCallback === 'function') {
            const handle = window.requestIdleCallback(warmAll, {
                timeout: PREFETCH_IDLE_TIMEOUT_MS,
            });
            this.#deps.resources.trackSubscription(() => window.cancelIdleCallback?.(handle));
        } else {
            // No requestIdleCallback (Safari < 17.4): a short delay stands in for idle.
            this.#deps.resources.trackTimeout(warmAll, PREFETCH_FALLBACK_DELAY_MS);
        }
    }

    /**
     * Name the view on screen in the tab's title and, unless the navigation keeps
     * focus, move focus to its heading, the page's one <h1>.
     * @param {string} viewType
     * @param {ShowViewOptions} options
     */
    #announceView(viewType, { keepFocus }) {
        document.title = `${this.#deps.viewConfig[viewType].label} – ${this.#pageTitle}`;
        if (keepFocus) return;
        const heading = document.querySelector('h1');
        if (!(heading instanceof HTMLElement)) return;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
    }

    /** @returns {string|null} The view on screen, read without tracking. */
    get #currentView() {
        return this.#state.currentView.peek();
    }

    /**
     * Write a navigation's state patch.
     * @param {{[key: string]: unknown}} patch
     * @returns {() => void} Writes the patched keys back to their values before the patch.
     */
    #writeStatePatch(patch) {
        // A patch names keys at run time; writeState refuses one the state lacks.
        const state = /** @type {import('@tba3/module-base').State<{[key: string]: unknown}>} */ (
            /** @type {unknown} */ (this.#state)
        );
        const before = Object.fromEntries(
            Object.keys(patch).map((key) => [key, state[key]?.peek()]),
        );
        writeState(state, patch);
        return () => writeState(state, before);
    }

    /**
     * Construct a view module in its slot (lazy loading), place it in its placeholder's
     * place, and wait for its first render. Every failure throws: showView() decides what
     * a failed load means (rethrow on cold start, roll back otherwise), and a quiet
     * return would let it commit currentView and the URL to a view with no module.
     * @param {string} viewType
     */
    async #initializeView(viewType) {
        const { ownerName, viewConfig, viewOptions } = this.#deps;
        const container = this.#viewContainers[viewType];
        if (!container) {
            throw new Error(`${ownerName}: Container not found for view '${viewType}'`);
        }
        const ModuleClass = /** @type {import('./appModule.js').ViewModuleClass|undefined} */ (
            await viewConfig[viewType].load()
        );
        // A renamed export resolves the import but not the binding.
        if (typeof ModuleClass?.create !== 'function') {
            throw new Error(
                `${ownerName}: load() for view '${viewType}' did not resolve to a module class`,
            );
        }

        // The view takes its placeholder's place in the shell, its id and its layout
        // class: placing it renders it.
        const viewModule = ModuleClass.create(container.id, {
            ...viewOptions,
            onNavigate: (view, options) => this.showView(view, options),
            viewConfig,
            skeleton: viewConfig[viewType].skeleton,
            viewKey: viewType,
        });
        viewModule.className = container.className;
        container.replaceWith(viewModule);

        // If the first render throws, put the placeholder back before rethrowing: taking
        // the view out tears it down, so a retry does not stack a second set of
        // listeners, and the placeholder survives for the rollback and any retry.
        try {
            await viewModule.contentComplete;
        } catch (error) {
            viewModule.replaceWith(container);
            throw error;
        }
        this.#viewContainers[viewType] = viewModule;
    }

    /**
     * Recover from a transition failure after showView() has already started
     * mutating containers and subscriptions.
     *
     * Returns true when the original error should keep propagating: either the
     * requested view is already live (late post-show failure, nothing to roll
     * back), or there is no previous view to restore (cold-start failure, so
     * the app's first render fails and shows its error state).
     * @param {string} viewType - View type whose transition failed
     * @param {string|null} previousView - View that was active before the switch
     * @param {() => void} undoStatePatch - Puts back the keys the navigation's state patch wrote
     * @returns {Promise<boolean>}
     */
    async #handleViewTransitionError(viewType, previousView, undoStatePatch) {
        if (this.#currentView === viewType) {
            return true;
        }

        // #hideCurrentView() has already hidden the outgoing view
        // while currentView still names it. Left that way, the app sits on
        // a hidden view whose own nav button is a no-op (showView()'s same-view
        // guard). Undo the half-applied transition.
        this.#resetViewContainer(viewType);

        if (!previousView) {
            return true;
        }

        // The view the user stays on shows the state from before the navigation.
        undoStatePatch();
        await this.#restoreView(previousView);
        return false;
    }

    /**
     * Hide the currently active view; hidden, it holds back what it watches.
     */
    #hideCurrentView() {
        const currentView = this.#currentView;
        if (!currentView) return;

        // A placeholder still up stays in the hidden shell: the view's pending
        // revealView() removes the one it mounted, and a revisit reuses it. Removing
        // it here made a revisit mount a second one that no reveal ever takes down.
        const container = this.#viewContainers[currentView];
        if (container) setShellShown(container, false);

        this.getViewModule(currentView)?.hide();
    }

    /**
     * @param {string} viewType
     */
    #showViewContainer(viewType) {
        const container = this.#viewContainers[viewType];
        if (container) {
            setShellShown(container, true);
        }
    }

    /**
     * Undo the container changes a half-applied transition left behind: hide the
     * container again, and for a view that never got built take down the busy state and
     * the skeleton the switch put on its placeholder. A built view keeps its cover and
     * placeholder: its pending revealView() owns them.
     * @param {string} viewType - View type whose transition failed
     */
    #resetViewContainer(viewType) {
        const container = this.#viewContainers[viewType];
        if (!container) return;

        setShellShown(container, false);
        if (this.getViewModule(viewType)) return;
        container.removeAttribute('aria-busy');
        hideViewSkeleton(container);
    }

    /**
     * Re-show the view that was live before a failed transition, as the happy path
     * does for an initialized view: pre-show hook, container, URL, show. currentView
     * still names it, so no state is written.
     *
     * A failure here is logged, never thrown, so it cannot mask the original error
     * on its way out of showView().
     * @param {string} viewType - The view to roll back to
     */
    async #restoreView(viewType) {
        try {
            await this.#deps.beforeShowView(viewType);
            this.#showViewContainer(viewType);
            // A hashchange-driven navigation has already moved the URL to the
            // view that failed; put it back without adding a history entry.
            this.#router.syncUrl(viewType, { replace: true });
            // As on the happy path: otherwise a rollback leaves the view showing state
            // from before the failed transition began.
            this.getViewModule(viewType)?.show();
        } catch (error) {
            notifyFailure(
                this.#deps.viewOptions.context.glossary,
                'general.messages.view-failed',
                `${this.#deps.ownerName}: Failed to restore view '${viewType}'`,
                error,
            );
        }
    }
}
