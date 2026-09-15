// @vitest-browser
// The functions under test are pure, but they live beside the renderer they size —
// importing that module pulls in ChartRenderer, which touches `window` at load.
import { describe, it, expect } from 'vitest';
import {
    estimateMinRowWidth,
    resolveLabelLineCount,
} from '@tba3/modules/sl/modules/charts/classDeviation/classDeviationChart.js';

/**
 * Column-label geometry for the SL Überblick cards.
 *
 * These functions decide how wide a summary card has to be before the CSS grid
 * will place a second card beside it. They exist because API labels are the school's
 * own free-text group names — `D_E_08a_ABCD`, `Landesschnitt HSA-GK` — where the
 * layout was built for `8a`. Getting the
 * floor wrong silently changes the demo dataset's layout too. The split itself is
 * the shared `splitLabelLines`, covered in chartLabelFit.test.js.
 */

describe('resolveLabelLineCount', () => {
    it('reports two as soon as any one label in the view wraps', () => {
        // WHY: the band is part of the chart area, so all cards must reserve the same
        // one. A card that reserved fewer lines would draw an equal deviation at a
        // different pixel height and break the shared y domain.
        expect(resolveLabelLineCount(['8a', '8b', 'D_E_08a_ABCD'])).toBe(2);
    });

    it('reports one when every label fits on a single line', () => {
        // The demo fixture's shape — it must not pay for a band it does not use.
        expect(resolveLabelLineCount(['8a', '8b', '8d', 'Landesschnitt'])).toBe(1);
    });

    it('reports one for a label that opens on a separator', () => {
        // WHY: '` Landesschnitt`' (school-entered free text) once split into a blank
        // first line that saved no width, yet made this report two lines and cost
        // every card in the view the taller label band.
        expect(resolveLabelLineCount([' Landesschnitt'])).toBe(1);
    });

    it('reports one for no labels at all', () => {
        expect(resolveLabelLineCount([])).toBe(1);
        expect(resolveLabelLineCount(null)).toBe(1);
    });
});

describe('estimateMinRowWidth', () => {
    const SHORT = ['8a', '8b', '8c', '8d'];

    it('falls back to the bar-readability floor when the labels are short', () => {
        // WHY: a two-character label needs ~25px, well under the 56px a bar needs to
        // stay readable, so the bar keeps deciding the width. Without the floor a card
        // of `8a`/`8b` columns would collapse to unreadably thin bars.
        // 152 (school box) + 20 (gap) + 4 * 56 + 44 (card chrome).
        expect(estimateMinRowWidth(SHORT)).toBe(152 + 20 + 4 * 56 + 44);
    });

    it('widens the card when the labels are longer than the floor', () => {
        const long = ['Landesschnitt HSA-GK', 'D_E_08a_ABCD', 'D_G_08e_EFGH', 'D_E_08b_IJKL'];

        expect(estimateMinRowWidth(long)).toBeGreaterThan(estimateMinRowWidth(SHORT));
    });

    it('is driven past the floor by a long unbreakable label, even among short ones', () => {
        // WHY: the demo fixture is exactly this shape — `Landesschnitt` next to `8a`.
        // One 13-character word with nothing to break on sets the column width for the
        // whole card, so the demo view widens too. Every column gets the same band, so
        // the widest label is the one that counts.
        expect(estimateMinRowWidth(['Landesschnitt', '8a', '8b', '8c'])).toBeGreaterThan(
            estimateMinRowWidth(SHORT),
        );
    });

    it('sizes off the longest line, not the longest label', () => {
        // WHY: this is the whole point of wrapping. A label that splits into two short
        // lines must not reserve the width of its unsplit self, or the card grows for
        // room it will never use.
        const wrapped = estimateMinRowWidth(['D_E_08a_ABCD']);
        const unwrappable = estimateMinRowWidth(['DE08aABCDXXXX']);

        expect(wrapped).toBeLessThan(unwrappable);
    });

    it('grows with the number of columns', () => {
        expect(estimateMinRowWidth(['8a', '8b'])).toBeLessThan(
            estimateMinRowWidth(['8a', '8b', '8c']),
        );
    });

    it('still reserves one column when there are none', () => {
        // A card with no columns is never drawn, but a zero here would hand CSS a
        // min-width narrower than the school-value box.
        expect(estimateMinRowWidth([])).toBe(152 + 20 + 56 + 44);
        expect(estimateMinRowWidth(null)).toBe(152 + 20 + 56 + 44);
    });
});
