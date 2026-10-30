// @vitest-browser

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapDashboardApp } from '../../../../src/common/app/bootstrapDashboardApp.js';
import { BaseAppModule } from '../../../../src/common/app/appModule.js';
import { createTestAppContext } from '../../support/glossaryFixture.js';
import { testAppOptions } from '../../support/testApp.js';
import { mountMainContent } from '../../../../packages/modules/test/support/domShell.js';

class FakeAppModule extends BaseAppModule {
    /** @type {FakeAppModule|null} The instance bootstrap built last. */
    static lastInstance = null;
    /** @type {'resolve'|'reject'|'uncaught'} How the next first render ends. */
    static initBehavior = 'resolve';
    /**
     * A spec with no views; bootstrap adds the dashboard id.
     * @override
     */
    static defaultOptions = testAppOptions({}, 'none');

    /** Bootstrap words uncaught failures in the app's glossary from its boot on. */
    #context = createTestAppContext('en');

    constructor() {
        super();
        FakeAppModule.lastInstance = this;
    }

    /**
     * @override
     * @returns {import('../../../../src/common/app/appContext.js').AppContext}
     */
    get context() {
        return this.#context;
    }

    /**
     * The shell's one view slot, then the behavior the test asked for.
     * @override
     */
    async _renderContent() {
        const shell = document.createElement('div');
        shell.className = 'view-shell';
        this.append(shell);
        if (FakeAppModule.initBehavior === 'reject') {
            throw new Error('init failed');
        }
        if (FakeAppModule.initBehavior === 'uncaught') {
            // A failure nothing in the boot awaits: a listener or a timer throwing.
            window.dispatchEvent(
                new ErrorEvent('error', { error: new Error('boot listener failed') }),
            );
        }
    }

    /**
     * A shell that never came up: the first render settles first.
     * @override
     */
    whenShellReady() {
        return new Promise(() => {});
    }
}
customElements.define('test-fake-app', FakeAppModule);

describe('bootstrapDashboardApp', () => {
    beforeEach(() => {
        FakeAppModule.initBehavior = 'resolve';
        FakeAppModule.lastInstance = null;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // Every path must take down the cold-start skeleton each dashboard's HTML ships:
    // a fixed, full-viewport overlay left up would cover the alert.
    function appendAppSkeleton() {
        const skeleton = document.createElement('div');
        skeleton.id = 'app-skeleton';
        document.body.appendChild(skeleton);
    }

    it('returns the app in the place of the page placeholder, and renders no alert on success', async () => {
        const container = mountMainContent();
        appendAppSkeleton();

        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            appName: 'Englisch 8',
        });

        expect(result).toBe(FakeAppModule.lastInstance);
        // The landmark the skip link lands on: the app took its place, class and role.
        expect(container.isConnected).toBe(false);
        expect(result?.id).toBe('en-app');
        expect(result?.classList.contains('main-content')).toBe(true);
        expect(result?.getAttribute('role')).toBe('main');
        expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
        expect(document.getElementById('app-skeleton')).toBeNull();
    });

    it('returns null, logs, and renders one alert inside the container when init rejects', async () => {
        const container = mountMainContent();
        appendAppSkeleton();
        FakeAppModule.initBehavior = 'reject';

        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            appName: 'Englisch 8',
        });

        expect(result).toBeNull();
        expect(console.error).toHaveBeenCalled();
        // The placeholder is back in the app's place, holding the message alone.
        expect(container.isConnected).toBe(true);
        const alerts = container.querySelectorAll('[role="alert"]');
        expect(alerts).toHaveLength(1);
        expect(alerts[0].textContent).toContain('Englisch 8');
        // A way out: the dashboard did not come up, so a reload would only repeat it.
        expect(alerts[0].querySelector('a[href="../"]')).not.toBeNull();
        // No stack trace or raw error object in the DOM.
        expect(alerts[0].textContent).not.toContain('Error');
        expect(document.getElementById('app-skeleton')).toBeNull();
    });

    it('boots without its export lock when the tab cannot take it', async () => {
        // The boot awaits the claim: a failed lock request must neither hang it nor
        // take the dashboard down. The tab goes on as a page without Web Locks does.
        mountMainContent();
        appendAppSkeleton();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const request = vi.spyOn(navigator.locks, 'request').mockImplementation(() => {
            throw new Error('locks unavailable');
        });

        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            appName: 'Englisch 8',
        });
        request.mockRestore();

        expect(result).toBe(FakeAppModule.lastInstance);
        expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
        expect(document.getElementById('app-skeleton')).toBeNull();
    });

    it('renders the alert when a step before the app is built throws', async () => {
        // Outside the try, a throw here left the cold-start skeleton up with no message.
        const container = mountMainContent();
        appendAppSkeleton();
        const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(() => {
            throw new Error('no media queries');
        });

        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            appName: 'Englisch 8',
        });
        matchMedia.mockRestore();

        expect(result).toBeNull();
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
        expect(document.getElementById('app-skeleton')).toBeNull();
    });

    it('reports a failure nothing caught while init() runs as a toast and in the console', async () => {
        // The global handlers go in before the first render resolves, or a listener
        // throwing during the boot is lost to the console.
        mountMainContent();
        FakeAppModule.initBehavior = 'uncaught';

        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            appName: 'Englisch 8',
        });

        expect(result).toBe(FakeAppModule.lastInstance);
        const toast = document.querySelector('.toast');
        expect(toast?.textContent).toContain('Ein unerwarteter Fehler ist aufgetreten.');
        expect(console.error).toHaveBeenCalledWith(
            'Uncaught:',
            expect.objectContaining({ message: 'boot listener failed' }),
        );
    });
});
