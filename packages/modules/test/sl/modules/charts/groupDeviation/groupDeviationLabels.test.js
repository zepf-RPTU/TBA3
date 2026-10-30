// @vitest-browser
// The functions under test are pure, but they live beside the renderer they size —
// importing that module pulls in ChartRenderer, which touches `window` at load.
import { describe, it, expect } from 'vitest';
import {
    resolveLabelLineCount,
    summaryMinRowWidth,
} from '../../../../../src/sl/modules/charts/groupDeviation/groupDeviationChart.js';

/**
 * The minimum width of a summary whose one card carries `labels`.
 * @param {string[]} labels - The card's column labels.
 * @returns {number} width in px
 */
const estimateMinRowWidth = (labels) =>
    summaryMinRowWidth({ rows: [{ entries: labels.map((label) => ({ label })) }] });

/**
 * Column-label geometry for the SL Überblick cards.
 *
 * These functions decide how wide a summary card has to be before the CSS grid
 * will place a second card beside it. API labels are the school's own free-text group
 * names — `D_E_08a_ABCD`, `Landesschnitt HSA-GK` — not just `8a`, and the floor also
 * sets the demo dataset's layout. The split itself is the shared `splitLabelLines`,
 * covered in chartLabelFit.test.js.
 */

describe('resolveLabelLineCount', () => {
    it('reports two as soon as any one label in the view wraps', () => {
        // The band is part of the chart area, so all cards must reserve the same
        // one. A card that reserved fewer lines would draw an equal deviation at a
        // different pixel height and break the shared y domain.
        expect(resolveLabelLineCount(['8a', '8b', 'D_E_08a_ABCD'])).toBe(2);
    });

    it('reports one when every label fits on a single line', () => {
        // The demo fixture's shape — it must not pay for a band it does not use.
        expect(resolveLabelLineCount(['8a', '8b', '8d', 'Landesschnitt'])).toBe(1);
    });

    it('reports one for a label that opens on a separator', () => {
        // '` Landesschnitt`' (school-entered free text) split into a blank first
        // line would save no width, yet make this report two lines and cost every card
        // in the view the taller label band.
        expect(resolveLabelLineCount([' Landesschnitt'])).toBe(1);
    });

    it('reports one for no labels at all', () => {
        expect(resolveLabelLineCount([])).toBe(1);
    });
});

describe('summaryMinRowWidth', () => {
    const SHORT = ['8a', '8b', '8c', '8d'];

    it('falls back to the bar-readability floor when the labels are short', () => {
        // A two-character label needs ~25px, well under the 56px a bar needs to
        // stay readable, so the bar keeps deciding the width. Without the floor a card
        // of `8a`/`8b` columns would collapse to unreadably thin bars.
        // 152 (school box) + 20 (gap) + 2 * 10 (plot padding) + 4 * 56; the card's own
        // chrome is the CSS's to add.
        expect(estimateMinRowWidth(SHORT)).toBe(152 + 20 + 20 + 4 * 56);
    });

    it('is driven past the floor by a long unbreakable label, even among short ones', () => {
        // The demo fixture has this shape — `Landesschnitt` next to `8a`. Every
        // column gets the same band, so one 13-character word with nothing to break on
        // sets the column width for the whole card.
        expect(estimateMinRowWidth(['Landesschnitt', '8a', '8b', '8c'])).toBeGreaterThan(
            estimateMinRowWidth(SHORT),
        );
    });

    it('sizes off the longest line, not the longest label', () => {
        // A label that splits into two short lines must not reserve the width of
        // its unsplit self, or the card grows for room it never uses.
        const wrapped = estimateMinRowWidth(['D_E_08a_ABCD']);
        const unwrappable = estimateMinRowWidth(['DE08aABCDXXXX']);

        expect(wrapped).toBeLessThan(unwrappable);
    });
});
