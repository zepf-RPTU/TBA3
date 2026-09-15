import { describe, it, expect } from 'vitest';
import { TableRedrawScheduler } from '@tba3/modules/common/tables/internal/tableRedrawScheduler.js';

/**
 * Build a scheduler over controllable module state and a captured frame queue so the
 * test drives redraw gating + settle timing without a real Tabulator or rAF.
 */
function makeScheduler(init = {}) {
    const redraws = [];
    const state = {
        table: init.table ?? { redraw: (arg) => redraws.push(arg) },
        built: init.built ?? true,
        destroyed: init.destroyed ?? false,
        container: init.container ?? { offsetWidth: 100, offsetHeight: 50 },
    };
    const frames = [];
    const scheduler = new TableRedrawScheduler({
        getTable: () => state.table,
        isBuilt: () => state.built,
        isDestroyed: () => state.destroyed,
        getContainer: () => state.container,
        scheduleFrame: (cb) => frames.push(cb),
    });
    // Run queued frames generation-by-generation until the queue drains.
    const flushFrames = () => {
        let guard = 0;
        while (frames.length && guard++ < 50) frames.splice(0).forEach((fn) => fn());
    };
    return { scheduler, state, redraws, flushFrames, pendingFrames: () => frames.length };
}

describe('TableRedrawScheduler.redrawNow', () => {
    it('redraws the current, built, on-screen table', () => {
        const h = makeScheduler();
        expect(h.scheduler.redrawNow()).toBe(true);
        expect(h.redraws).toEqual([true]); // Tabulator full redraw
    });

    it('skips when the table is not yet built or the module is destroyed', () => {
        const notBuilt = makeScheduler({ built: false });
        expect(notBuilt.scheduler.redrawNow()).toBe(false);
        expect(notBuilt.redraws).toEqual([]);

        const destroyed = makeScheduler({ destroyed: true });
        expect(destroyed.scheduler.redrawNow()).toBe(false);
    });

    it('skips a stale table that is no longer the current one', () => {
        const h = makeScheduler();
        const stale = h.state.table;
        h.state.table = {
            redraw: () => {
                throw new Error('stale redraw');
            },
        };
        expect(h.scheduler.redrawNow(stale)).toBe(false); // stale !== current
    });

    it('skips a zero-size container unless requireVisible is false', () => {
        // WHY: redrawing a hidden (0×0) container measures wrong widths; the
        // initial build (requireVisible:false) is the one intentional exception.
        const h = makeScheduler({ container: { offsetWidth: 0, offsetHeight: 0 } });
        expect(h.scheduler.redrawNow()).toBe(false);
        expect(h.redraws).toEqual([]);
        expect(h.scheduler.redrawNow(undefined, { requireVisible: false })).toBe(true);
    });
});

describe('TableRedrawScheduler.scheduleSettled', () => {
    it('defers the redraw to a frame and does a follow-up settle redraw + afterRedraw', () => {
        const h = makeScheduler();
        let afterCalls = 0;

        expect(
            h.scheduler.scheduleSettled({
                afterRedraw: () => {
                    afterCalls += 1;
                },
            }),
        ).toBe(true);
        expect(h.redraws).toEqual([]); // nothing runs synchronously
        expect(afterCalls).toBe(0);

        h.flushFrames();
        expect(h.redraws).toEqual([true, true]); // initial + follow-up
        expect(afterCalls).toBe(1); // afterRedraw once, after settle
    });

    it('collapses overlapping schedules via the pending guard', () => {
        // WHY: the guard is the single reason a settle redraw and a second request
        // do not stack into duplicate redraws mid-flight.
        const h = makeScheduler();
        expect(h.scheduler.scheduleSettled()).toBe(true);
        expect(h.scheduler.scheduleSettled()).toBe(false); // already pending
        h.flushFrames();
        expect(h.redraws).toEqual([true, true]); // one schedule's worth, not two
    });

    it('does not run afterRedraw when the initial redraw is skipped', () => {
        const h = makeScheduler({ container: { offsetWidth: 0, offsetHeight: 0 } });
        let afterCalls = 0;
        h.scheduler.scheduleSettled({
            afterRedraw: () => {
                afterCalls += 1;
            },
        });
        h.flushFrames();
        expect(h.redraws).toEqual([]);
        expect(afterCalls).toBe(0);
    });

    it('releases the guard after settling so a later schedule works', () => {
        const h = makeScheduler();
        h.scheduler.scheduleSettled();
        h.flushFrames();
        expect(h.scheduler.scheduleSettled()).toBe(true); // guard was released
    });
});

describe('TableRedrawScheduler guard sharing (show/hide)', () => {
    it('redrawNowGuarded is skipped while a settle redraw is pending', () => {
        // WHY: show()'s synchronous redraw and the settle redraw share ONE guard, so
        // a show mid-settle must not fire a competing redraw.
        const h = makeScheduler();
        h.scheduler.scheduleSettled(); // sets pending
        expect(h.scheduler.redrawNowGuarded()).toBe(false);
        expect(h.redraws).toEqual([]); // nothing ran synchronously

        h.flushFrames();
        expect(h.scheduler.redrawNowGuarded()).toBe(true); // now free
    });

    it('resetGuard() clears the guard so a fresh schedule can start', () => {
        const h = makeScheduler();
        h.scheduler.scheduleSettled(); // pending = true (frame not flushed)
        h.scheduler.resetGuard(); // hide() path
        expect(h.scheduler.scheduleSettled()).toBe(true); // guard cleared
    });
});
