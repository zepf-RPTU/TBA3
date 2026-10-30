// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';
import { BaseModule } from '../../index.js';

afterEach(() => {
    document.body.replaceChildren();
});

/** A module whose content pass fails for the payload `'bad'`, once the test ends it. */
class Pass extends BaseModule {
    /** @type {Array<() => void>} */
    #finish = [];

    /** @returns {Array<() => void>} Ends each pass started, in start order. */
    get finish() {
        return this.#finish;
    }

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderContent() {
        const payload = this.data;
        await new Promise((resolve) => this.#finish.push(() => resolve(undefined)));
        if (payload === 'bad') throw new Error('bad payload');
    }

    /**
     * Hand the module a pass it started itself, outside an update.
     * @param {Promise<void>} pass
     */
    adopt(pass) {
        this._adoptContentPass(pass);
    }

    /** Start a rebuild of the module's own, which `finish` ends like a content pass. */
    startRebuild() {
        this.adopt(new Promise((resolve) => this.#finish.push(() => resolve(undefined))));
    }
}
customElements.define('test-content-pass', Pass);

/** A module whose content settles once, when the test ends it. */
class Settling extends BaseModule {
    /** @type {() => void} */
    #endSettle = () => {};

    /** @type {Promise<void>} */
    #settled = new Promise((resolve) => {
        this.#endSettle = () => resolve(undefined);
    });

    /** Ends the settling of the module's content. */
    endSettle() {
        this.#endSettle();
    }

    /**
     * @override
     * @returns {Promise<void>}
     */
    _contentSettled() {
        return this.#settled;
    }
}
customElements.define('test-content-settling', Settling);

/** A module with nothing of its own to wait for. */
class Holder extends BaseModule {}
customElements.define('test-content-holder', Holder);

/** @returns {Promise<void>} Resolves once the queued microtasks have run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('BaseModule content pass', () => {
    it('settles on the newest pass when a pass it replaced fails', async () => {
        // A payload set while the previous one is still drawing supersedes it: the
        // earlier pass's failure is about a payload no longer shown.
        const module = Pass.create('pass', {});
        module.data = 'bad';
        document.body.append(module);
        const waiting = module.updateComplete;
        await tick();

        module.data = 'good';
        await tick();
        const [endBad, endGood] = module.finish;
        endBad();
        endGood();

        await expect(waiting).resolves.toBe(true);
    });

    it('rejects while the failing pass is the newest', async () => {
        const module = Pass.create('pass', {});
        module.data = 'bad';
        document.body.append(module);
        const waiting = module.updateComplete;
        module.finish[0]();

        await expect(waiting).rejects.toThrow('bad payload');
    });

    it('settles on a pass the module hands over after a failed one', async () => {
        // A rebuild the module starts on its own signals replaces the failed pass: the
        // module now shows what the rebuild drew.
        const module = Pass.create('pass', {});
        module.data = 'bad';
        document.body.append(module);
        module.finish[0]();
        await expect(module.updateComplete).rejects.toThrow('bad payload');
        expect(module.initialized).toBe(false);

        module.adopt(Promise.resolve());

        await expect(module.updateComplete).resolves.toBe(true);
        await expect(module.contentComplete).resolves.toBeUndefined();
        expect(module.initialized).toBe(true);
    });

    it('waits for a pass a sibling starts while another settles', async () => {
        // A table syncs its chart once its rows are drawn, inside its own settling; the
        // chart had settled already, so a wait taken before the sync would miss it.
        const parent = Holder.create('parent', {});
        const table = Settling.create('table', {});
        const chart = Pass.create('chart', {});
        parent.append(table, chart);
        document.body.append(parent);
        await tick();
        chart.finish[0]();

        let settled = false;
        const waiting = parent.updateComplete.then(() => {
            settled = true;
        });
        await tick();

        chart.startRebuild();
        table.endSettle();
        await tick();
        expect(settled).toBe(false);

        chart.finish[1]();
        await waiting;
        expect(settled).toBe(true);
    });

    it('counts a pass a sibling starts after another child was built as unbuilt', async () => {
        const parent = Holder.create('parent', {});
        const first = Pass.create('first', {});
        const second = Pass.create('second', {});
        parent.append(first, second);
        document.body.append(parent);
        await tick();

        let built = false;
        const waiting = parent.contentComplete.then(() => {
            built = true;
        });
        // The second child is built, then starts a rebuild while the first still builds.
        second.finish[0]();
        await tick();
        second.startRebuild();
        first.finish[0]();
        await tick();
        expect(built).toBe(false);

        second.finish[1]();
        await waiting;
        expect(built).toBe(true);
    });

    it('settles a subtree where nothing restarts', async () => {
        const parent = Holder.create('parent', {});
        const child = Pass.create('child', {});
        parent.append(child);
        document.body.append(parent);
        await tick();
        child.finish[0]();

        await expect(parent.updateComplete).resolves.toBe(true);
    });

    it('rejects while a handed-over pass that failed is the newest', async () => {
        const module = Pass.create('pass', {});
        module.data = 'good';
        document.body.append(module);
        module.finish[0]();
        await module.updateComplete;

        module.adopt(Promise.reject(new Error('rebuild failed')));
        await expect(module.contentComplete).rejects.toThrow('rebuild failed');

        module.data = 'good again';
        await tick();
        module.finish[1]();
        await expect(module.updateComplete).resolves.toBe(true);
    });
});
