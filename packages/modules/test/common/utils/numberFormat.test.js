import { describe, expect, it } from 'vitest';

import {
    MISSING_VALUE,
    formatCount,
    formatCountOf,
    formatDecimal,
    formatPercent,
    formatPercentPoints,
    formatShare,
} from '../../../src/common/utils/numberFormat.js';

// Every dashboard number a reader sees is a percentage or a difference between two
// of them, and it must read the same in the charts, Materialien and the info boxes.
// One helper, one German format — and points are not percent.

describe('formatPercent', () => {
    it('writes a percentage the German way, from the number as shown', () => {
        expect(formatPercent(62.1)).toBe('62,1 %');
        expect(formatPercent(100)).toBe('100,0 %');
        expect(formatPercent(0)).toBe('0,0 %');
        expect(formatPercent(66.666, 0)).toBe('67 %');
    });

    it('prints a dash for the share of nobody', () => {
        // `percentOf` answers null for a zero total; every share display
        // reads that as "no share", never as 0 %.
        expect(formatPercent(null)).toBe('–');
    });

    it('takes a share between 0 and 1 through formatShare', () => {
        expect(formatShare(0.621)).toBe('62,1 %');
        expect(formatShare(0.5, 0)).toBe('50 %');
    });
});

describe('formatPercentPoints', () => {
    it('writes a difference between percentages as signed points, never percent', () => {
        // "+3 %" reads as three percent more than before, which is a different number.
        expect(formatPercentPoints(3.7)).toBe('+3,7 PP');
        expect(formatPercentPoints(-3.7)).toBe('-3,7 PP');
        expect(formatPercentPoints(0)).toBe('0,0 PP');
    });
});

describe('formatCount', () => {
    it('writes a whole number with German digit grouping', () => {
        expect(formatCount(12)).toBe('12');
        expect(formatCount(1234)).toBe('1.234');
    });

    it('writes a count out of a total', () => {
        expect(formatCountOf(12, 1000)).toBe('12 von 1.000');
    });
});

describe('a value the data does not carry', () => {
    it('prints the missing-value dash in every formatter', () => {
        // "0,0 %" for a missing value would be a figure the payload never reported,
        // indistinguishable from a real zero.
        for (const missing of [null, undefined, Number.NaN]) {
            expect(formatShare(missing)).toBe(MISSING_VALUE);
            expect(formatPercent(missing)).toBe(MISSING_VALUE);
            expect(formatDecimal(missing)).toBe(MISSING_VALUE);
            expect(formatPercentPoints(missing)).toBe(MISSING_VALUE);
            expect(formatCount(missing)).toBe(MISSING_VALUE);
        }
    });
});
