// @vitest-browser

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewLifecycle } from '../../../../src/common/app/viewLifecycle.js';
import { createTestAppOptions } from '../../support/glossaryFixture.js';
import { viewOptions } from '../../support/viewOptions.js';
import { EmptyView } from '../../support/emptyView.js';
import { required } from '../../../../packages/modules/test/support/required.js';

/** @typedef {import('../../../../src/common/app/viewLifecycle.js').ViewLifecycleOptions} ViewLifecycleOptions */

/**
 * These pin the two contracts the collaborator has with its app that the
 * app-level suite (appViewTransition.test.js) does not reach: a queued
 * navigation runs the app's pre-show step with its own options, commits the view
 * state and replaces the history entry, and a queued showView() settles only once
 * its navigation has run.
 */

const VIEW_CONFIG = {
    alpha: {
        containerId: 'alpha-container',
        buttonId: 'a',
        icon: 'A',
        skeleton: /** @type {const} */ ('stack'),
        label: 'Alpha',
        headerGlossaryPath: 'test.alpha.header',
        navigationGlossaryPath: 'test.alpha.navigation',
        load: async () => EmptyView,
    },
    beta: {
        containerId: 'beta-container',
        buttonId: 'b',
        icon: 'B',
        skeleton: /** @type {const} */ ('stack'),
        label: 'Beta',
        headerGlossaryPath: 'test.beta.header',
        navigationGlossaryPath: 'test.beta.navigation',
        load: async () => EmptyView,
    },
    gamma: {
        containerId: 'gamma-container',
        buttonId: 'g',
        icon: 'G',
        skeleton: /** @type {const} */ ('stack'),
        label: 'Gamma',
        headerGlossaryPath: 'test.gamma.header',
        navigationGlossaryPath: 'test.gamma.navigation',
        load: async () => EmptyView,
    },
};

/**
 * A lifecycle over real views and a real app state, its app-side hooks spies.
 */
function mountLifecycle() {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    window.history.replaceState(null, '', '#');

    const { appState, comparisonState } = viewOptions({ viewMode: 'both' });
    /** @type {ViewLifecycleOptions} */
    const options = {
        ownerName: 'TestApp',
        viewConfig: VIEW_CONFIG,
        // A tracker that drops what it is handed: the idle prewarm of the other views
        // never runs, so only the navigations under test import a view.
        resources: /** @type {ViewLifecycleOptions['resources']} */ (
            /** @type {unknown} */ ({ trackSubscription: () => {}, trackTimeout: () => {} })
        ),
        viewOptions: {
            appState,
            comparisonState,
            studentView: undefined,
            context: createTestAppOptions('en').context,
        },
        beforeShowView: vi.fn(
            /** @type {ViewLifecycleOptions['beforeShowView']} */ (async () => {}),
        ),
        isNamedInline: vi.fn((/** @type {unknown} */ _error) => false),
    };
    const lifecycle = new ViewLifecycle(options);
    lifecycle.mount(parent, 'alpha');
    return { lifecycle, deps: options, state: appState };
}

/**
 * Hold the next beforeShowView() open so a second request lands mid-transition.
 * @param {ViewLifecycleOptions} deps - The lifecycle's options, its hooks spies.
 * @returns {() => void} Lets the parked navigation continue.
 */
function parkNextBeforeShow(deps) {
    let release = () => {};
    vi.mocked(deps.beforeShowView).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                release = () => resolve(undefined);
            }),
    );
    return () => release();
}

describe('ViewLifecycle', () => {
    beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('dispatches a navigation queued mid-transition, with history replaced', async () => {
        const { lifecycle, deps, state } = mountLifecycle();
        await lifecycle.showView('alpha');
        const replaced = vi.spyOn(window.history, 'replaceState');

        const release = parkNextBeforeShow(deps);
        const inFlight = lifecycle.showView('beta');
        await Promise.resolve();
        const queued = lifecycle.showView('gamma', { statePatch: { viewMode: 'split' } });

        expect(deps.beforeShowView).not.toHaveBeenCalledWith('gamma');
        // The patch is written at dispatch, not at queue time.
        expect(state.viewMode.peek()).toBe('both');
        release();
        await inFlight;
        await queued;

        expect(deps.beforeShowView).toHaveBeenCalledWith('gamma');
        expect(state.viewMode.peek()).toBe('split');
        // The intermediate view leaves no back entry.
        expect(window.location.hash).toBe('#gamma');
        expect(replaced).toHaveBeenLastCalledWith(null, '', '#gamma');
        // The view before it is the one the queued navigation left.
        expect(state.previousView.peek()).toBe('beta');
    });

    it('settles a queued showView() only once its navigation has run', async () => {
        // The notes drawer's chip click does `await showView(v)` then
        // `await whenViewRevealed(v)` before scrolling to the linked module. A click
        // that lands mid-transition only queues; if showView() settled then, the
        // reveal wait would see a view that is not current yet and scroll against
        // the view the user is still looking at.
        const { lifecycle, deps, state } = mountLifecycle();
        await lifecycle.showView('alpha');

        const release = parkNextBeforeShow(deps);
        const inFlight = lifecycle.showView('beta');
        await Promise.resolve();

        let settled = false;
        const queued = lifecycle.showView('gamma').then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        release();
        await inFlight;
        await queued;

        expect(state.currentView.peek()).toBe('gamma');
        await lifecycle.whenViewRevealed('gamma');
        expect(
            required(document.getElementById('gamma-container'), 'gamma view').hasAttribute(
                'data-view-rendering',
            ),
        ).toBe(false);
    });
});

