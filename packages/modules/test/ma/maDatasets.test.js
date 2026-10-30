import { describe, expect, it } from 'vitest';

import { MA_DATASETS } from '../../src/ma/index.js';
import { BOOKLET_PROPERTY } from '../support/competenceLevelGroups.js';
import { itemRecord } from '../support/groupDocumentStoreFixture.js';
import { createSubjectContext } from '../support/subjectContext.js';

/**
 * The value groups of one items.json, in an order that interleaves the roles.
 * @returns {import('../../src/common/data/schemas/items.js').ItemsValueGroup[]}
 */
function itemsWithEveryRole() {
    /**
     * @param {string} id
     * @param {string} type - Its role.
     * @param {string} name
     * @returns {import('../../src/common/data/schemas/items.js').ItemsValueGroup}
     */
    const valueGroup = (id, type, name) => ({
        id,
        type,
        name,
        domain: { id: 'zahlen', name: 'Zahlen und Operationen' },
        items: [itemRecord('i1', 0.5, { name: '1.1', exercise: 'Aufgabe 1' })],
    });
    return [
        valueGroup('nw-hsa', 'state', 'Landesschnitt HSA'),
        valueGroup('bund', 'federal', 'Bundesschnitt'),
        valueGroup('group-3a', 'group', 'Lerngruppe 3a'),
        valueGroup('school-avg', 'school', 'Schulschnitt'),
        valueGroup('nw-gy', 'state', 'Landesschnitt GY'),
    ];
}

describe('MA_DATASETS', () => {
    it('keeps the group items apart from every comparison population', async () => {
        // Split on `type` with the group the only enumerated side — a population the
        // client has no shape for must never join the group's own item records.
        const store = (
            await createSubjectContext('ma', { documents: { 'items.json': itemsWithEveryRole() } })
        ).documents;

        expect(store.getDataset(MA_DATASETS.GROUP_ITEMS).map((g) => g.id)).toEqual(['group-3a']);
    });

    it('keeps every comparison average in payload order, as EN does', async () => {
        // A state can ship one Landesschnitt per track, each its own marker; an
        // unknown population is kept, and the order is the exporter's, not a client ranking.
        const store = (
            await createSubjectContext('ma', { documents: { 'items.json': itemsWithEveryRole() } })
        ).documents;

        const groups = store.getDataset(MA_DATASETS.ITEM_COMPARISON_GROUPS);
        expect(groups.map((g) => g.id)).toEqual(['nw-hsa', 'bund', 'school-avg', 'nw-gy']);
        expect(groups.map((g) => g.shortLabel)).toEqual(['L1', null, null, 'L2']);
    });

    it('lists every comparison population once across the competence levels and the items', async () => {
        // The app shows every id of this list at start, and one ⌀ toggle stands for a
        // population in the competence-level chart and the item lollipop alike: a population both
        // documents carry is one toggle, one only the items carry still gets its own.
        const store = (
            await createSubjectContext('ma', {
                documents: {
                    'competence-levels.json': [
                        {
                            id: 'group-3a',
                            type: 'group',
                            name: 'Lerngruppe 3a',
                            properties: [BOOKLET_PROPERTY],
                            competenceLevels: [],
                        },
                        {
                            id: 'nw-hsa',
                            type: 'state',
                            name: 'Landesschnitt HSA',
                            properties: [BOOKLET_PROPERTY],
                            competenceLevels: [],
                        },
                    ],
                    'items.json': itemsWithEveryRole(),
                },
            })
        ).documents;

        expect(store.getDataset(MA_DATASETS.COMPARISON_IDS)).toEqual([
            'nw-hsa',
            'bund',
            'school-avg',
            'nw-gy',
        ]);
    });
});
