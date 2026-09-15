import { describe, it, expect } from 'vitest';
import { VisibilityDeferralQueue } from '@tba3/modules/common/tables/internal/visibilityDeferralQueue.js';

/**
 * Build a queue with controllable visibility and a captured flush scheduler so the
 * test drives exactly when deferred operations run (no real rAF/timeout needed).
 */
function makeQueue({ visible = false } = {}) {
    let isVisible = visible;
    const scheduled = [];
    const errors = [];
    const queue = new VisibilityDeferralQueue({
        isVisible: () => isVisible,
        scheduleFlush: (runDrained) => scheduled.push(runDrained),
        onError: (error) => errors.push(error),
    });
    return {
        queue,
        setVisible: (v) => {
            isVisible = v;
        },
        runScheduled: () => scheduled.splice(0).forEach((fn) => fn()),
        scheduledCount: () => scheduled.length,
        errors,
    };
}

describe('VisibilityDeferralQueue', () => {
    it('runs the operation immediately when the container is visible', () => {
        const h = makeQueue({ visible: true });
        let ran = false;

        const executedNow = h.queue.runOrDefer('a', () => {
            ran = true;
        });

        expect(executedNow).toBe(true);
        expect(ran).toBe(true);
        h.queue.flush();
        expect(h.scheduledCount()).toBe(0); // nothing was queued
    });

    it('defers the operation when hidden and runs it on flush', () => {
        const h = makeQueue({ visible: false });
        let ran = false;

        const executedNow = h.queue.runOrDefer('a', () => {
            ran = true;
        });
        expect(executedNow).toBe(false);
        expect(ran).toBe(false); // held, not run

        h.queue.flush();
        expect(ran).toBe(false); // scheduled, not yet fired
        h.runScheduled();
        expect(ran).toBe(true);
    });

    it('replaces an earlier pending op with the same key so only the latest runs', () => {
        // WHY: re-deferring the same logical operation (e.g. a data update that
        // arrives twice while hidden) must run once with the freshest closure, not
        // replay a stale one — the key dedupes by intent, not by identity.
        const h = makeQueue({ visible: false });
        const calls = [];

        h.queue.runOrDefer('update', () => calls.push('stale'));
        h.queue.runOrDefer('update', () => calls.push('fresh'));

        h.queue.flush();
        h.runScheduled();

        expect(calls).toEqual(['fresh']);
    });

    it('keeps operations queued under distinct keys', () => {
        const h = makeQueue({ visible: false });
        const calls = [];

        h.queue.runOrDefer('a', () => calls.push('a'));
        h.queue.runOrDefer('b', () => calls.push('b'));

        h.queue.flush();
        h.runScheduled();

        expect(calls.sort()).toEqual(['a', 'b']);
    });

    it('isolates a failing operation so the rest still run', () => {
        // WHY: pending ops are independent; one throwing must not abort the batch.
        const h = makeQueue({ visible: false });
        const calls = [];

        h.queue.runOrDefer('boom', () => {
            throw new Error('nope');
        });
        h.queue.runOrDefer('ok', () => calls.push('ok'));

        h.queue.flush();
        h.runScheduled();

        expect(calls).toEqual(['ok']);
        expect(h.errors).toHaveLength(1);
        expect(h.errors[0].message).toBe('nope');
    });

    it('does not schedule a flush when nothing is pending', () => {
        const h = makeQueue({ visible: false });
        h.queue.flush();
        expect(h.scheduledCount()).toBe(0);
    });

    it('reports whether it drained anything so callers can react to deferred work', () => {
        // WHY: TableModule.show() uses this signal to decide whether to force a
        // column-width redraw. A deferred data update that ran can change content
        // and thus layout, so "something was drained" must be distinguishable from
        // "nothing was pending" — otherwise an unchanged revisit cannot be skipped.
        const h = makeQueue({ visible: false });

        expect(h.queue.flush()).toBe(false); // empty queue

        h.queue.runOrDefer('a', () => {});
        expect(h.queue.flush()).toBe(true); // drained one op

        expect(h.queue.flush()).toBe(false); // drained already, nothing left
    });

    it('drains the queue on flush so a second flush is a no-op', () => {
        const h = makeQueue({ visible: false });
        let count = 0;

        h.queue.runOrDefer('a', () => {
            count += 1;
        });
        h.queue.flush();
        h.runScheduled();
        expect(count).toBe(1);

        h.queue.flush(); // nothing left
        expect(h.scheduledCount()).toBe(0);
        h.runScheduled();
        expect(count).toBe(1); // not re-run
    });
});
