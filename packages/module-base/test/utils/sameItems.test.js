import { describe, expect, it } from 'vitest';

import { sameItems } from '../../src/utils/sameItems.js';

describe('sameItems', () => {
    it('compares two lists item by item, in order', () => {
        expect(sameItems(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(sameItems(['a', 'b'], ['b', 'a'])).toBe(false);
        expect(sameItems(['a'], ['a', 'b'])).toBe(false);
    });

    it('treats an absent list as equal only to another absent one', () => {
        expect(sameItems(null, null)).toBe(true);
        expect(sameItems(null, [])).toBe(false);
        expect(sameItems(undefined, ['a'])).toBe(false);
    });
});
