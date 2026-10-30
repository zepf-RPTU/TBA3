import { describe, it, expect } from 'vitest';
import {
    LABEL_LINE_HEIGHT_EM,
    fitLabelLine,
    measureLabelBlockHeight,
    splitLabelLines,
    spreadLabelPositions,
} from '../../../src/common/charts/chartLabelFit.js';

/** @typedef {import('../../../src/common/charts/chartLabelFit.js').LabelMeasurer} LabelMeasurer */

/**
 * Every chart printing a free-text group name (`D_E_08a_ABCD`, `Landesschnitt HSA-GK`) breaks
 * and shortens it through these functions. A wrong split reserves width for a break that is
 * never drawn, and the labels overlap.
 */

describe('splitLabelLines', () => {
    it('breaks where the longer of the two lines comes out shortest', () => {
        // The slot has to fit the longer line, so that line is what is being
        // minimised. Breaking `Landesschnitt HSA-GK` at its hyphen instead would leave
        // an 18-character line and reserve nearly the full width anyway.
        expect(splitLabelLines('Landesschnitt HSA-GK')).toEqual(['Landesschnitt', 'HSA-GK']);
    });

    it('breaks a separator-joined test-group name into two balanced halves', () => {
        expect(splitLabelLines('D_E_08a_ABCD')).toEqual(['D_E_', '08a_ABCD']);
        expect(splitLabelLines('E_E1_08_ABCD')).toEqual(['E_E1_', '08_ABCD']);
    });

    it('keeps every character, so the label still reads back in full', () => {
        // The break is cosmetic. A split that dropped its separator would rename
        // the group — `D_E_08a_ABCD` is not `D_E08a_ABCD`.
        for (const label of ['D_E_08a_ABCD', 'Landesschnitt HSA-GK', 'M-G3-08-MNOP']) {
            expect(splitLabelLines(label).join('').replace(/\s/g, '')).toBe(
                label.replace(/\s/g, ''),
            );
        }
    });

    it('leaves a label with no separator on one line', () => {
        // Nothing to break on; the middle ellipsis handles a label that still does not fit.
        expect(splitLabelLines('Landesschnitt')).toEqual(['Landesschnitt']);
        expect(splitLabelLines('8a')).toEqual(['8a']);
    });

    it('does not break when the break would not make the label narrower', () => {
        // A trailing separator would leave the whole label on line one and an empty
        // line two — wider, not narrower.
        expect(splitLabelLines('8a_')).toEqual(['8a_']);
    });

    it('never breaks onto an empty line', () => {
        // A label that opens on a separator (`' Landesschnitt'`, school-entered
        // free text) split into ['', 'Landesschnitt'] would get a blank first line that
        // saves no width, yet counts as a second line and costs the whole view the
        // taller label band.
        expect(splitLabelLines(' Landesschnitt')).toEqual([' Landesschnitt']);
    });

    it('never returns more than two lines', () => {
        expect(splitLabelLines('a_b_c_d_e_f_g_h').length).toBeLessThanOrEqual(2);
    });

    it('returns nothing for an empty label', () => {
        expect(splitLabelLines('')).toEqual([]);
        expect(splitLabelLines(null)).toEqual([]);
    });
});

describe('measureLabelBlockHeight', () => {
    // Line boxes are 10px tall whatever the text; the font size is the stub's own.
    const chartAt = (/** @type {number} */ fontSizePx) => ({
        resolveChartTextSize: () => fontSizePx,
        measureTexts: (/** @type {string[]} */ texts) => ({ maxHeight: texts.length ? 10 : 0 }),
    });

    it('is one line box while every label stays on one line', () => {
        expect(measureLabelBlockHeight(/** @type {any} */ (chartAt(12)), ['8a', 'Schule'])).toBe(
            10,
        );
    });

    it('adds one line step as soon as any label breaks over two lines', () => {
        // A single two-line label among one-liners costs exactly one step, and a
        // second two-line label costs nothing more.
        const chart = /** @type {any} */ (chartAt(12));
        expect(measureLabelBlockHeight(chart, ['8a', 'Landesschnitt HSA-GK'])).toBe(
            10 + 12 * LABEL_LINE_HEIGHT_EM,
        );
        expect(measureLabelBlockHeight(chart, ['D_E_08a_ABCD', 'Landesschnitt HSA-GK'])).toBe(
            10 + 12 * LABEL_LINE_HEIGHT_EM,
        );
    });

    it('is nothing for no labels', () => {
        expect(measureLabelBlockHeight(/** @type {any} */ (chartAt(12)), [])).toBe(0);
    });
});

