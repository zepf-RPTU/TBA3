import { describe, it, expect } from 'vitest';
import {
    getBestNumericSelection,
    getSelectionValueRange,
    isBetterNumericSelection,
    matchesComparison,
} from '@tba3/modules/sl/modules/infoBox/infoBoxSelectionRanking.js';

const candidates = [
    { className: '8b', share: 0.4 },
    { className: '8a', share: 0.4 },
    { className: '8c', share: 0.1 },
    { className: '8d', share: null },
];

describe('getSelectionValueRange', () => {
    it('reports both boundaries, breaking ties by the lower key', () => {
        const range = getSelectionValueRange(
            candidates,
            (c) => c.share,
            (c) => c.className,
            (c) => c.className,
        );
        expect(range).toEqual({
            minShare: 0.1,
            maxShare: 0.4,
            minSelection: '8c',
            maxSelection: '8a',
        });
    });

    it('returns null when nothing is rankable', () => {
        expect(getSelectionValueRange([{ share: null }], (c) => c.share)).toBeNull();
        expect(getSelectionValueRange(null, (c) => c.share)).toBeNull();
    });
});

describe('getBestNumericSelection', () => {
    it('picks the highest by default and the lowest in min mode, with the class name as tie-break', () => {
        const select = (c) => ({ className: c.className });
        expect(getBestNumericSelection(candidates, select, (c) => c.share, null)).toEqual({
            className: '8a',
        });
        expect(getBestNumericSelection(candidates, select, (c) => c.share, null, 'min')).toEqual({
            className: '8c',
        });
    });

    it('drops candidates without a selection or a finite value', () => {
        expect(
            getBestNumericSelection(
                [{ share: 0.5 }],
                () => null,
                (c) => c.share,
                null,
            ),
        ).toBeNull();
        expect(
            getBestNumericSelection(
                [{ share: NaN }],
                (c) => c,
                (c) => c.share,
                null,
            ),
        ).toBeNull();
    });
});

describe('isBetterNumericSelection / matchesComparison', () => {
    it('orders by value first and by key on ties', () => {
        expect(isBetterNumericSelection(2, 1, 'b', 'a')).toBe(true);
        expect(isBetterNumericSelection(1, 1, 'a', 'b')).toBe(true);
        expect(isBetterNumericSelection(1, 1, 'b', 'a')).toBe(false);
        expect(isBetterNumericSelection(1, 2, 'a', 'b', 'min')).toBe(true);
        expect(isBetterNumericSelection(NaN, 1, 'a', 'b')).toBe(false);
    });

    it('tests the sign of a difference', () => {
        expect(matchesComparison(3)).toBe(true);
        expect(matchesComparison(-3)).toBe(false);
        expect(matchesComparison(-3, 'lt')).toBe(true);
        expect(matchesComparison(NaN)).toBe(false);
    });
});
