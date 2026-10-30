// @vitest-browser
// (the value-label font reads the root font tokens)
import { describe, it, expect } from 'vitest';
import { VALUE_LABEL, fitValueLabel } from '../../../src/common/charts/chartValueLabels.js';

/**
 * A renderer stand-in whose text is 8 px a character and 12 px a line, drawn at 12 px:
 * the fit rule is arithmetic over those, so the tier choice can be read off the sizes.
 */
const chart = {
    measureTexts: (/** @type {string[]} */ texts) => ({
        maxWidth: Math.max(...texts.map((text) => text.length * 8)),
        maxHeight: 12,
        totalWidth: 0,
        totalHeight: 0,
        sizes: texts.map((text) => ({ width: text.length * 8, height: 12 })),
    }),
    resolveChartTextSize: () => 12,
};

/** The level-share tiers a stacked segment offers, longest first. */
const TIERS = ['A2 · 32 %', ['A2', '32 %'], 'A2'];

/**
 * A box whose inner area, once `VALUE_LABEL.padPx` a side is taken, is exactly `widthPx` × `heightPx`.
 * @param {number} widthPx - Inner width.
 * @param {number} heightPx - Inner height.
 * @returns {{width: number, height: number}}
 */
const box = (widthPx, heightPx) => ({
    width: widthPx + 2 * VALUE_LABEL.padPx,
    height: heightPx + 2 * VALUE_LABEL.padPx,
});

describe('fitValueLabel', () => {
    it('keeps the longest tier that fits the box less its padding', () => {
        // `A2 · 32 %` is 9 characters, 72 px: it fits exactly, not a pixel less.
        expect(fitValueLabel(chart, TIERS, box(72, 12))).toBe('A2 · 32 %');
        expect(fitValueLabel(chart, TIERS, box(71, 12))).toBe('A2');
    });

    it('takes the two-line tier where the box is tall enough for both lines', () => {
        // Two lines take one line box plus one 1.1 × 12 px line step: 25.2 px.
        expect(fitValueLabel(chart, TIERS, box(40, 26))).toEqual(['A2', '32 %']);
        expect(fitValueLabel(chart, TIERS, box(40, 25))).toBe('A2');
    });

    it('returns null when no tier fits', () => {
        expect(fitValueLabel(chart, TIERS, box(15, 12))).toBeNull();
        expect(fitValueLabel(chart, TIERS, box(72, 11))).toBeNull();
    });

    it('skips an empty tier rather than drawing nothing as a fit', () => {
        expect(fitValueLabel(chart, ['', 'A2'], box(16, 12))).toBe('A2');
    });
});
