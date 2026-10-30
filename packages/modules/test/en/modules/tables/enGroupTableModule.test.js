// @vitest-browser

import { signal } from '@preact/signals-core';
import { describe, it, expect, vi } from 'vitest';
import { EnGroupTableModule } from '../../../../src/en/modules/tables/enGroupTableModule.js';
import { EN_DATASETS } from '../../../../src/en/enDatasets.js';
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
    styleCategories: [{ value: 'global', fieldName: 'globalPercent', label: 'Global' }],
    resultTypes: [],
    equivalenceTables: { ho: null, le: null },
});

describe('EnGroupTableModule Domäne switch', () => {
    it('re-runs the sort in force, which a style column takes from the domain', async () => {
        // A style column's sorter reads the share of the domain in force. Without a
        // re-sort the rows keep the old domain's order under the new domain's figures,
        // while the header still shows the sort arrow.
        const domainMode = signal('ho');
        const module = EnGroupTableModule.create('en-group-table', {
            context: await createSubjectContext('en', {
                datasets: [
                    [EN_DATASETS.STUDENT_RECORDS, []],
                    [EN_DATASETS.CONFIG, EN_CONFIG],
                ],
            }),
            glossaryKey: 'en.group.group-table',
            showModuleTitle: true,
            domainMode,
        });
        const table = await mountTable(module);
        // The user sorted by the style column.
        table.setSort([{ column: 'globalPercent', dir: 'desc' }]);
        const setSort = vi.spyOn(table, 'setSort');

        domainMode.value = 'le';

        await vi.waitFor(() =>
            expect(setSort).toHaveBeenCalledWith([{ column: 'globalPercent', dir: 'desc' }]),
        );
        module.remove();
    });
});
