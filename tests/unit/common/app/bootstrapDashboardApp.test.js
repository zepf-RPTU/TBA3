// @vitest-browser

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapDashboardApp } from '../../../../src/common/app/bootstrapDashboardApp.js';

/**
 * Minimal fake app module standing in for the real subject AppModule classes.
 * Behavior is controlled per test via the static `initBehavior` hook.
 */
class FakeAppModule {
    constructor(appId, container, options) {
        this.appId = appId;
        this.container = container;
        this.options = options;
        FakeAppModule.lastInstance = this;
    }

    async init(initData) {
        this.initData = initData;
        if (FakeAppModule.initBehavior === 'reject') {
            throw new Error('init failed');
        }
    }
}

describe('bootstrapDashboardApp', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        FakeAppModule.initBehavior = 'resolve';
        FakeAppModule.lastInstance = null;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    /** Stand-in for the cold-start placeholder each dashboard's HTML ships. */
    function appendAppSkeleton() {
        const skeleton = document.createElement('div');
        skeleton.id = 'app-skeleton';
        document.body.appendChild(skeleton);
        return skeleton;
    }

    it('returns null, logs, and appends one alert to body when the container is missing', async () => {
        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            containerSelector: '.does-not-exist',
        });

        expect(result).toBeNull();
        expect(console.error).toHaveBeenCalled();
        const alerts = document.body.querySelectorAll('[role="alert"]');
        expect(alerts).toHaveLength(1);
        expect(alerts[0].className).toBe('dashboard-bootstrap-error');
    });

    it('returns the app instance and renders no alert on success', async () => {
        const container = document.createElement('div');
        container.className = 'main-content';
        document.body.appendChild(container);

        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            containerSelector: '.main-content',
        });

        expect(result).toBe(FakeAppModule.lastInstance);
        expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
    });

    it('returns null, logs, and renders one alert inside the container when init rejects', async () => {
        const container = document.createElement('div');
        container.className = 'main-content';
        document.body.appendChild(container);
        FakeAppModule.initBehavior = 'reject';

        const result = await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            containerSelector: '.main-content',
            appName: 'Englisch 8',
        });

        expect(result).toBeNull();
        expect(console.error).toHaveBeenCalled();
        const alerts = container.querySelectorAll('[role="alert"]');
        expect(alerts).toHaveLength(1);
        expect(alerts[0].textContent).toContain('Englisch 8');
        // No stack trace or raw error object should be exposed in the DOM.
        expect(alerts[0].textContent).not.toContain('Error');
    });

    it('removes the cold-start skeleton once the app has initialized', async () => {
        const container = document.createElement('div');
        container.className = 'main-content';
        document.body.appendChild(container);
        appendAppSkeleton();

        await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            containerSelector: '.main-content',
        });

        expect(document.getElementById('app-skeleton')).toBeNull();
    });

    it('removes the cold-start skeleton on every failure path so it cannot hide the error', async () => {
        // The skeleton is a fixed, full-viewport overlay: leaving it up would
        // cover the alert the user needs in order to know what went wrong.
        const container = document.createElement('div');
        container.className = 'main-content';
        document.body.appendChild(container);
        appendAppSkeleton();
        FakeAppModule.initBehavior = 'reject';

        await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            containerSelector: '.main-content',
        });

        expect(document.getElementById('app-skeleton')).toBeNull();
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    });

    it('removes the cold-start skeleton when the app container is missing', async () => {
        appendAppSkeleton();

        await bootstrapDashboardApp({
            AppModule: FakeAppModule,
            appId: 'en',
            containerSelector: '.does-not-exist',
        });

        expect(document.getElementById('app-skeleton')).toBeNull();
        expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(1);
    });
});
