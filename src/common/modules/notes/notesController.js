/**
 * NotesController — the per-app notes drawer, built on first use and destroyed with the app.
 *
 * A draggable slide-in drawer hosting a Quill editor. The drawer is a `popover="manual"`:
 * the top layer without a modal's inert page or light dismiss, so the page stays
 * usable beside it and only its ✕, the header toggle or an Escape nothing else claims
 * close it. The page model and its persistence are NotesStore's, the one editor per notebook
 * notesEditLock.js's, the module links notesLinkMenu.js's, drag and resize
 * drawerGestures.js's, the Markdown export notesMarkdown.js's; this class owns the
 * tabs, the editor and the wiring. While another tab edits the notebook the drawer
 * shows it read-only, follows that tab's saves, and offers to take it over.
 */

import Quill from 'quill';
import { confirmDialog, isUnclaimedEscape } from '@tba3/modules/overlays';
import { NotesStore } from './notesStore.js';
import { NotesEditLock } from './notesEditLock.js';
import { notesToMarkdown } from './notesMarkdown.js';
import { buildExportFileName, triggerDownload } from '../../export/exportFiles.js';
import { wireNotesLinks } from './notesLinkMenu.js';
import { MODULE_LINK_FORMAT, registerModuleLinkBlot } from './moduleLinkBlot.js';
import {
    cycleSize,
    dockToOtherSide,
    keepWithinViewport,
    wireDrag,
    wireResize,
} from './drawerGestures.js';
import { handleTabKeydown, noticeCallout, renderIcon, requireEl } from '@tba3/module-base';
import { html, nothing, render } from 'lit';

import { ref } from 'lit/directives/ref.js';
import { repeat } from 'lit/directives/repeat.js';
import './notesController.css';

/** Element ids the drawer's ARIA wiring needs. */
const TITLE_ID = 'notes-drawer-title';
/** The line under the editor that says how the keyboard leaves it. */
const HINT_ID = 'notes-drawer-hint';
const EDITOR_ID = 'notes-drawer-editor';
const TAB_ID_PREFIX = 'notes-drawer-tab-';

registerModuleLinkBlot(Quill);

/**
 * The drawer's editor, built on its first show().
 * @typedef {object} DrawerParts
 * @property {HTMLElement} editorEl - The editor's element, the tab panel.
 * @property {Quill} quill
 */

export class NotesController {
    /** @type {DrawerParts|null} */
    #drawer = null;

    /** @type {HTMLElement|null} The drawer, built on its first show(). */
    #root = null;

    /** @type {string|null} The page whose tab an inline rename input stands in for. */
    #renamingPageId = null;

    /** @type {(active: boolean) => void} */
    #onActiveChange;

    /** @type {NotesStore} */
    #store;

    /** @type {NotesEditLock} Held while the drawer is open; without it the drawer is read-only. */
    #lock;

    /** Whether a show() is waiting for the lock's answer. */
    #opening = false;

    /** @type {import('./notesLinkMenu.js').NotesLinkDeps} */
    #linkDeps;

    /** @type {import('@tba3/modules/context').GlossaryAnnotator} The app's glossary, which words the drawer. */
    #glossary;

    /** @type {{id: string, label: string}} The dataset whose notebook this is. */
    #dataset;

    /** @type {string} */
    #appId;

    /** @type {HTMLElement|null} Where focus was when the drawer opened; it goes back there on close. */
    #returnFocusTo = null;

    /** The page listeners the controller adds; destroy() removes them. */
    #listeners = new AbortController();

