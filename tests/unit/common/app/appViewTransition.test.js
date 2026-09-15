// @vitest-browser

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAppModule } from '../../../../src/common/app/appModule.js';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { BaseModule } from '@tba3/module-base/modules/baseModule.js';
import { mountMainContent } from '../../support/domShell.js';

/**
 * These tests cover what happens when a view transition does *not* go to plan.
 *
 * showView() applies a transition in steps: it hides and suspends the outgoing
 * view first, and only records the new one as current once that view has
 * initialized. Anything that throws in between leaves the shell half-switched —
 * and because `#state.currentView` still names the view that was just hidden,
 * the "already on requested view" guard turns that view's own nav button into a
 * no-op. The user would be looking at a blank page with no way back.
 *
 * The assertions below are written against that outcome, not against the
 * implementation: after a failed switch the app must be on a *live* view, and a
 * view whose render threw must be retryable.
 */

/** Fake view module. `renderBehavior` decides how its render pass ends. */
class FakeViewModule extends BaseViewModule {
    /** Counts onResume() calls so tests can tell a resume from a first show. */
    onResumeCalls = 0;

    async _renderView(data) {
        this.setData(data);

        const behavior = FakeViewModule.renderBehavior[this.id] ?? 'resolve';
        if (behavior === 'throw') {
            // Throws inside the render template, i.e. with the container already
            // covered by beginViewRender() — the case that used to strand a view
            // at visibility: hidden for the rest of the session.
            throw new Error(`render failed: ${this.id}`);
        }

        if (behavior === 'never-settles') {
            const child = new BaseModule(`${this.id}-child`, document.createElement('div'));
            child.whenSettled = () => new Promise(() => {});
            this.registerChildModule(child);
        }
    }

    onResume() {
        this.onResumeCalls += 1;
    }

    destroy() {
        FakeViewModule.destroyedIds.push(this.id);
        super.destroy();
    }
}

/** @type {Object<string, 'resolve'|'throw'|'never-settles'>} */
FakeViewModule.renderBehavior = {};

/** Ids of instances whose destroy() ran, so tests can assert half-built cleanup. */
FakeViewModule.destroyedIds = [];

/** Stands in for `() => import('./views/x.js').then(m => m.XViewModule)`. */
const loadFake = () => Promise.resolve({ FakeViewModule }).then((m) => m.FakeViewModule);

const VIEW_CONFIG = {
    alpha: {
        containerId: 'alpha-container',
        buttonId: 'alphaButton',
        icon: 'A',
        navigationGlossaryPath: 'test.nav.alpha',
        skeleton: 'stack',
        load: loadFake,
    },
    beta: {
        containerId: 'beta-container',
        buttonId: 'betaButton',
        icon: 'B',
        navigationGlossaryPath: 'test.nav.beta',
        skeleton: 'split',
        load: loadFake,
    },
    gamma: {
        containerId: 'gamma-container',
        buttonId: 'gammaButton',
        icon: 'G',
        navigationGlossaryPath: 'test.nav.gamma',
        skeleton: 'stack',
        load: loadFake,
    },
};

/**
 * App harness. The chrome hooks are stubbed out (sidebar, shared header, export
 * toolbar, tooltip/glossary services) so the tests exercise the transition
 * itself; `preShowHook` stands in for the awaited pre-show work the real apps do
 * in beforeShowView().
 */
class TestAppModule extends BaseAppModule {
    /** @type {(() => Promise<void>)|null} */
    preShowHook = null;

    createHeaderElements() {
        /* no sidebar or shared header in the harness */
    }

    async initializeComponents() {
        /* no header, export toolbar, or page interactions */
    }

    async beforeShowView() {
        if (this.preShowHook) await this.preShowHook();
    }

    getContainerClassPrefix() {
        return 'test';
    }
}

/**
 * Build an app with both view containers mounted, but no view shown yet.
 */
function mountApp({ viewConfig = VIEW_CONFIG } = {}) {
    const main = mountMainContent('test-app');

    const app = new TestAppModule('test-app', main, {});
    app.configure({ viewConfig, defaultView: 'alpha' });
    app.setData({});
    app.createViewContainers();

    return { app, main };
}

