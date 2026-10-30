// @vitest-browser

import { describe, it, expect, vi } from 'vitest';
import { MaItemTableModule } from '../../../../src/ma/modules/tables/maItemTableModule.js';
import { required } from '../../../support/required.js';
import { createSubjectContext } from '../../../support/subjectContext.js';
import { mountTable, stubCanvasTextMeasurement } from '../../../support/tableHarness.js';

vi.mock('../../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

stubCanvasTextMeasurement();

describe('MaItemTableModule presets', () => {
    it('count an item as incomplete from 25 % not attempted', async () => {
        const module = MaItemTableModule.create('ma-item-table', {
            context: await createSubjectContext('ma'),
            glossaryKey: 'ma.item.item-table',
            showModuleTitle: true,
        });
        const table = await mountTable(module);

        /** @type {HTMLButtonElement} */ (
            required(module.querySelectorAll('button[data-preset-index]')[2])
        ).click();

        const incomplete = (/** @type {number|null} */ percentageNotAttempted) =>
            table.filters.every((entry) =>
                typeof entry.field === 'function' ? entry.field({ percentageNotAttempted }) : true,
            );
        expect(incomplete(30)).toBe(true);
        expect(incomplete(25)).toBe(true);
        expect(incomplete(10)).toBe(false);
        expect(incomplete(null)).toBe(false);
        module.remove();
    });
});
