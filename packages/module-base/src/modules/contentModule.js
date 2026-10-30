/**
 * ContentModule — base class for titled content modules: the shared card shell of
 * title bar, optional subtitle and content body.
 */

import { BaseModule } from './baseModule.js';
import { DEFAULT_RUNTIME } from './moduleRuntime.js';
import { FOCUSABLE, eventPathMatches } from '../utils/domBuilder.js';
import {
    applyMarkupTokens,
    applyTemplateTokens,
    missingGlossaryText,
    resolveDotPath,
    resolveGlossaryTitle,
} from '../glossary/glossaryText.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { renderIcon } from '../utils/icons.js';
import { waitForStableElementBox } from '../utils/waitForLayout.js';
import { trusted } from '../utils/trustedDirective.js';
import { effect } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { createRef, ref } from 'lit/directives/ref.js';
import './contentModule.css';

/**
 * What in a card's header keeps its click to itself: the toolbar, and any control in the
 * title (a glossary term opens its popup). The chevron is the one that folds the card.
 */
const HEADER_CONTROL = `.content-module-header-actions, :is(${FOCUSABLE}, [role="button"]):not(.content-module-toggle)`;

/**
 * @typedef {import('./baseModule.js').BaseOptions & {
 *   glossaryKey?: string | null,
 *   glossaryReplacements?: import('../glossary/glossaryText.js').GlossaryReplacements | null,
 *   title?: string,
 *   subtitle?: string,
 *   showSubtitle?: boolean,
 *   showModuleTitle?: boolean,
 *   showModuleCard?: boolean,
 *   bodyClassName?: string,
 *   collapsible?: boolean,
 *   enableModuleExport?: boolean,
 * }} ContentOptions
 */

/**
 * @template {ContentOptions} [O=ContentOptions]
 * @augments {BaseModule<O>}
 */
class ContentModule extends BaseModule {
    /**
     * The documents and datasets a card reads (file names or dataset keys), ensured
     * through its context's store before every content pass. A card that reads none
     * leaves it empty.
     * @type {ReadonlyArray<string | {name: string}>}
     */
    static documents = [];

    /**
     * What this card reads: its class's `static documents` unless a card type names
     * them per instance.
     * @returns {ReadonlyArray<string | {name: string}>}
     */
    get documents() {
        return /** @type {typeof ContentModule} */ (this.constructor).documents;
    }

    /** @type {import('lit/directives/ref.js').Ref<HTMLDivElement>} */
    #bodyRef = createRef();
    /** @type {import('lit/directives/ref.js').Ref<HTMLHeadingElement>} */
    #titleRef = createRef();
    /** @type {import('lit/directives/ref.js').Ref<HTMLDivElement>} */
    #subtitleRef = createRef();

    /** @type {import('./moduleRuntime.js').ModuleExportControl|null} */
    #exportControl = null;
    #exportSyncQueued = false;
    /** @type {(() => void)|null} Disposes the effect that follows the toolbar's signals. */
    #headerActionsTracker = null;
    /** Whether the export control follows the signals its type and identity read. */
    #followsExportIdentity = false;

    /** @type {import('../glossary/glossaryText.js').GlossaryEntry|null} */
    #glossaryEntry = null;
    /** @type {string|null} */
    #glossaryTitle = null;
    /** @type {string|null} The glossary title as markup: a replacement's keyed runs are terms. */
    #glossaryTitleMarkup = null;
    /** @type {string|null} The last `setTitle()` text. */
    #titleOverride = null;
    /** @type {import('lit').TemplateResult|string|null} What the subtitle slot shows. */
    #subtitle = null;
    /** @type {string|null} */
    #glossaryBody = null;

