// @vitest-browser
import { describe, expect, it } from 'vitest';
import { render } from 'lit';
import { resultSectionTemplate } from '../../../src/common/utils/resultRows.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { MISSING_VALUE } from '../../../src/common/utils/numberFormat.js';

/** @type {import('../../../src/common/utils/resultRows.js').ResultFigures} */
const FIGURES = {
    rate: 60,
    correct: 6,
    incorrect: 3,
    notAttempted: 1,
    total: 10,
    totalUnit: 'students',
    pilotRate: 70,
    pilotDiffPP: -10,
};

/**
 * @param {Partial<typeof FIGURES>} [figures] - Figures the test pins.
 * @returns {Array<{label: string, value: Element}>}
 */
const rows = (figures) => {
    const host = document.createElement('div');
    render(
        resultSectionTemplate(createTestContext('en').glossary, { ...FIGURES, ...figures }),
        host,
    );
    return [...host.querySelectorAll('.detail-row')].map((row) => ({
        label: row.querySelector('.detail-label')?.textContent?.replace(/:$/, '') ?? '',
        value: /** @type {Element} */ (row.querySelector('.detail-value')),
    }));
};

describe('resultSectionTemplate', () => {
    it('names what the total counts: an item counts students, a pooled Leitidee responses', () => {
        expect(rows().map(({ label }) => label)).toContain('Gesamt Schüler:innen');
        expect(rows({ totalUnit: 'responses' }).map(({ label }) => label)).toContain(
            'Gesamt Antworten',
        );
    });

    it('prints the dash, not 0 %, for a rate nobody answered toward', () => {
        expect(rows({ rate: null })[0].value.textContent).toBe(MISSING_VALUE);
    });

    it('places a selection’s rate right below the rate', () => {
        expect(rows({ selection: { label: 'Lösungsquote Anna', rate: 50 } })[1].label).toBe(
            'Lösungsquote Anna',
        );
    });

    it('marks a Pilotierung difference below the pilot rate in the table colour', () => {
        const pilot = rows().at(-1);

        expect(pilot?.label).toBe('Pilotierung');
        expect(pilot?.value.querySelector('.result-diff--down')).not.toBeNull();
    });

    it('leaves the Pilotierung row out for an unpiloted item', () => {
        expect(
            rows({ pilotRate: null, pilotDiffPP: null }).map(({ label }) => label),
        ).not.toContain('Pilotierung');
    });
});
