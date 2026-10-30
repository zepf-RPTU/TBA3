/**
 * The notes editor's module links: the "link to module" dropdown in Quill's toolbar
 * that inserts a chip, and the chip click that switches the dashboard to the chip's
 * view and highlights the module there. Everything about the dashboard comes in
 * through callbacks.
 */

import { Delta } from 'quill';
import { encodeModuleLinkValue, MODULE_LINK_CLASS, MODULE_LINK_FORMAT } from './moduleLinkBlot.js';
import { headerActionDropdown, renderHeaderActionMenuItems, renderIcon } from '@tba3/module-base';
import { html, render } from 'lit';

const HIGHLIGHT_CLASS = 'notes-highlight-flash';

/**
 * @typedef {object} NotesLinkDeps
 * @property {import('@tba3/modules/context').GlossaryAnnotator} glossary - The app's glossary, which words the link control.
 * @property {Array<{viewType: string, label: string}>} views - Every view of the current app, in sidebar order.
 * @property {(viewType: string) => Array<{id: string, label: string, element: HTMLElement}> | null} getLinkTargets - The linkable modules of a view; null for a view not rendered this session.
 * @property {(viewType: string) => Promise<void>} onNavigate - Switch the dashboard to a view and wait until it is revealed.
 */

/**
 * Add the link control to the editor's toolbar and wire the chips' clicks.
 * @param {import('quill').default} quill - The mounted notes editor.
 * @param {NotesLinkDeps} deps - What the links need from the hosting dashboard.
 */
export function wireNotesLinks(quill, deps) {
    prependLinkControl(quill, deps);
    wireChipClicks(quill, deps);
}

/**
 * Puts the "link to module" control at the left end of Quill's auto-built
 * toolbar (the formatting tools are pushed right by CSS), reusing the shared
 * header-action-dropdown pattern; the menu is a popover, so a click outside and
 * Escape close it natively. It opens rightwards: the trigger sits at the drawer's
 * left edge.
 * @param {import('quill').default} quill
 * @param {NotesLinkDeps} deps
 */
function prependLinkControl(quill, deps) {
    const toolbarEl = /** @type {HTMLElement} */ (
        /** @type {import('quill/modules/toolbar.js').default} */ (quill.getModule('toolbar'))
            .container
    );
    const formats = document.createElement('span');
    formats.className = 'ql-formats notes-link-formats';
    toolbarEl.insertBefore(formats, toolbarEl.firstChild);

    const linkText = deps.glossary.getRequiredEntryText(
        'general.buttons.element_texts.note-link.text',
    );
    render(
        headerActionDropdown({
            wrapperClass: 'notes-link-control',
            placement: 'bottom-start',
            family: 'text',
            ariaLabel: deps.glossary.getRequiredEntryText(
                'general.buttons.element_texts.note-link.label',
            ),
            buttonContent: html`${renderIcon('link')}<span>${linkText}</span>`,
            // Every open starts at step 1 (the view list).
            buildMenu: (dropdown) => renderLinkMenu(dropdown, null, quill, deps),
        }),
        formats,
    );
}

/**
 * Render one step of the link dropdown into its <ul>: the app's views
 * (step 1), or one view's linkable modules behind a "back" item (step 2).
 *
 * A view's modules only exist once the view has rendered, so a view the
 * user has not opened this session shows a hint instead of a list; a live
 * view with no linkable modules shows the empty message.
 * @param {HTMLElement} dropdown - The dropdown whose list is rebuilt for the step.
 * @param {string|null} viewType - View whose modules to list; null for the view list.
 * @param {import('quill').default} quill - The editor a chosen module is linked into.
 * @param {NotesLinkDeps} deps
 */
