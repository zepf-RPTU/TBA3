import { describe, it, expect } from 'vitest';
import { ResourceTracker } from '@tba3/module-base/utils/resourceTracker.js';

describe('ResourceTracker.untrackDisposable', () => {
    it('drops a settled one-shot handle so repeated renders cannot pile them up', () => {
        const tracker = new ResourceTracker('test');
        const destroyed = [];

        // The shape used by remountChartHost / #waitForTableContainerWidth: a cancel
        // handle that is only meaningful until the wait it guards has settled.
        const handle = tracker.trackDisposable({ destroy: () => destroyed.push('handle') });
        expect(tracker.untrackDisposable(handle)).toBe(true);

        tracker.destroy();

        // Already settled — re-running its teardown at destroy time would resolve a
        // promise nobody is waiting on and clear a timeout that has long fired.
        expect(destroyed).toEqual([]);
    });

    it('leaves other disposables tracked and still tears them down in LIFO order', () => {
        const tracker = new ResourceTracker('test');
        const destroyed = [];

        tracker.trackDisposable({ destroy: () => destroyed.push('first') });
        const middle = tracker.trackDisposable({ destroy: () => destroyed.push('middle') });
        tracker.trackDisposable({ destroy: () => destroyed.push('last') });

        tracker.untrackDisposable(middle);
        tracker.destroy();

        expect(destroyed).toEqual(['last', 'first']);
    });

    it('does not skip siblings when a disposable untracks itself during destroy', () => {
        const tracker = new ResourceTracker('test');
        const destroyed = [];

        // destroy() walks the list backwards; a handle whose teardown calls finish()
        // — which untracks it — mutates that list mid-walk.
        tracker.trackDisposable({ destroy: () => destroyed.push('outer') });
        const selfUntracking = tracker.trackDisposable({
            destroy: () => {
                destroyed.push('self');
                tracker.untrackDisposable(selfUntracking);
            },
        });
        tracker.trackDisposable({ destroy: () => destroyed.push('later') });

        tracker.destroy();

        expect(destroyed).toEqual(['later', 'self', 'outer']);
    });

    it('reports false for a disposable it never tracked', () => {
        const tracker = new ResourceTracker('test');
        expect(tracker.untrackDisposable({ destroy: () => {} })).toBe(false);
    });
});
