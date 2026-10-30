// @vitest-browser

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createProgressBarColumns } from '../../../src/common/tables/progressBarColumn.js';

import { columnFunction, createFakeCell } from '../../support/tabulatorFakes.js';
import { tooltipLines } from '../../support/dom.js';
import { required } from '../../support/required.js';
import { createTestContext } from '../../support/glossaryFixture.js';

/** A context whose glossary answers with the entry path, so assertions name the entry read. */
const context = createTestContext();

beforeEach(() => {
    vi.spyOn(context.glossary, 'getRequiredEntryText').mockImplementation((path) => path);
});

/**
 * Run the column's formatter on one row, as Tabulator would.
 * @param {object} rowData
 * @param {Parameters<typeof createProgressBarColumns>[1]} [options]
 * @returns {HTMLElement}
 */
function render(rowData, options) {
    const formatter = columnFunction(createProgressBarColumns(context, options)[0], 'formatter');
    return formatter(createFakeCell(null, rowData));
}

const SHARES = {
    percentageCorrect: 56,
    percentageNotAttempted: 10,
    percentageIncorrect: 34,
    correctCount: 14,
    notAttemptedCount: 2,
    incorrectCount: 9,
};

describe('progress bar column', () => {
    it('shows the no-data text for a row that carries none of the three shares', () => {
        // An item nobody answered has no shares; a tooltip reading
        // "Richtig: 0,0 % (0)" would state a result the payload never reported.
        const bar = render({
            percentageCorrect: null,
            percentageIncorrect: null,
            percentageNotAttempted: null,
        });

        expect(bar.textContent).toBe('general.messages.no-data-short');
        expect(bar.querySelector('[data-tooltip-html]')).toBeNull();
    });

    it('draws no segment and no tooltip for one missing share', () => {
        // A payload may omit one result bucket; the other two stay as delivered.
        const bar = render({
            percentageCorrect: 60,
            percentageIncorrect: 40,
            percentageNotAttempted: null,
            correctCount: 6,
            incorrectCount: 4,
        });

        expect(bar.querySelector('.level-percentageNotAttempted')).toBeNull();
        expect(tooltipLines(required(bar.querySelector('.level-percentageCorrect')))).toEqual([
            'Richtig',
            'Anteil: 60,0 %',
            'Anzahl Schüler:innen: 6',
        ]);
    });

    it('draws no segment for a zero share, and stacks the others to the full bar', () => {
        // A zero share has no width, so a segment for it could never be hovered;
        // its value is still in the row, and the other segments fill the track.
        const bar = render({
            percentageCorrect: 100,
            percentageIncorrect: 0,
            percentageNotAttempted: 0,
            correctCount: 5,
            incorrectCount: 0,
            notAttemptedCount: 0,
        });

        const segments = bar.querySelectorAll('.stacked-bar-segment');
        expect(segments).toHaveLength(1);
        expect(/** @type {HTMLElement} */ (segments[0]).style.width).toBe('100%');
    });

    it('names every share for assistive tech, not only the labelled one', () => {
        // Falsch and Unbearbeitet live only in hover tooltips otherwise.
        const bar = render(SHARES);

        expect(bar.getAttribute('role')).toBe('img');
        expect(bar.getAttribute('aria-label')).toBe('Richtig 56 %, Unbearbeitet 10 %, Falsch 34 %');
    });

    it('counts what the row counts: items on a student row', () => {
        const bar = render(SHARES, { countLabel: 'Anzahl Teilaufgaben' });

        expect(tooltipLines(required(bar.querySelector('.level-percentageCorrect')))).toContain(
            'Anzahl Teilaufgaben: 14',
        );
    });
});