const skeletonsIn = (main) => main.querySelectorAll('.view-skeleton');

/**
 * Wait until a view is actually revealed. showView() resolves before that:
 * revealView() is deliberately not awaited, so the render cover comes off a few
 * frames later.
 */
async function waitForReveal(app, viewType) {
    const container = app.getViewContainer(viewType);
    for (let i = 0; i < 60 && container.hasAttribute('data-view-rendering'); i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return container;
}

describe('BaseAppModule view transitions', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        FakeViewModule.renderBehavior = {};
        FakeViewModule.destroyedIds = [];
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    describe('a failed transition', () => {
        it('leaves the app on the previous view, live rather than hidden', async () => {
            // The bug this pins: currentView kept naming a view that had already
            // been hidden and suspended, so clicking its button hit the
            // "already on requested view" guard and did nothing at all.
            const { app } = mountApp();
            await app.showView('alpha');
            FakeViewModule.renderBehavior['beta-module'] = 'throw';

            await app.showView('beta');

            expect(app.getCurrentView()).toBe('alpha');
            const alphaContainer = app.getViewContainer('alpha');
            expect(alphaContainer.style.display).toBe('');
            // The module's own visibility state must agree with the DOM. A
            // container shown while its module still believes it is hidden is
            // the same half-switched shell from a different direction: the next
            // show() sees #visible === true and skips its own work.
            expect(/** @type {any} */ (app.getViewModule('alpha')).visible).toBe(true);
            // Resumed, not left suspended — a visible view that ignores every
            // event is just a different flavour of stuck.
            expect(/** @type {any} */ (app.getViewModule('alpha')).isSuspended).toBe(false);
        });

        it('hides the view that failed and drops its placeholder', async () => {
            const { app, main } = mountApp();
            await app.showView('alpha');
            FakeViewModule.renderBehavior['beta-module'] = 'throw';

            await app.showView('beta');

            const betaContainer = app.getViewContainer('beta');
            expect(betaContainer.style.display).toBe('none');
            expect(skeletonsIn(main)).toHaveLength(0);
            // The placeholder is gone from the DOM, but assistive tech reads
            // aria-busy rather than the overlay: leaving it set would announce a
            // hidden container as perpetually loading.
            expect(betaContainer.hasAttribute('aria-busy')).toBe(false);
        });

        it('clears the render cover so the failed view can be retried', async () => {
            // beginViewRender() sets data-view-rendering, which view-layout.css
            // turns into visibility: hidden. Nothing else ever removes it after
            // a throw, so without the reset the view stays invisible even once
            // whatever broke has been fixed.
            const { app } = mountApp();
            await app.showView('alpha');
            FakeViewModule.renderBehavior['beta-module'] = 'throw';
            await app.showView('beta');

            expect(app.getViewContainer('beta').hasAttribute('data-view-rendering')).toBe(false);

            FakeViewModule.renderBehavior['beta-module'] = 'resolve';
            await app.showView('beta');

            expect(app.getCurrentView()).toBe('beta');
            expect(app.getViewContainer('beta').style.display).toBe('');
        });

        it('releases the transition lock, so navigation still works afterwards', async () => {
            const { app } = mountApp();
            await app.showView('alpha');
            FakeViewModule.renderBehavior['beta-module'] = 'throw';

            await app.showView('beta');
            await app.showView('beta'); // second attempt must not be swallowed by the guard

            expect(console.error).toHaveBeenCalled();
            expect(app.getCurrentView()).toBe('alpha');
        });

        it('propagates a cold-start failure so bootstrap can render its error state', async () => {
            // With no previous view there is nothing to roll back to; swallowing
            // here would leave the user on a blank page with no message.
            const { app } = mountApp();
            FakeViewModule.renderBehavior['alpha-module'] = 'throw';

            await expect(app.showView('alpha')).rejects.toThrow('render failed');
            expect(app.getCurrentView()).toBeNull();
        });
    });

    describe('the loading placeholder', () => {
        it('goes up before the awaited pre-show work, not after it', async () => {
            // The pre-show hook renders the shared header and is awaited while
            // the new view's container is already visible and empty. Mounting
            // the placeholder afterwards leaves that gap uncovered.
            const { app, main } = mountApp();
            let releaseHook = () => {};
            app.preShowHook = () =>
                new Promise((resolve) => {
                    releaseHook = resolve;
                });

            const pending = app.showView('alpha');
            await Promise.resolve();

            expect(skeletonsIn(main)).toHaveLength(1);
            expect(skeletonsIn(main)[0].dataset.skeletonFor).toBe('alpha-container');

            releaseHook();
            await pending;
        });

        it('covers a revisit that lands while an earlier render still holds the view hidden', async () => {
            // revealView() is not awaited, so the transition lock is released
            // while a view can still be covered. Coming back to it then finds an
            // initialized module — the old mount condition — but a container
            // that is still at visibility: hidden.
            const { app, main } = mountApp();
            FakeViewModule.renderBehavior['beta-module'] = 'never-settles';
            await app.showView('beta');
            await app.showView('alpha');
            await waitForReveal(app, 'alpha');

            // Beta is still covered, and switching away took its placeholder
            // down — so anything found after the revisit was mounted by it.
            expect(app.getViewContainer('beta').getAttribute('data-view-rendering')).toBe('true');
            expect(skeletonsIn(main)).toHaveLength(0);

            await app.showView('beta');

            expect(skeletonsIn(main)).toHaveLength(1);
            expect(skeletonsIn(main)[0].dataset.skeletonFor).toBe('beta-container');
        });

        it('does not cover a revisit to a view that is already revealed', async () => {
            // The placeholder answers a blank window. A view that has finished
            // rendering has none, so covering it would only add a flash.
            const { app, main } = mountApp();
            await app.showView('alpha');
            await waitForReveal(app, 'alpha');
            await app.showView('beta');
            await waitForReveal(app, 'beta');

            await app.showView('alpha');

            expect(skeletonsIn(main)).toHaveLength(0);
        });
    });

    describe('the resume contract', () => {
        it('calls onResume() when returning to a suspended view, but not on first show', async () => {
            // A view that was suspended missed everything published while it was
            // hidden; onResume() is where it re-syncs. A first show is not a
            // resume — its own render already applied current state — so the hook
            // must not fire then (which is what makes the old app-level
            // rebroadcast and its first-show guard unnecessary).
            const { app } = mountApp();

            await app.showView('alpha');
            await waitForReveal(app, 'alpha');
            const alpha = /** @type {any} */ (app.getViewModule('alpha'));
            expect(alpha.onResumeCalls).toBe(0); // first show is not a resume

            await app.showView('beta'); // suspends alpha
            await waitForReveal(app, 'beta');
            await app.showView('alpha'); // resumes alpha
            await waitForReveal(app, 'alpha');

            expect(alpha.onResumeCalls).toBe(1);
            // Views are never destroyed, so the resumed instance is the original.
            expect(app.getViewModule('alpha')).toBe(alpha);
        });
    });

    describe('a navigation that arrives mid-transition', () => {
        it('applies only the last request and lands the URL on it', async () => {
            // A second (or third) click during a slow hydrate must not be
            // dropped, and the last one wins. Anything it superseded must never
            // be applied at all.
            const { app } = mountApp();
            await app.showView('alpha');
            await waitForReveal(app, 'alpha');

            // Park the next transition in its pre-show hook so more requests can
            // pile up behind it.
            let releaseHook = () => {};
            app.preShowHook = () =>
                new Promise((resolve) => {
                    releaseHook = resolve;
                });
            const inFlight = app.showView('beta');
            await Promise.resolve();

            // Let the eventual queued dispatch run its pre-show hook freely, then
            // fire two more requests while beta is still parked — alpha wins.
            app.preShowHook = null;
            await app.showView('gamma');
            await app.showView('alpha');

            releaseHook();
            await inFlight;
            await waitForReveal(app, 'alpha');

            expect(app.getCurrentView()).toBe('alpha'); // last request applied
            expect(app.getViewModule('gamma')).toBeNull(); // superseded, never applied
            expect(window.location.hash).toContain('alpha');
        });
    });

    describe('a half-built view whose init throws', () => {
        it('destroys the half-built instance but keeps its container for a retry', async () => {
            // init() that throws leaves an instance that was never stored or
            // registered; without tearing it down its listeners and
            // subscriptions leak, and a retry stacks a second set. But the
            // teardown must not detach the shared view container — a view adopts
            // its container as its element.
            const { app, main } = mountApp();
            await app.showView('alpha');
            await waitForReveal(app, 'alpha');

            FakeViewModule.renderBehavior['beta-module'] = 'throw';
            await app.showView('beta'); // fails, rolls back to alpha

            // Half-built instance was destroyed (its resources released)...
            expect(FakeViewModule.destroyedIds).toContain('beta-module');
            // ...yet its container survived, still attached to .main-content.
            expect(app.getViewContainer('beta').parentElement).toBe(main);
            expect(app.getCurrentView()).toBe('alpha');

            // A retry renders cleanly into the surviving container.
            FakeViewModule.renderBehavior['beta-module'] = 'resolve';
            await app.showView('beta');
            await waitForReveal(app, 'beta');

            expect(app.getCurrentView()).toBe('beta');
            expect(app.getViewModule('beta')).not.toBeNull();
        });
    });

    describe('a view whose loader cannot produce a class', () => {
        // The registry used to be three parallel maps (viewConfig, imports, class
        // names), and initializeView() only logged when they disagreed — so a
        // renamed export let showView() continue past the failure and commit
        // currentView, the URL and the nav buttons to a view with no module.

        it('rejects configure() when an entry has no loader at all', () => {
            expect(() =>
                mountApp({
                    viewConfig: {
                        ...VIEW_CONFIG,
                        beta: { ...VIEW_CONFIG.beta, load: undefined },
                    },
                }),
            ).toThrow(/missing required fields: load/);
        });

        it('rejects configure() when the loader is not callable', () => {
            // The likelier typo than omitting it outright: a bare module path, or
            // an `import(...)` that was started instead of wrapped in a thunk.
            expect(() =>
                mountApp({
                    viewConfig: {
                        ...VIEW_CONFIG,
                        beta: { ...VIEW_CONFIG.beta, load: './views/betaViewModule.js' },
                    },
                }),
            ).toThrow(/load must be a function/);
        });

        it('rolls back to the previous view when the export is missing', async () => {
            // What a renamed/removed export looks like: the import resolves, the
            // named binding on it does not.
            const { app } = mountApp({
                viewConfig: {
                    ...VIEW_CONFIG,
                    beta: {
                        ...VIEW_CONFIG.beta,
                        load: () =>
                            Promise.resolve({ FakeViewModule }).then((m) => m.RenamedViewModule),
                    },
                },
            });
            await app.showView('alpha');
            await waitForReveal(app, 'alpha');

            await app.showView('beta');

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Failed to show view 'beta'"),
                expect.objectContaining({
                    message: expect.stringContaining('did not resolve to a module class'),
                }),
            );
            expect(app.getCurrentView()).toBe('alpha');
            expect(app.getViewContainer('alpha').style.display).toBe('');
            expect(app.getViewContainer('beta').style.display).toBe('none');
            expect(window.location.hash).not.toContain('beta');
        });

        it('propagates as a cold-start failure when it is the first view', async () => {
            const { app } = mountApp({
                viewConfig: {
                    ...VIEW_CONFIG,
                    alpha: {
                        ...VIEW_CONFIG.alpha,
                        load: () =>
                            Promise.resolve({ FakeViewModule }).then((m) => m.RenamedViewModule),
                    },
                },
            });

            await expect(app.showView('alpha')).rejects.toThrow(
                /did not resolve to a module class/,
            );
            expect(app.getCurrentView()).toBeNull();
        });
    });
});
