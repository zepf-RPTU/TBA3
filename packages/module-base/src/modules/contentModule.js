/**
 * ContentModule — base class for titled content modules: the shared card shell of
 * title bar, optional subtitle and content body.
 *
 * When the title wrapper renders, the container's DOM `id` moves to the inner body div,
 * so a chart renderer calling `document.getElementById(host.id)` lands on the content
 * area rather than on the card. Subclasses implement `_doRenderContent(data)`.
 */

import { BaseModule } from './baseModule.js';
import { moduleRuntime } from './moduleRuntime.js';
import { eventPathHasClass } from '../utils/domBuilder.js';
import { applyTemplateTokens, MISSING_GLOSSARY_TITLE } from '../glossary/glossaryText.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { createIcon } from '../utils/icons.js';
import './contentModule.css';

class ContentModule extends BaseModule {
    // ========================================================================
    // PRIVATE FIELDS
    // ========================================================================

    /** @type {HTMLElement|null} */
    #contentContainer = null; // The inner body div where subclass content renders
    /** @type {HTMLElement|null} */
    #headerElement = null; // The .content-module-header div (for collapsible click)
    /** @type {HTMLElement|null} */
    #headerActionsElement = null; // The .content-module-header-actions div (button toolbar)
    /** @type {SVGSVGElement|null} */
    #chevronElement = null; // The chevron icon (inline SVG)
    /** @type {HTMLElement|null} */
    #titleElement = null; // The h2 title element inside the header
    /** @type {HTMLElement|null} */
    #subtitleElement = null; // The .content-module-subtitle div (built at mount or lazily via setSubtitle)
    #hasRenderedSubtitle = false; // Whether a subtitle element was created for the current header
    #expanded = true; // Current expand/collapse state
    /** @type {((e: any) => void)|null} */
    #headerClickHandler = null; // Bound click handler for cleanup

    // DI-resolved services
    #exportService;
    /** @type {(moduleId: string, identity?: string|Array<string|number|null|undefined>|null) => string} */
    #buildExportTargetId;
    /** @type {(html: string) => string} */
    #decorateText;

    // Glossary integration
    #glossaryKey; // string|null — dot-notation path, e.g. 'en.class.class-table'
    #glossaryData; // Object|null — glossary JSON object (app-specific)
    #glossaryTitle; // string|null — extracted from glossary entry 'title' field
    /** @type {string|null} The last setTitle() text — what the card shows, so what an export is named */
    #titleOverride = null;
    #glossarySubtitle; // string|null — extracted from glossary entry 'subtitle' field
    #glossaryBody; // string|null — extracted from glossary entry 'body' field
    #glossaryElementTexts; // Object|null — extracted from glossary entry 'element_texts' field

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    /**
     * @param {string} id - Unique identifier
     * @param {string|HTMLElement|null} [container] - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options (glossaryKey, glossaryData, glossaryReplacements, …; see class JSDoc)
     */
    constructor(id, container = null, options = {}) {
        super(id, container, options);

        this.#exportService = moduleRuntime().exportService;
        this.#buildExportTargetId = moduleRuntime().buildExportTargetId;
        this.#decorateText = moduleRuntime().decorateText;

        // Glossary integration
        this.#glossaryKey = options.glossaryKey ?? null;
        this.#glossaryData = options.glossaryData ?? null;
        this.#glossaryTitle = null;
        this.#glossarySubtitle = null;
        this.#glossaryBody = null;
        this.#glossaryElementTexts = null;
    }

    // ========================================================================
    // LIFECYCLE — mount builds title structure, glossary loaded before render
    // ========================================================================

    /**
     * Mount the module — builds the structural DOM (title wrapper, empty body)
     * synchronously. After mount(), the titled card shell is visible but the
     * content area is empty. Loads glossary info so the title is available.
     * @override
     * @param {object} [data] - Initialization data
     */
    mount(data) {
        if (this.mounted) return;

        // Auto-load glossary info before building title
        if (this.#glossaryKey && this.#glossaryData) {
            this.loadInfoFromGlossary();
        }

        super.mount(data);

        // Build the structural shell (title wrapper + empty body)
        this.#mountContentShell();
    }

    /**
     * Initialize the module. Loads glossary info (if configured) before
     * handing off to the parent lifecycle so that `_doRender()` can read
     * `glossaryTitle` / `glossarySubtitle` for the title bar.
     * @override
     * @param {object} [data] - Initialization data
     * @returns {Promise<void>}
     */
    async init(data) {
        // Auto-load glossary info if both key and data are available
        if (this.#glossaryKey && this.#glossaryData) {
            this.loadInfoFromGlossary();
        }

        return super.init(data);
    }

