/** BaseModule — base class for every view building block: a light-DOM Lit element. */

import { effect } from '@preact/signals-core';
import { ReactiveElement, nothing, render as renderTemplate } from 'lit';
import { ResourceTracker } from '../utils/resourceTracker.js';
import { onChange } from '../utils/state.js';
import { withDefaults } from '../utils/withDefaults.js';
import './baseModule.css';

/** @typedef {import('../glossary/glossaryText.js').GlossaryTree} GlossaryTree */
/** @typedef {import('lit').PropertyValues} PropertyValues */

/**
 * Marks a module's element: the tree walks find modules by it, and baseModule.css gives
 * it its block box and its `hidden` rule.
 */
const MODULE_ATTRIBUTE = 'data-tba-module';

/** Fail-safe cap on `whenSettled()`: generous enough for a slow content build. */
const SETTLE_TIMEOUT_MS = 3000;

/**
 * Marks an export capture stage. A module cloned into one stays inert: no setup, no
 * render, no registrations.
 */
export const CAPTURE_STAGE_ATTRIBUTE = 'data-capture-stage';

/**
 * The id the nodes an element holds are named after: its own, or — for a card's body,
 * which has none — the id of the module element it sits in.
 * @param {Element} element
 * @returns {string} The id; empty when neither has one.
 */
export function owningModuleId(element) {
    return element.id || element.closest(`[${MODULE_ATTRIBUTE}]`)?.id || '';
}

/**
 * What a card needs of its context's `documents`: making named documents readable. A name
 * is a document's file name or a dataset key; opaque here, the store resolves it.
 * @typedef {{ensure(names: ReadonlyArray<string | {name: string}>): Promise<void>}} DocumentSource
 */

/**
 * What a module reads of its app, beyond its own options: the document store, the
 * glossary and the host services. An app's context extends it with its own parts; a
 * subclass that reads those narrows the type in its own options typedef.
 * @typedef {object} BaseContext
 * @property {DocumentSource} documents
 * @property {GlossaryTree|null} glossaryData
 * @property {import('./moduleRuntime.js').ModuleRuntime} [runtime] - The host services a card reads (export, text decoration).
 */

/**
 * @typedef {object} BaseOptions
 * @property {string} [viewKey] - The key of the view the module sits in.
 * @property {BaseContext} [context]
 */

/**
 * The keys `_childOptions` hands down, typed as module `M` declares them.
 * @template {{options: BaseOptions}} M
 * @typedef {Pick<M['options'], 'viewKey' | 'context'>} ChildContext
 */

/**
 * A module element: configured once through `options`, driven by reactive properties.
 * @template {BaseOptions} [O=BaseOptions]
 */
class BaseModule extends ReactiveElement {
    /**
     * @override
     * @type {import('lit').PropertyDeclarations}
     */
    static properties = { data: { attribute: false } };

    /**
     * The options a caller may leave out, filled in when `options` is set. A subclass
     * with defaults declares its own.
     * @type {object}
     */
    static defaultOptions = {};

    /** @type {O} */
    #options = /** @type {O} */ ({});
    /** @type {ResourceTracker|null} */
    #resources = null;
    /** A copy inside an export capture stage: never set up, never rendered. */
    #inert = false;
    #setUp = false;
    /** @type {unknown} What `_setup()` threw; the module then never renders. */
    #setupError = undefined;
    #tornDown = false;
    /** Disconnected and not yet torn down. */
    #removalQueued = false;
    /**
     * What `_onShow`/`_onHide` last reported; null until the first refresh reaches it.
     * @type {boolean|null}
     */
    #shown = null;
    #contentRendered = false;
    /** A content pass was asked for without a property change (`refreshContent()`). */
    #contentRequested = false;
    #initialized = false;
    /** @type {Promise<void>} */
    #contentPass = Promise.resolve();
    /** @type {import('lit').RenderOptions} */
    #renderOptions = { host: this };
    /** @type {import('lit').RootPart|undefined} The part `render()`'s template lives in, once it rendered one. */
    #templatePart;

