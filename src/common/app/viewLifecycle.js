/**
 * ViewLifecycle — the view state machine of a dashboard app shell.
 *
 * Owns the view-management concern: the per-view container and module slots, lazy view
 * initialization, the transition lock with its single-slot navigation queue, rollback
 * after a failed switch, the idle-time import warm-up for unvisited views, and the
 * "missed a KS theme switch while hidden" bookkeeping. A plain collaborator the
 * coordinator *has*, not a `BaseModule` subclass — everything app-owned that a
 * transition touches (the current-view state, the subclass pre/post-show hooks, sidebar
 * and URL activation, view construction, child teardown) is injected, so the app keeps
 * its extension contract while the coordinator shrinks to coordination.
 *
 * `currentView` deliberately stays in the app's state: header controls read it through
 * the app's state accessors, so the lifecycle reads and writes it through the injected
 * `getCurrentView` / `setCurrentView` rather than owning a copy.
 * @module viewLifecycle
 */

import { BaseViewModule } from '../modules/baseViewModule.js';
import { showViewSkeleton, hideViewSkeleton } from './viewSkeleton.js';
import { notifyFailure } from '../services/notificationService.js';

/**
 * Fail-safe cap for whenViewRevealed(), on both of its paths: the current view's
 * own whenRevealed() promise (which revealView() never settles if the render threw
 * on the way there) and the poll for a view switch that only queued mid-transition.
 * Must outlast the reveal it waits on, or it expires mid-render and the caller
 * measures a still-hidden view: revealView() is bounded by whenSubtreeSettled()'s
 * 3s fail-safe plus up to 200ms of skeleton hold. Wall-clock, not a frame count — a frame budget is a different duration on
 * every display (240 frames is 4s at 60Hz but 2s at 120Hz, i.e. shorter than the
 * reveal) and stretches to minutes in a background tab, where requestAnimationFrame
 * is throttled or paused.
 */
const VIEW_REVEAL_TIMEOUT_MS = 4000;

/**
 * @typedef {object} ViewLifecycleDeps
 * @property {string} ownerName - App class name, used as the log prefix
 * @property {{[viewType: string]: import('./appModule.js').ViewConfigEntry}} viewConfig - View configuration entries
 * @property {import('@tba3/module-base/utils/resourceTracker.js').ResourceTracker} resources - Coordinator resource tracker (idle/timeout handles)
 * @property {() => string|null} getCurrentView - Read the app's current view
 * @property {(viewType: string) => void} setCurrentView - Commit a view as current in the app's state
 * @property {(viewType: string, container: HTMLElement) => Promise<BaseViewModule>} initializeView - Construct, init and register a view module; throws on any failure
 * @property {(viewType: string, options: object) => Promise<void>} beforeShowView - Subclass pre-show hook
 * @property {(viewType: string, context: {previousView: string|null}) => void} afterShowView - Subclass post-show hook, told which view was current before the switch
 * @property {(viewType: string, options: {replace: boolean}) => void} onViewActivated - Reflect the active view in the sidebar and the URL
 * @property {(viewType: string, options: object) => Promise<void>} navigate - The app's public showView(), for dispatching a queued navigation through subclass overrides
 */

export class ViewLifecycle {
    /** @type {ViewLifecycleDeps} */
    #deps;

    // View modules (lazy-initialized), one slot per configured view
    /** @type {{[viewType: string]: BaseViewModule|null}} */
    #viewModules = {};

    // View containers - populated by createContainers()
    /** @type {{[viewType: string]: HTMLElement}} */
    #viewContainers = {};

    // Guard flag to prevent overlapping view transitions
    #isTransitioning = false;

    // Single-slot queue for a navigation requested while a transition was in
    // flight. Last request wins; dispatched when the transition settles.
    /** @type {{viewType: string, options: object} | null} */
    #pendingView = null;

