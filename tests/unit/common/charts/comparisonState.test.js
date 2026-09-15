/**
 * The comparison-state port — what a chart needs to know which averages are shown.
 *
 * The distinction the whole port turns on: **no state is not an empty list.** A host
 * that supplies nothing has no opinion, and its charts draw every average the payload
 * carries; a host that supplies an empty list has said "show none". tba3 always
 * supplies a state, so the no-opinion branch exists for a consumer and is pinned here
 * rather than by any dashboard test.
 */

import { describe, expect, it, vi } from 'vitest';

import {
    bindComparisonState,
    createComparisonState,
    initialActiveModes,
} from '@tba3/modules/common/charts/comparisonState.js';

describe('initialActiveModes', () => {
    it('reports null when no state was supplied, which every chart reads as "draw them all"', () => {
        expect(initialActiveModes({})).toBeNull();
        expect(initialActiveModes({ comparisonState: null })).toBeNull();
        expect(initialActiveModes(undefined)).toBeNull();
    });

    it('reports an empty list when a state says nothing is shown — an opinion, not an absence', () => {
        expect(initialActiveModes({ comparisonState: createComparisonState() })).toEqual([]);
    });

    it('reports the active ids a state carries', () => {
        const state = createComparisonState(['school', 'state']);

        expect(initialActiveModes({ comparisonState: state })).toEqual(['school', 'state']);
    });
});

describe('createComparisonState', () => {
    it('answers isActive for the ids it was seeded with', () => {
        const state = createComparisonState(['state']);

        expect(state.isActive('state')).toBe(true);
        expect(state.isActive('school')).toBe(false);
    });

    it('publishes the whole active list on a change, not the delta', () => {
        const state = createComparisonState(['school']);
        const seen = vi.fn();
        state.subscribe(seen);

        state.setActive('state', true);

        expect(seen).toHaveBeenCalledTimes(1);
        expect(seen).toHaveBeenLastCalledWith(['school', 'state']);
    });

    it('stays silent when a toggle changes nothing', () => {
        // WHY: charts absorb duplicates, but a state that republishes on every click
        // makes every chart on the page re-render for a no-op.
        const state = createComparisonState(['school']);
        const seen = vi.fn();
        state.subscribe(seen);

        state.setActive('school', true);
        state.setActive('missing', false);

        expect(seen).not.toHaveBeenCalled();
    });

    it('stops delivering once unsubscribed', () => {
        const state = createComparisonState();
        const seen = vi.fn();
        const unsubscribe = state.subscribe(seen);

        unsubscribe();
        state.setActive('school', true);

        expect(seen).not.toHaveBeenCalled();
    });

    it('hands out a copy, so a caller cannot edit the state through its answer', () => {
        const state = createComparisonState(['school']);

        state.getActiveModes().push('state');

        expect(state.getActiveModes()).toEqual(['school']);
    });
});

describe('bindComparisonState', () => {
    it('pushes every later change into the host, and stops when released', () => {
        // WHY: charts pull their initial visibility in their constructor and are pushed
        // to afterwards. Binding covers only the second half — which is why a host must
        // be constructed with the same state object it is bound to.
        const state = createComparisonState();
        const host = { setActiveModes: vi.fn() };

        const release = bindComparisonState(host, state);
        state.setActive('school', true);
        release();
        state.setActive('state', true);

        expect(host.setActiveModes).toHaveBeenCalledTimes(1);
        expect(host.setActiveModes).toHaveBeenLastCalledWith(['school']);
    });
});