    /**
     * @param {object} deps
     * @param {string} deps.appId - Dashboard id ('en'|'ma'|'sl'); with the dataset it keys the notebook.
     * @param {{id: string, label: string}} deps.dataset - The dataset the page shows; each has its own notebook.
     * @param {import('@tba3/modules/context').GlossaryAnnotator} deps.glossary - The app's glossary, which words the drawer and its link menu.
     * @param {(active: boolean) => void} deps.onActiveChange - Told whenever the drawer opens or closes, so the app can sync its toggle.
     * @param {Array<{viewType: string, label: string}>} deps.views - Every view of the app, in sidebar order, for the link dropdown.
     * @param {(viewType: string) => Array<{id: string, label: string, element: HTMLElement}> | null} deps.getLinkTargets - The linkable modules of a view; null for a view not rendered this session.
     * @param {(viewType: string) => Promise<void>} deps.onNavigate - Switch the dashboard to a view and wait until it is revealed.
     */
    constructor({ appId, dataset, glossary, onActiveChange, views, getLinkTargets, onNavigate }) {
        this.#glossary = glossary;
        this.#appId = appId;
        this.#dataset = dataset;
        this.#store = new NotesStore({ appId, scope: dataset.id });
        this.#lock = new NotesEditLock(this.#store.key, () => this.#onEditingChange());
        this.#linkDeps = { glossary, views, getLinkTargets, onNavigate };
        this.#onActiveChange = onActiveChange;

        const { signal } = this.#listeners;
        window.addEventListener(
            'resize',
            () => {
                if (this.#root) keepWithinViewport(this.#root);
            },
            { signal },
        );
        // The drawer is dismissible, so an Escape nothing else claimed closes it from
        // anywhere on the page, as it closes the rail: a drawer covering what focus is on
        // would otherwise need the pointer to go.
        document.addEventListener(
            'keydown',
            (event) => {
                if (!this.#isOpen() || !isUnclaimedEscape(event)) return;
                event.preventDefault();
                this.#hide();
            },
            { signal },
        );
        // The editing tab saved: a reader follows along.
        window.addEventListener(
            'storage',
            (event) => {
                if (event.key === this.#store.key && !this.#lock.editing && this.#isOpen()) {
                    this.#refresh();
                }
            },
            { signal },
        );
    }

    /** Take the drawer down with the app: the drawer, its lock and the page listeners. */
    destroy() {
        this.#listeners.abort();
        this.#hide();
        this.#lock.release();
        this.#root?.remove();
        this.#root = null;
    }

    /**
     * @param {string} key - Entry under `general.buttons.element_texts`.
     * @returns {string}
     */
    #buttonText(key) {
        return this.#glossary.getRequiredEntryText(`general.buttons.element_texts.${key}`);
    }

    /** @returns {Promise<void>} Settles once the drawer is open or closed. */
    async toggle() {
        if (this.#isOpen()) {
            this.#hide();
        } else {
            await this.#show();
        }
    }

    /** @returns {boolean} Whether the drawer is on screen. */
    #isOpen() {
        return this.#root?.matches(':popover-open') ?? false;
    }

    /** Open the drawer once the lock has answered, so it opens in the mode it stays in. */
    async #show() {
        if (this.#opening) return;
        this.#opening = true;
        try {
            await this.#lock.acquire();
        } finally {
            this.#opening = false;
        }
        if (this.#listeners.signal.aborted) return;
        const root = this.#root ?? this.#build();
        this.#refresh();
        root.showPopover();
        keepWithinViewport(root);
        this.#returnFocusTo = /** @type {HTMLElement|null} */ (document.activeElement);
        this.#focusDrawer();
        this.#onActiveChange(true);
    }

    /** Close the drawer and leave the notebook to the next tab; a no-op while it is closed. */
    #hide() {
        const root = this.#root;
        if (!root?.matches(':popover-open')) return;
        // Read before hiding: a hidden drawer no longer holds focus.
        const hadFocus = root.contains(document.activeElement);
        root.hidePopover();
        this.#lock.release();
        // Only when focus was still in the drawer: a click elsewhere that closed it has
        // already put focus where the user wants it.
        if (hadFocus) this.#returnFocusTo?.focus();
        this.#onActiveChange(false);
    }