    // Live views that missed a KS color-theme switch because they were not the
    // active view at the time (see refreshThemeInCurrentView). Their baked
    // colors are refreshed when they are next shown.
    /** @type {Set<string>} */
    #themeStaleViews = new Set();

    /**
     * @param {ViewLifecycleDeps} deps - The app-owned pieces a transition touches.
     */
    constructor(deps) {
        this.#deps = deps;
        Object.keys(deps.viewConfig).forEach((viewType) => {
            this.#viewModules[viewType] = null;
        });
    }

    // ========================================================================
    // PUBLIC API (called by the app coordinator)
    // ========================================================================

    /**
     * Create one hidden container per configured view inside `parent`.
     * @param {HTMLElement} parent - The app's main container
     */
    createContainers(parent) {
        Object.entries(this.#deps.viewConfig).forEach(([viewType, viewData]) => {
            const viewContainer = document.createElement('div');
            viewContainer.id = viewData.containerId;
            // All start hidden
            viewContainer.style.display = 'none';
            parent.appendChild(viewContainer);
            this.#viewContainers[viewType] = viewContainer;
        });
    }

    /**
     * Whether a view transition is currently in flight.
     * @returns {boolean} True while a transition runs, so a showView() call would be queued rather than run now.
     */
    get isTransitioning() {
        return this.#isTransitioning;
    }

    /**
     * Get view container by view type
     * @param {string} viewType - View type
     * @returns {HTMLElement|null} View container element
     */
    getViewContainer(viewType) {
        return this.#viewContainers[viewType] || null;
    }

    /**
     * Get view module by view type
     * @param {string} viewType - View type
     * @returns {BaseViewModule|null} View module instance
     */
    getViewModule(viewType) {
        return this.#viewModules[viewType] || null;
    }

    /**
     * The notes drawer's link targets for a view: the live module's own when the
     * view has been initialized this session, else nothing (the drawer tells the
     * user to open the view first — see NotesController).
     * @param {string} viewType - View type
     * @returns {Array<{id: string, label: string, element: HTMLElement}>} Link targets, empty for a view not yet rendered
     */
    getNotesLinkTargets(viewType) {
        return this.#viewModules[viewType]?.getNotesLinkTargets?.() ?? [];
    }

    /**
     * Refresh the currently active view after a KS color-theme switch.
     *
     * Most level coloring is CSS-variable driven and recolors live via the
     * `data-ks-theme` attribute; only charts that bake resolved colors at
     * render/construction time need a redraw. Rather than destroying and
     * recreating the whole view (fragile: hides the container, re-measures under
     * a raced layout, and can strand the view blank on any teardown throw), we
     * ask the active view to refresh those charts in place. The theme color
     * cache was already invalidated by applyKsTheme().
     */
    refreshThemeInCurrentView() {
        const currentView = this.#deps.getCurrentView();

        // Every other live view keeps colors baked under the old theme, and a
        // hidden container cannot be redrawn now (its charts would rerender
        // against a display:none box and blank, and a same-width revisit skips
        // the show()-time table redraw). Remember them and refresh on their next
        // show. Mid-transition the outgoing view is already hidden and the
        // incoming one may be a resumed view mid-show, so both count as stale;
        // showView() refreshes the incoming one right after showing it.
        for (const [viewType, viewModule] of Object.entries(this.#viewModules)) {
            if (viewModule && (viewType !== currentView || this.#isTransitioning)) {
                this.#themeStaleViews.add(viewType);
            }
        }
        if (this.#isTransitioning) return;

        const viewModule = currentView ? this.#viewModules[currentView] : null;
        viewModule?.onThemeChanged?.();
    }

    /**
     * Show a specific view
     * @param {string} viewType - View type key
     * @param {object} options - Optional view options
     * @returns {Promise<void>}
     */
    async showView(viewType, options = {}) {
        const ownerName = this.#deps.ownerName;
        if (!this.#deps.viewConfig[viewType]) {
            console.error(`${ownerName}: Unknown view type:`, viewType);
            return;
        }

        // Queue a navigation that arrives mid-transition instead of dropping it.
        // Single slot, last request wins: a user clicking three tabs wants the
        // third. Dispatched when the current transition settles (see finally),
        // which also reconciles a hashchange (back/forward) that lands here after
        // the URL has already moved.
        if (this.#isTransitioning) {
            console.debug(
                `${ownerName}: View switch to '${viewType}' queued (already transitioning)`,
            );
            this.#pendingView = { viewType, options };
            return;
        }

        // Guard: Skip if already on requested view
        if (this.#deps.getCurrentView() === viewType) {
            console.debug(`${ownerName}: View switch blocked - already on '${viewType}'`);
            return;
        }

        // Remember where we came from — a failed transition rolls back to it.
        const previousView = this.#deps.getCurrentView();

        this.#isTransitioning = true;

        // When true, this transition is leaving via a rethrow (cold-start or late
        // failure); the finally must then not dispatch a queued view.
        let errorPropagating = false;

        try {
            // Hide current view
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
                !this.#viewModules[viewType] ||
                viewContainer?.getAttribute(BaseViewModule.RENDERING_ATTRIBUTE) === 'true';
            if (needsSkeleton) {
                // Mark the region busy for the whole lazy-import + pre-show window,
                // not just the view's own render pass — that is the longest window
                // and the one assistive tech would otherwise not hear about.
                // beginViewRender() sets it again (harmlessly); revealView() clears
                // it on success and #resetViewContainer() clears it on failure.
                viewContainer?.setAttribute('aria-busy', 'true');
                showViewSkeleton(viewContainer, skeletonShape);
            }

            // Pre-show hook (e.g., update header, show nav cards)
            await this.#deps.beforeShowView(viewType, options);

            // Re-measure: header configs are per view, so the slot the
            // placeholder covers can have moved while we awaited the update.
            // Idempotent — repositions the same overlay, no second fade-in.
            if (needsSkeleton) showViewSkeleton(viewContainer, skeletonShape);

            // Initialize view if needed (lazy loading). The view's own
            // beginViewRender() finds the placeholder already in place and
            // revealView() takes it down.
            if (!this.#viewModules[viewType]) {
                await this.#initializeView(viewType);
            }

            // Update state, then reflect the active view in the sidebar and the
            // URL hash (deep-linking, browser history). Done after currentView
            // is set so the resulting hashchange is a no-op. On initial load,
            // the history entry is replaced instead of pushed to avoid a
            // phantom history step.
            this.#deps.setCurrentView(viewType);
            this.#deps.onViewActivated(viewType, { replace: options.replaceHistory === true });

            // Show the view module
            const viewModule = this.#viewModules[viewType];
            if (viewModule) {
                // show() first: resume() replays the bus events the view missed
                // while hidden through its own handlers, and those may test
                // `this.visible`. onResume() then covers off-bus catch-up, only
                // for a view that was genuinely suspended — a first show is not
                // (the view's own _doRender already applied current state).
                const wasSuspended = viewModule.isSuspended;
                viewModule.show();
                viewModule.resume();
                if (wasSuspended) viewModule.onResume();
                this.#refreshStaleTheme(viewType, viewModule);
            }

            // Post-show hook. previousView is what this transition left — the
            // lifecycle already holds it for rollback, so a subclass that needs
            // it (MA's help view "back" card) does not track it a second time.
            this.#deps.afterShowView(viewType, { previousView });
        } catch (error) {
            notifyFailure(
                'general.messages.view-failed',
                `${ownerName}: Failed to show view '${viewType}'`,
                error,
            );

            if (await this.#handleViewTransitionError(viewType, previousView)) {
                errorPropagating = true;
                throw error;
            }
        } finally {
            this.#isTransitioning = false;
            // Safety net for a failed import/init only — on the happy path the
            // view module exists and revealView() owns the teardown, which must
            // not be pre-empted here (see BaseViewModule.revealView).
            if (!this.#viewModules[viewType]) {
                hideViewSkeleton(this.#viewContainers[viewType]);
            }

            // Dispatch a navigation that arrived while this transition was
            // running (last one wins). Skipped when the transition is leaving via
            // a rethrow, so a cold-start failure still reaches
            // bootstrapDashboardApp instead of being chased by another
            // transition. Routed through the app's public showView() so subclass
            // overrides (e.g. MA's layout-mode handling) still run, with history
            // replaced so the intermediate view leaves no phantom back entry.
            const pendingView = this.#pendingView;
            this.#pendingView = null;
            if (pendingView && !errorPropagating) {
                // Fire-and-forget: a late failure inside this dispatched call
                // (e.g. a post-show hook throwing) would otherwise reject with
                // no handler anywhere in the call chain.
                this.#deps
                    .navigate(pendingView.viewType, {
                        ...pendingView.options,
                        replaceHistory: true,
                    })
                    .catch((error) =>
                        console.error(
                            `${ownerName}: Failed to dispatch queued view '${pendingView.viewType}':`,
                            error,
                        ),
                    );
            }
        }
    }

    /**
     * Kick a view's dynamic import() early (fire-and-forget) so it overlaps
     * other startup work instead of being serialized after it. The module
     * system caches the promise, so the later `await load()` in
     * initializeView() resolves immediately. Rejections are swallowed here and
     * surfaced through initializeView(), which re-awaits the same import on the
     * real load path.
     * @param {string} viewType - View type to warm up
     */
    warmUpViewImport(viewType) {
        const load = this.#deps.viewConfig?.[viewType]?.load;
        if (typeof load !== 'function') return;
        load().catch(() => {});
    }

    /**
     * Idle-prefetch every view module except the one already loaded, so a later
     * switch to any of them issues no module requests. Called only after the
     * first view's whenRevealed() (see the app's hydrate sequence), so it never
     * competes with that reveal; requestIdleCallback then keeps it off whatever
     * the main thread does next. The timeout bounds that wait: idle alone is a
     * request, not a promise, and a tab that never goes idle would otherwise
     * skip the prefetch entirely and pay the import cost on every first
     * navigation instead. Falls back to a delayed timeout where
     * requestIdleCallback is unavailable. The idle handle is tracked as a
     * disposable so it is cancelled if the app is destroyed first.
     * @param {string} loadedView - The view already imported (skipped)
     */
    prefetchOtherViewModules(loadedView) {
        const pending = Object.keys(this.#deps.viewConfig).filter(
            (viewType) => viewType !== loadedView,
        );
        if (pending.length === 0) return;

        const warmAll = () => pending.forEach((viewType) => this.warmUpViewImport(viewType));

        const win = /** @type {any} */ (window);
        if (typeof win.requestIdleCallback === 'function') {
            const handle = win.requestIdleCallback(warmAll, { timeout: 2000 });
            this.#deps.resources.trackDisposable({
                destroy: () => win.cancelIdleCallback?.(handle),
            });
        } else {
            // No requestIdleCallback (Safari < 17.4): a short delay standing in
            // for idle. The reveal gate above already keeps it clear of the first
            // render.
            this.#deps.resources.trackTimeout(warmAll, 200);
        }
    }

    /**
     * Resolves once a view is actually uncovered. showView() returns before
     * revealView() drops the render cover on a first render, and measuring a
     * still `visibility: hidden` view would scroll to the wrong place — so a
     * caller that needs geometry (the notes drawer's chip navigation) waits here.
     * Also covers a showView() call that only queued (mid-transition): the
     * rendering attribute is not yet 'true' for a transition that has not
     * started, so this additionally requires the view to have actually become
     * current before resolving.
     * Bounded by VIEW_REVEAL_TIMEOUT_MS so a stalled reveal cannot hang the
     * caller. The timer runs alongside the poll rather than being counted in
     * frames, so the bound holds on any refresh rate and still fires in a
     * background tab where requestAnimationFrame does not. It only ever costs the
     * full timeout when a render genuinely stalls — the loop resolves the moment
     * the view uncovers.
     * @param {string} viewType - View type to wait for
     * @returns {Promise<void>}
     */
    whenViewRevealed(viewType) {
        const container = this.#viewContainers[viewType];
        if (!container) return Promise.resolve();

        // The view is current and rendering: it knows the exact moment it uncovers.
        // Only a showView() that merely queued (mid-transition) — where the view is
        // not current yet — still needs the poll below. Bounded like that poll: a
        // _doRender() that throws between beginViewRender() and revealView() leaves
        // the promise unsettled forever, and no caller may hang on that.
        const viewModule = this.#viewModules[viewType];
        if (
            this.#deps.getCurrentView() === viewType &&
            typeof viewModule?.whenRevealed === 'function'
        ) {
            return new Promise((resolve) => {
                const failSafe = setTimeout(resolve, VIEW_REVEAL_TIMEOUT_MS);
                void viewModule.whenRevealed().then(() => {
                    clearTimeout(failSafe);
                    resolve();
                });
            });
        }

        return new Promise((resolve) => {
            let frame = 0;
            /** @type {any} */
            let failSafe = null;
            const finish = () => {
                cancelAnimationFrame(frame);
                clearTimeout(failSafe);
                resolve();
            };
            const check = () => {
                const isRevealed =
                    this.#deps.getCurrentView() === viewType &&
                    container.getAttribute(BaseViewModule.RENDERING_ATTRIBUTE) !== 'true';
                if (isRevealed) {
                    finish();
                    return;
                }
                frame = requestAnimationFrame(check);
            };
            // Armed before the first poll so a synchronous resolve can clear it.
            failSafe = setTimeout(finish, VIEW_REVEAL_TIMEOUT_MS);
            check();
        });
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Construct a view into its slot via the injected initializer. Every failure
     * throws rather than returning: showView() decides what a failed load means
     * (rethrow on cold start so bootstrap renders its error panel, roll back to
     * the previous view otherwise). Returning quietly would let showView()
     * continue past the failure and commit currentView, the URL and the nav
     * buttons to a view with no module.
     * @param {string} viewType - View type
     */
    async #initializeView(viewType) {
        const container = this.#viewContainers[viewType];
        if (!container) {
            throw new Error(`${this.#deps.ownerName}: Container not found for view '${viewType}'`);
        }
        this.#viewModules[viewType] = await this.#deps.initializeView(viewType, container);
    }

    /**
     * Recover from a transition failure after showView() has already started
     * mutating containers and subscriptions.
     *
     * Returns true when the original error should keep propagating: either the
     * requested view is already live (late post-show failure, nothing to roll
     * back), or there is no previous view to restore (cold-start failure, so
     * bootstrap must render the inline error state).
     * @param {string} viewType - View type whose transition failed
     * @param {string|null} previousView - View that was active before the switch
     * @returns {Promise<boolean>} Whether the original error should be rethrown
     */
    async #handleViewTransitionError(viewType, previousView) {
        // Late failure (a post-show hook threw): the requested view is already
        // live and the app state agrees with it, so there is nothing to roll back.
        if (this.#deps.getCurrentView() === viewType) {
            return true;
        }

        // #hideCurrentView() has already hidden and suspended the outgoing view
        // while currentView still names it. Left that way, the app sits on
        // a hidden view whose own nav button is a no-op (the "already on
        // requested view" guard above). Undo the half-applied transition.
        this.#resetViewContainer(viewType);

        if (!previousView) {
            return true;
        }

        await this.#restoreView(previousView);
        return false;
    }

    /**
     * Hide the currently active view and suspend its event subscriptions.
     */
    #hideCurrentView() {
        const currentView = this.#deps.getCurrentView();
        if (!currentView) return;

        const container = this.#viewContainers[currentView];
        if (container) {
            container.style.display = 'none';
            // The overlay is a sibling in .main-content, not a child, so hiding
            // the container does not hide it. A render still in flight (or one
            // that threw before revealView()) would otherwise leave a
            // placeholder covering the view we are switching to.
            hideViewSkeleton(container);
        }

        const viewModule = this.#viewModules[currentView];
        if (viewModule) {
            viewModule.hide();
            // Suspend event subscriptions to prevent stale handlers on hidden views
            viewModule.suspend();
        }
    }

    /**
     * Show a view container
     * @param {string} viewType - View type
     */
    #showViewContainer(viewType) {
        const container = this.#viewContainers[viewType];
        if (container) {
            container.style.display = '';
            // Claim the view's layout space before its content exists. Until
            // #createDOM() applies `view-base` the container is zero-height,
            // which (a) shifts whatever follows it in .main-content — SL's nav
            // cards visibly jump — and (b) leaves the skeleton overlay no
            // height to measure, so it would stretch over that chrome. Every
            // view re-applies `view-base` in its own DOM build, so the class is
            // continuous from here through render.
            container.classList.add('view-base');
        }
    }

    /**
     * Undo the container changes a half-applied transition left behind.
     *
     * Hides the container again and clears the render cover — the
     * `data-view-rendering` attribute that view-layout.css turns into
     * `visibility: hidden`. Without that clear, a view whose render threw after
     * beginViewRender() stays invisible for the rest of the session, including
     * on a later successful retry, because nothing else ever removes it.
     * @param {string} viewType - View type whose transition failed
     */
    #resetViewContainer(viewType) {
        const container = this.#viewContainers[viewType];
        if (!container) return;

        container.style.display = 'none';
        container.removeAttribute(BaseViewModule.RENDERING_ATTRIBUTE);
        container.removeAttribute('aria-busy');
        hideViewSkeleton(container);
    }

    /**
     * Re-show a view that was live before a failed transition, so the user is
     * left on a working screen instead of a blank one. Mirrors the happy path
     * for an already-initialized view: pre-show hooks (header, nav chrome),
     * container, buttons, URL, resume — currentView still names it, so no
     * state update is needed.
     *
     * Best-effort by design: a secondary failure here is logged, never thrown,
     * so it cannot mask the original error on its way out of showView().
     * @param {string} viewType - The view to roll back to
     */
    async #restoreView(viewType) {
        try {
            await this.#deps.beforeShowView(viewType, {});
            this.#showViewContainer(viewType);
            // A hashchange-driven navigation has already moved the URL to the
            // view that failed; put it back without adding a history entry.
            this.#deps.onViewActivated(viewType, { replace: true });

            // Mirrors the happy path in showView(): show, then resume() replays
            // what was published while the view was hidden and onResume() covers
            // off-bus catch-up — otherwise a rollback leaves it showing state
            // from before the failed transition began.
            const viewModule = this.#viewModules[viewType];
            const wasSuspended = viewModule?.isSuspended;
            viewModule?.show();
            viewModule?.resume();
            if (wasSuspended) viewModule.onResume();
            if (viewModule) this.#refreshStaleTheme(viewType, viewModule);
        } catch (error) {
            notifyFailure(
                'general.messages.view-failed',
                `${this.#deps.ownerName}: Failed to restore view '${viewType}'`,
                error,
            );
        }
    }

    /**
     * Apply a KS color-theme switch this view missed while it was not the
     * active view (see refreshThemeInCurrentView). Called right after the view
     * is shown, so its charts and tables redraw against a visible container.
     * @param {string} viewType - The view that just became visible.
     * @param {BaseViewModule} viewModule - Its module, whose charts and tables are redrawn.
     */
    #refreshStaleTheme(viewType, viewModule) {
        if (!this.#themeStaleViews.delete(viewType)) return;
        viewModule.onThemeChanged?.();
    }
}
