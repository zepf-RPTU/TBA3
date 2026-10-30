// @vitest-browser
/**
 * The notes drawer's tab strip: the rename pencil that gives touch a route to a
 * rename (`dblclick` is the mouse route), and the routing of the tab click delegate
 * the pencil branch sits in. Its other branches (add / delete / select) serve every
 * page tab, and a mis-scoped selector there fails silently: the wrong verb runs and
 * nothing throws. And the one editor per notebook: a second drawer on the same
 * notebook, as another tab opens it, is read-only until it takes the notebook over.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Quill from 'quill';

import { NotesController } from '../../../../../src/common/modules/notes/notesController.js';
import { MODULE_LINK_FORMAT } from '../../../../../src/common/modules/notes/moduleLinkBlot.js';
import { mountMainContent } from '../../../../../packages/modules/test/support/domShell.js';
import { createTestAppContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../../../packages/modules/test/support/required.js';

const STORAGE_KEY = 'tba3_notes_notestest_groups/1';

/** @type {NotesController} */
let controller;

const tabs = () => document.querySelectorAll('.notes-drawer-tab');
const activeTab = () =>
    required(document.querySelector('.notes-drawer-tab[aria-selected="true"]'), 'active tab');
const renameButtons = () => document.querySelectorAll('.notes-drawer-tab-rename');
const addButton = () => document.querySelector('.notes-drawer-tab-add');
const deleteButton = () =>
    /** @type {HTMLButtonElement} */ (document.querySelector('.notes-drawer-tab-delete'));

/** @returns {NotesController} A drawer on the suite's notebook, not yet opened. */
const notebookController = () =>
    new NotesController({
        appId: 'notestest',
        dataset: { id: 'groups/1', label: 'Klasse 1' },
        glossary: createTestAppContext('en').glossary,
        onActiveChange: () => {},
        views: [],
        getLinkTargets: () => null,
        onNavigate: async () => {},
    });

beforeEach(async () => {
    mountMainContent();
    localStorage.removeItem(STORAGE_KEY);
    controller = notebookController();
    await controller.toggle();
});

afterEach(() => {
    controller.destroy();
});

describe('rename pencil', () => {
    it('is the one control, and renames whichever page is active', () => {
        expect(tabs()).toHaveLength(1);
        expect(renameButtons()).toHaveLength(1);

        /** @type {HTMLElement} */ (addButton()).click();

        expect(tabs()).toHaveLength(2);
        // The pencil sits beside the tablist, not in it.
        expect(renameButtons()).toHaveLength(1);
        const activeId = activeTab().getAttribute('data-page-id');
        /** @type {HTMLElement} */ (renameButtons()[0]).click();
        const input = /** @type {HTMLInputElement} */ (
            document.querySelector('.notes-drawer-tab-input')
        );
        input.value = 'Zweite';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(activeTab().getAttribute('data-page-id')).toBe(activeId);
        expect(activeTab().textContent.trim()).toBe('Zweite');
        expect(tabs()[0].textContent.trim()).not.toBe('Zweite');
    });

    it('leaves the name alone when the rename is cancelled', () => {
        /** @type {HTMLElement} */ (renameButtons()[0]).click();
        const input = /** @type {HTMLInputElement} */ (
            document.querySelector('.notes-drawer-tab-input')
        );
        const before = input.value;

        input.value = 'verworfen';
        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );

        expect(activeTab().textContent.trim()).toBe(before || '1');
    });
});

describe('tab semantics', () => {
    it('is a tablist of tabs, with the page controls outside it', () => {
        /** @type {HTMLElement} */ (addButton()).click();

        const found = document.querySelector('[role="tablist"]');
        expect(found).not.toBeNull();
        const tablist = required(found, 'tablist');
        // Only tabs inside: a button among them breaks the tablist's required
        // children.
        expect([...tablist.children].every((el) => el.getAttribute('role') === 'tab')).toBe(true);
        expect(tablist.querySelector('.notes-drawer-tab-add')).toBeNull();
        expect(renameButtons()[0].closest('[role="tablist"]')).toBeNull();
    });

    it('puts only the active tab in the tab order and names the panel from it', () => {
        /** @type {HTMLElement} */ (addButton()).click();

        const stops = [...tabs()].map((tab) => tab.getAttribute('tabindex'));
        expect(stops.filter((value) => value === '0')).toHaveLength(1);
        expect(activeTab().getAttribute('tabindex')).toBe('0');

        const panel = required(
            document.getElementById(
                required(activeTab().getAttribute('aria-controls'), 'aria-controls'),
            ),
            'tab panel',
        );
        expect(panel.getAttribute('role')).toBe('tabpanel');
        expect(panel.getAttribute('aria-labelledby')).toBe(activeTab().id);
    });

    it('moves the selection with the arrow keys', () => {
        /** @type {HTMLElement} */ (addButton()).click();
        const second = /** @type {HTMLElement} */ (tabs()[1]);
        expect(activeTab()).toBe(second);

        second.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

        expect(activeTab().getAttribute('data-page-id')).toBe(
            tabs()[0].getAttribute('data-page-id'),
        );
        expect(document.activeElement).toBe(tabs()[0]);
    });

    it('is not a tab list while a rename input stands in for a tab', () => {
        /** @type {HTMLElement} */ (renameButtons()[0]).click();

        const input = /** @type {HTMLInputElement} */ (
            document.querySelector('.notes-drawer-tab-input')
        );
        expect(input.closest('[role="tablist"]')).toBeNull();

        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
        expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    });
});

