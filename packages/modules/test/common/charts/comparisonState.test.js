/**
 * The comparison-state port: what a chart reads to know which averages are shown. No state
 * is not an empty list: a host that supplies none has its charts draw every average the
 * payload carries, a host that supplies an empty list shows none.
 */

import { effect } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';

import { createComparisonState } from '../../../src/common/charts/comparisonState.js';

/**
 * Follow the active list as a chart does: a tracked read inside an effect, changes only.
 * @param {import('../../../src/common/charts/comparisonState.js').ComparisonState} state
 * @returns {Array<ReadonlyArray<string>>} The lists seen after registration.
 */
function follow(state) {
    /** @type {Array<ReadonlyArray<string>>} */
    const seen = [];
    let first = true;
    effect(() => {
        const ids = state.activeModes.value;
        if (first) {
            first = false;
            return;
        }
        seen.push(ids);
    });
    return seen;
}

describe('createComparisonState', () => {
    it('answers isActive for the ids switched on', () => {
        const state = createComparisonState();
        state.setActive('state', true);

        expect(state.isActive('state')).toBe(true);
        expect(state.isActive('school')).toBe(false);
    });

    it('is a tracked read: a reader in an effect sees the whole list on a change', () => {
        // A chart follows the ⌀ toggles by reading the port in an effect; nothing
        // pushes the list to it.
        const state = createComparisonState();
        state.setActive('school', true);
        const seen = follow(state);

        state.setActive('state', true);

        expect(seen).toEqual([['school', 'state']]);
    });

    it('stays silent when a toggle changes nothing', () => {
        // Charts absorb duplicates, but a state that republishes on every click
        // makes every chart on the page re-render for a no-op.
        const state = createComparisonState();
        state.setActive('school', true);
        const seen = follow(state);

        state.setActive('school', true);
        state.setActive('missing', false);

        expect(seen).toEqual([]);
    });

    it('hands out a frozen list, so a caller cannot edit the state through its answer', () => {
        const state = createComparisonState();
        state.setActive('school', true);

        expect(Object.isFrozen(state.activeModes.value)).toBe(true);
    });
});
