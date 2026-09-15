import { describe, it, expect } from 'vitest';
import { TableEventSuppressor } from '@tba3/modules/common/tables/internal/tableEventSuppressor.js';

/** A suppressor whose deferred releases are captured so the test can flush them. */
function makeSuppressor() {
    const deferred = [];
    const suppressor = new TableEventSuppressor((release) => deferred.push(release));
    return { suppressor, flushDeferred: () => deferred.splice(0).forEach((fn) => fn()) };
}

describe('TableEventSuppressor', () => {
    it('suppresses a single named event without affecting others', () => {
        const { suppressor } = makeSuppressor();
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);

        const release = suppressor.suppress('dataFiltered');
        expect(suppressor.isSuppressed('dataFiltered')).toBe(true);
        expect(suppressor.isSuppressed('rowSelectionChanged')).toBe(false);

        release();
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
    });

    it('treats the default/wildcard suppression as covering every event', () => {
        const { suppressor } = makeSuppressor();
        const release = suppressor.suppress(); // defaults to '*'
        expect(suppressor.isSuppressed('anything')).toBe(true);
        expect(suppressor.isSuppressed('dataSorted')).toBe(true);
        release();
        expect(suppressor.isSuppressed('anything')).toBe(false);
    });

    it('counts suppression depth so a nested release does not re-enable the outer scope', () => {
        // WHY: this is the whole reason the state is a counter, not a boolean —
        // overlapping suppress() scopes for the same event must both release
        // before the event fires again, or an inner operation would leak events
        // out of an outer suppressed operation.
        const { suppressor } = makeSuppressor();
        const releaseOuter = suppressor.suppress('dataFiltered');
        const releaseInner = suppressor.suppress('dataFiltered');

        releaseInner();
        expect(suppressor.isSuppressed('dataFiltered')).toBe(true); // outer still holds it

        releaseOuter();
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
    });

    it('makes each release idempotent so a double-call cannot under-count a sibling scope', () => {
        // WHY: withSuppressed defers releases (release: 'timeout'); if a release ran
        // twice it could decrement a still-active sibling scope's counter to 0.
        const { suppressor } = makeSuppressor();
        const releaseA = suppressor.suppress('dataFiltered');
        const releaseB = suppressor.suppress('dataFiltered');

        releaseA();
        releaseA(); // repeated — must be a no-op, not a second decrement
        expect(suppressor.isSuppressed('dataFiltered')).toBe(true); // B still holds it

        releaseB();
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
    });

    it('withSuppressed (sync) suppresses during the operation and releases after', () => {
        const { suppressor } = makeSuppressor();
        let seenDuring = null;
        suppressor.withSuppressed('dataFiltered', () => {
            seenDuring = suppressor.isSuppressed('dataFiltered');
        });
        expect(seenDuring).toBe(true);
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
    });

    it('withSuppressed (timeout) defers release through the injected scheduler', () => {
        const { suppressor, flushDeferred } = makeSuppressor();
        suppressor.withSuppressed('dataFiltered', () => {}, { release: 'timeout' });
        expect(suppressor.isSuppressed('dataFiltered')).toBe(true);
        flushDeferred(); // simulate the tracked timeout firing
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
    });

    it('releases suppression even if the operation throws', () => {
        const { suppressor } = makeSuppressor();
        expect(() =>
            suppressor.withSuppressed('dataFiltered', () => {
                throw new Error('boom');
            }),
        ).toThrow('boom');
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
    });

    it('clear() drops all outstanding suppression', () => {
        const { suppressor } = makeSuppressor();
        suppressor.suppress('dataFiltered');
        suppressor.suppress('*');
        suppressor.clear();
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
        expect(suppressor.isSuppressed('anything')).toBe(false);
    });

    it('suppresses multiple named events from a single suppress() call', () => {
        const { suppressor } = makeSuppressor();
        const release = suppressor.suppress(['dataFiltered', 'dataSorted']);
        expect(suppressor.isSuppressed('dataFiltered')).toBe(true);
        expect(suppressor.isSuppressed('dataSorted')).toBe(true);
        expect(suppressor.isSuppressed('rowSelectionChanged')).toBe(false);
        release();
        expect(suppressor.isSuppressed('dataFiltered')).toBe(false);
        expect(suppressor.isSuppressed('dataSorted')).toBe(false);
    });
});