describe('ViewLifecycle failure reports', () => {
    /** @returns {number} The toasts standing in the page. */
    const toastCount = () => document.querySelectorAll('.toast').length;

    beforeEach(() => {
        document.querySelectorAll('.toast').forEach((toast) => toast.remove());
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('raises no toast for the dataset load bootstrap names above the views', async () => {
        // A second alert repeating the inline message buried the recovery it names.
        const { lifecycle, deps } = mountLifecycle();
        await lifecycle.showView('alpha');
        const loadFailure = new Error('dataset');
        vi.mocked(deps.beforeShowView).mockRejectedValueOnce(loadFailure);
        vi.mocked(deps.isNamedInline).mockImplementation(
            (/** @type {unknown} */ error) => error === loadFailure,
        );

        await lifecycle.showView('beta');

        expect(toastCount()).toBe(0);
    });

    it('puts back the state a navigation patched when its switch rolls back', async () => {
        // An MA nav card's chart-only patch otherwise outlived the failed switch.
        const { lifecycle, deps, state } = mountLifecycle();
        await lifecycle.showView('alpha');
        let patchedDuringSwitch = null;
        vi.mocked(deps.beforeShowView).mockImplementationOnce(async () => {
            patchedDuringSwitch = state.viewMode.peek();
            throw new Error('view');
        });

        await lifecycle.showView('beta', { statePatch: { viewMode: 'chart-only' } });

        expect(patchedDuringSwitch).toBe('chart-only');
        expect(state.viewMode.peek()).toBe('both');
        expect(state.currentView.peek()).toBe('alpha');
    });

    it('keeps the patched state of a switch that went through', async () => {
        const { lifecycle, state } = mountLifecycle();
        await lifecycle.showView('alpha');

        await lifecycle.showView('beta', { statePatch: { viewMode: 'chart-only' } });

        expect(state.viewMode.peek()).toBe('chart-only');
        expect(state.currentView.peek()).toBe('beta');
    });

    it('writes the state patch of a navigation to the view already shown', async () => {
        const { lifecycle, state } = mountLifecycle();
        await lifecycle.showView('alpha');

        await lifecycle.showView('alpha', { statePatch: { viewMode: 'split' } });

        expect(state.viewMode.peek()).toBe('split');
    });

    it('still toasts a view that failed for any other reason', async () => {
        const { lifecycle, deps } = mountLifecycle();
        await lifecycle.showView('alpha');
        vi.mocked(deps.beforeShowView).mockRejectedValueOnce(new Error('view'));

        await lifecycle.showView('beta');

        expect(toastCount()).toBe(1);
    });
});

describe('ViewLifecycle view announcement', () => {
    it('names the view in the tab always, and focuses its heading on a switch, not on the page load', async () => {
        // A switch otherwise leaves focus on <body> and every tab titled alike; a deep
        // link's title and history entry name its view too.
        const heading = document.createElement('h1');
        heading.textContent = 'Ansicht';
        document.body.prepend(heading);
        document.title = 'TBA3 – Test';
        const { lifecycle } = mountLifecycle();

        await lifecycle.showView('alpha');
        expect(document.title).toBe('Alpha – TBA3 – Test');
        expect(document.activeElement).not.toBe(heading);

        await lifecycle.showView('beta');
        expect(document.title).toBe('Beta – TBA3 – Test');
        expect(document.activeElement).toBe(heading);
        heading.remove();
    });

    it('names the view but leaves focus in place on a switch that keeps focus', async () => {
        // The notes editor's link chips switch views while the writer keeps typing.
        const heading = document.createElement('h1');
        document.body.prepend(heading);
        const editor = document.createElement('textarea');
        document.body.append(editor);
        document.title = 'TBA3 – Test';
        const { lifecycle } = mountLifecycle();

        await lifecycle.showView('alpha');
        editor.focus();
        await lifecycle.showView('beta', { keepFocus: true });

        expect(document.title).toBe('Beta – TBA3 – Test');
        expect(document.activeElement).toBe(editor);
        heading.remove();
        editor.remove();
    });
});