    /** @returns {boolean} */
    get #expanded() {
        return !this.classList.contains('collapsed');
    }

    /** @returns {import('./moduleRuntime.js').ModuleRuntime} */
    get #runtime() {
        return this.options.context?.runtime ?? DEFAULT_RUNTIME;
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * Load the glossary entry, so the title is known before the first render, and put
     * the card classes on the element.
     * @override
     */
    _setup() {
        super._setup();
        // Through the resources, not `_teardown()`: released even when a subclass's
        // `_teardown()` throws before it reaches this one.
        this.resources.trackSubscription(() => {
            this.#headerActionsTracker?.();
            this.#exportControl?.dispose();
        });
        const glossarySubtitle = this.#loadGlossaryEntry();

        if (this.options.showModuleCard !== false) this.classList.add('module-container');
        if (!this.options.showModuleTitle) return;
        // A card without subtitle copy keeps the slot empty, for a later setSubtitle().
        const { showSubtitle, subtitle } = this.options;
        if (showSubtitle) {
            // The `subtitle` option follows the glossary copy, never replaces it.
            this.#subtitle =
                (glossarySubtitle ?? '') + (subtitle ? this.#runtime.decorateText(subtitle) : '');
        }
        this.syncExportControls();
    }

    /**
     * The card shell: without a title bar nothing (the element is the body), with one
     * the header (chevron, title, toolbar), the subtitle and the body, which is the
     * subclass's to fill.
     * @override
     * @returns {unknown}
     */
    render() {
        if (!this.options.showModuleTitle) return nothing;
        const collapsible = this.options.collapsible ?? false;
        const headerClass = { 'interactive-subtle': collapsible };
        const bodyClass = this.options.bodyClassName ? { [this.options.bodyClassName]: true } : {};
        // No whitespace around title or subtitle: it would show in the title's text, and
        // the shared `:empty` rule hides only a subtitle with none.
        const title = this.#titleTemplate();
        const subtitle = this.#subtitleTemplate();
        const titleId = collapsible && this.id ? `${this.id}-title` : nothing;
        const bodyId = collapsible && this.id ? `${this.id}-body` : nothing;
        // The view title is the page's <h1>, so every module title is an <h2>. The
        // keyboard's toggle is the chevron, named by the title: wrapping the title would
        // nest its glossary terms, which are tab stops, in a button. A pointer toggles
        // anywhere on the header.
        return html`<div
                class="content-module-header ${classMap(headerClass)}"
                @click=${this.#onHeaderClick}
            >
                ${
                    collapsible
                        ? html`<button
                              type="button"
                              class="content-module-toggle"
                              aria-expanded=${String(this.#expanded)}
                              aria-controls=${bodyId}
                              aria-labelledby=${titleId}
                          >
                              ${renderIcon('chevron_right', { className: 'content-module-chevron' })}
                          </button>`
                        : nothing
                }
                <h2 class="content-module-title" id=${titleId} ${ref(this.#titleRef)}>${title}</h2>
                <div class="content-module-header-actions">${this.#headerActionsTemplate()}</div>
            </div>
            <div class="content-module-subtitle" ${ref(this.#subtitleRef)}>${subtitle}</div>
            <div
                class="content-module-body ${classMap(bodyClass)}"
                id=${bodyId}
                ${ref(this.#bodyRef)}
            ></div>`;
    }

    /**
     * The toolbar's content: the subclass's actions, then the export control, last.
     * Built inside an effect that re-renders the shell when a signal it read changes;
     * each render replaces the effect, so it follows exactly what the latest toolbar read.
     * @returns {unknown}
     */
    #headerActionsTemplate() {
        this.#headerActionsTracker?.();
        /** @type {unknown} */
        let template;
        let built = false;
        this.#headerActionsTracker = effect(() => {
            if (built) {
                this.requestUpdate();
                return;
            }
            built = true;
            template = [this._headerActions(), this.#exportControl?.template() ?? nothing];
        });
        return template;
    }

    /**
     * The card's header actions, in display order (lit values: `headerActionButton`,
     * `headerActionDropdown`, …). Called on every shell render and tracked: the signals
     * it reads re-render the shell, and state that is no signal asks for one with
     * `requestUpdate()`. Must not change anything.
     * @protected
     * @returns {unknown}
     */
    _headerActions() {
        return nothing;
    }

    /**
     * @param {MouseEvent} event - A click in the header.
     */
    #onHeaderClick = (event) => {
        if (!this.options.collapsible) return;
        if (!eventPathMatches(event, HEADER_CONTROL, event.currentTarget)) this.toggle();
    };

    /**
     * Where a subclass renders: the `.content-module-body` div under a title bar, else
     * the element itself.
     * @returns {HTMLElement}
     */
    get contentContainer() {
        return this.#bodyRef.value ?? this;
    }

    /**
     * A card is on screen while its body is: a collapse hides the body, not the header.
     * @override
     * @returns {Element}
     */
    get _visibilityTarget() {
        return this.contentContainer;
    }

    /**
     * Wait until the content body's box has settled, before a build that measures it.
     * Nothing to wait for when the body has no layout (a hidden view, a collapsed card):
     * no box would ever settle there, and the card is drawn again when it is shown.
     * @param {Parameters<typeof waitForStableElementBox>[1]} [options] - How long to sample, and how strict "settled" is.
     * @returns {Promise<void>|null} The wait, or null — synchronously, so a caller can build at once.
     * @protected
     */
    _whenLaidOut(options) {
        const body = this.contentContainer;
        if (!body.checkVisibility()) return null;
        return waitForStableElementBox(body, options);
    }

    /**
     * The subtitle slot of the title bar, empty (and hidden) while the card shows no
     * subtitle. For reading and labelling only: the shell's template owns its content,
     * so it changes through `setSubtitle()`.
     * @returns {HTMLElement|null} Null without a title bar.
     */
    get subtitleElement() {
        return this.#subtitleRef.value ?? null;
    }

    /**
     * The title element of the title bar, for what is labelled by it. The shell's
     * template owns its content, so it changes through `setTitle()`.
     * @returns {HTMLElement|null} Null without a title bar.
     */
    get titleElement() {
        return this.#titleRef.value ?? null;
    }

    /**
     * The title the card shows: the last `setTitle()` text, else the resolved title.
     * @returns {string}
     */
    get cardTitle() {
        return this.#titleOverride || this.#resolveTitle();
    }

    /**
     * This card's export definition: null when `enableModuleExport` is false or
     * `_getExportType()` names no type.
     * @returns {import('./moduleRuntime.js').ExportControlDefinition | null}
     */
    #exportControlDefinition() {
        if (this.options.enableModuleExport === false) return null;

        const type = this._getExportType();
        if (!type) return null;

        return {
            moduleId: this.id,
            identity: this.getExportIdentity(),
            title: this.cardTitle,
            type,
            view: this.options.viewKey ?? null,
            module: this,
        };
    }

    /**
     * A collapsed card's body is `display: none`, so nothing inside it is laid
     * out and nothing would rasterize. Open it — and every collapsed card below
     * it — for the duration of the capture; opening shows the subtree, which draws
     * what it could not draw folded, and the capture waits for that to settle.
     * @override
     * @returns {Array<() => () => void>} The superclass's steps, then the opening, which re-collapses on undo.
     */
    _captureSteps() {
        const steps = super._captureSteps();
        if (this.#expanded || !this.options.showModuleTitle) return steps;
        return [
            ...steps,
            () => {
                this.expand();
                return () => this.collapse();
            },
        ];
    }

    /**
     * What this module exports as while it has something to export, else null.
     * Subclasses that can be exported override it with their type and their own
     * readiness precondition.
     * @protected
     * @returns {import('./moduleRuntime.js').ExportType | null}
     */
    _getExportType() {
        return null;
    }

    /**
     * What this module currently shows, beyond the module itself: the piece of identity
     * that goes into its export target id. An identity that changes in place (a section
     * button, a selector) must be read from state signals (`createState`), which the
     * export control follows; a plain field is enough only when a content pass changes it.
     *
     * Override it where one instance shows one of many in turn: without it two captures
     * share an id and the second overwrites the first.
     * @returns {string|Array<string|number|null|undefined>|null} Null when it shows one thing for its whole life.
     */
    getExportIdentity() {
        return null;
    }

    /**
     * Update the module title text; an empty one falls back to the resolved title.
     * Has no effect when showModuleTitle is off (no title element was built).
     * @param {string} text - The new title as plain text; it is escaped before rendering.
     */
    setTitle(text) {
        if (!this.options.showModuleTitle) return;

        this.#titleOverride = String(text ?? '');
        this.requestUpdate();
        this.syncExportControls();
    }

    /**
     * Set (or clear) the subtitle content after the shell rendered; no effect without
     * a title bar. Takes a lit-html template, or markup the caller vouches for
     * (glossary-decorated copy, every interpolated value escaped); `setTitle()` takes text.
     * @param {import('lit').TemplateResult | string | null} [content]
     */
    setSubtitle(content) {
        if (!this.options.showModuleTitle) return;
        this.#subtitle = content ?? null;
        this.requestUpdate();
    }

    /**
     * Create, update or remove this module's export control from its current state. Call
     * it when exportability changes outside a content pass.
     *
     * The sync runs once, in a microtask, however often a task asks: a render, a state
     * change and a title change in one task settle the control once, with the final id
     * and title together.
     */
    syncExportControls() {
        if (this.#exportSyncQueued) return;
        this.#exportSyncQueued = true;
        queueMicrotask(() => {
            this.#exportSyncQueued = false;
            // Only a module that renders has a toolbar to carry the control: not one
            // never connected (its setup reruns this sync), torn down, or whose
            // `_setup()` threw (a subclass's, after this sync was queued), which would
            // build a control nothing shows.
            if (this.hasUpdated && this.shouldUpdate()) this.#applyExportControls();
        });
    }

    /** Bring the export control in line with the current definition, now. */
    #applyExportControls() {
        // Only a title bar has a toolbar to carry it.
        if (!this.options.showModuleTitle) return;
        // Followed from the first sync on, not from the first control: a type whose
        // readiness is a signal that starts out null must still bring its control.
        if (this.options.enableModuleExport !== false && !this.#followsExportIdentity) {
            this.#followExportIdentity();
        }
        const exportDefinition = this.#exportControlDefinition();
        if (!exportDefinition) {
            if (!this.#exportControl) return;
            this.#exportControl.dispose();
            this.#exportControl = null;
            this.requestUpdate();
            return;
        }
        if (this.#exportControl) {
            this.#exportControl.update(exportDefinition);
            return;
        }

        this.#exportControl =
            this.#runtime.exportService.createModuleExportControl(exportDefinition);
        this.requestUpdate();
    }

    /**
     * Re-sync the export control whenever a signal `_getExportType()` or
     * `getExportIdentity()` reads changes. Flat, as `onChange` compares item by item.
     */
    #followExportIdentity() {
        this.#followsExportIdentity = true;
        this.onChange(
            () => [this._getExportType(), ...[this.getExportIdentity()].flat()],
            () => this.syncExportControls(),
        );
    }

    // ========================================================================
    // GLOSSARY INTEGRATION
    // ========================================================================
    /**
     * The visible title, decorated only when no subtitle is shown — a card says a term
     * once, and the subtitle is the better place for it. A replacement's keyed runs are
     * terms either way: they name the entry their value links to.
     * @returns {unknown}
     */
    #titleTemplate() {
        const markup =
            !this.#titleOverride && this.#glossaryTitleMarkup
                ? this.#glossaryTitleMarkup
                : escapeHtml(this.cardTitle);
        return trusted(this.options.showSubtitle ? markup : this.#runtime.decorateText(markup));
    }

    /**
     * The subtitle: a template as is, markup (a string) through `trusted()`.
     * @returns {unknown}
     */
    #subtitleTemplate() {
        const content = this.#subtitle;
        return typeof content === 'string' || content == null ? trusted(content) : content;
    }

    /**
     * The title the card shows unless `setTitle()` overrode it: the glossary title,
     * else the `title` option, else the visible missing-entry marker.
     * @returns {string}
     */
    #resolveTitle() {
        return this.#glossaryTitle || this.options.title || missingGlossaryText(this.glossaryKey);
    }

    /**
     * Resolve `glossaryKey` in the context's `glossaryData` and fill the glossary fields
     * from the entry: `title` and `body`, and hand back `subtitle`, which only setup
     * reads (the latter two decorated with popup links). A field the entry lacks becomes
     * null. `tutorial` is tour-card copy and not read here.
     * @returns {string|null} The entry's `subtitle`, decorated; null without one.
     */
    #loadGlossaryEntry() {
        const glossaryData = this.options.context?.glossaryData;
        const glossaryKey = this.glossaryKey;
        if (!glossaryKey || !glossaryData) return null;

        /** @type {import('../glossary/glossaryText.js').GlossaryEntry|null} */
        const entry = resolveDotPath(glossaryData, glossaryKey) ?? null;
        const replacements = this.options.glossaryReplacements ?? null;
        // The values are text, or runs that name their entries. The title text takes
        // them as text; the title markup, the subtitle and the body are markup, so they
        // take the values escaped and each keyed run as its entry's term.
        /**
         * @param {string} text - Glossary prose.
         * @returns {string}
         */
        const resolveText = (text) =>
            this.#runtime.decorateText(applyMarkupTokens(text, replacements));

        this.#glossaryEntry = entry;
        const title = resolveGlossaryTitle(entry);
        this.#glossaryTitle = applyTemplateTokens(title, replacements) || null;
        this.#glossaryTitleMarkup =
            applyMarkupTokens(escapeHtml(title ?? ''), replacements) || null;
        this.#glossaryBody = entry?.body ? resolveText(entry.body) : null;
        return entry?.subtitle ? resolveText(entry.subtitle) : null;
    }

    /** @returns {import('../glossary/glossaryText.js').GlossaryEntry|null} The resolved glossary entry, for a field the card reads itself (e.g. `messages`). */
    get glossaryEntry() {
        return this.#glossaryEntry;
    }

    /** @returns {string|null} The entry's `body`, decorated; null without one. */
    get glossaryBody() {
        return this.#glossaryBody;
    }

    /** @returns {string|null} Dot-notation glossary path for this module, e.g. 'app.view.card'. */
    get glossaryKey() {
        return this.options.glossaryKey ?? null;
    }

    // ========================================================================
    // CONTENT PASS
    // ========================================================================

    /**
     * Fetch what the card reads, then let the subclass fill the body. A subclass fills
     * the body in _renderBody(); one that must wait before the pass starts overrides this
     * and calls it once ready.
     * @override
     * @returns {Promise<void>}
     */
    async _renderContent() {
        // A store that already holds the documents answers at once. A card torn down
        // while it waited renders nothing.
        const required = this.documents;
        if (required.length > 0) {
            await this.#ensureDocuments(required);
            if (this.destroyed) return;
        }

        // `data` is null until a parent sets it, and null bypasses a subclass's
        // `data = {}` default parameter.
        await this._renderBody(this.data ?? {});
        this.syncExportControls();
    }

    /**
     * Render the content into `this.contentContainer`.
     * @abstract
     * @param {unknown} data
     * @returns {Promise<void>}
     * @protected
     */
    // eslint-disable-next-line no-unused-vars
    async _renderBody(data) {
        throw new Error(`ContentModule[${this.id}]: _renderBody() must be implemented by subclass`);
    }

    /**
     * Make documents readable through the context's store before the card reads them.
     * @param {ReadonlyArray<string | {name: string}>} names
     * @returns {Promise<void>} Resolves once every named document has landed.
     * @throws {Error} when the card has no context
     */
    #ensureDocuments(names) {
        const documents = this.options.context?.documents;
        if (!documents) {
            throw new Error(
                `${this.constructor.name}[${this.id}]: reads ${names.map((name) => (typeof name === 'string' ? name : name.name)).join(', ')} but has no context to read them from`,
            );
        }
        return documents.ensure(names);
    }

    // ========================================================================
    // COLLAPSIBLE API
    // ========================================================================

    /** Expand the content (show body + subtitle); the subtree is shown again. */
    expand() {
        if (!this.options.showModuleTitle || this.#expanded) return;
        this.classList.remove('collapsed');
        this.requestUpdate();
        this.refreshVisibility();
    }

    /** Collapse the content (hide body + subtitle); the subtree counts as hidden. */
    collapse() {
        if (!this.options.showModuleTitle || !this.#expanded) return;
        this.classList.add('collapsed');
        this.requestUpdate();
        this.refreshVisibility();
    }

    toggle() {
        if (this.#expanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }
}

export { ContentModule };
