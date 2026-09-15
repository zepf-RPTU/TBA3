// @vitest-browser

import { describe, it, expect, vi } from 'vitest';
import { createProgressBarColumn } from '@tba3/modules/common/tables/progressBarColumn.js';

vi.mock('@tba3/modules/common/glossary/glossaryAnnotator.js', () => ({
    glossaryAnnotator: { getRequiredEntryText: (path) => path },
}));

/**
 * Run the column's formatter on one row, as Tabulator would.
 * @param {object} rowData - The row's fields.
 * @returns {HTMLElement} The rendered bar.
 */
function render(rowData) {
    const { formatter } = createProgressBarColumn({ showCounts: true });
    return formatter({ getRow: () => ({ getData: () => rowData }) });
}

describe('progress bar column, fixed mode', () => {
    it('shows the no-data text for a row that carries none of the three shares', () => {
        // WHY: an item nobody answered has no shares. An empty bar whose tooltips read
        // "Richtig: 0.0% (0)" states a result the payload never reported.
        const bar = render({
            percentageCorrect: null,
            percentageIncorrect: null,
            percentageNotAttempted: null,
        });

        expect(bar.textContent).toBe('general.messages.no-data-short');
        expect(bar.querySelector('[data-tooltip-text]')).toBeNull();
    });

    it('draws no segment and no tooltip for one missing share', () => {
        // WHY: a payload may omit one Ergebnis bucket; the other two stay as delivered.
        const bar = render({
            percentageCorrect: 60,
            percentageIncorrect: 40,
            percentageNotAttempted: null,
            correctCount: 6,
            incorrectCount: 4,
        });

        expect(bar.querySelector('.bar-not-attempted')).toBeNull();
        expect(bar.querySelector('.bar-correct').getAttribute('data-tooltip-text')).toBe(
            'Richtig: 60.0% (6)',
        );
    });

    it('keeps a genuine zero share', () => {
        const bar = render({
            percentageCorrect: 100,
            percentageIncorrect: 0,
            percentageNotAttempted: 0,
            correctCount: 5,
            incorrectCount: 0,
            notAttemptedCount: 0,
        });

        expect(bar.querySelector('.bar-incorrect').getAttribute('data-tooltip-text')).toBe(
            'Falsch: 0.0% (0)',
        );
    });
});
