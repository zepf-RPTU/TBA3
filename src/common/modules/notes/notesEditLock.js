/**
 * One editor per notebook. Two tabs editing the same stored notebook would each
 * overwrite the other's pages with every save, so the drawer holds the notebook's Web
 * Lock while it is open. A tab that opens the notebook meanwhile waits in the lock's
 * queue and shows it read-only; it becomes the editor when the editing tab closes its
 * drawer, or at once when the reader takes the notebook over (`steal`), which puts the
 * other tab back in the queue — WhatsApp Web's "use here".
 *
 * Web Locks exist only in a secure context; without them, or when a request fails, the
 * tab edits unlocked, as before there was a lock.
 */

import { holdLock } from '../../services/webLock.js';

/**
 * The releases of this page still in flight, by lock name, until the browser has freed
 * the lock: a drawer reopened at once would otherwise find its own lock held and open
 * read-only.
 * @type {Map<string, Promise<void>>}
 */
const releasing = new Map();

export class NotesEditLock {
    /** @type {string} */
    #name;
    /** @type {() => void} */
    #onChange;
    /** Whether the drawer wants the lock: between acquire() and release(). */
    #wanted = false;
    #editing = false;
    /** @type {(() => Promise<void>)|null} Lets go of the held lock. */
    #release = null;
    /** @type {AbortController|null} Withdraws the request waiting in the queue. */
    #queued = null;
    /** Whether a steal() is on its way: a second click must not steal from the first. */
    #stealing = false;

    /**
     * @param {string} name - The lock's name: the notebook's storage key.
     * @param {() => void} onChange - Told whenever this tab becomes the editor or stops
     *   being it, except by its own release().
     */
    constructor(name, onChange) {
        this.#name = name;
        this.#onChange = onChange;
    }

    /** @returns {boolean} Whether this tab may edit the notebook. */
    get editing() {
        return this.#editing;
    }

    /**
     * Take the lock when no tab holds it, otherwise queue for it.
     * @returns {Promise<void>} Settles once `editing` tells which of the two it was.
     */
    async acquire() {
        this.#wanted = true;
        if (!navigator.locks) {
            this.#granted(null);
            return;
        }
        try {
            await releasing.get(this.#name);
            const release = await holdLock(this.#name, { ifAvailable: true }, this.#lost);
            if (release) this.#granted(release);
            else if (this.#wanted) this.#queue();
        } catch (error) {
            this.#unlocked(error);
        }
    }

    /** Take the notebook over from the tab that edits it. */
    steal() {
        if (!this.#wanted || this.#editing || this.#stealing) return;
        this.#stealing = true;
        this.#withdraw();
        void holdLock(this.#name, { steal: true }, this.#lost)
            .then(this.#granted, this.#unlocked)
            .finally(() => {
                this.#stealing = false;
            });
    }

    /** Let go of the lock, or leave the queue; the next tab in it becomes the editor. */
    release() {
        this.#wanted = false;
        this.#withdraw();
        if (this.#release) this.#letGo(this.#release);
        this.#release = null;
        this.#editing = false;
    }

    #queue() {
        const queued = new AbortController();
        this.#queued = queued;
        holdLock(this.#name, { signal: queued.signal }, this.#lost).then(
            (release) => {
                this.#queued = null;
                this.#granted(release);
            },
            (error) => {
                if (!queued.signal.aborted) this.#unlocked(error);
            },
        );
    }

    /** @param {() => Promise<void>} release */
    #letGo(release) {
        const freed = release();
        releasing.set(this.#name, freed);
        void freed.then(() => {
            if (releasing.get(this.#name) === freed) releasing.delete(this.#name);
        });
    }

    #withdraw() {
        this.#queued?.abort();
        this.#queued = null;
    }

    /** @param {(() => Promise<void>)|null} release - Null when editing unlocked. */
    #granted = (release) => {
        // The drawer closed while the request was on its way.
        if (!this.#wanted) {
            if (release) this.#letGo(release);
            return;
        }
        this.#release = release;
        this.#set(true);
    };

    /** @param {() => Promise<void>} release - The stolen lock's; one this tab no longer holds is no news. */
    #lost = (release) => {
        if (release !== this.#release) return;
        this.#release = null;
        this.#set(false);
        if (this.#wanted) this.#queue();
    };

    /** @param {unknown} error */
    #unlocked = (error) => {
        console.warn('[notesEditLock] Could not take the notes lock, editing unlocked:', error);
        this.#granted(null);
    };

    /** @param {boolean} editing */
    #set(editing) {
        if (editing === this.#editing) return;
        this.#editing = editing;
        this.#onChange();
    }
}
