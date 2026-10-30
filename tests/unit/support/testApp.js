/**
 * The spec a test app boots with: one fixture dataset that fetches nothing, the smallest
 * glossary the annotator comes up on, and the test's own views.
 */

import shellGlossary from '../../../src/common/app/shellGlossary.json' with { type: 'json' };

/** @typedef {import('../../../src/common/app/appModule.js').BaseAppModule<any>} AnyApp */
/** @typedef {typeof import('../../../src/common/app/appModule.js').BaseAppModule} BaseAppModuleClass */

/** @typedef {import('../../../src/common/app/appModule.js').AppSpec} AppSpec */
/** @typedef {import('../../../src/common/app/appModule.js').ViewConfigEntry} ViewConfigEntry */

/**
 * The `dataset` option a BaseAppModule subclass needs: one fixture dataset whose one
 * request (the scale document every store requires) is never ensured, so nothing is
 * fetched.
 * @type {import('../../../src/common/app/appModule.js').AppDatasetSpec}
 */
const TEST_APP_DATASET = {
    options: [{ id: 'test', label: 'Test', folder: 'test' }],
    defaultId: 'test',
    requests: [
        {
            file: 'competence-levels.json',
            documents: ['competence-levels.json'],
        },
    ],
};

/** The app id a test app boots as; no real dashboard uses it. */
const TEST_APP_ID = 'tba3';

/**
 * The smallest glossary an app boots with: the shell's copy every app carries, a shared
 * term index for the test app id, which is what the annotator needs to come up, and each
 * view's header and nav entry.
 * @param {string[]} viewTypes
 * @returns {import('@tba3/module-base/glossary').GlossaryTree}
 */
function testGlossary(viewTypes) {
    return {
        ...shellGlossary,
        [TEST_APP_ID]: {
            shared: { element_texts: {} },
            'nav-cards': {
                element_texts: Object.fromEntries(
                    viewTypes.map((viewType) => [`nav-${viewType}`, { title: viewType }]),
                ),
            },
            ...Object.fromEntries(
                viewTypes.map((viewType) => [viewType, { header: { title: viewType } }]),
            ),
        },
    };
}

/**
 * The spec a BaseAppModule subclass hands its base, around a test's views.
 * @param {{[viewType: string]: ViewConfigEntry}} views - The views, as an app declares them.
 * @param {string} defaultView - The view shown when the URL names none.
 * @returns {AppSpec}
 */
export function testAppOptions(views, defaultView) {
    return {
        appId: TEST_APP_ID,
        dataset: TEST_APP_DATASET,
        glossaryData: testGlossary(Object.keys(views)),
        views,
        defaultView,
        initialState: {},
    };
}

/**
 * A test app configured the way bootstrap configures one, placed in an emptied page as
 * its `.main-content`: connecting it starts its first render.
 * @template {AnyApp} A
 * @param {(new () => A) & Pick<BaseAppModuleClass, 'create'>} AppClass
 * @param {AppSpec} spec - Its spec, from testAppOptions().
 * @param {(app: A) => void} [beforeConnect] - Stubs to put in place before it renders.
 * @returns {A} The app, connected.
 */
export function placeTestApp(AppClass, spec, beforeConnect = () => {}) {
    const app = AppClass.create(`${TEST_APP_ID}-app`, spec);
    app.className = 'main-content';
    beforeConnect(app);
    document.body.replaceChildren(app);
    return app;
}

/**
 * The element a test app shows a view in: the view's container until it is first
 * shown, then the view module that replaced it.
 * @param {string} viewType
 * @returns {HTMLElement|null}
 */
export function viewElementOf(viewType) {
    return document.getElementById(`${TEST_APP_ID}-${viewType}-container`);
}