describe('fitLabelLine', () => {
    // Fixed-advance measurement stub: 6px per character, so a slot of N px holds
    // N/6 characters.
    const CHAR_PX = 6;
    /** @type {LabelMeasurer} */
    const chart = {
        measureTexts: (texts) => {
            const sizes = texts.map((t) => ({ width: t.length * CHAR_PX }));
            return { maxWidth: Math.max(...sizes.map((size) => size.width)), sizes };
        },
    };

    it('returns the line untouched when it fits', () => {
        expect(fitLabelLine(chart, 'D_E_08a', 7 * CHAR_PX)).toBe('D_E_08a');
    });

    it('shortens from the middle, keeping head and tail', () => {
        // The head and tail are what tell two free-text labels apart —
        // `D_E_08a_ABCD` against `D_G_08a_ABCD`. An end-ellipsis would make
        // them identical on screen.
        const fitted = fitLabelLine(chart, 'D_E_08a_ABCD', 9 * CHAR_PX);

        expect(fitted).toHaveLength(9);
        expect(fitted).toContain('…');
        expect(fitted.startsWith('D_E_')).toBe(true);
        expect(fitted.endsWith('BCD')).toBe(true);
    });

    it('keeps the head one longer than the tail on an odd budget', () => {
        // The head disambiguates more (subject and level lead the name).
        expect(fitLabelLine(chart, 'ABCDEFGH', 6 * CHAR_PX)).toBe('ABC…GH');
    });

    it('degrades to a bare ellipsis when nothing fits', () => {
        expect(fitLabelLine(chart, 'D_E_08a_ABCD', 2 * CHAR_PX)).toBe('…');
    });

    it('keeps a one- or two-character tag rather than replacing it with the ellipsis', () => {
        // The detail chart fits every bar label against its bar pitch, including
        // the fixed tags `S` (Schule), `L1` (a Landesschnitt track) and `Q`. An
        // ellipsis is no narrower than they are, so abbreviating them would delete
        // the only thing naming the bar and save nothing.
        expect(fitLabelLine(chart, 'S', CHAR_PX / 2)).toBe('S');
        expect(fitLabelLine(chart, 'L1', CHAR_PX)).toBe('L1');
    });

    it('leaves the line alone for a non-positive slot', () => {
        // A zero slot means the caller has no band yet; mangling the label there
        // would hide the layout bug instead of showing it.
        expect(fitLabelLine(chart, 'D_E_08a_ABCD', 0)).toBe('D_E_08a_ABCD');
    });

    it('finds the same longest fit as trying every length from the longest down', () => {
        // The fit measures every candidate in one batch to spare forced layouts.
        // With proportional glyphs the answer must still be the longest candidate that
        // fits, exactly what a linear walk downwards returns.
        const glyphPx = (/** @type {string} */ ch) =>
            /[WM_]/.test(ch) ? 11 : /[il1.]/.test(ch) ? 3 : 7;
        /** @type {LabelMeasurer} */
        const proportional = {
            measureTexts: (texts) => {
                const sizes = texts.map((t) => ({
                    width: [...t].reduce((w, ch) => w + glyphPx(ch), 0),
                }));
                return { maxWidth: Math.max(...sizes.map((size) => size.width)), sizes };
            },
        };
        const linearFit = (/** @type {string} */ line, /** @type {number} */ slot) => {
            if (proportional.measureTexts([line]).maxWidth <= slot) return line;
            for (let kept = line.length - 1; kept >= 2; kept -= 1) {
                const candidate = `${line.slice(0, Math.ceil(kept / 2))}…${line.slice(line.length - Math.floor(kept / 2))}`;
                if (proportional.measureTexts([candidate]).maxWidth <= slot) return candidate;
            }
            return line.length > 2 ? '…' : line;
        };

        for (const line of ['D_E_08a_ABCD', 'Landesschnitt HSA-GK', 'WiMi.l1_MW', 'abc']) {
            for (let slot = 1; slot <= 160; slot += 1) {
                expect(fitLabelLine(proportional, line, slot)).toBe(linearFit(line, slot));
            }
        }
    });

    it("measures with the caller's options, so fit and draw use the same font", () => {
        /** @type {unknown} */
        let seen = null;
        /** @type {LabelMeasurer} */
        const spy = {
            measureTexts: (texts, options) => {
                seen = options;
                return { maxWidth: 0, sizes: [] };
            },
        };

        fitLabelLine(spy, '8a', 100, { textSize: 'sm', fontWeight: 'bold' });

        expect(seen).toEqual({ textSize: 'sm', fontWeight: 'bold' });
    });
});

describe('spreadLabelPositions', () => {
    // The direct series labels at the right end of a line chart land on the
    // same y whenever two series end at the same value. Overlapping text is worse
    // than no label; pushing apart keeps every label readable and in the plot.
    /**
     * @param {number} minGapPx
     * @returns {{minGapPx: number, min: number, max: number}} No bounds.
     */
    const UNBOUNDED = (minGapPx) => ({ minGapPx, min: -Infinity, max: Infinity });

    it('leaves labels alone when they are already far enough apart', () => {
        const items = [{ y: 10 }, { y: 50 }, { y: 90 }];
        expect(spreadLabelPositions(items, UNBOUNDED(12))).toEqual(items);
    });

    it('pushes colliding labels apart in order and keeps the input order', () => {
        const items = [
            { id: 'a', y: 40 },
            { id: 'b', y: 40 },
            { id: 'c', y: 44 },
        ];
        const out = spreadLabelPositions(items, UNBOUNDED(10));
        expect(out.map((o) => o.id)).toEqual(['a', 'b', 'c']);
        expect(out.map((o) => o.y)).toEqual([40, 50, 60]);
    });

    it('respects the upper bound by shifting the stack back up', () => {
        const items = [{ y: 95 }, { y: 98 }, { y: 100 }];
        const out = spreadLabelPositions(items, { minGapPx: 10, min: 0, max: 100 });
        expect(out.map((o) => o.y)).toEqual([80, 90, 100]);
    });

    it('does not mutate its input', () => {
        const items = [{ y: 0 }, { y: 0 }];
        spreadLabelPositions(items, UNBOUNDED(5));
        expect(items[1].y).toBe(0);
    });
});
