import { describe, it, expect } from 'vitest';
import { ReadinessGate } from '../../../../src/common/tables/internal/readinessGate.js';

/**
 * The gate a table's deferred operations pass: shown, and not building. Its integration
 * with the table (show flush, build settle, teardown) is `tableModuleVisibility.test.js`.
 */

/**
 * A gate with switchable state and a settle the test resolves.
 * @param {{visible?: boolean, building?: boolean}} [initial]
 */
function makeGate({ visible = true, building = false } = {}) {
    const state = { visible, building, closed: false };
    /** @type {() => void} */
    let settle = () => {};
    /** @type {Array<[unknown, string]>} */
    const errors = [];
    const gate = new ReadinessGate({
        isVisible: () => state.visible,
        isBuilding: () => state.building,
        whenSettled: () =>
            new Promise((resolve) => {
                settle = () => resolve(undefined);
            }),
        isClosed: () => state.closed,
        onError: (error, key) => errors.push([error, key]),
    });
    return { gate, state, errors, settle: () => settle() };
}

describe('ReadinessGate', () => {
    it('runs at once when shown and built, and holds a hidden table’s operation until shown', () => {
        const { gate, state } = makeGate({ visible: false });
        /** @type {string[]} */
        const calls = [];

        expect(gate.run('a', () => calls.push('a'))).toBe(false);
        expect(calls).toEqual([]);
        state.visible = true;
        gate.flush();
        expect(calls).toEqual(['a']);
        expect(gate.run('b', () => calls.push('b'))).toBe(true);
        gate.flush();
        expect(calls).toEqual(['a', 'b']);
    });

    it('keeps the latest operation per key, whether it waited hidden or behind a build', async () => {
        const { gate, state, settle } = makeGate({ building: true });
        /** @type {string[]} */
        const calls = [];

        gate.run('update', () => calls.push('behind the build'));
        state.visible = false;
        gate.run('update', () => calls.push('while hidden'));
        state.visible = true;
        state.building = false;
        settle();
        await Promise.resolve();

        expect(calls).toEqual(['while hidden']);
    });

    it('drops the operation waiting under a key when a newer one runs at once', () => {
        // Shown, but not yet flushed: the newer operation is the one the table takes.
        const { gate, state } = makeGate({ visible: false });
        /** @type {string[]} */
        const calls = [];
        gate.run('update', () => calls.push('stale'));

        state.visible = true;
        gate.run('update', () => calls.push('fresh'));
        gate.flush();

        expect(calls).toEqual(['fresh']);
    });

    it('stops at an operation that starts a build; the rest run once it has settled', async () => {
        const { gate, state, settle } = makeGate({ visible: false });
        /** @type {string[]} */
        const calls = [];
        gate.run('rebuild', () => {
            calls.push('rebuild');
            state.building = true;
        });
        gate.run('after', () => calls.push('after'));

        state.visible = true;
        gate.flush();
        expect(calls).toEqual(['rebuild']);

        state.building = false;
        settle();
        await Promise.resolve();
        expect(calls).toEqual(['rebuild', 'after']);
    });

    it('logs an operation that throws after it waited, and runs the rest', () => {
        const { gate, state, errors } = makeGate({ visible: false });
        const boom = new Error('boom');
        /** @type {string[]} */
        const calls = [];
        gate.run('boom', () => {
            throw boom;
        });
        gate.run('ok', () => calls.push('ok'));

        state.visible = true;
        gate.flush();

        expect(errors).toEqual([[boom, 'boom']]);
        expect(calls).toEqual(['ok']);
    });

    it('drops what waits once its owner is torn down', () => {
        const { gate, state } = makeGate({ visible: false });
        /** @type {string[]} */
        const calls = [];
        gate.run('a', () => calls.push('a'));

        state.closed = true;
        state.visible = true;

        gate.flush();
        expect(calls).toEqual([]);
    });
});
