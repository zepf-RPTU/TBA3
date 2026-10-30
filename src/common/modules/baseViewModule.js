/**
 * BaseViewModule — base class for the top-level view of a dashboard. A view owns a
 * screen's module tree and its app-state observation, and seeds its children from
 * explicit options rather than letting them read state themselves.
 */

import { BaseModule, ContentModule, waitForLayout } from '@tba3/module-base';
import { isMissingGlossaryText } from '@tba3/module-base/glossary';
import { renderChartMessage } from '@tba3/modules/charts';
import { restartSkeletonHold, showViewSkeleton, waitForSkeletonHold } from '../app/viewSkeleton.js';

/** @typedef {import('../app/appModule.js').ShellState} ShellState */

/**
 * @template {ShellState} [TState=ShellState]
 * @typedef {object} ViewModuleOptions
 * @property {(viewType: string, options?: import('../app/viewLifecycle.js').ShowViewOptions) => Promise<void>} onNavigate - Switches the app to another view; settles once the switch is done
 * @property {import('@tba3/module-base').State<TState>} appState
 * @property {import('@tba3/modules/charts').ComparisonState} comparisonState - Which ⌀ comparison groups show; kept outside the app state
 * @property {import('../app/appContext.js').AppContext} context - Passed through to child modules
 * @property {{[viewType: string]: import('../app/appModule.js').LabelledViewConfigEntry}} viewConfig - The app's viewConfig map (view labels, icons, sidebar order)
 * @property {string} [studentView] - The view a student opens in (`_openStudent`); none in an app without students
 * @property {import('../app/viewSkeleton.js').ViewSkeletonShape} [skeleton] - Loading placeholder shape
 * @property {string} [viewKey] - The view's own key in the app's viewConfig
 */

/**
 * A dashboard view, typed by its app's state `TState`: `options.appState` carries that
 * app's signals, and `watch` hands each handler its signal's value type.
 * @template {ShellState} [TState=ShellState]
 * @augments {BaseModule<ViewModuleOptions<TState>>}
 */
export class BaseViewModule extends BaseModule {
    /** @type {Map<import('@preact/signals-core').ReadonlySignal<unknown>, (value: any) => void>} */
    #watchers = new Map();
    // watched signal -> latest value changed while hidden, in order of last arrival
    #pendingChanges = new Map();
    // watched signal -> the value the view last rendered: read at registration, then delivered
    #seen = new Map();
    #hidden = false;
    /** @type {{promise: Promise<void>, resolve: () => void}|null} Open while a render window is covered; see whenRevealed() */
    #revealWaiters = null;
    /** @type {HTMLElement|null} the placeholder over the view while it is covered */
    #skeleton = null;
    /** Bumped by every cover; only the newest one uncovers. */
    #coverGeneration = 0;
    static RENDERING_ATTRIBUTE = 'data-view-rendering';

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * Hidden (a view switch): watched signals stop reaching their handlers, and only the
     * latest value per signal is kept for `_onShow`.
     * @override
     */
    _onHide() {
        this.#hidden = true;
    }

