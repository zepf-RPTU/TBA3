/**
 * The options the app shell hands every view: its shared app state and the comparison
 * state. A view watches the comparison state from its first render, so a test that
 * renders a view passes these along with its own options.
 */

import { createState } from '@tba3/module-base';
import { createComparisonState } from '@tba3/modules/charts';

/** @typedef {import('../../../src/common/app/appModule.js').ShellState} ShellState */

/**
 * The shell's state with a test's own keys: whichever app's keys the view under test
 * reads, so they are open here.
 * @typedef {ShellState & {[key: string]: any}} TestAppState
 */

/**
 * @param {{[key: string]: unknown}} [initialState] - Seed state on top of the shell's keys.
 * @returns {{appState: import('@tba3/module-base').State<TestAppState>, comparisonState: import('@tba3/modules/charts').ComparisonState}}
 */
export function viewOptions(initialState = {}) {
    /** @type {import('@tba3/module-base').StateInit<TestAppState>} */
    const seed = {
        currentView: null,
        previousView: null,
        currentStudentId: null,
        ...initialState,
    };
    const appState = createState(seed);
    return { appState, comparisonState: createComparisonState() };
}

/**
 * The options a test hands a view: the shell's view options plus whichever of the rest
 * the view under test reads.
 * @typedef {Partial<import('../../../src/common/modules/baseViewModule.js').ViewModuleOptions<TestAppState>>} TestViewOptions
 */
