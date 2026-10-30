// @vitest-browser

import { describe, it, expect } from 'vitest';
import { html, render } from 'lit';
import { BaseModule } from '@tba3/module-base';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { mountModule } from '../../../../packages/modules/test/support/dom.js';
import { viewOptions } from '../../support/viewOptions.js';

/**
 * A view builds its children before it places them in one render, so a sync callback
 * fired from a child's first content pass reaches a sibling placed after it instead of
 * being lost because its target does not exist yet.
 */

/**
 * A child's options: a sync callback it fires from its first content pass.
 * @typedef {import('@tba3/module-base').BaseOptions & {onSync?: (data: {from: string}) => void}} ChildOptions
 */

/**
 * A child that reports while rendering, and records what it is told.
 * @augments {BaseModule<ChildOptions>}
 */
class Child extends BaseModule {
    /** @type {string[]} */
    #received = [];

    /** @returns {string[]} Who reported to this child, in order. */
    get received() {
        return this.#received;
    }

    /** @override */
    async _renderContent() {
        // As a table does: it fires its sync callback option from its first render
        // (e.g. _onDisplayedRowsChanged → onDataSync), which the view wired to a
        // sibling's verb with a lazy closure.
        this.options.onSync?.({ from: this.id });
    }

    /**
     * @param {{from: string}} data - What a sibling reported.
     */
    onSync(data) {
        this.#received.push(data.from);
    }
}
customElements.define('test-sync-child', Child);

/** A view that places a publisher before the listener it reports to. */
class View extends BaseViewModule {
    /** @override */
    async _renderView() {
        const listener = Child.create('listener', {});
        const publisher = Child.create('publisher', {
            onSync: (data) => listener.onSync(data),
        });
        render(html`${publisher}${listener}`, this);
    }
}
customElements.define('test-sync-view', View);

describe('BaseViewModule child placement', () => {
    it('reaches a sibling placed after the child whose first render reports to it', async () => {
        const view = await mountModule(
            View.create('view', /** @type {View['options']} */ (viewOptions())),
        );

        const [publisher, listener] = /** @type {Child[]} */ (view.childModules);
        expect(publisher.id).toBe('publisher');
        expect(listener.received).toEqual(['publisher']);
    });
});
