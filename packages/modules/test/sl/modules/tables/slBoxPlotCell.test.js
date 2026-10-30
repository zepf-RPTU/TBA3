// @vitest-browser
// slColumnBuilders pulls in the chart/theme layer at import time, which reads
// computed styles off document.documentElement.

import { describe, it, expect } from 'vitest';
import { createVizModeSwitchingFormatter } from '../../../../src/sl/modules/tables/slColumnBuilders.js';
import { VIZ_MODES } from '../../../../src/sl/slVizModes.js';

import { createFakeCell as cellFor } from '../../../support/tabulatorFakes.js';
import { tooltipLines } from '../../../support/dom.js';
import { createTestContext } from '../../../support/glossaryFixture.js';

const { glossary } = createTestContext();

// The cell ends its whiskers at Tukey's fences, as every SL box-plot chart does.
// Ending them at mean ± 1.5·SD and calling them "Min / Max" would make the same mark mean
// two different things depending on where the reader looks.

describe('the box-plot cell (box-plot viz mode)', () => {
    /**
     * The survey-measure cell formatter, in box-plot mode.
     * @returns {(cell: any) => any}
     */
    const boxPlotModeFormatter = () =>
        createVizModeSwitchingFormatter({
            boxColor: '#336699',
            dataField: 'teachingQuality',
            tooltipTitle: 'Unterrichtsqualität',
            vizModeGetter: () => VIZ_MODES.BOXPLOT,
            glossary,
        });

    // The 1–5 rating scale maps onto 10…110 px, so 1.5 → 22.5 and 4.5 → 97.5.
    // A mean ± 1.5·SD rule would draw the same row at 2.25 → 41.25 and 3.75 → 78.75.
    const TUKEY_STATS = {
        count: 5,
        mean: 3,
        standardDeviation: 0.5,
        median: 3,
        q1: 2.5,
        q3: 3.5,
        whiskerMin: 1.5,
        whiskerMax: 4.5,
    };

    /**
     * The horizontal extent of the drawn figure: the whisker ends.
     * @param {Element} node - The rendered cell.
     * @returns {{from: number, to: number}} Leftmost and rightmost x of any line.
     */
    function whiskerSpan(node) {
        const xs = [...node.querySelectorAll('svg line')].flatMap((line) => [
            Number(line.getAttribute('x1')),
            Number(line.getAttribute('x2')),
        ]);
        return { from: Math.min(...xs), to: Math.max(...xs) };
    }

    it('degrades to the empty bar cell when the box-plot stats are missing or invalid', () => {
        // Incomplete stats (count 0, or a missing quartile) must render the
        // shared no-data cell rather than a broken/empty SVG.
        const format = boxPlotModeFormatter();
        const empty = format(cellFor(null, { teachingQuality: { count: 0 } }));
        expect(empty.classList.contains('stacked-bar-container')).toBe(true);
        expect(empty.querySelector('.stacked-bar-empty').textContent).toBe('Keine Daten');
    });

    it('draws the whiskers at the Tukey ends the statistics carry, and names them', () => {
        const format = boxPlotModeFormatter();
        const node = format(cellFor(null, { teachingQuality: TUKEY_STATS }));

        expect(node.querySelector('svg')).not.toBeNull();
        // Box + median + 2 whiskers + 2 caps = 6 drawn shapes.
        expect(node.querySelectorAll('svg line, svg rect')).toHaveLength(6);

        const { from, to } = whiskerSpan(node);
        expect(from).toBeCloseTo(22.5, 5);
        expect(to).toBeCloseTo(97.5, 5);

        const tooltip = tooltipLines(node);
        expect(tooltip).toContain('Median: 3,00');
        expect(tooltip).toContain('Q1 / Q3: 2,50 / 3,50');
        expect(tooltip).toContain('Min / Max: 1,50 / 4,50');
    });
});
