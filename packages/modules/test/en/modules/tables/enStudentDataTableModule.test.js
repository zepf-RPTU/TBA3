// @vitest-browser

import { describe, it, expect, vi } from 'vitest';
import { EnStudentDataTableModule } from '../../../../src/en/modules/tables/enStudentDataTableModule.js';
import { EN_DATASETS } from '../../../../src/en/enDatasets.js';
import { RESULT_CODE } from '../../../../src/common/domain/apiValueMaps.js';
import { registerStandardItemScales } from '../../../support/competenceScaleFixture.js';
import { required } from '../../../support/required.js';
import { createSubjectContext } from '../../../support/subjectContext.js';
import { mountTable, stubCanvasTextMeasurement } from '../../../support/tableHarness.js';

vi.mock('../../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

stubCanvasTextMeasurement();

/** @type {import('../../../../src/en/enConfig.js').EnConfig} */
const EN_CONFIG = Object.freeze({
    domainIds: ['ho', 'le'],
    domainLabels: ['Hören', 'Lesen'],
    subjectName: 'Englisch',
    styleCategories: [],
    resultTypes: [],
    equivalenceTables: { ho: null, le: null },
});

/**
 * The table showing one student who reached B1 (slots 5-6) in Hörverstehen and A2
 * (slots 3-4) in Leseverstehen, the shared predicates themselves being pinned in
 * `levelPresetFilters.test.js`; and a way to switch on one of its level presets.
 */
async function mountStudentTable() {
    const context = await createSubjectContext('en', {
        datasets: [
            [EN_DATASETS.CONFIG, EN_CONFIG],
            // One item the student sat, so the table has a row to build with.
            [
                EN_DATASETS.ITEM_RECORDS,
                [{ iqbId: 'i1', name: '1', domain: 'ho', competenceLevel: 'B1.1' }],
            ],
            [
                EN_DATASETS.STUDENT_RECORDS,
                [
                    {
                        studentId: 's1',
                        itemResults: new Map([['i1', RESULT_CODE.CORRECT]]),
                        domains: {
                            ho: { competenceLevelItemSpan: { from: 5, to: 6 } },
                            le: { competenceLevelItemSpan: { from: 3, to: 4 } },
                        },
                    },
                ],
            ],
        ],
    });
    registerStandardItemScales(context.palette);
    const module = EnStudentDataTableModule.create('en-student-table', {
        context,
        studentId: 's1',
        glossaryKey: 'en.student.student-item-table',
        // In the app the student card shows this toolbar in its own title bar.
        showModuleTitle: true,
    });
    const table = await mountTable(module);
    /**
     * Switch on the preset at `index` (0 „Unter GER“, 1 „Über GER“) and read back whether
     * the filters it put on the table keep a row.
     * @param {number} index
     * @returns {(domain: string, competenceLevel: string, resultCode: number) => boolean}
     */
    const preset = (index) => {
        /** @type {HTMLButtonElement} */ (
            required(module.querySelectorAll('button[data-preset-index]')[index])
        ).click();
        return (domain, competenceLevel, resultCode) =>
            table.filters.every((entry) =>
                typeof entry.field === 'function'
                    ? entry.field({ domain, competenceLevel, resultCode })
                    : true,
            );
    };
    return { preset };
}

describe('EnStudentDataTableModule level presets', () => {
    it('relate each row to the level reached in its own domain', async () => {
        const { preset } = await mountStudentTable();

        const below = preset(0);
        // A2.2 (slot 4) is below B1 in ho, inside A2 in le.
        expect(below('ho', 'A2.2', RESULT_CODE.INCORRECT)).toBe(true);
        expect(below('le', 'A2.2', RESULT_CODE.INCORRECT)).toBe(false);

        const above = preset(1);
        // B1.1 (slot 5) is inside B1 in ho, above A2 in le.
        expect(above('ho', 'B1.1', RESULT_CODE.CORRECT)).toBe(false);
        expect(above('le', 'B1.1', RESULT_CODE.CORRECT)).toBe(true);
    });
});