    /**
     * Shown again: deliver the latest value of every watched signal that changed while
     * hidden, in order of last change. Values are absolute state (a mode, a student id,
     * the comparison set), so the last one per signal is enough, and a revisit without a
     * change re-renders nothing. It runs after the children's `_onShow`, so handlers may
     * test `this.visible`.
     * @override
     */
    _onShow() {
        // A revisit while a reveal is pending finds the placeholder that reveal will take
        // down; it fades in anew with the shell, so its hold starts over too.
        if (this.#hidden && this.#skeleton) restartSkeletonHold(this);
        this.#hidden = false;
        const pending = Array.from(this.#pendingChanges);
        this.#pendingChanges.clear();
        for (const [source, value] of pending) {
            this.#deliver(source, value, 'Error applying a change on show:');
        }
    }

    /**
     * Hand a watched signal's value to its handler and record it as the one the view shows.
     * Caught: an effect's error reaches whoever wrote the signal (a header control, a
     * navigation's statePatch), not this view.
     * @param {import('@preact/signals-core').ReadonlySignal<unknown>} source
     * @param {unknown} value
     * @param {string} failure - The log line's message.
     */
    #deliver(source, value, failure) {
        const handler = this.#watchers.get(source);
        if (!handler) return;
        this.#seen.set(source, value);
        try {
            handler(value);
        } catch (error) {
            console.error(`BaseViewModule[${this.id}]: ${failure}`, error);
        }
    }

    /**
     * Watch one signal — an app-state key (`this.options.appState.vizMode`) or a value
     * computed from them — and react with plain child verbs: a header control (or a
     * clicking view) writes the state, this handler pushes the value to whichever
     * children render it.
     *
     * Changes only: the handler is not called for the value at registration, which the
     * render already read. While the view is hidden the delivery waits for `_onShow`.
     * Released with the view's other resources. Watch from _renderView(), not the
     * constructor: handlers touch children and view DOM, which do not exist at
     * construction. One handler per signal.
     *
     * A child that renders a key follows it itself: pass the signal down as its option
     * (`domainMode: appState.currentMode`) instead of watching it here. `watch` is for
     * work only the view can do (re-pointing children, navigation).
     * @template T
     * @param {import('@preact/signals-core').ReadonlySignal<T>} source
     * @param {(value: T) => void} handler
     * @throws {Error} when the signal is already watched
     */
    watch(source, handler) {
        if (this.#watchers.has(source)) {
            throw new Error(`${this.constructor.name}[${this.id}]: that signal is already watched`);
        }
        this.#watchers.set(source, handler);
        this.#seen.set(source, source.peek());
        this.onChange(
            () => source.value,
            (value) => {
                if (this.#hidden) {
                    this.#pendingChanges.delete(source);
                    // Changed back to what the view shows: nothing left to deliver.
                    if (!Object.is(value, this.#seen.get(source))) {
                        this.#pendingChanges.set(source, value);
                    }
                    return;
                }
                this.#deliver(source, value, 'Error applying a change:');
            },
        );
    }

    // ========================================================================
    // TOUR STEPS, CHILD OPTIONS AND NOTES TARGETS
    // ========================================================================

    /**
     * Guided-walkthrough steps the module tree cannot declare.
     *
     * `buildTourSteps()` derives a step for the view header and for every card below
     * the view that has glossary tutorial copy, in document order. Override only for an
     * anchor that is not a module, or content whose element does not exist while the
     * tour runs (leave out `getAnchor`: the card is then centred). The steps follow the
     * derived ones, before the shared closing cards; an entry without tutorial copy
     * contributes none.
     * @returns {Array<{glossaryPath: string, getAnchor?: () => (HTMLElement|null)}>} In tour order; none by default.
     */
    get tourExtras() {
        return [];
    }

    /**
     * Children get the comparison-state port alongside what the kit threads. It is a
     * VERA concept, so it is added here rather than in the kit's own child options.
     * @template {object} [E={}]
     * @param {E} [extras] - Per-child options; these win over the defaults.
     * @returns {import('@tba3/module-base').ChildContext<this> & {comparisonState: import('@tba3/modules/charts').ComparisonState} & NoInfer<E>}
     * @protected
     * @override
     */
    _childOptions(extras) {
        return {
            comparisonState: this.options.comparisonState,
            ...super._childOptions(extras),
        };
    }

    /**
     * Default notes-panel link targets: every child card that renders its own title
     * bar (`showModuleTitle`), labelled with the title it shows on screen (glossary
     * title, else the `title` option — ContentModule's precedence).
     * Override in a view when this default is ambiguous or wrong (e.g. two
     * children that render the same title).
     *
     * Called for any live view, not just the visible one: the notes drawer
     * lists the modules of every view opened this session.
     * @returns {Array<{id: string, label: string, element: HTMLElement}>}
     */
    getNotesLinkTargets() {
        return this.childModules
            .filter(
                /**
                 * @param {BaseModule<any>} child
                 * @returns {child is ContentModule<any>} Whether it renders a titled card to link.
                 */
                (child) =>
                    child instanceof ContentModule &&
                    Boolean(child.options.showModuleTitle) &&
                    // A card whose copy is missing is left out, not listed under the marker.
                    !isMissingGlossaryText(child.cardTitle),
            )
            .map((child) => ({
                id: child.id,
                label: child.cardTitle,
                element: child,
            }));
    }

    // ========================================================================
    // RENDER TEMPLATE
    // ========================================================================

    /**
     * Render the view behind its cover. Final for views: the cover protocol
     * (beginViewRender before anything is built, revealView once everything
     * is) lives here, so a view cannot forget half of it. Views implement
     * _renderView(), which places the child modules; the pass ends once their first
     * content passes have run. A throw in either leaves the view covered; the caller
     * that owns the instance removes it, and the teardown takes the cover down.
     *
     * The app's student view of a group without students has no one to show: it says
     * so instead of rendering. The app seeds a student once the data has landed, and the
     * dataset cannot change without a reload.
     * @override
     * @returns {Promise<void>}
     */
    async _renderContent() {
        const cover = this.#beginViewRender();
        try {
            if (this.#showsNoStudent) {
                renderChartMessage(this, {
                    text: this.options.context.glossary.getRequiredEntryText(
                        'general.messages.no-students',
                    ),
                });
            } else {
                await this._renderView();
            }
            await Promise.all(this.childModules.map((child) => child.contentComplete));
        } catch (error) {
            // The view stays covered for its owner to destroy, but nobody waiting on
            // its reveal may hang on a render that will never reveal.
            this.#settleRevealWaiters();
            throw error;
        }
        void this.#revealView(cover);
    }

    /** @returns {boolean} Whether this is the student view and the group has no student to show. */
    get #showsNoStudent() {
        const { appState, studentView, viewKey } = this.options;
        return (
            studentView !== undefined &&
            viewKey === studentView &&
            appState.currentStudentId.peek() == null
        );
    }

    /**
     * Cover the view while `work` rebuilds part of it in place (a layout switch filling
     * a panel), then uncover it as a render does: once the subtree has settled, after
     * the placeholder's hold. A newer cover — another switch, a re-render — supersedes
     * this one, which then leaves the uncovering to it.
     * @param {Promise<unknown>|undefined} work - The rebuild; nothing to wait for without one.
     * @returns {Promise<void>} Resolves once the view is uncovered or the cover superseded; rejects with `work`'s error after uncovering.
     */
    async coverWhile(work) {
        const cover = this.#beginViewRender();
        try {
            await work;
        } finally {
            await this.#revealView(cover);
        }
    }

    /**
     * Build the view's DOM, subscriptions and child modules, placing the children in
     * the view. Runs while the view is covered, so intermediate render steps are never
     * on screen.
     * @returns {Promise<void>}
     * @protected
     */
    async _renderView() {
        throw new Error(
            `${this.constructor.name}[${this.id}]: _renderView() must be implemented by subclass`,
        );
    }

    // ========================================================================
    // BATCH REVEAL
    // ========================================================================

    /**
     * Hide the view while its initial DOM and child modules mount, and put a
     * skeleton placeholder in its place.
     * Uses visibility instead of display/opacity so layout can settle without
     * exposing the intermediate render steps to the user.
     * @returns {number} The cover, which `revealView()` uncovers only while it is the newest.
     */
    #beginViewRender() {
        this.#coverGeneration += 1;
        this.setAttribute(BaseViewModule.RENDERING_ATTRIBUTE, 'true');
        this.setAttribute('aria-busy', 'true');
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
        // The one the app already mounted for the lazy-import window, if any.
        this.#skeleton = showViewSkeleton(this, this.options.skeleton);
        return this.#coverGeneration;
    }

