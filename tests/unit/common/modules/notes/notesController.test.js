// @vitest-browser
/**
 * The notes drawer's tab strip: the rename pencil that gives touch a route to a
 * rename (`dblclick` is the mouse route and stays), and the routing of the tab
 * click delegate the pencil branch was inserted into.
 *
 * That routing is the real risk here: a fourth branch was inserted into a
 * delegate whose three existing branches (add / delete / select) every page tab
 * depends on, and a mis-scoped selector there fails silently — the wrong verb
 * runs and nothing throws.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { NotesController } from '../../../../../src/common/modules/notes/notesController.js';
import { mountMainContent } from '../../../support/domShell.js';

const STORAGE_KEY = 'tba3_notes_notestest';

/** @type {NotesController} */
let controller;

const tabs = () => document.querySelectorAll('.notes-drawer-tab');
const activeTab = () => document.querySelector('.notes-drawer-tab[aria-selected="true"]');
const renameButtons = () => document.querySelectorAll('.notes-drawer-tab-rename');
const addButton = () => document.querySelector('.notes-drawer-tab-add');

beforeAll(() => {
    mountMainContent();
    localStorage.removeItem(STORAGE_KEY);
    controller = new NotesController({ appId: 'notestest' });
    controller.open();
});

beforeEach(() => {
    // Back to a single, unnamed page: the drawer is a singleton and its pages
    // are only reachable through the strip, so unwind them the way a user would.
    while (tabs().length > 1) {
        /** @type {HTMLElement} */ (document.querySelector('.notes-drawer-tab-delete')).click();
    }
    const input = document.querySelector('.notes-drawer-tab-input');
    if (input) /** @type {HTMLElement} */ (input).blur();
});

describe('rename pencil', () => {
    it('is the one control, and points at whichever page is active', () => {
        expect(tabs()).toHaveLength(1);
        expect(renameButtons()).toHaveLength(1);

        /** @type {HTMLElement} */ (addButton()).click();

        expect(tabs()).toHaveLength(2);
        // Still one pencil — it sits beside the tablist, not in it — and it acts
        // on the tab that is active.
        expect(renameButtons()).toHaveLength(1);
        expect(renameButtons()[0].getAttribute('data-page-id')).toBe(
            activeTab().getAttribute('data-page-id'),
        );
    });

    it('carries a Material Symbols glyph rather than a text mark', () => {
        // Structure check rule 9: every icon comes from the shared registry.
        expect(renameButtons()[0].querySelector('svg[data-icon="edit"]')).not.toBeNull();
    });

    it('opens the rename input and commits a new name', () => {
        /** @type {HTMLElement} */ (renameButtons()[0]).click();

        const input = /** @type {HTMLInputElement} */ (
            document.querySelector('.notes-drawer-tab-input')
        );
        expect(input).not.toBeNull();
        expect(document.activeElement).toBe(input);

        input.value = 'Elternabend';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(document.querySelector('.notes-drawer-tab-input')).toBeNull();
        expect(activeTab().textContent.trim()).toBe('Elternabend');
    });

    it('leaves the name alone when the rename is cancelled', () => {
        /** @type {HTMLElement} */ (renameButtons()[0]).click();
        const input = /** @type {HTMLInputElement} */ (
            document.querySelector('.notes-drawer-tab-input')
        );
        const before = input.value;

        input.value = 'verworfen';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(activeTab().textContent.trim()).toBe(before || '1');
    });
});

describe('tab semantics', () => {
    it('is a tablist of tabs, with the page controls outside it', () => {
        /** @type {HTMLElement} */ (addButton()).click();

        const tablist = document.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();
        // Only tabs inside — a button among them is what made the strip a tab list
        // with no tabs, and it is invisible to axe unless the rules stay on.
        expect([...tablist.children].every((el) => el.getAttribute('role') === 'tab')).toBe(true);
        expect(tablist.querySelector('.notes-drawer-tab-add')).toBeNull();
        expect(renameButtons()[0].closest('[role="tablist"]')).toBeNull();
    });

    it('puts only the active tab in the tab order and names the panel from it', () => {
        /** @type {HTMLElement} */ (addButton()).click();

        const stops = [...tabs()].map((tab) => tab.getAttribute('tabindex'));
        expect(stops.filter((value) => value === '0')).toHaveLength(1);
        expect(activeTab().getAttribute('tabindex')).toBe('0');

        const panel = document.getElementById(activeTab().getAttribute('aria-controls'));
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

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    });
});

describe('tab click routing', () => {
    it('still adds a page', () => {
        /** @type {HTMLElement} */ (addButton()).click();
        expect(tabs()).toHaveLength(2);
    });

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

        /** @type {HTMLElement} */ (document.querySelector('.notes-drawer-tab-delete')).click();

        expect(tabs()).toHaveLength(1);
        // The last page keeps no delete button — there must always be one page.
        expect(document.querySelector('.notes-drawer-tab-delete')).toBeNull();
    });
});
