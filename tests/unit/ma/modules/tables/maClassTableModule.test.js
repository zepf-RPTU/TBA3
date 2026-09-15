// @vitest-browser

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { MaClassTableModule } from '@tba3/modules/ma/modules/tables/maClassTableModule.js';
import { initGlossaryForTests } from '../../../support/glossaryFixture.js';

vi.mock('@tba3/modules/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

/**
 * The class table with its render-time data stored, not built: presets and columns are
 * read straight off the hooks that decide them.
 * @param {{studentArray: Array<object>, nrItems: number, classKsThresholds: number[]|null}} data - The payload `_doRenderContent` would receive.
 * @returns {MaClassTableModule} The module.
 */
function tableWith(data) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const table = new MaClassTableModule('ma-class-table', container, {});
    table._currentStudentArray = data.studentArray;
    table._onBeforeRender(data);
    return table;
}

const student = (fields = {}) => ({
    studentId: 's1',
    firstName: 'Ada',
    lastName: 'Berg',
    summedResult: 27,
    ksThresholds: [27, 35],
    ...fields,
});

beforeAll(() => initGlossaryForTests('ma'));

describe('MaClassTableModule ±Schwellenwert presets', () => {
    it('are left out without class thresholds, even when students carry their own', () => {
        // WHY: `resolveClassKsThresholds` withholds a class table whose cut scores are
        // points rather than solved items. The students' own tables sit on the same
        // booklet, so their floors are points too — enabling the presets on those alone
        // compared `summedResult` with a number on another scale.
        const presets = tableWith({
            studentArray: [student()],
            nrItems: 35,
            classKsThresholds: null,
        })._getPresets();

        expect(presets.map((preset) => preset.label)).toEqual(['Stärkste 5', 'Schwächste 5']);
    });

    it('are offered when the class row supplies thresholds counted in items', () => {
        const presets = tableWith({
            studentArray: [student()],
            nrItems: 55,
            classKsThresholds: [27, 35, 42, 48],
        })._getPresets();

        expect(presets).toHaveLength(4);
    });
});

describe('MaClassTableModule student-id link', () => {
    const tooltipFor = (rowData) => {
        const [idColumn] = tableWith({
            studentArray: [rowData],
            nrItems: 1,
            classKsThresholds: null,
        })._getColumns({ genderFilterParams: {}, traitFilterParams: {} });
        const cell = {
            getValue: () => rowData.studentId,
            getRow: () => ({ getData: () => rowData }),
        };
        return idColumn.formatter(cell).getAttribute('data-tooltip-text');
    };

    it('names the student whose results it opens', () => {
        expect(tooltipFor({ studentId: 's1', firstName: 'Ada', lastName: 'Berg' })).toBe(
            'Einzelergebnisse von Ada Berg',
        );
    });

    it('falls back to a generic label when the payload carries no name', () => {
        // WHY: first and last name are optional properties, and `_preprocessData` drops an
        // empty one. The tooltip read "Einzelergebnisse von undefined undefined".
        expect(tooltipFor({ studentId: 's1' })).toBe('Einzelergebnisse anzeigen');
        expect(tooltipFor({ studentId: 's1', firstName: 'Ada' })).toBe('Einzelergebnisse anzeigen');
    });
});
