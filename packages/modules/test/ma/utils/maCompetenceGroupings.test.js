// The competence groupings come from the payload: every type the items carry, its values
// in `id` order, never a hardcoded vocabulary (VERA 3 and VERA 8 name them differently).

import { describe, expect, it } from 'vitest';
import { deriveCompetenceGroupings } from '../../../src/ma/utils/maCompetenceGroupings.js';
import { buildItemArray } from '../../../src/ma/utils/maItemDataAdapter.js';
import { buildStudentItemRowsByStudent } from '../../../src/ma/utils/maStudentDataAdapter.js';

/** @typedef {import('../../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */

const K = 'Allgemeine Kompetenz';
const AB = 'Anforderungsbereich';

/**
 * One payload item.
 * @param {string} iqbId
 * @param {Array<{id?: string, type?: string, name?: string}>} competences
 * @returns {ItemsValueGroup['items'][number]}
 */
const item = (iqbId, competences) => ({
    iqbId,
    name: iqbId,
    position: 1,
    exercise: { name: `Aufgabe ${iqbId}` },
    descriptiveStatistics: { mean: 0.5 },
    parameters: { competenceLevel: { id: '1', nameShort: 'I' }, competences },
});

/** @type {ItemsValueGroup[]} */
const groupItems = [
    {
        id: 'g1',
        type: 'group',
        name: '3a',
        domain: { id: 'zo', name: 'Zahlen und Operationen' },
        items: [
            // The first item names AB II before K5: payload order says nothing about the values.
            item('i1', [
                { id: 'II', type: AB, name: 'Zusammenhänge herstellen' },
                { id: 'K5', type: K, name: 'Mit Elementen der Mathematik umgehen' },
            ]),
            item('i2', [
                { id: 'K2', type: K, name: 'Probleme mathematisch lösen' },
                { id: 'K10', type: K, name: 'Zehn' },
                { id: 'K5', type: K, name: 'Mit Elementen der Mathematik umgehen' },
                { id: 'I', type: AB, name: 'Reproduzieren' },
            ]),
        ],
    },
    {
        id: 'g1',
        type: 'group',
        name: '3a',
        domain: { id: 'rf', name: 'Raum und Form' },
        items: [
            item('i3', [
                { id: 'III', type: AB, name: 'Verallgemeinern und Reflektieren' },
                { type: 'style', name: 'global' },
                { type: K },
            ]),
        ],
    },
];

describe('deriveCompetenceGroupings', () => {
    const groupings = deriveCompetenceGroupings(groupItems);

    it('keeps the types in the order the payload first names them, skipping style', () => {
        expect(groupings.map(({ type, field }) => [type, field])).toEqual([
            [AB, 'competenceGroup0'],
            [K, 'competenceGroup1'],
        ]);
    });

    it('orders the values by id, numerals and codes numerically', () => {
        expect(groupings[0].values).toEqual([
            'Reproduzieren',
            'Zusammenhänge herstellen',
            'Verallgemeinern und Reflektieren',
        ]);
        expect(groupings[1].values).toEqual([
            'Probleme mathematisch lösen',
            'Mit Elementen der Mathematik umgehen',
            'Zehn',
        ]);
    });

    it('orders values without an id by name', () => {
        // The IQB tags VERA 3 tasks by name only.
        const [primar] = deriveCompetenceGroupings([
            {
                id: 'g1',
                type: 'group',
                name: '3a',
                domain: { id: 'zo', name: 'Zahlen und Operationen' },
                items: [
                    item('i1', [
                        { type: K, name: 'Modellieren' },
                        { type: K, name: 'Darstellen' },
                    ]),
                ],
            },
        ]);
        expect(primar.values).toEqual(['Darstellen', 'Modellieren']);
    });

    it('derives nothing from items without competences', () => {
        expect(deriveCompetenceGroupings([{ ...groupItems[0], items: [item('i1', [])] }])).toEqual(
            [],
        );
    });
});

describe('the item and student records', () => {
    const groupings = deriveCompetenceGroupings(groupItems);
    const records = buildItemArray(groupItems, [], null, groupings);

    it('carry each item its values per grouping, in the grouping order', () => {
        const i2 = records.find((record) => record.iqbId === 'i2');
        expect(i2?.competenceGroup0).toEqual(['Reproduzieren']);
        expect(i2?.competenceGroup1).toEqual([
            'Probleme mathematisch lösen',
            'Mit Elementen der Mathematik umgehen',
            'Zehn',
        ]);
        // An item without a value of a type has an empty list, not a missing field.
        expect(records.find((record) => record.iqbId === 'i3')?.competenceGroup1).toEqual([]);
    });

    it('reach the student rows', () => {
        const withResult = records.map((record) => ({
            ...record,
            results: new Map([['s1', 1]]),
        }));
        const [row] = buildStudentItemRowsByStudent(withResult, groupings).get('s1') ?? [];
        expect(row.competenceGroup0).toEqual(['Zusammenhänge herstellen']);
        expect(row.competenceGroup1).toEqual(['Mit Elementen der Mathematik umgehen']);
    });
});