describe('editor and drawer accessibility', () => {
    it('makes the editor a named multi-line text box that says how to leave it', () => {
        const editor = required(document.querySelector('.ql-editor'), 'editor');
        expect(editor.getAttribute('role')).toBe('textbox');
        expect(editor.getAttribute('aria-multiline')).toBe('true');
        expect(editor.getAttribute('aria-labelledby')?.split(' ')).toContain(activeTab().id);
        const hint = required(
            document.getElementById(required(editor.getAttribute('aria-describedby'), 'hint id')),
            'hint',
        );
        expect(hint.textContent?.trim()).not.toBe('');
    });

    it('names its toolbar and says which formats are on', () => {
        const toolbar = required(document.querySelector('.ql-toolbar'), 'toolbar');
        expect(toolbar.getAttribute('role')).toBe('toolbar');
        expect(toolbar.getAttribute('aria-label')).toBeTruthy();
        expect(
            required(toolbar.querySelector('.ql-bold'), 'bold').getAttribute('aria-pressed'),
        ).toBe('false');
    });

    it('closes on an Escape from anywhere on the page', () => {
        const outside = document.createElement('button');
        document.body.append(outside);
        outside.focus();

        const escape = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        });
        outside.dispatchEvent(escape);

        expect(escape.defaultPrevented).toBe(true);
        expect(document.querySelector('.notes-drawer:popover-open')).toBeNull();
        outside.remove();
    });

    it('docks on the other side with one click, as dragging would', () => {
        const drawer = /** @type {HTMLElement} */ (
            required(document.querySelector('.notes-drawer'))
        );
        const before = drawer.getBoundingClientRect().left;
        /** @type {HTMLButtonElement} */ (
            required(
                document.querySelector(
                    'button[aria-label="Notizen auf die andere Seite verschieben"]',
                ),
            )
        ).click();
        expect(drawer.getBoundingClientRect().left).not.toBe(before);
    });
});

describe('tab click routing', () => {
    it('still selects a page, and does not start a rename doing so', () => {
        /** @type {HTMLElement} */ (addButton()).click();
        const first = /** @type {HTMLElement} */ (tabs()[0]);
        const firstId = first.getAttribute('data-page-id');

        first.click();

        expect(activeTab().getAttribute('data-page-id')).toBe(firstId);
        expect(document.querySelector('.notes-drawer-tab-input')).toBeNull();
    });

    it('still deletes a page', () => {
        /** @type {HTMLElement} */ (addButton()).click();
        expect(tabs()).toHaveLength(2);

        deleteButton().click();

        expect(tabs()).toHaveLength(1);
        // The last page hides its delete button: there is always one page.
        expect(deleteButton().hidden).toBe(true);
    });
});

describe('undo', () => {
    it('stays on the page it was typed on', () => {
        // The history records a page load like an edit: an undo after a page switch would
        // put the previous page's text back into the new page, and save it there.
        const quill = Quill.find(
            required(document.querySelector('.notes-drawer-editor'), 'editor'),
        );
        if (!(quill instanceof Quill)) throw new Error('no Quill on the editor');
        quill.insertText(0, 'Seite eins', 'user');
        // A pause longer than the history's merge window, so the load is its own entry.
        quill.history.cutoff();
        /** @type {HTMLElement} */ (addButton()).click();

        quill.history.undo();

        expect(quill.getText().trim()).toBe('');
    });
});

