// @vitest-browser

import { describe, it, expect } from 'vitest';
import { EN_DATASETS } from '@tba3/modules/en-domain';
import { EnOverviewViewModule } from '../../../../src/en/views/enOverviewViewModule.js';
import { createSubjectContext } from '../../../../packages/modules/test/support/subjectContext.js';
import { createTestRuntime } from '../../../../packages/modules/test/support/glossaryFixture.js';
import { nextAnimationFrames } from '../../../../packages/modules/test/support/dom.js';
import { viewOptions } from '../../support/viewOptions.js';

/**
 * The distribution cards name each domain as the payload does, and link it to the entry
 * that claims its id: `Hören` and `Lesen` match no term.
 */

/**
 * Mount the overview on a config of two domains.
 * @param {string[]} domainIds
 * @param {string[]} domainLabels
 * @returns {Promise<EnOverviewViewModule>}
 */
async function mountOverview(domainIds, domainLabels) {
    const context = await createSubjectContext('en', {
        datasets: [
            [
                EN_DATASETS.CONFIG,
                {
                    domainIds,
                    domainLabels,
                    subjectName: 'Englisch',
                    styleCategories: [],
                    resultTypes: [],
                    equivalenceTables: Object.fromEntries(domainIds.map((id) => [id, null])),
                },
            ],
        ],
    });
    const view = EnOverviewViewModule.create(
        'en-overview',
        /** @type {EnOverviewViewModule['options']} */ ({
            context: { ...context, runtime: createTestRuntime(context) },
            ...viewOptions(),
        }),
    );
    document.body.append(view);
    await nextAnimationFrames(3);
    return view;
}

/**
 * Each distribution card's title, with the terms it links.
 * @param {EnOverviewViewModule} view
 */
function distributionTitles(view) {
    return ['#en-overview-left-chart', '#en-overview-right-chart'].map((id) => {
        const title = view.querySelector(`${id} .content-module-title`);
        return [
            title?.textContent,
            [...(title?.querySelectorAll('[data-glossary-key]') ?? [])].map((term) => [
                term.textContent,
                term.getAttribute('data-glossary-key'),
            ]),
        ];
    });
}

describe('EnOverviewViewModule distribution titles', () => {
    it('name each domain from the payload, linked by its id', async () => {
        const view = await mountOverview(['ho', 'le'], ['Hören', 'Lesen']);

        expect(distributionTitles(view)).toEqual([
            [
                'GER-Verteilung: Hören',
                [
                    ['GER', 'ger'],
                    ['Hören', 'hörverstehen'],
                ],
            ],
            [
                'GER-Verteilung: Lesen',
                [
                    ['GER', 'ger'],
                    ['Lesen', 'leseverstehen'],
                ],
            ],
        ]);
        view.remove();
    });

    it('title any two domains, which no glossary entry claims, from the payload alone', async () => {
        // Both cards share one entry, keyed by no domain id: unknown domains still get
        // their titles and tutorials, only without a link to a domain entry.
        const view = await mountOverview(['sp', 'sc'], ['Sprechen', 'Schreiben']);

        expect(distributionTitles(view)).toEqual([
            ['GER-Verteilung: Sprechen', [['GER', 'ger']]],
            ['GER-Verteilung: Schreiben', [['GER', 'ger']]],
        ]);
        expect(
            view.querySelector('#en-overview-scatterplot .content-module-title')?.textContent,
        ).toBe('Lösungsquoten: Sprechen und Schreiben');
        view.remove();
    });
});