    /**
     * The content container where subclass content should be rendered.
     * When the wrapper is active, this is the inner `.content-module-body` div.
     * When the wrapper is skipped, this falls back to `this.container`.
     * @returns {HTMLElement} The inner body div when the wrapper is active, otherwise the module container itself.
     */
    get contentContainer() {
        return /** @type {HTMLElement} */ (this.#contentContainer || this.container);
    }

    /**
     * The subtitle element, if one has been rendered (at mount or via setSubtitle).
     * Lets subclasses attach a delegated listener to dynamic subtitle content.
     * @returns {HTMLElement|null} The subtitle element, or null when none has been rendered.
     */
    get subtitleElement() {
        return this.#subtitleElement;
    }

    /**
     * Whether the module is currently expanded (always true if not collapsible).
     * @returns {boolean} True when the body is showing; always true for a non-collapsible module.
     */
    get isExpanded() {
        return this.#expanded;
    }

    /**
     * The header actions container for placing buttons (export, toggles, etc.)
     * in the title bar.
     * Returns null when showModuleTitle is off, or when the resolved title is empty.
     * @returns {HTMLElement|null} The toolbar element, or null when there is no title bar to hang it in.
     */
    get headerActionsContainer() {
        return this.#ensureHeaderActionsElement();
    }

    /**
     * Export control definition for this content module.
     * Return null to keep the module non-exportable.
     * Subclasses should override this when they explicitly opt into export UI.
     *
     * Supported fields:
     * - id {string} Stable export target id used for batch selection
     * - title {string} Human-readable label used for metadata / filenames
     * - type {string} Optional target type label for selection metadata
     * - container {string|HTMLElement|null} Optional export capture target metadata
     * @returns {object | null} The export target descriptor, or null to keep the module non-exportable.
     */
    getExportControlDefinition() {
        return null;
    }

    /**
     * Build this module's export target id through the registered export runtime.
     * Subclasses that assemble their own descriptor go through this rather than
     * importing the id builder, so a host that registers no export service keeps
     * the whole export graph out of its bundle.
     * @protected
     * @param {string|Array<string|number|null|undefined>|null} [identity] - What the capture depicts, beyond the module itself.
     * @returns {string} A stable id for the capture.
     */
    _buildExportTargetId(identity = null) {
        return this.#buildExportTargetId(this.id, identity);
    }

    /**
     * The export descriptor every exportable ContentModule builds the same way —
     * the target id from `getExportIdentity()`, the title the card shows (a
     * `setTitle()` override first, then the glossary title over the option title),
     * the body container as the capture target. Subclasses add only their own
     * precondition and `type`.
     * @protected
     * @param {string} type - The target type label for selection metadata (`'table'`, `'info-box'`, …).
     * @returns {{id: string, title: string, type: string, container: string|HTMLElement|null}} The descriptor `getExportControlDefinition()` returns.
     */
    _buildExportControlDefinition(type) {
        return {
            id: this._buildExportTargetId(this.getExportIdentity()),
            title:
                this.#titleOverride ||
                this.glossaryTitle ||
                this.getOption('title') ||
                MISSING_GLOSSARY_TITLE,
            type,
            container: this.contentContainer?.id || this.contentContainer || null,
        };
    }

    /**
     * What this module currently shows, beyond the module itself — the piece of
     * identity that goes into its export target id (`buildExportTargetId`).
     *
     * `null` means "this module shows one thing for its whole life", which is
     * the only case a bare `module-<id>` is correct for. Override it wherever
     * one instance shows one of many in turn (a selected student, a Leitidee,
     * an InfoBox section): without it the two captures share an id and the
     * second overwrites the first.
     *
     * Whatever changes the identity must also call `syncExportControls()` — the
     * id is only re-read on a sync, so an in-place update that skips it leaves
     * the checkbox ticking the previous entity.
     * @returns {string|Array<string|number|null|undefined>|null} What the module currently shows, or null when it shows one thing for its whole life.
     */
    getExportIdentity() {
        return null;
    }

    /**
     * Update the module title text.
     * Has no effect when showModuleTitle is off (no title element was built).
     * Preserves the initial title rendering rule: annotate only when no subtitle rendered.
     * @param {string} text - The new title as plain text; it is escaped before rendering.
     */
    setTitle(text) {
        if (!this.#titleElement) return;

        this.#titleOverride = text == null ? '' : String(text);
        this.#renderTitle(text);

        this.syncExportControls();
    }

    /**
     * Set (or clear) the subtitle content after mount.
     * Symmetric with setTitle(). Lazily creates the .content-module-subtitle
     * element (inserted between header and body) the first time it is needed.
     * An empty string leaves the element empty, which the shared
     * `.content-module-subtitle:empty { display:none }` rule hides.
     * Does not alter the already-rendered title (no retroactive re-annotation).
     * Unlike setTitle(), which takes text and escapes it, this takes markup: the
     * caller escapes every interpolated value before handing it over.
     * @param {string} [content] - Subtitle HTML, already escaped where it carries data.
     */
    setSubtitle(content) {
        const html = content == null ? '' : String(content);

        let el = this.#subtitleElement;
        if (!el) {
            if (!html) return; // nothing to show and no element yet — no-op
            if (!this.#contentContainer) return; // structure not built yet
            // Title-less modules use the container itself as the content area, so
            // there is no header slot to insert a subtitle before (and
            // insertBefore(el, this.container) would throw). No-op instead.
            if (this.#contentContainer === this.container) return;
            el = document.createElement('div');
            el.className = 'content-module-subtitle';
            this.#subtitleElement = el;
            this.container?.insertBefore(el, this.#contentContainer);
        }

        el.innerHTML = html;
    }

    /**
     * Re-evaluate this module's export controls against its current state.
     * Use when child-owned lifecycle changes affect exportability after render.
     */
    syncExportControls() {
        this.#syncExportControls();
    }

    // ========================================================================
    // GLOSSARY INTEGRATION
    // ========================================================================
    /**
     * Resolve subtitle HTML: the glossary subtitle first, then the explicit
     * `subtitle` option appended after it. The option never replaces glossary copy.
     * @returns {string} The subtitle markup, or an empty string when the module shows none.
     */
    #resolveSubtitleContent() {
        if (!this.getOption('showSubtitle', false)) {
            return '';
        }

        const explicitSubtitle = this.getOption('subtitle');
        return (
            (this.glossarySubtitle || '') +
            (explicitSubtitle ? this.#decorateText(explicitSubtitle) : '')
        );
    }

    /**
     * Render the visible title text, decorating it only when no subtitle is shown —
     * a card says a term once, and the subtitle is the better place for it.
     * @param {*} text - The title to render; coerced to a string.
     */
    #renderTitle(text) {
        if (!this.#titleElement) {
            return;
        }

        const normalizedText = text == null ? '' : String(text);

        if (!this.#hasRenderedSubtitle) {
            this.#titleElement.innerHTML = this.#decorateText(escapeHtml(normalizedText));
            return;
        }

        this.#titleElement.textContent = normalizedText;
    }

    /**
     * Load info content from glossary by dot-notation path.
     * Walks `glossaryData` using the dot-notation `glossaryPath` and extracts
     * the following fields from the resolved entry:
     * - `title`         → `glossaryTitle`
     * - `subtitle`      → `glossarySubtitle` (annotated with interactive popup links)
     * - `body`          → `glossaryBody` (annotated with interactive popup links)
     * - `element_texts` → `glossaryElementTexts` (sub-component label map)
     *
     * `tutorial` is deliberately not read here: it is tour-card copy,
     * resolved by src/common/modules/tutorial/glossaryTutorial.js.
     * @param {string} [glossaryPath=this.glossaryKey] - e.g., 'en.class.class-table'
     * @param {object} [glossaryData=this.glossaryData] - Glossary JSON object to traverse
     * @param {object | null} [replacements=this.getOption('glossaryReplacements') ?? null] - Placeholder values substituted into the resolved glossary text.
     */
    loadInfoFromGlossary(
        glossaryPath = this.#glossaryKey,
        glossaryData = this.#glossaryData,
        replacements = this.getOption('glossaryReplacements') ?? null,
    ) {
        if (!glossaryPath || !glossaryData) return;

        const parts = glossaryPath.split('.');
        let entry = glossaryData;

        for (const part of parts) {
            if (entry && typeof entry === 'object' && Object.hasOwn(entry, part)) {
                entry = entry[part];
            } else {
                entry = null;
                break;
            }
        }

        const resolveGlossaryText = (text) => applyTemplateTokens(text, replacements);

        const resolvedTitle = resolveGlossaryText(entry?.title ?? null);
        if (resolvedTitle) {
            this.#glossaryTitle = resolvedTitle;
        }
        if (entry?.subtitle) {
            // Annotate glossary terms within the subtitle for interactive popups
            this.#glossarySubtitle = this.#decorateText(resolveGlossaryText(entry.subtitle));
        }
        if (entry?.body) {
            // Annotate glossary terms within the body for interactive popups
            this.#glossaryBody = this.#decorateText(resolveGlossaryText(entry.body));
        }

        if (entry?.element_texts && typeof entry.element_texts === 'object') {
            this.#glossaryElementTexts = entry.element_texts;
        }
    }

    /** @returns {string|null} Glossary title extracted from the glossary entry's 'title' field. */
    get glossaryTitle() {
        return this.#glossaryTitle;
    }

    /** @returns {string|null} Glossary subtitle extracted from the glossary entry's 'subtitle' field. */
    get glossarySubtitle() {
        return this.#glossarySubtitle;
    }

    /** @returns {string|null} Glossary body extracted from the glossary entry's 'body' field. */
    get glossaryBody() {
        return this.#glossaryBody;
    }

    /** @returns {object | null} Glossary element_texts map for sub-component labels. */
    get glossaryElementTexts() {
        return this.#glossaryElementTexts;
    }

    /** @returns {string|null} Dot-notation glossary path for this module. */
    get glossaryKey() {
        return this.#glossaryKey;
    }

    /** @param {string|null} value - Dot-notation glossary path. */
    set glossaryKey(value) {
        this.#glossaryKey = value;
    }

    /** @returns {object | null} Glossary JSON data object for this module. */
    get glossaryData() {
        return this.#glossaryData;
    }

    // ========================================================================
    // LIFECYCLE — _doRender delegates to _doRenderContent
    // ========================================================================

    /**
     * Render the module. Builds the title wrapper if not already built by mount(),
     * then delegates to _doRenderContent() for subclass-specific content.
     * Do not override in subclasses; implement _doRenderContent() instead.
     * @override
     * @param {*} data - Data payload from parent view
     * @returns {Promise<void>}
     */
    async _doRender(data) {
        // Build structural shell if not already done by mount()
        if (!this.mounted) {
            this.#mountContentShell();
        }

        // Delegate to subclass for actual content
        // Normalize null → {} so subclass default parameters (data = {}) fire correctly.
        // getData() returns null when no data was ever set, which bypasses = {} defaults.
        const result = await this._doRenderContent(data ?? {});
        this.syncExportControls();
        return result;
    }

    /**
     * Subclass rendering implementation.
     * Called after the wrapper (if any) is built.
     * Subclasses must render into `this.contentContainer`.
     * @param {*} data - Data payload
     * @returns {Promise<void>}
     * @abstract
     * @protected
     */
    // eslint-disable-next-line no-unused-vars
    async _doRenderContent(data) {
        throw new Error(
            `ContentModule[${this.id}]: _doRenderContent() must be implemented by subclass`,
        );
    }

    // ========================================================================
    // COLLAPSIBLE API
    // ========================================================================

    /**
     * Expand the content (show body + subtitle).
     */
    expand() {
        if (!this.#headerElement || this.#expanded) return;
        this.#expanded = true;
        this.container?.classList.remove('collapsed');
        if (this.#chevronElement) {
            this.#chevronElement.classList.add('expanded');
        }
    }

    /**
     * Collapse the content (hide body + subtitle).
     */
    collapse() {
        if (!this.#headerElement || !this.#expanded) return;
        this.#expanded = false;
        this.container?.classList.add('collapsed');
        if (this.#chevronElement) {
            this.#chevronElement.classList.remove('expanded');
        }
    }

    /**
     * Toggle expand/collapse state.
     */
    toggle() {
        if (this.#expanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }

    /**
     * @override
     */
    destroy() {
        // Remove any export buttons placed in the header actions slot so their
        // document-level click listeners (dropdown close handlers) are cleaned up.
        if (this.#headerActionsElement) {
            this.#exportService.removeModuleExportButton(this.#headerActionsElement);
        }
        super.destroy();
    }

    /**
     * Build the structural shell of the content module — card class, title
     * wrapper (if enabled), and the content container. Idempotent.
     */
    #mountContentShell() {
        const container = this.container;
        if (!container) return;
        // Ensure every ContentModule container gets the shared card class
        if (this.getOption('showModuleCard', true)) {
            container.classList.add('module-container');
        }

        const showTitle = this.getOption('showModuleTitle', false);

        if (!showTitle) {
            this.#contentContainer = container;
            return;
        }

        const title = this.glossaryTitle || this.getOption('title') || MISSING_GLOSSARY_TITLE;

        if (!title) {
            this.#contentContainer = container;
            return;
        }

        // Build header/body DOM only once
        if (!this.#headerElement) {
            this.#buildContent(title);
        }
    }

    /**
     * Build header + body DOM directly inside this.container.
     * Transfers the container's id to the body div.
     * @param {string} title - Resolved title text
     */
    #buildContent(title) {
        const collapsible = this.getOption('collapsible', false);
        const startCollapsed = this.getOption('startCollapsed', false);
        this.#expanded = !startCollapsed;

        const container = this.container;
        if (!container) return;

        if (startCollapsed) {
            container.classList.add('collapsed');
        }

        // --- Header ---
        const header = document.createElement('div');
        header.className =
            'content-module-header' + (collapsible ? ' collapsible interactive-subtle' : '');
        this.#headerElement = header;

        // Chevron (only if collapsible)
        if (collapsible) {
            const chevron = createIcon('chevron_right', {
                className: 'content-module-chevron' + (this.#expanded ? ' expanded' : ''),
            });
            header.appendChild(chevron);
            this.#chevronElement = chevron;

            // Click handler — guard against clicks on action buttons in the toolbar.
            // Path-based, not `e.target.closest(...)`: a menu row that rebuilds its
            // dropdown on click is detached by the time the event bubbles here, and
            // `closest()` on it would find nothing and collapse the module.
            this.#headerClickHandler = (e) => {
                if (!eventPathHasClass(e, 'content-module-header-actions')) this.toggle();
            };
            this.resources.trackDomListener(header, 'click', this.#headerClickHandler);
        }

        // --- Subtitle (optional) ---
        const subtitleContent = this.#resolveSubtitleContent();
        let subtitleEl = null;
        if (subtitleContent) {
            subtitleEl = document.createElement('div');
            subtitleEl.className = 'content-module-subtitle';
            subtitleEl.innerHTML = subtitleContent;
            this.#subtitleElement = subtitleEl;
        }
        this.#hasRenderedSubtitle = Boolean(subtitleEl);

        // Title
        // The view title is the page's <h1>, so every module title is an <h2>.
        const titleEl = document.createElement('h2');
        titleEl.className = 'content-module-title';
        this.#titleElement = titleEl;
        this.#renderTitle(title);
        header.appendChild(titleEl);

        // --- Body (content area) ---
        const body = document.createElement('div');
        body.className = 'content-module-body';

        // ID transfer: move the container's id to the body div so that
        // chart renderers using document.getElementById(host.id) find
        // the correct content area.
        if (container.id === this.id) {
            container.removeAttribute('id');
        }
        body.id = this.id;

        this.#contentContainer = body;

        // Append directly to container
        container.innerHTML = '';
        container.appendChild(header);
        if (subtitleEl) container.appendChild(subtitleEl);
        container.appendChild(body);

        this.#syncExportControls();
    }

    /**
     * Ensure the header actions toolbar exists when a consumer needs it.
     * Created lazily so modules with no header actions don't render an empty div.
     * @returns {HTMLElement|null} The toolbar, created on first use; null when there is no title bar to hang it in.
     */
    #ensureHeaderActionsElement() {
        if (this.#headerActionsElement) {
            return this.#headerActionsElement;
        }

        if (!this.#headerElement || !this.#titleElement) {
            return null;
        }

        const actionsEl = document.createElement('div');
        actionsEl.className = 'content-module-header-actions';
        this.#headerElement.appendChild(actionsEl);
        this.#headerActionsElement = actionsEl;

        return actionsEl;
    }

    /**
     * Create or remove this module's export controls in its local header toolbar.
     * Export placement is intentionally owned by ContentModule so child modules
     * do not append export buttons into arbitrary external containers.
     */
    #syncExportControls() {
        const exportDefinition = this.getExportControlDefinition();
        if (!exportDefinition) {
            this.#exportService.removeModuleExportButton(this.#headerActionsElement);
            return;
        }

        const headerActions = this.#ensureHeaderActionsElement();
        if (!headerActions) return;

        this.#exportService.createModuleExportButton(exportDefinition, {
            targetContainer: headerActions,
        });
    }
}

export { ContentModule };
