/**
 * State as signals: a plain record of `@preact/signals-core` signals, one per key. A
 * reader reads `state.key.value`; inside an effect the read subscribes, so the effect
 * runs again when the key changes. A writer sets `state.key.value = x`, or several keys
 * through `writeState`.
 *
 * Sharing is by reference: a key whose initial value is already a signal keeps that
 * signal, so whoever is handed one holds the one copy its owner writes.
 */

import { batch, effect, signal, Signal, untracked } from '@preact/signals-core';
import { sameItems } from './sameItems.js';

/**
 * A state: one signal per key of `T`.
 * @template {object} T
 * @typedef {{[K in keyof T]: Signal<T[K]>}} State
 */

/**
 * What `createState` takes for a state `T`: per key, the starting value, or a signal
 * to share.
 * @template {object} T
 * @typedef {{[K in keyof T]: T[K] | Signal<T[K]>}} StateInit
 */

/**
 * Build a state: `toSignal` per key.
 * @template {object} T
 * @param {StateInit<T>} initial - Every key's starting value, or the signal it shares.
 * @returns {State<T>}
 */
export function createState(initial) {
    return /** @type {State<T>} */ (
        Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, toSignal(value)]))
    );
}

/**
 * A value as a signal: a signal is shared as it is, a plain value gets a new one.
 * @template T
 * @param {T | Signal<T>} value - The value, or the signal to share.
 * @returns {Signal<T>}
 */
export function toSignal(value) {
    return value instanceof Signal ? value : signal(value);
}

/**
 * Whether two `read` results are the same value: `Object.is`, or element by element
 * for two arrays, so a `read` that returns a fresh `[a, b]` fires only when `a` or `b`
 * changes.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
    return Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && sameItems(a, b));
}

/**
 * Follow what `read` reads and call `run` when its result changes — value changes
 * only: the first run just subscribes, as the caller has already acted on the current
 * value, and a re-run whose result equals the last one (`sameValue`) does nothing.
 * `run` is untracked, so the signals its work reads do not subscribe the effect.
 * @template T
 * @param {() => T} read - Reads the signals to follow; its result goes to `run`.
 * @param {(value: T) => void} run - The work a change triggers.
 * @returns {() => void} Disposes the effect.
 */
export function onChange(read, run) {
    let first = true;
    /** @type {T} */
    let last;
    return effect(() => {
        const value = read();
        if (first) {
            first = false;
            last = value;
            return;
        }
        if (sameValue(last, value)) return;
        last = value;
        untracked(() => run(value));
    });
}

/**
 * Write several keys at once: effects see either none or all of the patch. A key the
 * state does not carry is a wiring bug, not a new key.
 * @template {object} T
 * @param {State<T>} state
 * @param {Partial<T>} patch
 * @throws {Error} for a key the state does not carry
 */
export function writeState(state, patch) {
    // Every key is checked before any is written: a batch that throws midway still
    // flushes the keys it wrote.
    const writes = Object.entries(patch).map(([key, value]) => {
        const target = /** @type {{[key: string]: Signal<unknown>|undefined}} */ (state)[key];
        if (!target) throw new Error(`writeState: the state has no key '${key}'`);
        return /** @type {const} */ ([target, value]);
    });
    batch(() => {
        for (const [target, value] of writes) target.value = value;
    });
}
