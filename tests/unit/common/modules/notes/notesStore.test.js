// @vitest-browser

import { beforeEach, describe, expect, it } from 'vitest';
import { NotesStore } from '../../../../../src/common/modules/notes/notesStore.js';

// Notes are one notebook per dashboard and dataset.

/**
 * @param {string} scope - The dataset's id.
 * @returns {NotesStore} A store over that dataset's notebook.
 */
const open = (scope) => new NotesStore({ appId: 'en', scope });

/** @param {string} key - A localStorage key. */
const stored = (key) => JSON.parse(localStorage.getItem(key) ?? 'null');

describe('NotesStore', () => {
    beforeEach(() => localStorage.clear());

    it('keys each notebook by dashboard and dataset', () => {
        const first = open('groups/1');
        first.renameActive('Eins');
        open('groups/2').renameActive('Zwei');

        expect(stored('tba3_notes_en_groups/1').pages[0].name).toBe('Eins');
        expect(stored('tba3_notes_en_groups/2').pages[0].name).toBe('Zwei');
        expect(open('groups/1').activePage.name).toBe('Eins');
    });

    it('keeps the notebook in memory when a reload finds nothing stored', () => {
        const store = open('groups/1');
        store.renameActive('Bleibt');
        localStorage.clear();

        store.reload();

        expect(store.activePage.name).toBe('Bleibt');
    });

    it("stores the editor's content the moment it changes", () => {
        open('groups/1').setActiveDelta({ ops: [{ insert: 'Sofort' }] });

        expect(stored('tba3_notes_en_groups/1').pages[0].delta.ops[0].insert).toBe('Sofort');
    });

    it('clears every page down to one empty page, stored', () => {
        const store = open('groups/1');
        store.renameActive('Weg');
        store.add();

        store.clearAll();

        expect(store.pages).toHaveLength(1);
        expect(store.activePage.name).toBeNull();
        expect(stored('tba3_notes_en_groups/1').pages).toHaveLength(1);
        // Ids are never reused: a stale reference to an old page stays unresolvable.
        expect(store.activePageId).not.toBe('p1');
    });
});

describe('NotesStore.hasContent', () => {
    // Clearing a fresh notebook must not ask about losing something.
    it('is false for one empty, unnamed page, and true once a page is named or added', () => {
        const store = open('groups/9');
        expect(store.hasContent()).toBe(false);

        store.add();
        expect(store.hasContent()).toBe(true);

        store.clearAll();
        store.renameActive('Name');
        expect(store.hasContent()).toBe(true);
    });
});
