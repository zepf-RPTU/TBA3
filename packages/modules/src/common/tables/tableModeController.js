/**
 * A value a table follows (a display mode such as `vizMode`, the student it shows): a reactive controller the table composes. The owning view passes the
 * app's signal down as the table's option; a table built standalone passes a plain value
 * and gets a signal of its own.
 */

import { effect, signal, Signal, untracked } from '@preact/signals-core';

/**
 * What a table needs to be driven by a mode: the gate that holds a change until the
 * table is shown and built.
 * @typedef {Pick<import('./tableModule.js').TableModule, 'addController' | 'deferUntilReady'>} TableModeHost
 */

/**
 * @template T
 */
export class TableModeController {
    #host;
    /** @type {import('@preact/signals-core').ReadonlySignal<T>} */
    #mode;
    #key;
    #apply;
    /** @type {T} The mode the table was last brought to: the one it was built for, then each one handed to `apply`. */
    #applied;
    /** @type {(() => void)|null} Ends the effect; set while the host is connected. */
    #dispose = null;

    /**
     * Registers itself with the host (`host.addController(this)`), so a table creates it
     * in its `_setup()`, from its options.
     * @param {TableModeHost} host
     * @param {object} config
     * @param {T | import('@preact/signals-core').ReadonlySignal<T>} config.mode - The mode, or the signal it follows (the app's).
     * @param {string} config.key - The deferral key: a newer change replaces a pending older one.
     * @param {(mode: T, previous: T) => void} config.apply - Brings the table to a new
     *     mode, from the one it was in. It must handle having no table yet (a change can
     *     land during the module's first pass, or after `clear()`), and a hook that keeps
     *     a persistent filter must track the mode then too, so the next table is built
     *     with it.
     */
    constructor(host, { mode, key, apply }) {
        this.#host = host;
        this.#mode =
            mode instanceof Signal
                ? /** @type {import('@preact/signals-core').ReadonlySignal<T>} */ (mode)
                : signal(/** @type {T} */ (mode));
        this.#applied = this.#mode.peek();
        this.#key = key;
        this.#apply = apply;
        host.addController(this);
    }

    /**
     * The current mode, which the table builds for (its columns, filters and
     * formatters read it). A tracked read.
     * @returns {T}
     */
    get value() {
        return this.#mode.value;
    }

    /**
     * Follow the mode while connected. A change applies once the table is visible and
     * built (`deferUntilReady`: a hidden tab queues it, the latest change wins), with
     * the mode in force at that moment.
     */
    hostConnected() {
        this.#dispose = effect(() => {
            if (this.#mode.value === this.#applied) return;
            untracked(() => this.#schedule());
        });
    }

    hostDisconnected() {
        this.#dispose?.();
        this.#dispose = null;
    }

    #schedule() {
        this.#host.deferUntilReady(`${this.#key}Change`, () => {
            const previous = this.#applied;
            this.#applied = this.#mode.peek();
            this.#apply(this.#applied, previous);
        });
    }
}

/**
 * Follow the student a table shows: a new one runs the table's content pass again once
 * the table is shown and built (a hidden table catches up when shown, the latest student
 * wins); none leaves the table as it is.
 * @param {import('./tableModule.js').TableModule<any>} table
 * @param {import('@preact/signals-core').ReadonlySignal<string|null> | string | null | undefined} studentId
 * @returns {TableModeController<string|null>} Its `value` is the student to render.
 */
export function followStudent(table, studentId) {
    return new TableModeController(table, {
        mode: studentId ?? null,
        key: 'student',
        apply: (next) => {
            if (!next) return;
            table.refreshContent().catch((error) => {
                console.error(`${table.constructor.name}: Error showing the student:`, error);
            });
        },
    });
}
