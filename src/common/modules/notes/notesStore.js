/**
 * NotesStore — the notes drawer's page model: one notebook per dashboard and dataset,
 * split into user-created pages (numbered, renameable), persisted to localStorage on
 * every change. Never holding an unsaved edit is what lets another tab take the notebook
 * over at any moment (`notesEditLock.js`), and the record is a few KB, so a write per
 * keystroke costs nothing worth coalescing. Stored in plain text: encryption would need a password the reader
 * enters each session, and the storage never leaves this browser profile. A read-only
 * store (another tab edits the notebook, `notesEditLock.js`) changes its pages in memory
 * only. Knows nothing about the editor or the drawer's DOM.
 */

import { readJson, writeJson } from '../../services/jsonStorage.js';

/** @typedef {{ops: import('quill').Op[]}} StoredDelta */
/** @typedef {{id: string, name: string | null, delta: StoredDelta}} NotesPage */

/**
 * @param {NotesPage} page
 * @returns {boolean} Whether it holds any text.
 */
function hasText(page) {
    return page.delta.ops.some((op) => typeof op.insert === 'string' && op.insert.trim());
}

/** @type {StoredDelta} */
const EMPTY_DELTA = { ops: [] };

const STORAGE_KEY_PREFIX = 'tba3_notes_';

export class NotesStore {
    /** @type {NotesPage[]} */
    #pages = [];
    /** @type {string} id of the page currently shown in the editor */
    #activePageId = '';
    /** Monotonic counter behind page ids — never reused, so a stored id stays valid. */
    #nextPageNumber = 1;

    /** @type {string} The notebook's localStorage key. */
    #key;
    /** Whether changes stay in memory: another tab is the notebook's editor. */
    #readOnly = false;

    /**
     * @param {object} options
     * @param {string} options.appId - Dashboard id ('en'|'ma'|'sl').
     * @param {string} options.scope - The dataset's id; with the app id it keys the notebook.
     */
    constructor({ appId, scope }) {
        this.#key = `${STORAGE_KEY_PREFIX}${appId}_${scope}`;
        this.#load(readJson(this.#key));
    }

    /** @returns {string} The notebook's localStorage key. */
    get key() {
        return this.#key;
    }

    /** @param {boolean} readOnly - Whether changes stay in memory from now on. */
    set readOnly(readOnly) {
        this.#readOnly = readOnly;
    }

    /**
     * Read the notebook afresh: another tab may have saved it since. The active page
     * stays when the stored notebook still has it. With nothing readable stored (a
     * blocked storage) the notebook in memory is the only copy, and it stays.
     */
    reload() {
        const parsed = readJson(this.#key);
        if (parsed) this.#load(parsed);
    }

    /** @returns {readonly NotesPage[]} The pages, in tab order. */
    get pages() {
        return this.#pages;
    }

    /** @returns {string} The id of the page shown in the editor. */
    get activePageId() {
        return this.#activePageId;
    }

    /** @returns {NotesPage} The page shown in the editor. */
    get activePage() {
        return /** @type {NotesPage} */ (
            this.#pages.find((page) => page.id === this.#activePageId)
        );
    }

    /**
     * Show another page.
     * @param {string} pageId - An existing page's id.
     * @returns {boolean} Whether the active page changed.
     */
    select(pageId) {
        if (pageId === this.#activePageId || !this.#pages.some((page) => page.id === pageId)) {
            return false;
        }
        this.#activePageId = pageId;
        this.#write();
        return true;
    }

    /** Add an empty page after the others and show it. */
    add() {
        const page = this.#createPage();
        this.#pages.push(page);
        this.#activePageId = page.id;
        this.#write();
    }

    /** Remove the active page and show its neighbour; the last page is never removed. */
    removeActive() {
        if (this.#pages.length < 2) return;
        const index = this.#pages.findIndex((page) => page.id === this.#activePageId);
        this.#pages.splice(index, 1);
        this.#activePageId = this.#pages[Math.min(index, this.#pages.length - 1)].id;
        this.#write();
    }

    /**
     * Name the active page; an empty name falls back to the page's position number.
     * @param {string} name
     */
    renameActive(name) {
        this.activePage.name = name.trim() || null;
        this.#write();
    }

    /** Remove every page, leaving one empty page. */
    clearAll() {
        const page = this.#createPage();
        this.#pages = [page];
        this.#activePageId = page.id;
        this.#write();
    }

    /** @returns {boolean} Whether the active page holds any text. */
    activeHasContent() {
        return hasText(this.activePage);
    }

    /**
     * @returns {boolean} Whether clearing would lose anything: a second page, a page
     *   name, or any text. A fresh notebook (one empty, unnamed page) has nothing.
     */
    hasContent() {
        return (
            this.#pages.length > 1 ||
            this.#pages.some((page) => page.name !== null || hasText(page))
        );
    }

    /**
     * Store the editor's content in the active page.
     * @param {StoredDelta} delta
     */
    setActiveDelta(delta) {
        this.activePage.delta = delta;
        this.#write();
    }

    /** @returns {NotesPage} A new, empty page under the next unused id. */
    #createPage() {
        const page = { id: `p${this.#nextPageNumber}`, name: null, delta: EMPTY_DELTA };
        this.#nextPageNumber += 1;
        return page;
    }

    /** @param {Record<string, any>|null} parsed - The stored record, if any. */
    #load(parsed) {
        const pages = Array.isArray(parsed?.pages)
            ? parsed.pages.filter((page) => typeof page?.id === 'string')
            : [];

        if (!parsed || !pages.length) {
            this.#nextPageNumber = 1;
            const page = this.#createPage();
            this.#pages = [page];
            this.#activePageId = page.id;
            return;
        }

        this.#pages = pages.map((page) => ({
            id: page.id,
            name: typeof page.name === 'string' && page.name ? page.name : null,
            delta: page.delta?.ops ? page.delta : EMPTY_DELTA,
        }));
        this.#nextPageNumber = Number.isFinite(parsed.nextPageNumber)
            ? parsed.nextPageNumber
            : this.#pages.length + 1;
        const kept = [this.#activePageId, parsed.activePageId].find((id) =>
            this.#pages.some((page) => page.id === id),
        );
        this.#activePageId = kept ?? this.#pages[0].id;
    }

    #write() {
        if (this.#readOnly) return;
        writeJson(this.#key, {
            nextPageNumber: this.#nextPageNumber,
            activePageId: this.#activePageId,
            pages: this.#pages,
        });
    }
}
