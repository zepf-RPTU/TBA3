/**
 * A view that renders nothing, for suites whose subject is the view base or the app
 * around a view, not what a view shows. One tag serves every suite: each test file has
 * its own element registry.
 */

import { BaseViewModule } from '../../../src/common/modules/baseViewModule.js';
import { mountModule } from '../../../packages/modules/test/support/dom.js';
import { viewOptions } from './viewOptions.js';

export class EmptyView extends BaseViewModule {
    /** @override */
    async _renderView() {}
}
customElements.define('test-empty-view', EmptyView);

/**
 * An empty view mounted in the page with the shell's view options, rendered.
 * @param {{[key: string]: unknown}} [initialState] - Seed state on top of the shell's keys.
 * @returns {Promise<{view: EmptyView, appState: ReturnType<typeof viewOptions>['appState']}>} The view and the app state it was handed.
 */
export async function mountEmptyView(initialState = {}) {
    const options = viewOptions(initialState);
    const view = await mountModule(
        EmptyView.create('view', /** @type {EmptyView['options']} */ (options)),
    );
    // As the view lifecycle shows every view it activates.
    view.show();
    return { view, appState: options.appState };
}
