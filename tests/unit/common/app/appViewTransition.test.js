// @vitest-browser

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { html, render } from 'lit';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { BaseModule } from '@tba3/module-base';
import { BaseAppModule } from '../../../../src/common/app/appModule.js';
import { placeTestApp, testAppOptions, viewElementOf } from '../../support/testApp.js';
import { required } from '../../../../packages/modules/test/support/required.js';

/** @typedef {import('../../../../src/common/app/appModule.js').ViewConfigEntry} ViewConfigEntry */

/** A child whose content never reports settled. */
class UnsettledChild extends BaseModule {
    /**
     * @override
     * @returns {Promise<void>} Never resolves.
     */
    _contentSettled() {
        return new Promise(() => {});
    }
}
customElements.define('test-unsettled-child', UnsettledChild);

/** A child whose content settles only when the test releases it. */
class HeldChild extends BaseModule {
    /** @type {Array<() => void>} The settle waits handed out and not yet released. */
    static waiting = [];

    /**
     * @override
     * @returns {Promise<void>} Resolves once the test calls `HeldChild.release()`.
     */
    _contentSettled() {
        return new Promise((resolve) => {
            HeldChild.waiting.push(() => resolve());
        });
    }

    /** Settle every held child. */
    static release() {
        HeldChild.waiting.splice(0).forEach((settle) => settle());
    }
}
customElements.define('test-held-child', HeldChild);

/**
 * showView() hides and suspends the outgoing view first and records the new one as
 * current only once that view has initialized. A throw in between leaves the shell
 * half-switched: `currentView` still names the view just hidden, so the "already on
 * requested view" guard turns that view's nav button into a no-op and the page stays
 * blank. The assertions pin the outcome: after a failed switch the app is on a live
 * view, and a view whose render threw can be retried.
 */

/** `renderBehavior` decides how its render pass ends. */
class FakeViewModule extends BaseViewModule {
    /** @type {Array<string|null>} */
    #delivered = [];

    /** @returns {Array<string|null>} The student ids the view's watcher received, in order. */
    get delivered() {
        return this.#delivered;
    }

