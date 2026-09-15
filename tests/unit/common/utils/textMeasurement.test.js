/**
 * Text measurement without a canvas.
 *
 * This file deliberately carries no `// @vitest-browser` marker: it runs in the node
 * project, where `document` does not exist, which is exactly the path
 * `measureHeaderWidth` has to survive. Every caller feeds the result into layout
 * (table column widths, ring title wrapping, the SL dropdown), so an estimate is
 * the contract, not a throw.
 */

import { describe, it, expect } from 'vitest';

import {
    measureHeaderWidth,
    resolveCssLengthToPx,
} from '@tba3/module-base/utils/textMeasurement.js';

describe('measureHeaderWidth without a canvas context', () => {
    it('estimates a width instead of throwing', () => {
        const width = measureHeaderWidth('Kompetenzstufe', { fontSize: 12, padding: 0 });

        expect(Number.isFinite(width)).toBe(true);
        expect(width).toBeGreaterThan(0);
    });

    it('grows with the label length', () => {
        const short = measureHeaderWidth('Hören', { fontSize: 12, padding: 0 });
        const long = measureHeaderWidth('Hören und Lesen im Klassenvergleich', {
            fontSize: 12,
            padding: 0,
        });

        expect(long).toBeGreaterThan(short);
    });

    it('grows with the font size', () => {
        const small = measureHeaderWidth('Domäne', { fontSize: 10, padding: 0 });
        const large = measureHeaderWidth('Domäne', { fontSize: 24, padding: 0 });

        expect(large).toBeGreaterThan(small);
    });

    it('adds the padding and the tracking to the estimate', () => {
        const bare = measureHeaderWidth('Domäne', { fontSize: 12, padding: 0 });
        const padded = measureHeaderWidth('Domäne', { fontSize: 12, padding: 20 });
        const tracked = measureHeaderWidth('Domäne', {
            fontSize: 12,
            padding: 0,
            letterSpacing: '0.1em',
        });

        expect(padded).toBe(bare + 20);
        expect(tracked).toBeGreaterThan(bare);
    });

    it('returns the padding alone for empty text', () => {
        expect(measureHeaderWidth('', { padding: 12 })).toBe(12);
    });
});

describe('resolveCssLengthToPx without a document', () => {
    it('resolves rem against the 16px default root size', () => {
        expect(resolveCssLengthToPx('1.5rem', 0)).toBe(24);
    });

    it('falls back for a unit it does not understand', () => {
        expect(resolveCssLengthToPx('2vw', 7)).toBe(7);
    });
});
