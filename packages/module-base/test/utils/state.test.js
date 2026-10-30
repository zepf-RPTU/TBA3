import { batch, effect, signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';

import { createState, onChange, writeState } from '../../src/utils/state.js';

/**
 * State is signals, for the app and for every module and renderer: a writer sets the
 * key, whoever renders it follows it in an effect. These cases pin the contract —
 * one signal per key, a given signal shared rather than copied, a multi-key write seen
 * whole, and no delivery for a write that changes nothing.
 */

/**
 * Follow one key through an effect, recording every change after registration.
 * @param {import('@preact/signals-core').Signal<unknown>} source
 * @returns {{seen: unknown[], dispose: () => void}}
 */
function follow(source) {
    /** @type {unknown[]} */
    const seen = [];
    let first = true;
    const dispose = effect(() => {
        const value = source.value;
        if (first) {
            first = false;
            return;
        }
        seen.push(value);
    });
    return { seen, dispose };
}

describe('createState', () => {
    it('keeps a signal it is given, so the owner and the holder share one copy', () => {
        const mode = signal('all');
        const state = createState({ mode, studentId: null });
        const { seen } = follow(state.mode);

        mode.value = 'd1';

        expect(state.mode).toBe(mode);
        expect(seen).toEqual(['d1']);
    });

    it('notifies nobody for a write that does not change the value — a control re-firing must cascade nowhere', () => {
        const state = createState({ vizMode: 'boxplot', displayMode: 'charts' });
        const { seen } = follow(state.vizMode);

        state.vizMode.value = 'boxplot';
        state.displayMode.value = 'table';

        expect(seen).toEqual([]);
    });
});

describe('onChange', () => {
    it('runs on a value change, not on a re-read that yields the same value', () => {
        const state = createState({ mode: 'all', studentId: /** @type {string|null} */ (null) });
        const run = vi.fn();
        onChange(() => state.mode.value === 'all', run);

        state.mode.value = 'd1';
        state.mode.value = 'd2';

        expect(run.mock.calls).toEqual([[false]]);
    });

    it('compares a fresh array element by element', () => {
        const state = createState({ mode: 'all', studentId: /** @type {string|null} */ (null) });
        const run = vi.fn();
        onChange(() => [state.mode.value, state.studentId.value], run);

        writeState(state, { mode: 'd1' });
        writeState(state, { mode: 'all' });
        writeState(state, { mode: 'all', studentId: 's1' });

        expect(run.mock.calls).toEqual([[['d1', null]], [['all', null]], [['all', 's1']]]);
    });

    it('skips a batch that writes a key away and back', () => {
        const state = createState({ mode: 'all' });
        const run = vi.fn();
        onChange(() => [state.mode.value], run);

        batch(() => {
            state.mode.value = 'd1';
            state.mode.value = 'all';
        });

        expect(run).not.toHaveBeenCalled();
    });
});

describe('writeState', () => {
    it('writes several keys as one batch: a reader of both never sees half the patch', () => {
        const state = createState({
            previousView: /** @type {string|null} */ (null),
            currentView: 'summary',
        });
        const reader = vi.fn();
        let first = true;
        effect(() => {
            const pair = [state.previousView.value, state.currentView.value];
            if (first) {
                first = false;
                return;
            }
            reader(pair);
        });

        writeState(state, { previousView: 'summary', currentView: 'overview' });

        expect(reader).toHaveBeenCalledTimes(1);
        expect(reader).toHaveBeenCalledWith(['summary', 'overview']);
    });

    it('throws on a key the state does not carry — a typo is a wiring bug, not a new key', () => {
        const state = createState({ vizMode: 'boxplot' });

        // The typo the types would reject is the point: the guard is for untyped callers.
        const typo = /** @type {{vizMode?: string}} */ (
            /** @type {unknown} */ ({ vizMod: 'stacked_bar' })
        );
        expect(() => writeState(state, typo)).toThrow(/no key 'vizMod'/);
        expect('vizMod' in state).toBe(false);
    });
});