    /** @override */
    async _renderView() {
        this.watch(this.options.appState.currentStudentId, (id) => this.#delivered.push(id));
        const behavior = FakeViewModule.renderBehavior[this.id] ?? 'resolve';
        if (behavior === 'throw') {
            // Throws with the container already covered by beginViewRender(): the
            // case that must not strand a view at visibility: hidden.
            throw new Error(`render failed: ${this.id}`);
        }

        if (behavior === 'never-settles') {
            render(html`${UnsettledChild.create(`${this.id}-child`, {})}`, this);
        }
        if (behavior === 'held') {
            render(html`${HeldChild.create(`${this.id}-child`, {})}`, this);
        }
    }

    /** @override */
    _teardown() {
        FakeViewModule.destroyedIds.push(this.id);
        super._teardown();
    }
}
customElements.define('test-fake-view', FakeViewModule);

/** @type {Object<string, 'resolve'|'throw'|'never-settles'|'held'>} */
FakeViewModule.renderBehavior = {};

/** @type {string[]} Ids of instances torn down, so tests can assert half-built cleanup. */
FakeViewModule.destroyedIds = [];

/**
 * Per view, a gate its next load() waits on: a held load keeps the transition that
 * builds the view in flight, with the view covered by its placeholder.
 * @type {{[viewType: string]: Promise<void>}}
 */
let loadGates = {};

/**
 * Hold the next build of a view in its lazy import.
 * @param {string} viewType
 * @returns {() => void} Lets the load resolve.
 */
function holdLoad(viewType) {
    let release = () => {};
    loadGates[viewType] = new Promise((resolve) => {
        release = () => resolve();
    });
    return () => release();
}

/**
 * Stands in for `() => import('./views/x.js').then(m => m.XViewModule)`, waiting on the
 * view's gate when a test holds it.
 * @param {string} viewType
 * @returns {() => Promise<typeof FakeViewModule>}
 */
const loadFake = (viewType) => () =>
    (loadGates[viewType] ?? Promise.resolve()).then(() => FakeViewModule);

/**
 * What a renamed or removed export looks like: the import resolves, the named binding on
 * it does not. It breaks the loader contract on purpose, hence the cast.
 * @type {ViewConfigEntry['load']}
 */
const loadRenamed = /** @type {ViewConfigEntry['load']} */ (
    () =>
        Promise.resolve(/** @type {{[name: string]: unknown}} */ ({ FakeViewModule })).then(
            (m) => m.RenamedViewModule,
        )
);

/**
 * The app opens on `home`, which reads no data; the tests switch between the other three.
 * @type {{[viewType: string]: ViewConfigEntry}}
 */
const VIEW_CONFIG = {
    home: { icon: 'home', skeleton: 'stack', needsData: false, load: loadFake('home') },
    alpha: { icon: 'home', skeleton: 'stack', load: loadFake('alpha') },
    beta: { icon: 'list_alt', skeleton: 'split', load: loadFake('beta') },
    gamma: { icon: 'person', skeleton: 'stack', load: loadFake('gamma') },
};

class TestAppModule extends BaseAppModule {}
customElements.define('test-transition-app', TestAppModule);

/**
 * Place an app as bootstrap does, over documents that land at once.
 * @param {{viewConfig?: {[viewType: string]: ViewConfigEntry}, defaultView?: string}} [options]
 * @returns {TestAppModule} The app, its first render started.
 */
function placeApp({ viewConfig = VIEW_CONFIG, defaultView = 'home' } = {}) {
    return placeTestApp(TestAppModule, testAppOptions(viewConfig, defaultView), (app) => {
        vi.spyOn(app.context.documents, 'ensureAll').mockResolvedValue(undefined);
    });
}

/**
 * An app on its first view, `home`, with the other views' containers in place.
 * @param {{viewConfig?: {[viewType: string]: ViewConfigEntry}}} [options]
 * @returns {Promise<TestAppModule>} The app, its first render done.
 */
async function mountApp({ viewConfig = VIEW_CONFIG } = {}) {
    const app = placeApp({ viewConfig });
    await app.contentComplete;
    return app;
}

/**
 * @param {HTMLElement} app
 */
const skeletonsIn = (app) => app.querySelectorAll('.view-skeleton');

/**
 * The lifecycle's shell around a view container: what shows and hides.
 * @param {HTMLElement|null} container
 * @returns {HTMLElement}
 */
const shellOf = (container) =>
    required(required(container, 'view container').parentElement, 'view shell');

/**
 * The view module the app built for a view, as the fake it is.
 * @param {string} viewType
 * @returns {FakeViewModule}
 */
function fakeView(viewType) {
    const view = viewElementOf(viewType);
    if (!(view instanceof FakeViewModule)) throw new Error(`No fake view module for ${viewType}`);
    return view;
}

describe('BaseAppModule view transitions', () => {
    beforeEach(() => {
        // No hash: the app opens on its default view.
        history.replaceState(null, '', window.location.pathname);
        loadGates = {};
        FakeViewModule.renderBehavior = {};
        FakeViewModule.destroyedIds = [];
        HeldChild.waiting = [];
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    describe('a failed transition', () => {
        it('leaves the app on the previous view, live rather than hidden', async () => {
            // currentView must not keep naming a view that is hidden and suspended, or
            // its button hits the "already on requested view" guard and does nothing.
            const app = await mountApp();
            await app.showView('alpha');
            FakeViewModule.renderBehavior['tba3-beta-container'] = 'throw';

            await app.showView('beta');

            expect(app.appState.currentView.peek()).toBe('alpha');
            const alphaContainer = viewElementOf('alpha');
            expect(shellOf(alphaContainer).style.display).toBe('');
            // The module's own visibility must agree with the shell's.
            expect(fakeView('alpha').visible).toBe(true);
            // Resumed, not left suspended: a watched key reaches it at once.
            app.appState.currentStudentId.value = 's-live';
            expect(fakeView('alpha').delivered).toEqual(['s-live']);
        });

        it('hides the view that failed and drops its placeholder', async () => {
            const app = await mountApp();
            await app.showView('alpha');
            FakeViewModule.renderBehavior['tba3-beta-container'] = 'throw';

            await app.showView('beta');

            const betaContainer = required(viewElementOf('beta'), 'beta container');
            expect(shellOf(betaContainer).style.display).toBe('none');
            expect(shellOf(betaContainer).querySelector('.view-skeleton')).toBeNull();
            // Assistive tech reads aria-busy, not the overlay: left set, it announces
            // a hidden container as loading.
            expect(betaContainer.hasAttribute('aria-busy')).toBe(false);
        });

        it('propagates a cold-start failure so bootstrap can render its error state', async () => {
            // No previous view to roll back to: swallowing the failure would leave a
            // blank page with no message.
            FakeViewModule.renderBehavior['tba3-alpha-container'] = 'throw';
            const app = placeApp({ defaultView: 'alpha' });

            await expect(app.contentComplete).rejects.toThrow('render failed');
            expect(app.appState.currentView.peek()).toBeNull();
        });
    });

    describe('the loading placeholder', () => {
        it('covers the view for its whole build, before its class has loaded', async () => {
            // The header render and the lazy import are awaited while the new view's
            // container is already visible and empty. Mounting the placeholder once
            // the view exists leaves that gap uncovered.
            const app = await mountApp();
            const releaseLoad = holdLoad('alpha');

            const pending = app.showView('alpha');
            await Promise.resolve();

            expect(skeletonsIn(app)).toHaveLength(1);
            expect(skeletonsIn(app)[0].parentElement).toBe(shellOf(viewElementOf('alpha')));

            releaseLoad();
            await pending;
        });

        it('covers a revisit that lands while an earlier render still holds the view hidden', async () => {
            // revealView() is not awaited, so the transition lock is released while
            // a view can still be covered. A revisit then finds an initialized
            // module in a container still at visibility: hidden.
            const app = await mountApp();
            FakeViewModule.renderBehavior['tba3-beta-container'] = 'never-settles';
            await app.showView('beta');
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();

            // Beta is still covered; its placeholder waits in its hidden shell.
            expect(
                required(viewElementOf('beta'), 'beta container').getAttribute(
                    'data-view-rendering',
                ),
            ).toBe('true');

            await app.showView('beta');

            expect(skeletonsIn(app)).toHaveLength(1);
            expect(skeletonsIn(app)[0].parentElement).toBe(shellOf(viewElementOf('beta')));
        });

        it('takes the placeholder down when a view left mid-reveal is revisited and reveals', async () => {
            // The reveal removes the placeholder the view mounted. One taken down on
            // leaving and mounted anew on the revisit was never the view's, so it
            // stayed over the finished view for the rest of the session.
            const app = await mountApp();
            FakeViewModule.renderBehavior['tba3-beta-container'] = 'held';
            await app.showView('beta');
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();
            await app.showView('beta');

            HeldChild.release();
            await fakeView('beta').whenRevealed();

            expect(fakeView('beta').hasAttribute('data-view-rendering')).toBe(false);
            expect(skeletonsIn(app)).toHaveLength(0);
        });

        it('keeps the cover of a view still rendering when a revisit to it rolls back', async () => {
            // The view's pending reveal owns its cover and placeholder. A rollback that
            // stripped them left the half-built view uncovered on the next visit.
            const app = await mountApp();
            FakeViewModule.renderBehavior['tba3-beta-container'] = 'held';
            await app.showView('beta');
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();

            // A patch naming a key the state lacks fails the switch before beta shows.
            await app.showView('beta', { statePatch: { notAKey: true } });

            expect(app.appState.currentView.peek()).toBe('alpha');
            expect(fakeView('beta').getAttribute('data-view-rendering')).toBe('true');
            expect(skeletonsIn(app)).toHaveLength(1);

            await app.showView('beta');
            HeldChild.release();
            await fakeView('beta').whenRevealed();

            expect(fakeView('beta').hasAttribute('data-view-rendering')).toBe(false);
            expect(skeletonsIn(app)).toHaveLength(0);
        });

        it('does not cover a revisit to a view that is already revealed', async () => {
            // The placeholder answers a blank window. A view that has finished
            // rendering has none, so covering it would only add a flash.
            const app = await mountApp();
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();
            await app.showView('beta');
            await fakeView('beta').whenRevealed();

            await app.showView('alpha');

            expect(skeletonsIn(app)).toHaveLength(0);
        });
    });

    describe('the resume contract', () => {
        it('delivers a change made while the view was hidden on its return, and nothing on first show', async () => {
            // Resume delivers the latest change a suspended view missed. A first show
            // is not a resume: its render already read current state.
            const app = await mountApp();

            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();
            const alpha = fakeView('alpha');
            expect(alpha.delivered).toEqual([]);

            await app.showView('beta');
            await fakeView('beta').whenRevealed();
            app.appState.currentStudentId.value = 's-hidden';
            expect(alpha.delivered).toEqual([]);
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();

            expect(alpha.delivered).toEqual(['s-hidden']);
            // Views are never destroyed, so the resumed instance is the original.
            expect(viewElementOf('alpha')).toBe(alpha);
        });
    });

    describe('a navigation that arrives mid-transition', () => {
        it('applies only the last request and lands the URL on it', async () => {
            // A click during a slow hydrate must not be dropped; the last one wins
            // and what it superseded is never applied.
            const app = await mountApp();
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();

            // Park beta in its lazy import so two more requests queue behind it.
            const releaseLoad = holdLoad('beta');
            const inFlight = app.showView('beta');
            await Promise.resolve();

            const toGamma = app.showView('gamma');
            const toAlpha = app.showView('alpha');

            // A queued call settles when its navigation ran, or at once when a later
            // one replaced it: gamma's is already settled, alpha's waits for beta.
            await toGamma;
            // Beta is still parked.
            expect(app.appState.currentView.peek()).toBe('alpha');

            releaseLoad();
            await inFlight;
            await toAlpha;
            await fakeView('alpha').whenRevealed();

            expect(app.appState.currentView.peek()).toBe('alpha');
            expect(viewElementOf('gamma')).not.toBeInstanceOf(FakeViewModule);
            expect(window.location.hash).toContain('alpha');
        });
    });

    describe('a half-built view whose init throws', () => {
        it('destroys the half-built instance but keeps its container for a retry', async () => {
            // An init() that throws leaves an instance never stored or registered:
            // without teardown its listeners and subscriptions leak and a retry
            // stacks a second set. The teardown must not detach the view container,
            // which a view adopts as its element.
            const app = await mountApp();
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();

            FakeViewModule.renderBehavior['tba3-beta-container'] = 'throw';
            await app.showView('beta');

            expect(FakeViewModule.destroyedIds).toContain('tba3-beta-container');
            expect(shellOf(viewElementOf('beta')).parentElement).toBe(app);
            expect(app.appState.currentView.peek()).toBe('alpha');

            FakeViewModule.renderBehavior['tba3-beta-container'] = 'resolve';
            await app.showView('beta');
            await fakeView('beta').whenRevealed();

            expect(app.appState.currentView.peek()).toBe('beta');
            expect(viewElementOf('beta')).toBeInstanceOf(FakeViewModule);
        });
    });

    describe('a view whose loader cannot produce a class', () => {
        // A showView() that continued past the failure would commit currentView,
        // the URL and the nav buttons to a view with no module.

        it('rolls back to the previous view when the export is missing', async () => {
            const app = await mountApp({
                viewConfig: {
                    ...VIEW_CONFIG,
                    beta: {
                        ...VIEW_CONFIG.beta,
                        load: loadRenamed,
                    },
                },
            });
            await app.showView('alpha');
            await fakeView('alpha').whenRevealed();

            await app.showView('beta');

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Failed to show view 'beta'"),
                expect.objectContaining({
                    message: expect.stringContaining('did not resolve to a module class'),
                }),
            );
            expect(app.appState.currentView.peek()).toBe('alpha');
            expect(shellOf(viewElementOf('alpha')).style.display).toBe('');
            expect(shellOf(viewElementOf('beta')).style.display).toBe('none');
            expect(window.location.hash).not.toContain('beta');
        });

        it('propagates as a cold-start failure when it is the first view', async () => {
            const app = placeApp({
                viewConfig: { ...VIEW_CONFIG, alpha: { ...VIEW_CONFIG.alpha, load: loadRenamed } },
                defaultView: 'alpha',
            });

            await expect(app.contentComplete).rejects.toThrow(/did not resolve to a module class/);
            expect(app.appState.currentView.peek()).toBeNull();
        });
    });

    describe("a view's header entry", () => {
        it('is the app’s <app>.<view>.header unless the view names one', async () => {
            const app = await mountApp();

            await app.showView('alpha');

            // The test glossary titles each view's header with the view key.
            expect(app.querySelector('.header-module-title')?.textContent).toBe('alpha');
        });

        it('fails the boot when it carries no title, before any view shows', async () => {
            // A missing header entry is a wiring bug that would otherwise surface as a
            // marker only once someone opens that view.
            const spec = testAppOptions(VIEW_CONFIG, 'home');
            delete spec.glossaryData.tba3.beta;
            const app = placeTestApp(TestAppModule, spec);

            await expect(app.contentComplete).rejects.toThrow(
                "view 'beta' has no header title at 'tba3.beta.header'",
            );
        });
    });
});