    constructor() {
        super();
        /** @type {unknown} The payload its parent hands down; a new one runs the content pass. */
        this.data = null;
    }

    /**
     * Light DOM: the app's stylesheets and Trusted Types policy reach a module like any
     * other element.
     * @override
     * @returns {HTMLElement} The element itself.
     */
    createRenderRoot() {
        return this;
    }

    /**
     * A module of this class, configured and not yet connected: what a parent places
     * itself rather than declaring it in a template.
     * @template {BaseModule<any>} M
     * @this {new () => M}
     * @param {string} id - The module id, the element's id.
     * @param {M['options']} options
     * @returns {M}
     */
    static create(id, options) {
        const module = new this();
        module.id = id;
        module.options = options;
        return module;
    }

    /**
     * The module's configuration, the class's `defaultOptions` filled in. Set once,
     * before the module first connects; a subclass types it through the class's type
     * parameter.
     * @returns {O}
     */
    get options() {
        return this.#options;
    }
    set options(options) {
        if (this.#setUp) {
            throw new Error(`${this.localName}#${this.id}: options are fixed once connected`);
        }
        const { defaultOptions } = /** @type {typeof BaseModule} */ (this.constructor);
        this.#options = /** @type {O} */ (withDefaults(defaultOptions, options));
    }

    /** @returns {boolean} Whether its subtree is on screen: connected and laid out. */
    get visible() {
        return this.isConnected && !this.#inert && this._visibilityTarget.checkVisibility();
    }

    /**
     * The element whose layout decides `visible`: the module itself unless a subclass
     * names another.
     * @protected
     * @returns {Element}
     */
    get _visibilityTarget() {
        return this;
    }

    /** @returns {boolean} Whether a content pass has completed. */
    get initialized() {
        return this.#initialized;
    }

    /** @returns {boolean} Whether the module has torn down; it never renders again. */
    get destroyed() {
        return this.#tornDown;
    }

    /**
     * The module's listeners, timers and subscriptions, released when it tears down.
     * Exists from the first connect on.
     * @returns {ResourceTracker}
     */
    get resources() {
        if (!this.#resources) {
            throw new Error(`${this.localName}#${this.id}: no resources before it connects`);
        }
        return this.#resources;
    }

    /**
     * Run `fn` now and again whenever a signal it read changes (`@preact/signals-core`'s
     * `effect`), until the module tears down. Every signal `fn` reads subscribes it,
     * including reads in what it calls: wrap work that is not the point of the effect —
     * a redraw, a callback — in `untracked()`. For changes only, use `onChange`.
     * @param {() => void} fn
     * @returns {() => void} Disposes the effect early.
     */
    effect(fn) {
        return this.resources.trackSubscription(effect(fn));
    }

    /**
     * `onChange` from state.js, disposed when the module tears down.
     * @template T
     * @param {() => T} read - Reads the signals to follow; its result goes to `run`.
     * @param {(value: T) => void} run - The work a change triggers.
     * @returns {() => void} Disposes the follower early.
     */
    onChange(read, run) {
        return this.resources.trackSubscription(onChange(read, run));
    }