    /** @returns {HTMLElement} The drawer, appended to the body and filled. */
    #build() {
        const root = document.createElement('div');
        root.className = 'notes-drawer';
        root.popover = 'manual';
        document.body.append(root);
        this.#root = root;
        this.#buildContent(root);
        return root;
    }

    /**
     * The drawer's parts. Everything that reads them runs once the drawer is shown,
     * which builds it first.
     * @returns {DrawerParts}
     */
    #built() {
        if (!this.#drawer) throw new Error('NotesController: the drawer is not built yet');
        return this.#drawer;
    }

    /** Focus the editor, or the take-over button while the notebook is read-only. */
    #focusDrawer() {
        if (this.#lock.editing) {
            this.#built().quill.focus();
        } else {
            requireEl(/** @type {HTMLElement} */ (this.#root), '.notes-drawer-take-over').focus();
        }
    }

    /**
     * Show the stored notebook afresh, editable only while this tab holds the lock.
     * Called with the drawer built.
     */
    #refresh() {
        const editing = this.#lock.editing;
        this.#store.readOnly = !editing;
        this.#store.reload();
        if (!editing) this.#renamingPageId = null;
        /** @type {HTMLElement} */ (this.#root).toggleAttribute('data-read-only', !editing);
        this.#built().quill.enable(editing);
        this.#showActivePage();
    }

    /** This tab became the notebook's editor, or another tab took it over. */
    #onEditingChange() {
        // A drawer still opening refreshes once it has the answer.
        const root = this.#root;
        if (!root || !this.#isOpen()) return;
        const hadFocus = root.contains(document.activeElement);
        this.#refresh();
        if (hadFocus) this.#focusDrawer();
    }

    /**
     * Show what the store now has active: the tabs, and the page in the editor. The undo
     * history starts over: it records the load like an edit, so an undo would put the
     * previous page's text back into this one.
     */
    #showActivePage() {
        this.#renderDrawer();
        const { quill } = this.#built();
        quill.setContents(this.#store.activePage.delta.ops, 'silent');
        quill.history.clear();
    }

    /** @param {string} pageId */
    #selectPage(pageId) {
        if (this.#store.select(pageId)) this.#showActivePage();
    }

    #addPage() {
        this.#store.add();
        this.#showActivePage();
    }

    /** Delete the active page; one with content asks first. */
    async #deleteActivePage() {
        if (
            this.#store.activeHasContent() &&
            !(await confirmDialog({
                glossary: this.#glossary,
                labelKey: 'general.buttons.element_texts.note-delete.label',
                messageKey: 'general.messages.confirm-delete-note',
                confirmKey: 'general.buttons.element_texts.notes-delete-confirm.label',
            }))
        ) {
            return;
        }
        // Another tab may have taken the notebook over while the dialog was open.
        if (!this.#lock.editing) return;
        this.#store.removeActive();
        this.#showActivePage();
    }

    /** Download this dataset's pages as one Markdown file. */
    #exportPages() {
        const markdown = notesToMarkdown(this.#store.pages);
        const fileName = buildExportFileName({
            appId: this.#appId,
            title: `${this.#buttonText('notes-title.label')} ${this.#dataset.label}`,
            ext: 'md',
        });
        triggerDownload(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), fileName);
    }

    /** Remove every page of this dataset; a notebook with anything to lose asks first. */
    async #confirmClearAll() {
        if (
            this.#store.hasContent() &&
            !(await confirmDialog({
                glossary: this.#glossary,
                labelKey: 'general.buttons.element_texts.notes-clear.label',
                messageKey: 'general.messages.confirm-clear-notes',
                confirmKey: 'general.buttons.element_texts.notes-delete-confirm.label',
            }))
        ) {
            return;
        }
        if (!this.#lock.editing) return;
        this.#renamingPageId = null;
        this.#store.clearAll();
        this.#showActivePage();
    }

    /**
     * Render the drawer's chrome, page tabs and page controls; the editor element is
     * the one Quill was mounted on. A re-render patches what is on screen.
     *
     * The page controls trail the strip instead of sitting between the tabs: a tablist
     * may own tabs and nothing else. The pencil is the only rename affordance a keyboard
     * can reach: a tab's dblclick is a shortcut no key produces. While a page is being
     * renamed an input stands in for its tab, and for that long the strip is not a tab
     * list.
     * @param {HTMLElement} root
     * @param {HTMLElement} editorEl - The editor's element, the tab panel.
     */
    #render(root, editorEl) {
        const { pages, activePageId } = this.#store;
        const { editing } = this.#lock;
        const renaming = this.#renamingPageId !== null;
        const renameTooltip = this.#buttonText('note-rename.tooltip');
        const deleteLabel = this.#buttonText('note-delete.label');
        const addLabel = this.#buttonText('note-add.label');
        const exportLabel = this.#buttonText('notes-export.label');
        const clearLabel = this.#buttonText('notes-clear.label');
        const dockLabel = this.#buttonText('notes-dock.label');
        const sizeLabel = this.#buttonText('notes-size.label');
        const tabs = repeat(
            pages,
            (page) => page.id,
            (page, index) =>
                page.id === this.#renamingPageId
                    ? this.#renameInputTemplate(page, index)
                    : this.#tabTemplate(page, index, page.id === activePageId),
        );
        editorEl.setAttribute('aria-labelledby', `${TAB_ID_PREFIX}${activePageId}`);
        this.#drawer?.quill.root.setAttribute(
            'aria-labelledby',
            `${TITLE_ID} ${TAB_ID_PREFIX}${activePageId}`,
        );
        render(
            html`
                <div class="notes-drawer-header">
                    <span class="notes-drawer-title" id=${TITLE_ID}
                        >${this.#buttonText('notes-title.label')}</span
                    >
                    <div class="notes-drawer-header-actions">
                        <button
                            type="button"
                            class="btn btn--icon"
                            aria-label=${dockLabel}
                            data-tooltip-text=${dockLabel}
                            @click=${this.#onDock}
                        >
                            ${renderIcon('swap_horiz')}
                        </button>
                        <button
                            type="button"
                            class="btn btn--icon"
                            aria-label=${sizeLabel}
                            data-tooltip-text=${sizeLabel}
                            @click=${this.#onSize}
                        >
                            ${renderIcon('zoom_in')}
                        </button>
                        <button
                            type="button"
                            class="btn btn--icon"
                            aria-label=${exportLabel}
                            data-tooltip-text=${exportLabel}
                            @click=${this.#onExport}
                        >
                            ${renderIcon('download')}
                        </button>
                        <button
                            type="button"
                            class="btn btn--icon"
                            aria-label=${clearLabel}
                            data-tooltip-text=${clearLabel}
                            ?disabled=${!editing}
                            @click=${this.#onClearAll}
                        >
                            ${renderIcon('clear_all')}
                        </button>
                        <button
                            type="button"
                            class="btn btn--icon"
                            aria-label=${this.#buttonText('notes-close.label')}
                            @click=${this.#onClose}
                        >
                            ${renderIcon('close')}
                        </button>
                    </div>
                </div>
                <div class="notes-drawer-tabs">
                    <div
                        class="tab-strip notes-drawer-tablist"
                        role=${renaming ? 'none' : 'tablist'}
                        aria-label=${this.#buttonText('notes-pages.label')}
                        @click=${this.#onTabClick}
                        @dblclick=${this.#onTabDblclick}
                        @keydown=${this.#onTabKeydown}
                    >
                        ${tabs}
                    </div>
                    <div class="notes-drawer-tab-actions">
                        <button
                            type="button"
                            class="notes-drawer-tab-rename"
                            aria-label=${this.#buttonText('note-rename.label')}
                            data-tooltip-text=${renameTooltip}
                            @click=${this.#onRename}
                        >
                            ${renderIcon('edit')}
                        </button>
                        <button
                            type="button"
                            class="notes-drawer-tab-delete"
                            aria-label=${deleteLabel}
                            data-tooltip-text=${deleteLabel}
                            ?hidden=${pages.length < 2}
                            @click=${this.#onDelete}
                        >
                            ×
                        </button>
                        <button
                            type="button"
                            class="notes-drawer-tab-add"
                            aria-label=${addLabel}
                            data-tooltip-text=${addLabel}
                            @click=${this.#onAdd}
                        >
                            +
                        </button>
                    </div>
                </div>
                ${editing ? nothing : this.#readOnlyNotice()} ${editorEl}
                <p class="notes-drawer-hint" id=${HINT_ID}>
                    ${this.#glossary.getRequiredEntryText('general.messages.notes-keyboard-hint')}
                </p>
                <div class="notes-drawer-resize-handle" aria-hidden="true"></div>
            `,
            root,
        );
    }

    /** @returns {import('lit').TemplateResult} What stands in for the toolbar while another tab edits. */
    #readOnlyNotice() {
        return noticeCallout({
            role: 'status',
            className: 'notes-drawer-read-only',
            message: this.#glossary.getRequiredEntryText('general.messages.notes-read-only'),
            detail: html`<button
                type="button"
                class="btn btn--text btn--size-control notes-drawer-take-over"
                @click=${this.#onTakeOver}
            >
                ${this.#buttonText('notes-take-over.label')}
            </button>`,
        });
    }

    /**
     * One page's tab. The label goes in as `textContent`, so the formatter's line breaks
     * stay out of the tab's text.
     * @param {import('./notesStore.js').NotesPage} page
     * @param {number} index - Its position; an unnamed page shows its number.
     * @param {boolean} selected - Whether it is the active page.
     * @returns {import('lit').TemplateResult}
     */
    #tabTemplate(page, index, selected) {
        return html`<button
            type="button"
            class="tab-strip-tab notes-drawer-tab"
            role="tab"
            id=${`${TAB_ID_PREFIX}${page.id}`}
            aria-controls=${EDITOR_ID}
            aria-selected=${String(selected)}
            tabindex=${selected ? '0' : '-1'}
            data-page-id=${page.id}
            data-tooltip-text=${this.#buttonText('note-rename-hint.tooltip')}
            .textContent=${page.name || String(index + 1)}
        ></button>`;
    }

    /**
     * The inline input standing in for the tab of the page being renamed. Enter and
     * blur commit, Escape cancels; an emptied name falls back to the page's number.
     * @param {import('./notesStore.js').NotesPage} page
     * @param {number} index - Its position, the placeholder.
     * @returns {import('lit').TemplateResult}
     */
    #renameInputTemplate(page, index) {
        return html`<input
            type="text"
            class="control-input notes-drawer-tab-input"
            .value=${page.name ?? ''}
            placeholder=${String(index + 1)}
            aria-label=${this.#buttonText('note-rename.label')}
            @keydown=${this.#onRenameKeydown}
            @blur=${this.#onRenameBlur}
            ${ref(this.#focusRenameInput)}
        />`;
    }

    /** Re-render the drawer from the store, once it is built. */
    #renderDrawer() {
        const root = this.#root;
        if (root) this.#render(root, this.#built().editorEl);
    }

    /** @param {Event} event - A click in the tab strip. */
    #onTabClick = (event) => {
        const tab = /** @type {HTMLElement} */ (event.target).closest('.notes-drawer-tab');
        const pageId = tab?.getAttribute('data-page-id');
        if (pageId) this.#selectPage(pageId);
    };

    /**
     * The first click of the pair already selected the tab, so a double-click always
     * renames the active page.
     * @param {Event} event - A double-click in the tab strip.
     */
    #onTabDblclick = (event) => {
        if (/** @type {HTMLElement} */ (event.target).closest('.notes-drawer-tab')) {
            this.#beginRename();
        }
    };

    /** @param {KeyboardEvent} event - A key in the tab strip. */
    #onTabKeydown = (event) => {
        handleTabKeydown(event, (tab) => {
            const pageId = tab.getAttribute('data-page-id');
            if (pageId) this.#selectPage(pageId);
        });
    };

    /** Move the drawer to the other side of the window: the dragging's single-click counterpart. */
    #onDock = () => {
        if (this.#root) dockToOtherSide(this.#root);
    };

    /** Step the drawer to its next size: the resize grip's single-click counterpart. */
    #onSize = () => {
        if (this.#root) cycleSize(this.#root);
    };

    #onClose = () => this.#hide();
    #onExport = () => this.#exportPages();
    #onClearAll = () => void this.#confirmClearAll();
    #onRename = () => this.#beginRename();
    #onDelete = () => void this.#deleteActivePage();
    #onAdd = () => this.#addPage();
    #onTakeOver = () => this.#lock.steal();

    /** Swap the active page's tab for the inline rename input; not while read-only. */
    #beginRename() {
        if (!this.#lock.editing) return;
        this.#renamingPageId = this.#store.activePageId;
        this.#renderDrawer();
    }

    /**
     * End the rename. Its input leaves the strip with the re-render, so a blur that
     * removal causes finds the rename already settled.
     * @param {string|null} name - The typed name to store, or null to cancel.
     */
    #finishRename(name) {
        if (this.#renamingPageId === null) return;
        this.#renamingPageId = null;
        if (name !== null) this.#store.renameActive(name);
        this.#renderDrawer();
    }

    /** @param {KeyboardEvent} event - A key in the rename input. */
    #onRenameKeydown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.#finishRename(/** @type {HTMLInputElement} */ (event.currentTarget).value);
        } else if (event.key === 'Escape') {
            // Handled: the key cancels the rename and leaves the drawer open.
            event.preventDefault();
            this.#finishRename(null);
        }
    };

    /** @param {Event} event - The rename input losing focus. */
    #onRenameBlur = (event) => {
        this.#finishRename(/** @type {HTMLInputElement} */ (event.currentTarget).value);
    };

    /** @param {Element|undefined} input - The rename input, once lit has created it. */
    #focusRenameInput = (input) => {
        if (!(input instanceof HTMLInputElement)) return;
        input.focus();
        input.select();
    };

    /**
     * Build the drawer: its chrome, the page controls and the editor.
     * @param {HTMLElement} root - Already created and appended.
     */
    #buildContent(root) {
        // A non-modal dialog: the page stays usable beside it.
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-labelledby', TITLE_ID);

        const editorEl = document.createElement('div');
        editorEl.className = 'notes-drawer-editor';
        editorEl.id = EDITOR_ID;
        editorEl.setAttribute('role', 'tabpanel');
        // Quill puts its toolbar right before the editor element: inside the editor's
        // slot in the template, which keeps the same element from render to render.
        this.#render(root, editorEl);
        wireDrag(requireEl(root, '.notes-drawer-header'), root);
        wireResize(requireEl(root, '.notes-drawer-resize-handle'), root);

        const quill = new Quill(editorEl, {
            theme: 'snow',
            // Only what the toolbar offers: a pasted video or formula embed would reach
            // Quill 2.0.3's unescaped HTML export (GHSA-v3m3-f69x-jf25) on copy.
            formats: ['bold', 'italic', 'list', MODULE_LINK_FORMAT],
            placeholder: this.#buttonText('notes-placeholder.label'),
            modules: {
                toolbar: [
                    ['bold', 'italic'],
                    [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
                ],
            },
        });
        this.#labelToolbar(root, quill);
        this.#labelEditor(quill);
        this.#drawer = { editorEl, quill };
        wireNotesLinks(quill, this.#linkDeps);
        // Every edit reaches the active page and storage at once; a page load is silent.
        quill.on('text-change', () => this.#store.setActiveDelta(quill.getContents()));
    }

    /**
     * Make Quill's editing surface a named multi-line text box: Quill leaves it a bare
     * contenteditable, and its placeholder is CSS only. Named by the drawer title and the
     * active page's tab (#render keeps that current), described by the line that says
     * how to leave it, since Tab indents inside it.
     * @param {Quill} quill
     */
    #labelEditor(quill) {
        quill.root.setAttribute('role', 'textbox');
        quill.root.setAttribute('aria-multiline', 'true');
        quill.root.setAttribute(
            'aria-labelledby',
            `${TITLE_ID} ${TAB_ID_PREFIX}${this.#store.activePageId}`,
        );
        quill.root.setAttribute('aria-describedby', HINT_ID);
    }

    /**
     * Name Quill's toolbar and its buttons in German: Quill labels them with its format
     * ids ("bold", "list: ordered") on a `lang="de"` page. Its format buttons show their
     * state only as `.ql-active`; it is mirrored to `aria-pressed` on every change of
     * the selection or the text.
     * @param {HTMLElement} root - The drawer, holding the toolbar.
     * @param {Quill} quill
     */
    #labelToolbar(root, quill) {
        const toolbar = root.querySelector('.ql-toolbar');
        toolbar?.setAttribute('role', 'toolbar');
        toolbar?.setAttribute('aria-label', this.#buttonText('notes-toolbar.label'));
        const formatButtons = [...(toolbar?.querySelectorAll('button') ?? [])];
        // Every keystroke and selection move runs this: only a change is written.
        const mirrorPressed = () => {
            for (const button of formatButtons) {
                const pressed = String(button.classList.contains('ql-active'));
                if (button.getAttribute('aria-pressed') !== pressed) {
                    button.setAttribute('aria-pressed', pressed);
                }
            }
        };
        mirrorPressed();
        quill.on('editor-change', mirrorPressed);
        /** @type {Array<[selector: string, key: string]>} */
        const buttons = [
            ['.ql-bold', 'notes-format-bold'],
            ['.ql-italic', 'notes-format-italic'],
            ['.ql-list[value="ordered"]', 'notes-format-ordered'],
            ['.ql-list[value="bullet"]', 'notes-format-bullet'],
            ['.ql-list[value="check"]', 'notes-format-check'],
        ];
        for (const [selector, key] of buttons) {
            root.querySelector(`.ql-toolbar ${selector}`)?.setAttribute(
                'aria-label',
                this.#buttonText(`${key}.label`),
            );
        }
    }
}
