// @vitest-browser

/**
 * AppState's comparison state — the one owner of "which reference groups are shown".
 *
 * Every app keeps `comparisonState` in its app state — MA and SL seed it at data load
 * through `seedComparisonState`, EN deliberately starts it empty; every ⌀ header
 * dropdown writes it through `setComparisonMode`, and every view observes the key
 * (`observeActiveComparisons`) to hand its charts the active list. An app without the
 * key must simply report nothing active. Driven through a real `BaseAppModule` rather
 * than a bare `AppState`, so the state the app hands out is the one under test. Same
 * harness shape as `appViewTransition.test.js`: chrome hooks stubbed, state applied by
 * `configure()`.
 */

import { describe, expect, it } from 'vitest';

import { BaseAppModule } from '../../../../src/common/app/appModule.js';
import { mountMainContent } from '../../support/domShell.js';

const VIEW_CONFIG = {
    alpha: {
        containerId: 'alpha-container',
        buttonId: 'alphaButton',
        icon: 'A',
        navigationGlossaryPath: 'test.nav.alpha',
        skeleton: 'stack',
        load: () => Promise.resolve(null),
    },
};

/** Chrome hooks stubbed out; only the state machinery under test is real. */
class TestAppModule extends BaseAppModule {
    static initialState = {};

    createHeaderElements() {
        /* no sidebar or shared header */
    }

    async initializeComponents() {
        /* no header, export toolbar, or page interactions */
    }

    getContainerClassPrefix() {
        return 'test';
    }

    getInitialState() {
        return { ...TestAppModule.initialState };
    }
}

function mountApp(initialState) {
    TestAppModule.initialState = initialState;
    const app = new TestAppModule('test-app', mountMainContent('test-app'), {});
    app.configure({ viewConfig: VIEW_CONFIG, defaultView: 'alpha' });
    return { app };
}

describe('AppState comparison state', () => {
    it('a toggle writes the state and notifies its observers once', () => {
        // WHY: every chart and dropdown in the app derives its truth from this one
        // key; a view observing it reads the full active list, not just the flipped
        // id, so a chart that missed earlier toggles lands on the right set at once.
        const { app } = mountApp({ comparisonState: { school: true, state: true } });
        const seen = [];
        app.appState.observe('comparisonState', () =>
            seen.push(app.appState.getActiveComparisons()),
        );

        app.appState.setComparisonMode('state', false);

        expect(app.appState.getComparisonState()).toEqual({ school: true, state: false });
        expect(seen).toEqual([['school']]);
    });

    it('a write that changes nothing notifies nobody', () => {
        // WHY: an observer firing here would make every chart re-check a state it
        // already shows.
        const { app } = mountApp({ comparisonState: { school: true } });
        const seen = [];
        app.appState.observe('comparisonState', () => seen.push(true));

        app.appState.setComparisonMode('school', true);

        expect(seen).toEqual([]);
    });

    it('hands out copies, so a caller cannot edit the state behind its back', () => {
        const { app } = mountApp({ comparisonState: { school: true } });

        app.appState.getComparisonState().school = false;

        expect(app.appState.getActiveComparisons()).toEqual(['school']);
    });

    it('an app without comparison state reports nothing active', () => {
        // SL keeps no comparisonState; the shared methods must not throw on it.
        const { app } = mountApp({});

        expect(app.appState.getComparisonState()).toEqual({});
        expect(app.appState.getActiveComparisons()).toEqual([]);
    });

    it('seeding at data load shows every delivered group and replaces what a previous dataset left', () => {
        // WHY replace, not merge: a dataset switch loads new comparison groups, and a
        // stale `true` under an id the new payload never delivers would keep a ⌀ menu
        // entry the charts cannot draw.
        const { app } = mountApp({ comparisonState: { old: true } });

        app.appState.seedComparisonState(['school', 'state']);

        expect(app.appState.getComparisonState()).toEqual({ school: true, state: true });
        expect(app.appState.getActiveComparisons()).toEqual(['school', 'state']);
    });
});
