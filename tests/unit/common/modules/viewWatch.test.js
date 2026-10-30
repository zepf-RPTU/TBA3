// @vitest-browser

import { describe, expect, it } from 'vitest';

import { mountEmptyView } from '../../support/emptyView.js';

/**
 * A header control writes an app-state key and the view's watch() pushes the value to
 * its children. It follows hide/show: a hidden view's children must not re-render
 * while off-screen but catch up once, and the view lets go of the app state when it is
 * destroyed.
 */
/**
 * A view with nothing to render: only its watchers are under test.
 * @param {{[key: string]: unknown}} [initialState] - Seed state on top of the shell's keys.
 */
async function makeView(initialState = {}) {
    const { view, appState } = await mountEmptyView(initialState);
    /** @type {unknown[]} */
    const applied = [];
    view.watch(appState.vizMode, (mode) => applied.push(mode));
    return { appState, view, applied };
}

describe('BaseViewModule.watch', () => {
    it('applies a change live while the view is shown, and nothing on registration', async () => {
        const { appState, applied } = await makeView({ vizMode: 'stacked_bar' });
        expect(applied).toEqual([]);

        appState.vizMode.value = 'boxplot';

        expect(applied).toEqual(['boxplot']);
    });

    it('defers while hidden and applies only the latest value on show', async () => {
        // The SL overview is hidden while the Balken/Boxplot switch is toggled: its
        // tables and previews catch up once, with the final mode.
        const { appState, view, applied } = await makeView({ vizMode: 'stacked_bar' });

        view.hide();
        appState.vizMode.value = 'boxplot';
        appState.vizMode.value = 'stacked_bar';
        appState.vizMode.value = 'boxplot';
        expect(applied).toEqual([]);

        view.show();

        expect(applied).toEqual(['boxplot']);
    });

    it('applies nothing on a show after which no watched signal changed', async () => {
        const { view, applied } = await makeView({ vizMode: 'stacked_bar' });

        view.hide();
        view.show();

        expect(applied).toEqual([]);
    });

    it('applies nothing on show when a signal changed while hidden and changed back', async () => {
        // The view still shows the value: re-applying it would rebuild its children
        // behind a cover for nothing.
        const { appState, view, applied } = await makeView({ vizMode: 'stacked_bar' });

        view.hide();
        appState.vizMode.value = 'boxplot';
        appState.vizMode.value = 'stacked_bar';
        view.show();

        expect(applied).toEqual([]);
    });

    it('applies a value on show that differs from the last one it delivered', async () => {
        const { appState, view, applied } = await makeView({ vizMode: 'stacked_bar' });
        appState.vizMode.value = 'boxplot';

        view.hide();
        appState.vizMode.value = 'stacked_bar';
        view.show();

        expect(applied).toEqual(['boxplot', 'stacked_bar']);
    });

    it('stops watching when the view is destroyed', async () => {
        const { appState, view, applied } = await makeView({ vizMode: 'stacked_bar' });

        view.remove();
        // Teardown waits out a move, one microtask.
        await Promise.resolve();
        appState.vizMode.value = 'boxplot';

        expect(applied).toEqual([]);
    });

    it('refuses a second watcher of the same signal', async () => {
        // A second handler silently replacing the first would drop what the first
        // forwarded; one signal has one handler.
        const { appState, view } = await makeView({ vizMode: 'stacked_bar' });

        expect(() => view.watch(appState.vizMode, () => {})).toThrow(/already watched/);
    });
});
