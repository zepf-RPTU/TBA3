// @vitest-browser

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewLifecycle } from '../../../../src/common/app/viewLifecycle.js';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';

/**
 * These pin the two contracts the collaborator has with its app that the
 * app-level suite (appViewTransition.test.js) does not reach: a queued
 * navigation must be dispatched through the app's *public* showView() — that is
 * where subclass overrides (MA's layout-mode handling) live — and a theme switch
 * that lands mid-transition must be applied to the incoming view once it shows,
 * because its charts baked the old colors while the container was hidden.
 */

class FakeViewModule extends BaseViewModule {
    themeRefreshes = 0;

    async _renderView(data) {
        this.setData(data);
    }

    onThemeChanged() {
        this.themeRefreshes += 1;
    }
}

const VIEW_CONFIG = {
    alpha: {
        containerId: 'alpha-container',
        buttonId: 'a',
        icon: 'A',
        label: 'Alpha',
        load: async () => FakeViewModule,
    },
    beta: {
        containerId: 'beta-container',
        buttonId: 'b',
        icon: 'B',
        label: 'Beta',
        load: async () => FakeViewModule,
    },
    gamma: {
        containerId: 'gamma-container',
        buttonId: 'g',
        icon: 'G',
        label: 'Gamma',
        load: async () => FakeViewModule,
    },
};

/**
 * A lifecycle wired to a minimal fake app: view construction is real, the
 * app-side hooks are spies, and `navigate` routes back into the lifecycle the
 * way BaseAppModule.showView() does.
 */
function mountLifecycle() {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const state = { currentView: null };
    /** @type {any} */
    const deps = {
        ownerName: 'TestApp',
        viewConfig: VIEW_CONFIG,
        resources: { trackDisposable: () => {}, trackTimeout: () => {} },
        getCurrentView: () => state.currentView,
        setCurrentView: (viewType) => {
            state.currentView = viewType;
        },
        initializeView: async (viewType, container) => {
            const viewModule = new FakeViewModule(`${viewType}-module`, container, {});
            await viewModule.init({});
            return viewModule;
        },
        beforeShowView: vi.fn(async () => {}),
        afterShowView: vi.fn(),
        onViewActivated: vi.fn(),
        navigate: vi.fn((viewType, options) => lifecycle.showView(viewType, options)),
    };
    const lifecycle = new ViewLifecycle(deps);
    lifecycle.createContainers(parent);
    return { lifecycle, deps };
}

