/**
 * NotesController — the per-app notes drawer, a page-lifetime singleton.
 *
 * A draggable slide-in drawer hosting a Quill editor. The lazy-build / mount /
 * visibility / Escape-close mechanics are delegated to a composed SingletonOverlay,
 * shared with itemPreviewOverlay.js. This class owns what is specific to notes: one
 * notebook per dashboard, split into as many user-created pages as wanted (numbered,
 * renameable) and persisted to localStorage per app; and chips that link to a module
 * in any view — clicking one switches the dashboard to that view and highlights the
 * module there.
 */

import { SingletonOverlay } from '../overlays/singletonOverlay.js';
import {
    registerModuleLinkBlot,
    encodeModuleLinkValue,
    MODULE_LINK_CLASS,
    MODULE_LINK_FORMAT,
} from './moduleLinkBlot.js';
import { scrollToAndHighlight } from './scrollHighlight.js';
import {
    closeDropdown,
    ensureHeaderActionDropdownControl,
    escapeHtml,
    handleTabKeydown,
    iconSvg,
    renderHeaderActionMenuItems,
    tabAttributes,
} from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import Quill from 'quill';
import './notesController.css';

const EMPTY_DELTA = { ops: [] };

const STORAGE_KEY_PREFIX = 'tba3_notes_';
const STORAGE_VERSION = 1;
const SAVE_DEBOUNCE_MS = 500;

/** Element ids the tab strip needs: every tab points its `aria-controls` at the editor. */
const EDITOR_ID = 'notes-drawer-editor';
const TAB_ID_PREFIX = 'notes-drawer-tab-';

export class NotesController {
    /** @type {HTMLElement|null} */
    #tabsEl = null;
    /** @type {HTMLElement | null} */
    #tabActionsEl = null;
    /** @type {HTMLElement | null} */
    #editorEl = null;
    /** @type {Quill|null} */
    #quill = null;

    /** @type {SingletonOverlay} */
    #overlay;

    /** @type {Array<{viewType: string, label: string}>} */
    #views = [];
    /** @type {Array<{id: string, name: string | null, delta: object}>} */
    #pages = [];
    /** @type {string|null} id of the page currently shown in the editor */
    #activePageId = null;
    /** Monotonic counter behind page ids — never reused, so a stored id stays valid. */
    #nextPageNumber = 1;
    /** @type {string|null} viewType the dashboard currently shows (link resolution, not tabs) */
    #currentViewType = null;
    /** @type {string|null} view whose modules the link dropdown currently lists (null = view list) */
    #linkMenuViewType = null;

    /** @type {string} */
    #storageKey;
    /** @type {number|null} */
    #saveTimer = null;

    /** @type {(viewType: string) => Array<{id: string, label: string, element: HTMLElement}>} */
    #getLinkTargets;
    /** @type {(viewType: string) => boolean} */
    #isViewLive;
    /** @type {(viewType: string) => Promise<void>} */
    #onNavigate;

