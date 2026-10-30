// @vitest-browser

import { describe, it, expect } from 'vitest';

import { measureTextWidth } from '../../src/utils/textMeasurement.js';

/**
 * The test font at a size.
 * @param {number} size - Font size in px.
 * @returns {import('../../src/utils/textMeasurement.js').MeasureFont}
 */
const font = (size) => ({ size, weight: 600, family: 'sans-serif' });

describe('measureTextWidth', () => {
    it('grows with the label length', () => {
        const short = measureTextWidth('Hören', { font: font(12) });
        const long = measureTextWidth('Hören und Lesen im Lerngruppenvergleich', {
            font: font(12),
        });

        expect(long).toBeGreaterThan(short);
    });

    it('grows with the font size', () => {
        const small = measureTextWidth('Domäne', { font: font(10) });
        const large = measureTextWidth('Domäne', { font: font(24) });

        expect(large).toBeGreaterThan(small);
    });

    it('adds the padding to the measured width', () => {
        const bare = measureTextWidth('Domäne', { font: font(12) });
        const padded = measureTextWidth('Domäne', { font: font(12), padding: 20 });

        expect(padded).toBe(bare + 20);
    });

    it('returns the padding alone for empty text', () => {
        expect(measureTextWidth('', { font: font(12), padding: 12 })).toBe(12);
    });
});