describe('module-link chips', () => {
    /**
     * Swap the suite's drawer for one whose chips navigate through `onNavigate`.
     * @param {(viewType: string) => Promise<void>} onNavigate
     * @param {HTMLElement[]} targets - The linkable modules, each under its own id, all on view `v`.
     * @returns {Promise<(moduleId: string) => HTMLElement>} A chip to the module, inserted into the editor.
     */
    async function drawerWithChips(onNavigate, targets) {
        controller.destroy();
        controller = new NotesController({
            appId: 'notestest',
            dataset: { id: 'groups/1', label: 'Klasse 1' },
            glossary: createTestAppContext('en').glossary,
            onActiveChange: () => {},
            views: [{ viewType: 'v', label: 'Ansicht' }],
            getLinkTargets: () =>
                targets.map((element) => ({ id: element.id, label: element.id, element })),
            onNavigate,
        });
        await controller.toggle();
        const quill = Quill.find(
            required(document.querySelector('.notes-drawer-editor'), 'editor'),
        );
        if (!(quill instanceof Quill)) throw new Error('no Quill on the editor');
        return (moduleId) => {
            quill.insertText(0, moduleId, MODULE_LINK_FORMAT, `v::${moduleId}`, 'user');
            return required(
                quill.root.querySelector(`[data-module-id="${moduleId}"]`),
                `chip ${moduleId}`,
            );
        };
    }

    it('highlights only the module of the latest click', async () => {
        // A slow switch for the first chip must not scroll away from the second one.
        const first = Object.assign(document.createElement('div'), { id: 'first' });
        const second = Object.assign(document.createElement('div'), { id: 'second' });
        document.body.append(first, second);
        /** @type {() => void} */
        let finishFirst = () => {};
        const navigations = [
            new Promise((resolve) => {
                finishFirst = () => resolve(undefined);
            }),
            Promise.resolve(),
        ];
        const chip = await drawerWithChips(async () => navigations.shift(), [first, second]);

        chip('first').click();
        chip('second').click();
        await vi.waitFor(() => expect(second.classList).toContain('notes-highlight-flash'));
        finishFirst();
        await new Promise((resolve) => setTimeout(resolve));

        expect(first.classList).not.toContain('notes-highlight-flash');
        first.remove();
        second.remove();
    });

    it('reports a failed navigation instead of leaving it unhandled', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const chip = await drawerWithChips(() => Promise.reject(new Error('view failed')), []);

        chip('gone').click();

        await vi.waitFor(() => expect(error).toHaveBeenCalled());
        error.mockRestore();
    });
});

describe('destroy', () => {
    it('takes the drawer and its window resize listener down with the app', async () => {
        const add = vi.spyOn(window, 'addEventListener');
        const own = new NotesController({
            appId: 'notesdestroytest',
            dataset: { id: 'groups/1', label: 'Klasse 1' },
            glossary: createTestAppContext('en').glossary,
            onActiveChange: () => {},
            views: [],
            getLinkTargets: () => null,
            onNavigate: async () => {},
        });
        const resize = add.mock.calls.find(([type]) => type === 'resize');
        add.mockRestore();
        await own.toggle();
        const drawers = () => document.querySelectorAll('.notes-drawer').length;
        const before = drawers();

        own.destroy();

        const options = /** @type {AddEventListenerOptions} */ (resize?.[2]);
        expect(options.signal?.aborted).toBe(true);
        expect(drawers()).toBe(before - 1);
    });
});

describe('one editor per notebook', () => {
    /** @type {NotesController} */
    let other;

    afterEach(() => {
        other.destroy();
    });

    /** @returns {HTMLElement[]} The suite's drawer, then the other one. */
    const drawers = () => /** @type {HTMLElement[]} */ ([
        ...document.querySelectorAll('.notes-drawer'),
    ]);

    /**
     * @param {HTMLElement} drawer
     * @returns {Quill}
     */
    const quillOf = (drawer) => {
        const quill = Quill.find(required(drawer.querySelector('.notes-drawer-editor'), 'editor'));
        if (!(quill instanceof Quill)) throw new Error('no Quill on the editor');
        return quill;
    };

    const takeOver = (/** @type {HTMLElement} */ drawer) =>
        /** @type {HTMLElement} */ (
            required(drawer.querySelector('.notes-drawer-take-over'), 'take-over button')
        ).click();

    it('opens the notebook read-only while another drawer edits it', async () => {
        other = notebookController();
        await other.toggle();
        const [editing, reading] = drawers();

        expect(editing.hasAttribute('data-read-only')).toBe(false);
        expect(reading.hasAttribute('data-read-only')).toBe(true);
        expect(quillOf(reading).isEnabled()).toBe(false);
        expect(document.activeElement?.classList).toContain('notes-drawer-take-over');
    });

    it('hands the notebook over on request, with what the editor typed', async () => {
        other = notebookController();
        await other.toggle();
        const [first, second] = drawers();
        // Taken over straight after the keystroke: an edit is stored the moment it is made.
        quillOf(first).insertText(0, 'Notiz aus Tab eins', 'user');

        takeOver(second);

        await vi.waitFor(() => expect(second.hasAttribute('data-read-only')).toBe(false));
        expect(first.hasAttribute('data-read-only')).toBe(true);
        expect(quillOf(second).getText().trim()).toBe('Notiz aus Tab eins');
    });

    it('gives the notebook to the waiting drawer when the editor closes', async () => {
        other = notebookController();
        await other.toggle();
        const [, second] = drawers();

        await controller.toggle();

        await vi.waitFor(() => expect(second.hasAttribute('data-read-only')).toBe(false));
        expect(quillOf(second).isEnabled()).toBe(true);
    });
});
