import { describe, it, expect } from 'vitest';
import {
    MAX_STANDARD_RANK,
    MIN_STANDARD_RANK,
    deriveRankBounds,
    parseStandardRank,
    satisfiesEveryPossibleRank,
} from '@tba3/modules/common/domain/competenceStandardRanks.js';

describe('parseStandardRank', () => {
    it('accepts only a string that is entirely a rank in range', () => {
        expect(parseStandardRank('3')).toBe(3);
        expect(parseStandardRank(' 5 ')).toBe(5);
        expect(parseStandardRank('0')).toBeNull();
        expect(parseStandardRank('6')).toBeNull();
        expect(parseStandardRank('3 (Regelstandard)')).toBeNull();
        expect(parseStandardRank('')).toBeNull();
        expect(parseStandardRank(undefined)).toBeNull();
    });
});

describe('deriveRankBounds', () => {
    it('pins a named level to its own rank and bounds unnamed neighbours by the named ones', () => {
        const bounds = deriveRankBounds([
            { nameShort: 'k.h.N.', shippedRank: null },
            { nameShort: 'KS 1', shippedRank: 1 },
            { nameShort: 'KS 2', shippedRank: null },
            { nameShort: 'KS 3', shippedRank: 3 },
            { nameShort: 'KS 5', shippedRank: null },
        ]);
        expect(bounds.get('k.h.N.')).toEqual({ lower: MIN_STANDARD_RANK, upper: 1 });
        expect(bounds.get('KS 1')).toEqual({ lower: 1, upper: 1 });
        expect(bounds.get('KS 2')).toEqual({ lower: 1, upper: 3 });
        expect(bounds.get('KS 5')).toEqual({ lower: 3, upper: MAX_STANDARD_RANK });
    });

    it('leaves a scale that names nothing at the full interval', () => {
        const bounds = deriveRankBounds([{ nameShort: 'A1' }, { nameShort: 'A2' }]);
        expect(bounds.get('A1')).toEqual({ lower: MIN_STANDARD_RANK, upper: MAX_STANDARD_RANK });
    });
});

describe('satisfiesEveryPossibleRank', () => {
    it('is exact for a pinned level and conservative for an unranked one', () => {
        const atLeastThree = (rank) => rank >= 3;
        expect(
            satisfiesEveryPossibleRank({ rankLowerBound: 3, rankUpperBound: 3 }, atLeastThree),
        ).toBe(true);
        expect(
            satisfiesEveryPossibleRank({ rankLowerBound: 1, rankUpperBound: 3 }, atLeastThree),
        ).toBe(false);
        expect(
            satisfiesEveryPossibleRank(
                { rankLowerBound: 1, rankUpperBound: 1 },
                (rank) => rank <= 1,
            ),
        ).toBe(true);
    });
});