    /**
     * @param {object} [deps] - Everything the controller needs from the hosting dashboard.
     * @param {string} [deps.appId] - Dashboard id ('en'|'ma'|'sl'), scopes the storage key
     * @param {(active: boolean) => void} [deps.onActiveChange] - Told whenever the drawer opens or closes, so the app can sync its toggle.
     * @param {(viewType: string) => Array<{id: string, label: string, element: HTMLElement}>} [deps.getLinkTargets] - Returns the linkable modules of a view, for the link dropdown.
     * @param {(viewType: string) => boolean} [deps.isViewLive] - Whether a view has been rendered this session, i.e. whether its modules exist to be listed
     * @param {(viewType: string) => Promise<void>} [deps.onNavigate] - Switch the dashboard to a view and wait for it
     */
    constructor({ appId = 'app', onActiveChange, getLinkTargets, isViewLive, onNavigate } = {}) {
        this.#storageKey = `${STORAGE_KEY_PREFIX}${appId}`;
        this.#getLinkTargets = getLinkTargets ?? (() => []);
        this.#isViewLive = isViewLive ?? (() => true);
        this.#onNavigate = onNavigate ?? (() => Promise.resolve());
        const notifyActiveChange = onActiveChange ?? (() => {});

        this.#loadFromStorage();

        this.#overlay = new SingletonOverlay('notes-drawer', (root) => this.#buildContent(root), {
            // Let the more local handler win: dropdownManager.js's own Escape
            // handler closes an open "link to module" dropdown, and a tab rename
            // input cancels itself — only close the whole drawer if neither is open.
            blockEscapeClose: () =>
                !!document.querySelector('.header-action-dropdown.show') ||
                !!this.#overlay.getRoot()?.querySelector('.notes-drawer-tab-input'),
            onShow: () => notifyActiveChange(true),
            onHide: () => {
                this.#flushSave();
                notifyActiveChange(false);
            },
        });
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    toggle() {
        this.#overlay.toggle();
    }

    open() {
        this.#overlay.show();
    }

    /**
     * Set the full list of views of the current app. Called once, before the
     * drawer is ever opened. Feeds the first step of the link dropdown — the
     * drawer's own tabs are user-created pages, not views.
     * @param {Array<{viewType: string, label: string}>} views - Every view of the current app, in sidebar order.
     */
    setViews(views) {
        this.#views = views;
    }

    /**
     * Called whenever the dashboard shows a different view. Notes are app-wide,
     * so this no longer changes what the editor shows — it only records which
     * view is on screen, so a chip click knows whether it has to navigate first.
     * @param {string} viewType - The view now on screen.
     */
    setActiveView(viewType) {
        this.#currentViewType = viewType;
    }

    #getActivePage() {
        return this.#pages.find((page) => page.id === this.#activePageId) ?? null;
    }

    /**
     * Copy the editor's current content into the active page. Called before any
     * operation that swaps or removes what the editor shows, and on every edit.
     */
    #captureActivePage() {
        const page = this.#getActivePage();
        if (this.#quill && page) {
            page.delta = this.#quill.getContents();
        }
    }

    /**
     * Show a different page: stores the outgoing page's content, loads the
     * incoming one.
     * @param {string} pageId - Page to show; the outgoing page is stored first.
     */
    #selectPage(pageId) {
        if (pageId === this.#activePageId) return;
        if (!this.#pages.some((page) => page.id === pageId)) return;

        this.#captureActivePage();
        this.#activePageId = pageId;
        this.#renderTabs();
        this.#loadActivePageIntoEditor();
        this.#saveToStorage();
    }

    #addPage() {
        this.#captureActivePage();
        const page = this.#createPage();
        this.#pages.push(page);
        this.#activePageId = page.id;
        this.#renderTabs();
        this.#loadActivePageIntoEditor();
        this.#saveToStorage();
    }

    /**
     * Delete a page. The last remaining page is never deletable (its × is not
     * rendered), and a page with content asks first.
     * @param {string} pageId - Page to delete.
     */
    #deletePage(pageId) {
        if (this.#pages.length < 2) return;

        const index = this.#pages.findIndex((page) => page.id === pageId);
        if (index === -1) return;

        this.#captureActivePage();
        const hasContent = (this.#pages[index].delta?.ops ?? []).some(
            (op) => typeof op.insert === 'string' && op.insert.trim(),
        );
        if (
            hasContent &&
            !window.confirm(
                glossaryAnnotator.getRequiredEntryText('general.messages.confirm-delete-note'),
            )
        )
            return;

        this.#pages.splice(index, 1);
        if (this.#activePageId === pageId) {
            this.#activePageId = this.#pages[Math.min(index, this.#pages.length - 1)].id;
            this.#renderTabs();
            this.#loadActivePageIntoEditor();
        } else {
            this.#renderTabs();
        }
        this.#saveToStorage();
    }

    #createPage() {
        const page = { id: `p${this.#nextPageNumber}`, name: null, delta: EMPTY_DELTA };
        this.#nextPageNumber += 1;
        return page;
    }

    #loadActivePageIntoEditor() {
        if (!this.#quill) return;
        this.#quill.setContents(this.#getActivePage()?.delta ?? EMPTY_DELTA, 'silent');
    }

    #renderTabs() {
        if (!this.#tabsEl || !this.#tabActionsEl) return;

        const canDelete = this.#pages.length > 1;
        const renameHint = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.note-rename-hint.tooltip',
        );
        this.#tabsEl.innerHTML = this.#pages
            .map((page, index) => {
                const pageId = escapeHtml(page.id);
                const label = escapeHtml(page.name || String(index + 1));
                const aria = tabAttributes({
                    id: `${TAB_ID_PREFIX}${pageId}`,
                    panelId: EDITOR_ID,
                    selected: page.id === this.#activePageId,
                });
                return `<button type="button" class="tab-strip-tab notes-drawer-tab" ${aria} data-page-id="${pageId}" data-tooltip-text="${renameHint}">${label}</button>`;
            })
            .join('');

        // The page controls trail the strip instead of sitting between the tabs: a
        // tablist may own tabs and nothing else, and out here they also stop moving
        // with the active tab on every page switch.
        const activeId = escapeHtml(this.#activePageId ?? '');
        const renameLabel = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.note-rename.label',
        );
        const renameTooltip = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.note-rename.tooltip',
        );
        // The pencil is the only rename affordance a keyboard can reach: a tab's
        // dblclick is a shortcut no key produces.
        const deleteLabel = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.note-delete.label',
        );
        const addLabel = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.note-add.label',
        );
        const deleteButton = canDelete
            ? `<button type="button" class="notes-drawer-tab-delete" data-page-id="${activeId}" aria-label="${deleteLabel}" data-tooltip-text="${deleteLabel}">×</button>`
            : '';
        this.#tabActionsEl.innerHTML = `
            <button type="button" class="notes-drawer-tab-rename" data-page-id="${activeId}" aria-label="${renameLabel}" data-tooltip-text="${renameTooltip}">${iconSvg('edit')}</button>
            ${deleteButton}
            <button type="button" class="notes-drawer-tab-add" aria-label="${addLabel}" data-tooltip-text="${addLabel}">+</button>
        `;

        this.#tabsEl.setAttribute('role', 'tablist');
        this.#editorEl?.setAttribute('aria-labelledby', `${TAB_ID_PREFIX}${this.#activePageId}`);
    }

    #wireTabs() {
        if (!this.#tabsEl) return;

        // The page controls live beside the tablist, not in it, so the delegated
        // listener sits on the row that holds both.
        const row = /** @type {HTMLElement} */ (this.#tabsEl.parentElement);
        row.addEventListener('click', (e) => {
            const el = /** @type {HTMLElement} */ (e.target);

            if (el.closest?.('.notes-drawer-tab-add')) {
                this.#addPage();
                return;
            }

            const deleteButton = el.closest?.('.notes-drawer-tab-delete');
            if (deleteButton) {
                const pageId = deleteButton.getAttribute('data-page-id');
                if (pageId) this.#deletePage(pageId);
                return;
            }

            // The pencil sits outside the tablist, so it never matches the tab
            // branch below — and #beginRename wants the tab element, hence the
            // lookup by page id.
            const renameButton = el.closest?.('.notes-drawer-tab-rename');
            if (renameButton) {
                const pageId = renameButton.getAttribute('data-page-id');
                const tabEl = pageId
                    ? this.#tabsEl?.querySelector(
                          `.notes-drawer-tab[data-page-id="${CSS.escape(pageId)}"]`,
                      )
                    : null;
                if (tabEl) this.#beginRename(/** @type {HTMLElement} */ (tabEl));
                return;
            }

            const tab = el.closest?.('.notes-drawer-tab');
            const pageId = tab?.getAttribute('data-page-id');
            if (pageId) this.#selectPage(pageId);
        });

        this.#tabsEl.addEventListener('dblclick', (e) => {
            const tab = /** @type {HTMLElement} */ (e.target).closest?.('.notes-drawer-tab');
            if (tab) this.#beginRename(/** @type {HTMLElement} */ (tab));
        });

        this.#tabsEl.addEventListener('keydown', (e) => {
            handleTabKeydown(e, (tab) => {
                const pageId = tab.getAttribute('data-page-id');
                if (pageId) this.#selectPage(pageId);
            });
        });
    }

    /**
     * Swap a page tab for an inline input. Enter/blur commit, Escape cancels;
     * an emptied name falls back to the page's position number.
     * @param {HTMLElement} tabEl - The page tab being renamed.
     */
    #beginRename(tabEl) {
        const pageId = tabEl.getAttribute('data-page-id');
        const index = this.#pages.findIndex((page) => page.id === pageId);
        if (index === -1) return;

        const page = this.#pages[index];
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'notes-drawer-tab-input';
        input.value = page.name ?? '';
        input.placeholder = String(index + 1);
        input.setAttribute(
            'aria-label',
            glossaryAnnotator.getRequiredEntryText(
                'general.buttons.element_texts.note-rename.label',
            ),
        );

        let settled = false;
        const finish = (commit) => {
            if (settled) return;
            settled = true;
            if (commit) {
                page.name = input.value.trim() || null;
                this.#saveToStorage();
            }
            this.#renderTabs();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish(true);
            } else if (e.key === 'Escape') {
                // The drawer's own Escape handler runs in the capture phase but
                // blockEscapeClose() sees this input and stands down, so the key
                // only cancels the rename.
                e.preventDefault();
                finish(false);
            }
        });
        input.addEventListener('blur', () => finish(true));

        // A tablist owns tabs and nothing else, and for as long as the input stands in
        // for one the strip is not a tab list — #renderTabs restores the role when the
        // rename settles.
        this.#tabsEl?.setAttribute('role', 'none');
        tabEl.replaceWith(input);
        input.focus();
        input.select();
    }

    #loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.#storageKey);
            const parsed = stored ? JSON.parse(stored) : null;
            const pages =
                parsed?.version === STORAGE_VERSION && Array.isArray(parsed.pages)
                    ? parsed.pages.filter((page) => typeof page?.id === 'string')
                    : [];

            if (pages.length) {
                this.#pages = pages.map((page) => ({
                    id: page.id,
                    name: typeof page.name === 'string' && page.name ? page.name : null,
                    delta: page.delta?.ops ? page.delta : EMPTY_DELTA,
                }));
                this.#nextPageNumber = Number.isFinite(parsed.nextPageNumber)
                    ? parsed.nextPageNumber
                    : this.#pages.length + 1;
                this.#activePageId = this.#pages.some((page) => page.id === parsed.activePageId)
                    ? parsed.activePageId
                    : this.#pages[0].id;
                return;
            }
        } catch (error) {
            console.error('[Notes] Failed to restore notes:', error);
        }

        const page = this.#createPage();
        this.#pages = [page];
        this.#activePageId = page.id;
    }

    #saveToStorage() {
        try {
            localStorage.setItem(
                this.#storageKey,
                JSON.stringify({
                    version: STORAGE_VERSION,
                    nextPageNumber: this.#nextPageNumber,
                    activePageId: this.#activePageId,
                    pages: this.#pages,
                }),
            );
        } catch (error) {
            console.error('[Notes] Failed to save notes:', error);
        }
    }

    /** Coalesce the write storm a typing user produces into one save. */
    #scheduleSave() {
        if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
        this.#saveTimer = window.setTimeout(() => {
            this.#saveTimer = null;
            this.#saveToStorage();
        }, SAVE_DEBOUNCE_MS);
    }

    #flushSave() {
        if (this.#saveTimer === null) return;
        clearTimeout(this.#saveTimer);
        this.#saveTimer = null;
        this.#saveToStorage();
    }

    /**
     * Populates the drawer root (already created/appended by SingletonOverlay)
     * with its markup and wiring. Called once, on first open().
     * @param {HTMLElement} root - The drawer element, already created and appended by SingletonOverlay.
     */
    #buildContent(root) {
        registerModuleLinkBlot();

        const closeLabel = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.notes-close.label',
        );
        const pagesLabel = glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.notes-pages.label',
        );
        root.innerHTML = `
            <div class="notes-drawer-header">
                <span class="notes-drawer-title">Notizen</span>
                <button type="button" class="btn btn--icon notes-drawer-close" aria-label="${closeLabel}">
                    ${iconSvg('close')}
                </button>
            </div>
            <div class="notes-drawer-tabs">
                <div class="tab-strip notes-drawer-tablist" role="tablist" aria-label="${pagesLabel}"></div>
                <div class="notes-drawer-tab-actions"></div>
            </div>
            <div class="notes-drawer-editor" id="${EDITOR_ID}" role="tabpanel"></div>
            <div class="notes-drawer-resize-handle" aria-hidden="true"></div>
        `;

        this.#tabsEl = /** @type {HTMLElement} */ (root.querySelector('.notes-drawer-tablist'));
        this.#tabActionsEl = /** @type {HTMLElement} */ (
            root.querySelector('.notes-drawer-tab-actions')
        );
        const editorEl = /** @type {HTMLElement} */ (root.querySelector('.notes-drawer-editor'));
        this.#editorEl = editorEl;
        this.#renderTabs();
        this.#wireTabs();

        this.#quill = new Quill(editorEl, {
            theme: 'snow',
            placeholder: glossaryAnnotator.getRequiredEntryText(
                'general.buttons.element_texts.notes-placeholder.label',
            ),
            modules: {
                toolbar: [
                    ['bold', 'italic'],
                    [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
                ],
            },
        });

        this.#prependLinkControl();
        this.#wireChipClicks();
        // Keep the in-memory page and localStorage in step with every edit —
        // otherwise a page switch, a drawer close or a reload drops what was typed.
        this.#quill.on('text-change', () => {
            this.#captureActivePage();
            this.#scheduleSave();
        });

        const handleEl = /** @type {HTMLElement} */ (root.querySelector('.notes-drawer-header'));
        this.#wireDrag(handleEl, root);
        const resizeHandleEl = /** @type {HTMLElement} */ (
            root.querySelector('.notes-drawer-resize-handle')
        );
        this.#wireResize(resizeHandleEl, root);
        root.querySelector('.notes-drawer-close')?.addEventListener('click', () =>
            this.#overlay.hide(),
        );

        this.#loadActivePageIntoEditor();
    }

    /**
     * Puts the "link to module" control at the left end of Quill's auto-built
     * toolbar (the formatting tools are pushed right by CSS), reusing the shared
     * header-action-dropdown pattern — outside-click/Escape handling is already
     * wired globally by dropdownManager.js.
     */
    #prependLinkControl() {
        if (!this.#quill) return;
        const toolbarEl = /** @type {any} */ (this.#quill.getModule('toolbar')).container;
        const formats = document.createElement('span');
        formats.className = 'ql-formats notes-link-formats';
        toolbarEl.insertBefore(formats, toolbarEl.firstChild);

        ensureHeaderActionDropdownControl(formats, {
            wrapperClass: 'notes-link-control',
            buttonClass: 'btn--text',
            ariaLabel: glossaryAnnotator.getRequiredEntryText(
                'general.buttons.element_texts.note-link.label',
            ),
            buttonHTML: `
                ${iconSvg('link')}
                <span>Verknüpfen</span>
            `,
            buildMenu: (dropdown) => {
                // Every open starts at step 1 (the view list).
                this.#linkMenuViewType = null;
                this.#renderLinkMenu(dropdown);
            },
        });
    }

    /**
     * Render the current step of the link dropdown into its <ul>: the app's views
     * (step 1), or one view's linkable modules behind a "back" item (step 2).
     *
     * A view's modules only exist once the view has rendered, so a view the
     * user has not opened this session shows a hint instead of a list — the
     * app does not render views off-screen just to name their modules. A live
     * view with genuinely zero linkable modules is a different, empty case.
     * @param {HTMLElement} dropdown - The dropdown whose list is rebuilt for the current step.
     */
    #renderLinkMenu(dropdown) {
        if (this.#linkMenuViewType === null) {
            renderHeaderActionMenuItems(
                dropdown,
                this.#views.map((view) => ({ id: view.viewType, label: view.label })),
                {
                    onSelect: (item) => {
                        this.#linkMenuViewType = String(item.id);
                        this.#renderLinkMenu(dropdown);
                    },
                },
            );
            return;
        }

        const viewType = this.#linkMenuViewType;
        const targets = this.#isViewLive(viewType) ? this.#getLinkTargets(viewType) : null;
        const items = [
            { id: '__back__', label: '← Ansichten', buttonClass: 'notes-link-back' },
            ...(targets === null
                ? [{ id: '__unvisited__', label: 'Ansicht zuerst öffnen', disabled: true }]
                : targets.length
                  ? targets.map((target) => ({ id: target.id, label: target.label }))
                  : [{ id: '__empty__', label: 'Keine verknüpfbaren Module', disabled: true }]),
        ];

        renderHeaderActionMenuItems(dropdown, items, {
            onSelect: (item) => {
                if (item.id === '__back__') {
                    this.#linkMenuViewType = null;
                    this.#renderLinkMenu(dropdown);
                    return;
                }
                this.#insertLink(viewType, item);
                closeDropdown(dropdown);
            },
        });
    }

    /**
     * Insert a module-link chip at the current cursor position (end of text if
     * no selection), followed by a space so typing doesn't continue the link.
     * That space has to clear the format explicitly: text inserted directly
     * after a formatted run inherits its formats, which would draw the space as
     * part of the chip (underlined on hover) and widen its hit area.
     * @param {string} viewType - View the chip navigates to.
     * @param {{id: string, label: string}} item - Module the chip points at, and the text it shows.
     */
    #insertLink(viewType, item) {
        if (!this.#quill) return;

        const range = this.#quill.getSelection(true);
        const insertAt = range ? range.index : this.#quill.getLength();

        this.#quill.insertText(insertAt, item.label, Quill.sources.USER);
        this.#quill.formatText(
            insertAt,
            item.label.length,
            MODULE_LINK_FORMAT,
            encodeModuleLinkValue(viewType, item.id),
            Quill.sources.USER,
        );
        this.#quill.insertText(
            insertAt + item.label.length,
            ' ',
            MODULE_LINK_FORMAT,
            false,
            Quill.sources.USER,
        );
        this.#quill.setSelection(insertAt + item.label.length + 1, 0, Quill.sources.SILENT);
    }

    /**
     * Delegated click handler for module-link chips inside the editor: switches
     * the dashboard to the chip's view if it isn't the one on screen, then
     * scrolls to and highlights the referenced module.
     */
    #wireChipClicks() {
        if (!this.#quill) return;
        this.#quill.root.addEventListener('click', (e) => {
            const chip = /** @type {HTMLElement} */ (e.target).closest?.(`.${MODULE_LINK_CLASS}`);
            if (!chip) return;
            e.preventDefault();

            const viewType = chip.getAttribute('data-view-type');
            const moduleId = chip.getAttribute('data-module-id');
            if (!viewType || !moduleId) return;

            this.#revealLinkedModule(viewType, moduleId);
        });
    }

    /**
     * @param {string} viewType - View to switch to first, when it is not already on screen.
     * @param {string} moduleId - Module to scroll to and highlight.
     */
    async #revealLinkedModule(viewType, moduleId) {
        if (viewType !== this.#currentViewType) {
            await this.#onNavigate(viewType);
        }

        // Resolved after the navigation: the target view may only now have been
        // rendered, and its modules' elements do not exist before that.
        const target = this.#getLinkTargets(viewType).find((t) => t.id === moduleId);
        scrollToAndHighlight(target?.element);
    }

    /**
     * Free-drag the drawer via its header handle (pointer events), clamped to
     * the viewport. Position persists on the DOM node for the rest of the page
     * session since the drawer is hidden (not destroyed) on close.
     * @param {HTMLElement} handle - The header area the drawer is dragged by.
     * @param {HTMLElement} root - The drawer element being moved.
     */
    #wireDrag(handle, root) {
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;

        const onPointerMove = (e) => {
            if (!dragging) return;
            const maxX = Math.max(window.innerWidth - root.offsetWidth, 0);
            const maxY = Math.max(window.innerHeight - root.offsetHeight, 0);
            const nextX = Math.min(Math.max(originX + (e.clientX - startX), 0), maxX);
            const nextY = Math.min(Math.max(originY + (e.clientY - startY), 0), maxY);
            root.style.right = 'auto';
            root.style.left = `${nextX}px`;
            root.style.top = `${nextY}px`;
        };

        const onPointerUp = (e) => {
            dragging = false;
            handle.releasePointerCapture(e.pointerId);
            handle.removeEventListener('pointermove', onPointerMove);
            handle.removeEventListener('pointerup', onPointerUp);
            handle.removeEventListener('pointercancel', onPointerUp);
        };

        handle.addEventListener('pointerdown', (e) => {
            if (/** @type {HTMLElement} */ (e.target).closest('button')) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = root.getBoundingClientRect();
            originX = rect.left;
            originY = rect.top;
            // Capture on the handle itself (not document) so move/up events keep
            // arriving even if the pointer leaves the window during the drag.
            handle.setPointerCapture(e.pointerId);
            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', onPointerUp);
            handle.addEventListener('pointercancel', onPointerUp);
        });
    }

    /**
     * Free-resize the drawer via a bottom-right handle (pointer events). CSS
     * min/max-width/height on `.notes-drawer` clamp the visible result, so the
     * handler itself just tracks the raw pointer delta.
     * @param {HTMLElement} handle - The bottom-right grip the drawer is resized by.
     * @param {HTMLElement} root - The drawer element being resized.
     */
    #wireResize(handle, root) {
        let resizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        const onPointerMove = (e) => {
            if (!resizing) return;
            root.style.width = `${startWidth + (e.clientX - startX)}px`;
            root.style.height = `${startHeight + (e.clientY - startY)}px`;
        };

        const onPointerUp = (e) => {
            resizing = false;
            handle.releasePointerCapture(e.pointerId);
            handle.removeEventListener('pointermove', onPointerMove);
            handle.removeEventListener('pointerup', onPointerUp);
            handle.removeEventListener('pointercancel', onPointerUp);
        };

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            resizing = true;

            // Pin to left/top (like #wireDrag's first move) so growing from this
            // bottom-right handle tracks the cursor even in the default right-anchored state.
            const rect = root.getBoundingClientRect();
            root.style.right = 'auto';
            root.style.left = `${rect.left}px`;
            root.style.top = `${rect.top}px`;

            startX = e.clientX;
            startY = e.clientY;
            startWidth = rect.width;
            startHeight = rect.height;
            // Capture on the handle itself (not document) so move/up events keep
            // arriving even if the pointer leaves the window during the resize.
            handle.setPointerCapture(e.pointerId);
            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', onPointerUp);
            handle.addEventListener('pointercancel', onPointerUp);
        });
    }
}
