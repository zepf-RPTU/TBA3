import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyedTimers } from '../../../src/common/services/keyedTimers.js';

describe('KeyedTimers', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    // The filter menu's "Alle Filter zurücksetzen" clears every pending text filter;
    // a timer that survived would re-apply the filter the reset just removed.
    it('clear() drops every pending timer', () => {
        const timers = new KeyedTimers();
        const fired = vi.fn();
        timers.schedule('a', 100, fired);
        timers.schedule('b', 100, fired);

        timers.clear();
        vi.advanceTimersByTime(200);

        expect(fired).not.toHaveBeenCalled();
        expect(timers.has('a')).toBe(false);
        expect(timers.has('b')).toBe(false);
    });
});
