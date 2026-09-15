// @vitest-browser

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { BaseModule } from '@tba3/module-base/modules/baseModule.js';

/**
 * BaseViewModule._hydrateChildren() is the one owner of the child-init
 * ordering the sibling wiring depends on: every child is registered and mounted
 * before any of them hydrates. The bug this prevents is a sibling's sync
 * callback — fired from inside its render — landing before the child it targets
 * is constructed and mounted, so the report is lost. Before the helper, EN/MA
 * views spelled that ordering out by hand with IMPORTANT comments and seven
 * MA/SL views got it the other way round.
 */

class View extends BaseViewModule {
    async _renderView() {}
}

/** A child that logs its lifecycle and, optionally, reports while rendering. */
class Child extends BaseModule {
    /** @type {string[]} */
    static log = [];
    received = [];

    constructor(id, options = {}) {
        super(id, document.createElement('div'), options);
    }

    mount(data) {
        // mount() is idempotent; log only the mount that actually happens.
        if (!this.mounted) Child.log.push(`mount:${this.id}`);
        super.mount(data);
    }

    async _doRender() {
        Child.log.push(`render:${this.id}`);
        // The production shape: a table fires its sync callback option from its
        // first render (e.g. _onTableReady → onDataSync); the view wired it to
        // a sibling's verb with a lazy closure.
        this.getOption('onSync')?.({ from: this.id });
    }

    onSync(data) {
        this.received.push(data.from);
    }
}

function mountView() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = new View('view', container, {});
    return { view };
}

describe('BaseViewModule._hydrateChildren', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        Child.log = [];
    });

    it('mounts every child before any hydrates, so a sync fired mid-render reaches a later-listed sibling', async () => {
        const { view } = mountView();
        const listener = new Child('listener');
        // The view wires the producer's callback to the consumer's verb — the
        // same lazy-closure shape real views use for table → chart sync.
        const publisher = new Child('publisher', { onSync: (data) => listener.onSync(data) });

        // The listener is listed *after* the publisher: without the
        // register-and-mount-all-first rule it would still be unmounted when the
        // publisher's render fires the callback.
        await view._hydrateChildren([[publisher], [listener]]);

        expect(listener.received).toEqual(['publisher']);
        expect(listener.mounted).toBe(true);
        expect(Child.log.indexOf('mount:listener')).toBeLessThan(
            Child.log.indexOf('render:publisher'),
        );
        expect(Array.from(view.childModules)).toEqual([publisher, listener]);
    });

    it('mounts every child before any hydrates, and stores per-child mount data', async () => {
        const { view } = mountView();
        const a = new Child('a');
        const b = new Child('b');

        await view._hydrateChildren([
            [a, { n: 1 }],
            [b, { n: 2 }],
        ]);

        expect(Child.log).toEqual(['mount:a', 'mount:b', 'render:a', 'render:b']);
        expect(a.getData()).toEqual({ n: 1 });
        expect(b.getData()).toEqual({ n: 2 });
        expect(a.initialized && b.initialized).toBe(true);
    });

    it('skips an absent child and leaves an early-mounted one as the view left it', async () => {
        const { view } = mountView();
        const early = new Child('early');
        view.registerChildModule(early);
        early.mount({ shell: 'tweaked' });

        await view._hydrateChildren([[null], [undefined, { ignored: true }], [early]]);

        expect(Array.from(view.childModules)).toEqual([early]);
        expect(early.getData()).toEqual({ shell: 'tweaked' });
        expect(Child.log).toEqual(['mount:early', 'render:early']);
    });
});
