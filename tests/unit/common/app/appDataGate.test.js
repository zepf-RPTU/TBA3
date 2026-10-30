// @vitest-browser

/**
 * The shell and a view that reads no document (the welcome page) show before the
 * dataset has loaded; a view that reads it waits for it under its placeholder. Awaiting
 * every document first would leave a blank page for the whole download.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseAppModule } from '../../../../src/common/app/appModule.js';
import { placeTestApp, testAppOptions } from '../../support/testApp.js';
import { EmptyView } from '../../support/emptyView.js';
import { REPORT_VIEW_CONFIG } from '../../../../src/common/views/report/reportViewConfig.js';

const loadFake = () => Promise.resolve(EmptyView);

const VIEW_CONFIG = {
    welcome: {
        icon: 'home',
        skeleton: /** @type {const} */ ('stack'),
        needsData: false,
        load: loadFake,
    },
    data: {
        icon: 'list_alt',
        skeleton: /** @type {const} */ ('stack'),
        load: loadFake,
    },
    // The report as the apps declare it, over a stand-in view and the test glossary.
    report: { ...REPORT_VIEW_CONFIG, headerGlossaryPath: undefined, load: loadFake },
};

class GatedApp extends BaseAppModule {}
customElements.define('test-gated-app', GatedApp);

afterEach(() => {
    window.location.hash = '';
});

describe('app start-up before the data', () => {
    it('shows the welcome view while the documents load, and holds a data view until they land', async () => {
        /** @type {() => void} */
        let land = () => {};
        const app = placeTestApp(GatedApp, testAppOptions(VIEW_CONFIG, 'welcome'), (gated) => {
            vi.spyOn(gated.context.documents, 'ensureAll').mockReturnValue(
                new Promise((resolve) => {
                    land = () => resolve(undefined);
                }),
            );
        });

        // The first render resolves once the first view is revealed.
        await app.contentComplete;
        expect(app.appState.currentView.peek()).toBe('welcome');

        const toData = app.showView('data');
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(app.appState.currentView.peek()).toBe('welcome');
        expect(document.querySelector('.view-skeleton')).not.toBeNull();

        land();
        await toData;
        expect(app.appState.currentView.peek()).toBe('data');
    });

    it('opens the report after the dataset failed to load: it reads only the tab captures', async () => {
        // The cart outlives a dataset switch, so a dataset that does not load must not
        // lock away the captures made under the others.
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = placeTestApp(GatedApp, testAppOptions(VIEW_CONFIG, 'welcome'), (gated) => {
            vi.spyOn(gated.context.documents, 'ensureAll').mockRejectedValue(new Error('down'));
        });
        await app.contentComplete;
        await vi.waitFor(() => expect(app.querySelector('[role="alert"]')).not.toBeNull());

        await app.showView('report');

        expect(app.appState.currentView.peek()).toBe('report');
    });

    it('names a failed data load once above the views of the running shell', async () => {
        // The welcome page shows before the data; a load that fails afterwards must be
        // named without taking down the page the reader is already using.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = placeTestApp(GatedApp, testAppOptions(VIEW_CONFIG, 'welcome'), (gated) => {
            vi.spyOn(gated.context.documents, 'ensureAll').mockRejectedValue(new Error('down'));
        });
        await app.contentComplete;
        await vi.waitFor(() => expect(app.querySelector('[role="alert"]')).not.toBeNull());

        const alerts = app.querySelectorAll('[role="alert"]');
        expect(alerts).toHaveLength(1);
        // The dashboard is up: the way on is another dataset, not a reload that keeps the
        // same `?scope`.
        expect(alerts[0].textContent).toContain('anderen Datensatz');
        expect(alerts[0].textContent).not.toContain('Laden Sie die Seite neu');
        expect(alerts[0].nextElementSibling).toBe(app.querySelector('.view-shell'));
        expect(app.appState.currentView.peek()).toBe('welcome');
        // A switch the failed load fails is not toasted again.
        await app.showView('data');
        expect(document.querySelectorAll('.toast')).toHaveLength(0);
    });
});