describe('ViewLifecycle', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('dispatches a navigation queued mid-transition through the app, with history replaced', async () => {
        const { lifecycle, deps } = mountLifecycle();
        await lifecycle.showView('alpha');

        // Park beta in its pre-show hook so a second request lands mid-transition.
        let release = () => {};
        deps.beforeShowView.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        );
        const inFlight = lifecycle.showView('beta');
        await Promise.resolve();
        await lifecycle.showView('gamma', { viewMode: 'split' });

        expect(deps.navigate).not.toHaveBeenCalled(); // nothing dispatched while beta is still in flight
        release();
        await inFlight;

        // The queued request re-enters through the app's showView() — the only
        // place a subclass override can act on it — carrying its own options.
        expect(deps.navigate).toHaveBeenCalledTimes(1);
        expect(deps.navigate).toHaveBeenCalledWith('gamma', {
            viewMode: 'split',
            replaceHistory: true,
        });
        // Dispatched fire-and-forget; let the queued transition land.
        await deps.navigate.mock.results[0].value;
        // A direct internal dispatch would land here too; the assertion above is
        // what tells the two apart. The URL side: the intermediate view leaves no
        // back entry.
        expect(deps.onViewActivated).toHaveBeenLastCalledWith('gamma', { replace: true });
    });

    it('runs the subclass hooks at dispatch time, with the request that is actually running', async () => {
        // The contract that let MA drop its showView() override: beforeShowView
        // sees the options of the transition that runs (a queued request's own,
        // not the in-flight one's), and afterShowView is told which view the
        // transition left — so a subclass never re-derives either.
        const { lifecycle, deps } = mountLifecycle();
        await lifecycle.showView('alpha');
        expect(deps.afterShowView).toHaveBeenLastCalledWith('alpha', { previousView: null });

        let release = () => {};
        deps.beforeShowView.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        );
        const inFlight = lifecycle.showView('beta', { viewMode: 'both' });
        await Promise.resolve();
        await lifecycle.showView('gamma', { viewMode: 'chart-only' });
        // Queued, not run: no hook has seen gamma's options yet.
        expect(deps.beforeShowView).not.toHaveBeenCalledWith('gamma', expect.anything());

        release();
        await inFlight;
        await deps.navigate.mock.results[0].value;

        expect(deps.beforeShowView).toHaveBeenLastCalledWith('gamma', {
            viewMode: 'chart-only',
            replaceHistory: true,
        });
        expect(deps.afterShowView).toHaveBeenLastCalledWith('gamma', { previousView: 'beta' });
    });

    it('makes whenViewRevealed() wait for a queued navigation to reach the screen', async () => {
        // The notes drawer's chip click does `await showView(v)` then
        // `await whenViewRevealed(v)` before scrolling to the linked module. A
        // click that lands mid-transition only *queues*: showView() returns with
        // the target neither current nor covered, and the real transition starts
        // later, from the finally. Resolving at that point would scroll against
        // the view the user is still looking at.
        const { lifecycle, deps } = mountLifecycle();
        await lifecycle.showView('alpha');

        let release = () => {};
        deps.beforeShowView.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        );
        const inFlight = lifecycle.showView('beta');
        await Promise.resolve();
        await lifecycle.showView('gamma'); // queued behind beta

        // What the queued target looks like right now: no render cover, no
        // placeholder — the same DOM a fully revealed view has. Nothing about
        // the container itself distinguishes "not started yet" from "done", so
        // the wait cannot be answered from cover state alone.
        const gammaContainer = lifecycle.getViewContainer('gamma');
        expect(gammaContainer.hasAttribute('data-view-rendering')).toBe(false);
        expect(document.querySelector('[data-skeleton-for="gamma-container"]')).toBeNull();

        let revealed = false;
        const startedAt = Date.now();
        const waiting = lifecycle.whenViewRevealed('gamma').then(() => {
            revealed = true;
        });
        await Promise.resolve();
        expect(revealed).toBe(false);

        release();
        await inFlight;
        await deps.navigate.mock.results[0].value;
        await waiting;

        expect(deps.getCurrentView()).toBe('gamma');
        expect(gammaContainer.hasAttribute('data-view-rendering')).toBe(false);
        // Resolved by observing the reveal, not by the 4s fail-safe — which would
        // pass every assertion above while giving the caller stale geometry.
        expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('applies a theme switch that landed mid-transition to the incoming view once it shows', async () => {
        const { lifecycle, deps } = mountLifecycle();
        await lifecycle.showView('alpha');
        await lifecycle.showView('beta');
        const alpha = /** @type {any} */ (lifecycle.getViewModule('alpha'));

        // Theme switches while alpha is being re-shown (hidden, mid-transition):
        // it must not be redrawn now against a display:none box, but it must
        // not keep the old colors either.
        let release = () => {};
        deps.beforeShowView.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        );
        const inFlight = lifecycle.showView('alpha');
        await Promise.resolve();
        lifecycle.refreshThemeInCurrentView();
        expect(alpha.themeRefreshes).toBe(0);

        release();
        await inFlight;

        expect(alpha.themeRefreshes).toBe(1);
        // Once applied, the mark is consumed: a later revisit does not redraw again.
        await lifecycle.showView('beta');
        await lifecycle.showView('alpha');
        expect(alpha.themeRefreshes).toBe(1);
    });
});
