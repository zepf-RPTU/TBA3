import { describe, expect, it, vi } from 'vitest';

import { AppState } from '../../../../src/common/app/appState.js';

/**
 * Mode state (viz mode, domain mode, …) is app state, not a bus event: the
 * header control writes the key and the view that renders the mode observes
 * it. These cases pin the contract views rely on — delivery only on an actual
 * change, in write order, and isolation between observers.
 */
function makeState(initialState = {}) {
    return new AppState({ initialState });
}

describe('AppState.observe', () => {
    it('delivers the new and previous value on a change of the observed key', () => {
        const state = makeState({ vizMode: 'stacked_bar' });
        const seen = [];
        state.observe('vizMode', (value, previous) => seen.push([value, previous]));

        state.updateState({ vizMode: 'boxplot' });

        expect(seen).toEqual([['boxplot', 'stacked_bar']]);
    });

    it('delivers nothing for a write that does not change the value — a control re-firing must cascade nowhere', () => {
        const state = makeState({ vizMode: 'boxplot' });
        const observer = vi.fn();
        state.observe('vizMode', observer);

        state.updateState({ vizMode: 'boxplot' });
        state.updateState({ displayMode: 'table' });

        expect(observer).not.toHaveBeenCalled();
    });

    it('delivers nothing on registration — the current value is read, not pushed', () => {
        const state = makeState({ vizMode: 'boxplot' });
        const observer = vi.fn();

        state.observe('vizMode', observer);

        expect(observer).not.toHaveBeenCalled();
        expect(state.getStateValue('vizMode')).toBe('boxplot');
    });

    it('stops delivering after the returned unsubscribe', () => {
        const state = makeState({ vizMode: 'boxplot' });
        const observer = vi.fn();
        const unsubscribe = state.observe('vizMode', observer);

        unsubscribe();
        state.updateState({ vizMode: 'stacked_bar' });

        expect(observer).not.toHaveBeenCalled();
    });

    it('a throwing observer does not cost the others their delivery', () => {
        const state = makeState({ vizMode: 'boxplot' });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const second = vi.fn();
        state.observe('vizMode', () => {
            throw new Error('boom');
        });
        state.observe('vizMode', second);

        state.updateState({ vizMode: 'stacked_bar' });

        expect(second).toHaveBeenCalledWith('stacked_bar', 'boxplot');
        expect(errorSpy).toHaveBeenCalledTimes(1);
        errorSpy.mockRestore();
    });

    it('setComparisonMode reaches comparisonState observers through the same path', () => {
        const state = makeState({ comparisonState: { school: true } });
        const seen = [];
        state.observe('comparisonState', (value) => seen.push(value));

        state.setComparisonMode('school', false);

        expect(seen).toEqual([{ school: false }]);
    });
});