    /**
     * Resolves once the view is uncovered — i.e. when the render window opened by
     * beginViewRender() has been closed by revealView() (or by the teardown). Resolves
     * at once when no window is open.
     * @returns {Promise<void>}
     */
    whenRevealed() {
        return this.#revealWaiters?.promise ?? Promise.resolve();
    }

    /**
     * Reveal the view once its content has stopped moving.
     *
     * A resolved content pass does not mean the content is on screen: a Tabulator
     * builds, redraws and measures columns over later frames. So the reveal waits for
     * the whole subtree to report settled, then for a layout pass.
     * @param {number} cover - The cover `beginViewRender()` returned.
     * @returns {Promise<void>} Resolves once the view is uncovered, or left alone because it was torn down or covered again since.
     */
    async #revealView(cover) {
        const isCurrent = () => cover === this.#coverGeneration;
        // A module that never settles (or fails) must not strand the view behind its
        // placeholder.
        await this.whenSettled();
        await waitForLayout();
        if (this.destroyed || !isCurrent()) return;
        await waitForSkeletonHold(this);
        if (this.destroyed || !isCurrent()) return;
        // Uncover and drop the placeholder in the same task so the two land in one
        // paint — no frame showing content under a placeholder, and none showing an
        // empty view after it.
        this.removeAttribute(BaseViewModule.RENDERING_ATTRIBUTE);
        this.removeAttribute('aria-busy');
        this.#skeleton?.remove();
        this.#skeleton = null;
        this.#settleRevealWaiters();
    }

    /** Resolve and clear the current render window's whenRevealed() promise. */
    #settleRevealWaiters() {
        const waiters = this.#revealWaiters;
        this.#revealWaiters = null;
        waiters?.resolve();
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * Tear down the view, including a render window it may still be inside.
     *
     * beginViewRender() both mounts a placeholder and hides the view behind it; only
     * revealView() undoes that pair. A view removed mid-render never gets there, and
     * the overlay is a *sibling* of the view, so removing the view leaves it standing.
     * Undo it here rather than depending on a specific
     * caller's cleanup sequence. Teardown runs once the view has left its shell, so
     * the view removes the overlay it kept rather than looking for it there.
     * @override
     */
    _teardown() {
        this.#skeleton?.remove();
        this.#skeleton = null;
        this.removeAttribute(BaseViewModule.RENDERING_ATTRIBUTE);
        this.removeAttribute('aria-busy');
        // A waiter on a view torn down mid-render must not hang.
        this.#settleRevealWaiters();
        // The watchers' effects are tracked resources, released after this.
        this.#watchers.clear();
        this.#pendingChanges.clear();
        this.#seen.clear();
        super._teardown();
    }

    // ========================================================================
    // NAVIGATION AND STUDENT SELECTION
    // ========================================================================

    /**
     * Switch the app to another view.
     * @param {string} viewTarget
     * @param {import('../app/viewLifecycle.js').ShowViewOptions} [options={}]
     * @returns {Promise<void>} Settles once the switch is done.
     * @protected
     */
    navigate(viewTarget, options = {}) {
        return this.options.onNavigate(viewTarget, options);
    }

    /**
     * Select a student without navigating: write `currentStudentId`, which the student
     * views observe.
     * @param {string} studentId
     * @protected
     */
    _selectStudent(studentId) {
        this.options.appState.currentStudentId.value = studentId;
    }

    /**
     * Select a student and open the app's student view — the shared body for every
     * `onStudentSelected` wire that means "open". State first, so a freshly
     * built student view seeds from it, then navigate; inside the student view the
     * selection alone switches the student.
     * @param {string} studentId
     * @throws {Error} in an app without a student view
     * @protected
     */
    _openStudent(studentId) {
        const { studentView, viewKey } = this.options;
        if (!studentView) {
            throw new Error(`${this.constructor.name}: the app has no student view to open`);
        }
        this._selectStudent(studentId);
        if (viewKey !== studentView) void this.navigate(studentView);
    }
}
