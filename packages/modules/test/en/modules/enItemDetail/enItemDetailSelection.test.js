import { describe, it, expect } from 'vitest';
import { resolveActiveId } from '../../../../src/en/modules/enItemDetail/enItemDetailSelection.js';

// resolveActiveId picks the active tab after the item detail panel's selection changes.
describe('resolveActiveId', () => {
    it('activates a newly-added item so selecting a new row switches to it', () => {
        expect(resolveActiveId(['a'], ['a', 'b'], 'a')).toBe('b');
    });

    it('activates the last of several newly-added items', () => {
        // Consistent with a single add, where the newest item wins.
        expect(resolveActiveId([], ['a', 'b', 'c'], null)).toBe('c');
    });

    it('keeps the active item when an unrelated row is deselected', () => {
        // Deselecting a different row must not move the panel off the item the user
        // is reading.
        expect(resolveActiveId(['a', 'b', 'c'], ['a', 'c'], 'a')).toBe('a');
    });

    it('falls back to the last remaining item when the active one is deselected', () => {
        // The active tab vanished, so the panel must show a still-selected
        // item rather than an empty/stale detail.
        expect(resolveActiveId(['a', 'b'], ['a'], 'b')).toBe('a');
    });

    it('returns null when the selection becomes empty', () => {
        // An empty set (e.g. filter reset) must clear the active item so the
        // panel shows its empty message.
        expect(resolveActiveId(['a'], [], 'a')).toBeNull();
    });
});