function renderLinkMenu(dropdown, viewType, quill, deps) {
    if (viewType === null) {
        renderHeaderActionMenuItems(
            dropdown,
            deps.views.map((view) => ({ id: view.viewType, label: view.label })),
            (item) => renderLinkMenu(dropdown, String(item.id), quill, deps),
        );
        return;
    }

    /**
     * @param {string} key - The message's key under `general.messages`.
     * @returns {string}
     */
    const message = (key) => deps.glossary.getRequiredEntryText(`general.messages.${key}`);
    const targets = deps.getLinkTargets(viewType);
    const items = [
        { id: '__back__', label: message('notes-link-back'), buttonClass: 'notes-link-back' },
        ...(targets === null
            ? [{ id: '__unvisited__', label: message('notes-link-unvisited'), disabled: true }]
            : targets.length
              ? targets.map((target) => ({ id: target.id, label: target.label }))
              : [{ id: '__empty__', label: message('notes-link-empty'), disabled: true }]),
    ];

    renderHeaderActionMenuItems(dropdown, items, (item) => {
        if (item.id === '__back__') {
            renderLinkMenu(dropdown, null, quill, deps);
            return;
        }
        insertLink(quill, viewType, item);
        dropdown.hidePopover();
    });
}

/**
 * Insert a module-link chip at the current cursor position (end of text if
 * no selection), followed by a plain space so typing doesn't continue the link.
 * One Delta, so the edit is one change and one save.
 * @param {import('quill').default} quill
 * @param {string} viewType - View the chip navigates to.
 * @param {{id: string, label: string}} item - Module the chip points at, and the text it shows.
 */
function insertLink(quill, viewType, item) {
    const range = quill.getSelection(true);
    const insertAt = range ? range.index : quill.getLength();

    quill.updateContents(
        new Delta()
            .retain(insertAt)
            .insert(item.label, { [MODULE_LINK_FORMAT]: encodeModuleLinkValue(viewType, item.id) })
            .insert(' '),
        'user',
    );
    quill.setSelection(insertAt + item.label.length + 1, 0, 'silent');
}

/**
 * Delegated click handler for module-link chips inside the editor: switches the
 * dashboard to the chip's view, then scrolls to and highlights the module.
 * @param {import('quill').default} quill
 * @param {NotesLinkDeps} deps
 */
function wireChipClicks(quill, deps) {
    // Bumped by every chip click: only the latest one scrolls once its navigation is done.
    let latestClick = 0;
    quill.root.addEventListener('click', (e) => {
        const chip = /** @type {HTMLElement} */ (e.target).closest?.(`.${MODULE_LINK_CLASS}`);
        if (!chip) return;
        e.preventDefault();

        const viewType = chip.getAttribute('data-view-type');
        const moduleId = chip.getAttribute('data-module-id');
        if (!viewType || !moduleId) return;

        const click = ++latestClick;
        revealLinkedModule(viewType, moduleId, deps, () => click === latestClick).catch((error) =>
            console.error('notesLinkMenu: Failed to show the linked module:', error),
        );
    });
}

/**
 * @param {string} viewType - View to switch to first; a no-op for the view on screen.
 * @param {string} moduleId - Module to scroll to and highlight.
 * @param {NotesLinkDeps} deps
 * @param {() => boolean} isCurrent - False once a newer chip click took over.
 */
async function revealLinkedModule(viewType, moduleId, deps, isCurrent) {
    await deps.onNavigate(viewType);
    if (!isCurrent()) return;

    // Resolved after the navigation: the target view may only now have been
    // rendered, and its modules' elements do not exist before that.
    const target = deps.getLinkTargets(viewType)?.find((t) => t.id === moduleId);
    if (target) scrollToAndHighlight(target.element);
}

/**
 * Scroll a module into view and flash it. The scroll jumps under reduced motion; the
 * class comes off when its animation ends, which reduced motion shortens, so that
 * still fires.
 * @param {HTMLElement} element - The linked module.
 */
function scrollToAndHighlight(element) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });

    element.classList.remove(HIGHLIGHT_CLASS);
    // Force reflow so the animation restarts if the same chip is clicked again quickly.
    void element.offsetWidth;
    element.classList.add(HIGHLIGHT_CLASS);
    element.addEventListener('animationend', () => element.classList.remove(HIGHLIGHT_CLASS), {
        once: true,
    });
}
