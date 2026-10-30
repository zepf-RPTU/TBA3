// @vitest-browser
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EnItemDetailModule } from '../../../../src/en/modules/enItemDetail/enItemDetailModule.js';
import { EN_GROUP_DOMAIN_VALUE_GROUPS } from '../../../support/groupDocumentStoreFixture.js';
import { mountModule } from '../../../support/dom.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

/**
 * The card is handed ids only and resolves the records from `en.itemRecords` itself, so
 * what it shows is the dataset's record for that id, in the table's order.
 */

const ITEMS_JSON = [
    {
        id: 'own-group',
        type: 'group',
        name: 'Lerngruppe',
        domain: { id: 'ho', name: 'Hören' },
        items: [
            {
                iqbId: 'ho-1',
                name: '1',
                position: 1,
                exercise: { name: 'Erste Aufgabe' },
                parameters: { competenceLevel: { id: '1', nameShort: 'A1.1' } },
                descriptiveStatistics: { mean: 0.5 },
            },
            {
                iqbId: 'ho-2',
                name: '2',
                position: 2,
                exercise: { name: 'Zweite Aufgabe' },
                parameters: { competenceLevel: { id: '1', nameShort: 'A1.1' } },
                descriptiveStatistics: { mean: 0.25 },
            },
        ],
    },
];

/** @type {EnItemDetailModule|null} */
let card = null;
/** @type {HTMLElement} */
let host;

beforeEach(() => {
    host = document.createElement('div');
    document.body.replaceChildren(host);
});

afterEach(() => {
    card?.remove();
    card = null;
});

/** @returns {Promise<EnItemDetailModule>} The card over the two-item group, not yet connected. */
async function makeCard() {
    card = EnItemDetailModule.create('detail', {
        context: await createSubjectContext('en', {
            documents: {
                'items.json': ITEMS_JSON,
                'competence-levels.json': EN_GROUP_DOMAIN_VALUE_GROUPS,
            },
        }),
        glossaryKey: 'en.item.item-details',
        showModuleTitle: true,
    });
    return card;
}

describe('EnItemDetailModule', () => {
    it('falls back to the empty message for an id the dataset does not know', async () => {
        const detail = await mountModule(await makeCard(), undefined, host);

        await detail.onItemSelected({ itemIds: ['nope'] });

        expect(host.querySelector('.item-detail-content .empty-message')).not.toBeNull();
    });

    it('names the item in one line and shows its stats', async () => {
        // The number, Domäne and Niveau are the table row's; the card repeats none of them
        // as rows, only the line that says which item the figures are for.
        const detail = await mountModule(await makeCard(), undefined, host);

        await detail.onItemSelected({ itemIds: ['ho-1'] });

        const content = /** @type {HTMLElement} */ (host.querySelector('.item-detail-content'));
        expect(content.querySelector('.detail-heading')?.textContent).toBe('H-1 – Erste Aufgabe');
        const labels = [...content.querySelectorAll('.detail-label')].map((label) =>
            label.textContent?.replace(/:$/, ''),
        );
        expect(labels).toContain('Lösungsquote');
    });
});
