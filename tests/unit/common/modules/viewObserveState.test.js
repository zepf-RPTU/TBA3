// @vitest-browser

import { describe, expect, it, vi } from 'vitest';

import { AppState } from '../../../../src/common/app/appState.js';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';

/**
 * observeState() is the mode counterpart of subscribe(): the header control
 * writes an app-state key, the view pushes the value to its children. It has
 * to follow suspend/resume exactly like a bus subscription — a hidden view's
 * children must not re-render while off-screen, but must catch up once — and
 * it has to let go of the app state when the view is destroyed.
 */
function makeView(initialState = {}) {
    const appState = new AppState({ initialState });
    const view = new BaseViewModule('view', null, { appState });
    const applied = [];
    const unsubscribe = view.observeState('vizMode', (mode) => applied.push(mode));
    return { appState, view, applied, unsubscribe };
}

describe('BaseViewModule.observeState', () => {
    it('applies a change live while the view is shown', () => {
        const { appState, applied } = makeView({ vizMode: 'stacked_bar' });

        appState.updateState({ vizMode: 'boxplot' });

        expect(applied).toEqual(['boxplot']);
    });

    it('defers while suspended and applies only the latest value on resume', () => {
        // SL overview hidden behind the summary view while the user toggles the
        // Balken/Boxplot switch twice: its tables and previews catch up once,
        // with the final mode.
        const { appState, view, applied } = makeView({ vizMode: 'stacked_bar' });

        view.suspend();
        appState.updateState({ vizMode: 'boxplot' });
        appState.updateState({ vizMode: 'stacked_bar' });
        appState.updateState({ vizMode: 'boxplot' });
        expect(applied).toEqual([]);

        view.resume();

        expect(applied).toEqual(['boxplot']);
    });

    it('applies nothing on a resume during which no observed key changed', () => {
        const { view, applied } = makeView({ vizMode: 'stacked_bar' });

        view.suspend();
        view.resume();

        expect(applied).toEqual([]);
    });

    it('flushes the pending value on resume', () => {
        const { appState, view, applied } = makeView({ vizMode: 'stacked_bar' });

        view.suspend();
        appState.updateState({ vizMode: 'boxplot' });
        view.resume();

        expect(applied).toEqual(['boxplot']);
    });

    it('drops the pending recording when the observer unsubscribes while suspended', () => {
        // The returned remover must clean up the suspend recording too: a
        // handler unsubscribed while its view is hidden must not be revived
        // by the resume flush.
        const { appState, view, applied, unsubscribe } = makeView({ vizMode: 'stacked_bar' });

        view.suspend();
        appState.updateState({ vizMode: 'boxplot' });
        unsubscribe();
        view.resume();

        expect(applied).toEqual([]);
    });

    it('stops observing when the view is destroyed', () => {
        const { appState, view, applied } = makeView({ vizMode: 'stacked_bar' });

        view.destroy();
        appState.updateState({ vizMode: 'boxplot' });

        expect(applied).toEqual([]);
    });

    it('warns and returns null without an observable app state', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const view = new BaseViewModule('view', null, {
            appState: { getStateValue: () => undefined },
        });

        expect(view.observeState('vizMode', () => {})).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        warnSpy.mockRestore();
    });
});
