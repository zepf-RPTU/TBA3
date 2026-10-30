// @vitest-browser

/**
 * The EN tables' domain column groups name their domain as the payload does and link it
 * to the entry that claims the domain's id: `Hören` and `Lesen` match no term.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createDomainColumns } from '../../../../src/en/modules/tables/enTableColumns.js';
import { processColumnDefinitions } from '../../../../src/common/tables/internal/columnDefinitionProcessor.js';
import { extractTableFilterDescriptors } from '../../../../src/common/tables/internal/tableFilterMetadata.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { buildRealTabulator, destroyRealTabulators } from '../../../support/realTabulator.js';

afterEach(destroyRealTabulators);

const enConfig = /** @type {import('../../../../src/en/enConfig.js').EnConfig} */ (
    /** @type {unknown} */ ({
        domainIds: ['ho', 'le'],
        domainLabels: ['Hören', 'Lesen'],
        styleCategories: [],
    })
);

describe('the EN domain column groups', () => {
    it('offer a GER filter per domain, named by its group, only when asked', () => {
        const context = createTestContext('en');
        const filters = (/** @type {{filterable?: boolean}} */ options) =>
            extractTableFilterDescriptors(
                createDomainColumns(context, { enConfig, mode: 'all' }, options),
            ).map(({ field, title }) => [field, title]);

        expect(filters({ filterable: true })).toEqual([
            ['d0Ger', 'Hören – GER'],
            ['d1Ger', 'Lesen – GER'],
        ]);
        expect(filters({})).toEqual([]);
    });

    it('link each group title to the entry that claims its domain id', async () => {
        const context = createTestContext('en');
        const { definitions } = processColumnDefinitions(
            createDomainColumns(context, { enConfig, mode: 'all' }),
            { excludedFields: new Set(), columnDefaults: {}, glossary: context.glossary },
        );
        const table = await buildRealTabulator({ columns: definitions, data: [] }, 800);

        const titles = [
            ...table.element.querySelectorAll('.tabulator-col-group > .tabulator-col-content'),
        ].map((title) => {
            const term = title.querySelector('[data-glossary-key]');
            return [title.textContent?.trim(), term?.getAttribute('data-glossary-key') ?? null];
        });
        expect(titles).toEqual([
            ['Hören', 'hörverstehen'],
            ['Lesen', 'leseverstehen'],
        ]);
    });
});
