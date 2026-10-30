import { describe, it, expect, vi } from 'vitest';
import { ResourceTracker } from '../../src/utils/resourceTracker.js';

describe('ResourceTracker.destroy', () => {
    it('removes its DOM listeners on destroy', () => {
        const tracker = new ResourceTracker('test');
        const target = new EventTarget();
        let calls = 0;
        tracker.trackDomListener(target, 'ping', () => calls++);

        target.dispatchEvent(new Event('ping'));
        tracker.destroy();
        target.dispatchEvent(new Event('ping'));

        expect(calls).toBe(1);
    });

    it('tears subscriptions down in LIFO order and past one that throws', () => {
        const tracker = new ResourceTracker('test');
        /** @type {string[]} */
        const destroyed = [];
        vi.spyOn(console, 'error').mockImplementation(() => {});

        tracker.trackSubscription(() => destroyed.push('first'));
        tracker.trackSubscription(() => {
            throw new Error('boom');
        });
        tracker.trackSubscription(() => destroyed.push('last'));

        tracker.destroy();

        expect(destroyed).toEqual(['last', 'first']);
    });

    it('releases a subscription tracked after destroy at once', () => {
        // An async step that subscribes after its owner tore down would otherwise
        // leave the subscription running for good.
        const tracker = new ResourceTracker('test');
        tracker.destroy();
        const release = vi.fn();

        tracker.trackSubscription(release);

        expect(release).toHaveBeenCalledOnce();
    });
});