    /**
     * The nearest modules inside this one, in document order. To walk the whole
     * subtree, use descendants().
     * @returns {BaseModule[]}
     */
    get childModules() {
        /** @type {BaseModule[]} */
        const children = [];
        // Down to the first module on each path and no further, so a walk of the whole
        // tree level by level reads each element once. The modules inside an inert copy
        // drop out with it.
        /** @param {Element} parent */
        const visit = (parent) => {
            for (const element of parent.children) {
                if (!element.hasAttribute(MODULE_ATTRIBUTE)) visit(element);
                else if (element instanceof BaseModule && !element.#inert) children.push(element);
            }
        };
        visit(this);
        return children;
    }

    /**
     * Every module inside this one, in document order (a child, its subtree, then the
     * next child); the module itself is not included.
     * @returns {BaseModule[]}
     */
    descendants() {
        return [...this.querySelectorAll(`[${MODULE_ATTRIBUTE}]`)].filter(
            /**
             * @param {Element} element
             * @returns {element is BaseModule}
             */
            (element) => element instanceof BaseModule && !element.#inert,
        );
    }

    /**
     * The option bundle every child module is configured with: this module's `context`
     * and `viewKey`.
     * @protected
     * @template {object} [E={}]
     * @param {E} [extras] - The child's own options; they win over the bundle.
     * @returns {ChildContext<this> & NoInfer<E>}
     */
    _childOptions(extras) {
        const { viewKey, context } = this.options;
        return /** @type {ChildContext<this> & NoInfer<E>} */ ({
            viewKey,
            context,
            ...extras,
        });
    }

    // ========================================================================
    // EXPORT CAPTURE
    // ========================================================================

    /**
     * Make this subtree capturable and return the restore. Do not override: a module
     * adds its own steps through `_captureSteps()`.
     *
     * An export rasterizes a clone of the card's live DOM, so whatever is not rendered
     * there is missing from the export. This module's steps run first, then the child
     * modules' preparation; the restore undoes them in reverse, and a step that throws
     * undoes everything this call did before it rethrows. Opening only starts the work:
     * the capture waits for the root's `whenSettled()`, which covers the whole subtree.
     * @returns {() => void} Undoes every change this call made, in reverse.
     */
    prepareExportCapture() {
        /** @type {Array<() => void>} */
        const restores = [];
        const restore = () => {
            for (const undo of [...restores].reverse()) undo();
        };
        try {
            for (const step of this._captureSteps()) restores.push(step());
            for (const child of this.childModules) restores.push(child.prepareExportCapture());
        } catch (error) {
            // The caller gets no restore: what ran so far is undone here.
            restore();
            throw error;
        }
        return restore;
    }

    /**
     * What this module changes before a capture, in order, each step returning its undo:
     * a module whose content needs opening before it is worth capturing returns its
     * steps, around those of its superclass. None by default.
     * @protected
     * @returns {Array<() => () => void>}
     */
    _captureSteps() {
        return [];
    }

    /**
     * Fix up the capture clone, which still mirrors the live tree node for node: the child
     * modules first, then this module's `_prepareOwnClone()`. Do not override.
     * @param {(live: Element) => Element|null} cloneOf - Maps a live element to its copy in the clone.
     */
    prepareExportClone(cloneOf) {
        for (const child of this.childModules) {
            child.prepareExportClone(cloneOf);
        }
        this._prepareOwnClone(cloneOf);
    }

    /**
     * Replace in the clone what a clone cannot carry of this module. Nothing by default.
     * @protected
     * @param {(live: Element) => Element|null} _cloneOf - Maps a live element to its copy in the clone.
     */
    _prepareOwnClone(_cloneOf) {}

    /**
     * This subtree's tabular content, serialised: this module's `_ownExportData()`, then
     * the child modules' blocks. Do not override.
     * @param {'csv'|'json'} format - Which serialisation to produce.
     * @returns {import('./moduleRuntime.js').ExportDataBlock[]} One block per table, in document order; empty when the subtree has none.
     */
    getExportDataText(format) {
        return [
            ...this._ownExportData(format),
            ...this.childModules.flatMap((child) => child.getExportDataText(format)),
        ];
    }

    /**
     * The tables this module itself holds, serialised. None by default.
     * @protected
     * @param {'csv'|'json'} _format - Which serialisation to produce.
     * @returns {import('./moduleRuntime.js').ExportDataBlock[]}
     */
    _ownExportData(_format) {
        return [];
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * The module's own markup, rendered into the element on every update — or `nothing`,
     * the default, for a module whose children its own code places (an untitled card is
     * its own body, a table builds into it): such an element holds no Lit part, which a
     * `replaceChildren()` would cut loose.
     * @returns {unknown}
     */
    render() {
        return nothing;
    }

    /**
     * Render `render()`'s template, once the module has one (Lit's `LitElement.update`,
     * minus the part for a module without a template). Final.
     * @override
     * @param {PropertyValues} changed
     */
    update(changed) {
        const template = this.render();
        if (!this.hasUpdated) this.#renderOptions.isConnected = this.isConnected;
        super.update(changed);
        if (template === nothing && !this.#templatePart) return;
        this.#templatePart = renderTemplate(template, this, this.#renderOptions);
    }

    /**
     * Set up on the first connect, then render at once: the shell is in place by the
     * time the element is. Final.
     * @override
     */
    connectedCallback() {
        if (this.closest(`[${CAPTURE_STAGE_ATTRIBUTE}]`)) {
            this.#inert = true;
            return;
        }
        if (this.#tornDown) {
            throw new Error(`${this.localName}#${this.id}: a torn-down module cannot reconnect`);
        }
        this.#removalQueued = false;
        if (!this.#setUp && this.#setupError === undefined) {
            // A callback's throw is reported, never propagated to whoever placed the
            // element, so a failed setup rejects `updateComplete` instead of leaving it
            // pending forever.
            try {
                if (!this.id) throw new Error(`<${this.localName}> needs an id`);
                this.setAttribute(MODULE_ATTRIBUTE, '');
                this.#resources = new ResourceTracker(this.id);
                this._setup();
                this.#setUp = true;
            } catch (error) {
                this.#setupError = error;
                this._adoptContentPass(Promise.reject(error));
            }
        }
        super.connectedCallback();
        this.#templatePart?.setConnected(true);
        // The first render runs here, not in Lit's queued update, so a throw from it
        // would otherwise leave `updateComplete` resolving over an empty card.
        try {
            this.performUpdate();
        } catch (error) {
            this._adoptContentPass(Promise.reject(error));
        }
    }

    /**
     * Tear down at the next microtask unless the element is back by then: a move
     * (a keyed reorder) disconnects and reconnects within one task. Final.
     * @override
     */
    disconnectedCallback() {
        if (this.#inert) return;
        super.disconnectedCallback();
        this.#templatePart?.setConnected(false);
        this.#removalQueued = true;
        queueMicrotask(() => {
            if (this.#removalQueued) this.#tearDown();
        });
    }

    /**
     * Read the options and build what the module keeps for its life: state, controllers,
     * effects. Runs once, on the first connect, before the first render.
     * @protected
     */
    _setup() {}

    /**
     * Release what `_setup()` and the renders built beyond the tracked resources (a
     * widget, an overlay outside the module). Runs once, when the module
     * leaves the document for good; tracked resources are released after it.
     * Overrides call `super._teardown()`.
     * @protected
     */
    _teardown() {}

    /**
     * Lit updates a disconnected element too: a module that failed its setup or has torn
     * down renders nothing more. Final.
     * @override
     * @returns {boolean}
     */
    shouldUpdate() {
        return this.#setupError === undefined && !this.#tornDown;
    }

    /**
     * Start the content pass after a render whose properties changed, and on the first.
     * A render with nothing changed (a requested shell refresh) leaves the content alone.
     * Final.
     * @override
     * @param {PropertyValues} changed
     */
    updated(changed) {
        if (this.#contentRendered && changed.size === 0 && !this.#contentRequested) return;
        this.#contentRendered = true;
        this.#contentRequested = false;
        this.#contentPass = this._renderContent(changed).then(() => {
            this.#initialized = true;
        });
    }

    /**
     * Run the content pass again from what the module holds itself — a selection, a
     * toggle — rather than from a new property value.
     * @returns {Promise<boolean>} The module's `updateComplete`.
     */
    refreshContent() {
        this.#contentRequested = true;
        this.requestUpdate();
        return this.updateComplete;
    }

    /**
     * Make `pass` the module's content pass, as `updated()` does for the pass it starts:
     * for content work a module starts outside an update (a rebuild on its own signals).
     * `updateComplete` and `contentComplete` wait for it, a pass it replaced no longer
     * rejects them, and one that throws rejects them until a newer pass replaces it.
     * Its failure reaches whoever awaits the module; it is never reported as unhandled.
     * @protected
     * @param {Promise<void>} pass
     */
    _adoptContentPass(pass) {
        this.#contentPass = pass.then(() => {
            this.#initialized = true;
        });
        this.#contentPass.catch(() => {});
    }

    /**
     * The module's content work after its template has committed: fetch, build, draw.
     * Each pass starts on a new payload; `updateComplete` waits for the latest.
     * @protected
     * @param {PropertyValues} changed
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line no-unused-vars
    async _renderContent(changed) {}

    /**
     * Resolves once the module's own content has stopped moving. A content pass
     * resolving is not the content being on screen: a widget may build and measure over
     * later frames. Default: nothing to wait for.
     * @protected
     * @returns {Promise<void>}
     */
    _contentSettled() {
        return Promise.resolve();
    }

    /**
     * Lit's update promise, extended to the whole subtree: every module's latest content
     * pass and its own settling (see `#whenSubtree`). A content pass that throws rejects
     * it.
     * @override
     * @protected
     * @returns {Promise<boolean>} Whether no further update was pending.
     */
    getUpdateComplete() {
        return this.#whenSubtree((module) => module.#ownSettled());
    }

    /**
     * Resolves once the latest content pass of every module in the subtree has run —
     * what is built, not yet what has settled (`updateComplete`). A content pass that
     * throws rejects it.
     * @returns {Promise<void>}
     */
    get contentComplete() {
        return this.#whenSubtree((module) => module.#ownContentComplete()).then(() => {});
    }

    /**
     * Run `step` on this module and every module inside it, again until no module was
     * added or removed and none started a content pass or has an update queued that
     * would start one. A sibling can start one from inside another's wait, after its own
     * wait had already resolved.
     * @param {(member: BaseModule) => Promise<boolean>} step - The wait for one module of the subtree.
     * @returns {Promise<boolean>} What `step` resolved with for this module.
     */
    async #whenSubtree(step) {
        let modules = [this, ...this.descendants()];
        for (;;) {
            const passes = new Map(modules.map((module) => [module, module.#contentPass]));
            const [result] = await Promise.all(modules.map(step));
            const after = [this, ...this.descendants()];
            const unchanged =
                after.length === passes.size &&
                after.every(
                    (module) =>
                        !module.isUpdatePending && passes.get(module) === module.#contentPass,
                );
            if (unchanged) return result;
            modules = after;
        }
    }

    /**
     * The module's own latest content pass, then its own settling.
     * @returns {Promise<boolean>} Whether no further update was pending.
     */
    async #ownSettled() {
        const result = await this.#ownContentComplete();
        await this._contentSettled();
        return result;
    }

    /**
     * Resolves once the pending render of the module's own template has committed — not
     * its content (`updateComplete`, which a content pass awaiting it would deadlock on).
     * For a content pass that changed what the template reads and measures the result.
     * @protected
     * @returns {Promise<boolean>} Whether no further update was pending.
     */
    _whenTemplateRendered() {
        return super.getUpdateComplete();
    }

    /**
     * Resolves once `updateComplete` has, or once the fail-safe cap has passed, and never
     * rejects, so a module that never settles or failed (it reports that itself) strands
     * no wait.
     * @returns {Promise<void>}
     */
    whenSettled() {
        /** @type {ReturnType<typeof setTimeout>|undefined} */
        let failSafe;
        return Promise.race([
            this.updateComplete.then(
                () => undefined,
                () => undefined,
            ),
            new Promise((resolve) => {
                failSafe = setTimeout(resolve, SETTLE_TIMEOUT_MS);
            }),
        ]).then(() => {
            // An armed timer per call would keep the timer queue (and a test runner's
            // event loop) busy for the whole window after every settle.
            clearTimeout(failSafe);
        });
    }

    /**
     * Lit's update promise, then the latest content pass, again until no update or
     * pass started meanwhile. A pass that threw rejects only while it is still the
     * latest: one a newer pass replaced drew a payload no longer shown.
     * @returns {Promise<boolean>} Whether no further update was pending.
     */
    async #ownContentComplete() {
        let result = await super.getUpdateComplete();
        for (;;) {
            const pass = this.#contentPass;
            const failure = await pass.then(
                () => null,
                (error) => ({ error }),
            );
            if (this.isUpdatePending) result = await super.getUpdateComplete();
            if (pass !== this.#contentPass) continue;
            if (failure) throw failure.error;
            return result;
        }
    }

    #tearDown() {
        if (this.#tornDown) return;
        this.#tornDown = true;
        this.#removalQueued = false;
        try {
            // A `_setup()` that threw left its fields unbuilt; only its resources need release.
            if (this.#setUp) this._teardown();
        } finally {
            this.#resources?.destroy();
        }
    }

    // ========================================================================
    // VISIBILITY
    // ========================================================================

    /** Show the module (its `hidden` attribute off) and report the change below. */
    show() {
        this.hidden = false;
        this.refreshVisibility();
    }

    /**
     * Hide the module (its `hidden` attribute on) and report the change below. A child
     * its owner hid stays hidden when an ancestor is shown again.
     */
    hide() {
        this.hidden = true;
        this.refreshVisibility();
    }

    /**
     * Re-read whether this subtree is on screen and run `_onShow`/`_onHide` on every
     * module whose answer changed, the descendants before the module. A module created
     * since the last refresh has no answer yet, so it hears the hook for its current one.
     * Whoever changes what is on screen — a show(), a collapse, a view switch — calls it.
     */
    refreshVisibility() {
        // Every module is read before any hook runs: a hook draws, and a draw between
        // two `checkVisibility()` reads would force a fresh layout for the second.
        /** @type {Array<[BaseModule, boolean]>} */
        const changed = [];
        this.#collectVisibilityChanges(changed);
        // A hook is a notification, as an event listener is: one that throws is reported
        // and keeps neither the hooks after it nor the caller's own work from running.
        for (const [module, shown] of changed) {
            // An earlier hook that changed this module's visibility again (a nested
            // `refreshVisibility`) already ran its hook for the newer answer.
            if (module.#tornDown || module.#shown !== shown) continue;
            try {
                if (shown) module._onShow();
                else module._onHide();
            } catch (error) {
                console.error(
                    `BaseModule[${module.id}]: Error in ${shown ? '_onShow' : '_onHide'}:`,
                    error,
                );
            }
        }
    }

    /**
     * Record the new `visible` of this subtree, and collect every module whose answer
     * changed, the descendants before the module.
     * @param {Array<[BaseModule, boolean]>} changed - Collects the modules to notify and their new answer, in hook order.
     */
    #collectVisibilityChanges(changed) {
        if (!this.#setUp || this.#tornDown) return;
        for (const child of this.childModules) child.#collectVisibilityChanges(changed);
        const visible = this.visible;
        if (visible === this.#shown) return;
        this.#shown = visible;
        changed.push([this, visible]);
    }

    /**
     * The subtree became visible. For work that needs a laid-out box.
     * @protected
     */
    _onShow() {}

    /**
     * The subtree stopped being visible.
     * @protected
     */
    _onHide() {}
}

export { BaseModule };
