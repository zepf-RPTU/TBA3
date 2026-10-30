import { describe, expect, it } from 'vitest';

import { EN_DATASETS } from '../../src/en/index.js';
import { BOOKLET_PROPERTY, studentFields } from '../support/competenceLevelGroups.js';
import { EN_GROUP_DOMAIN_VALUE_GROUPS, itemRecord } from '../support/groupDocumentStoreFixture.js';
import { createSubjectContext } from '../support/subjectContext.js';

/** @typedef {import('../../src/common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */

describe('EN_DATASETS', () => {
    it('labels a trait from either person document', async () => {
        // A student's identity comes from whichever person document names them first,
        // so a label only the aggregations carry must still reach the Merkmale chips.
        const { properties, covariates } = studentFields('Lerngruppe', 'S1');
        const student = (/** @type {string} */ value, /** @type {string} */ label) => ({
            id: 's1',
            type: 'student',
            name: 's1',
            domain: { id: 'ho', name: 'Hören' },
            properties,
            covariates: [...covariates, { type: 'trait', value, label }],
        });
        const store = (
            await createSubjectContext('en', {
                documents: {
                    'students-competence-levels.json': [
                        { ...student('f', 'Förderbedarf'), competenceLevels: [] },
                    ],
                    'students-aggregations.json': [
                        { ...student('kw', 'Kurzwahl'), aggregations: [] },
                    ],
                },
            })
        ).documents;

        expect([...store.getDataset(EN_DATASETS.TRAIT_LABELS)]).toEqual([
            ['f', 'Förderbedarf'],
            ['kw', 'Kurzwahl'],
        ]);
    });

    it('keeps the group items apart from the comparison groups items.json carries', async () => {
        // Split on `type`, the spec's discriminator — a comparison population must
        // never be merged into the group's own item records and shift its percentages.
        const store = (
            await createSubjectContext('en', {
                documents: {
                    'items.json': [
                        {
                            id: 'group-8a',
                            type: 'group',
                            name: 'Lerngruppe 8a',
                            domain: { id: 'ho', name: 'Hören' },
                            items: [],
                        },
                        {
                            id: 'nw-gy',
                            type: 'state',
                            name: 'Landesschnitt GY',
                            domain: { id: 'ho', name: 'Hören' },
                            items: [itemRecord('a', 0.5)],
                        },
                        {
                            id: 'bund',
                            type: 'federal',
                            name: 'Bundesschnitt',
                            domain: { id: 'ho', name: 'Hören' },
                            items: [itemRecord('a', 0.4)],
                        },
                    ],
                },
            })
        ).documents;

        expect(store.getDataset(EN_DATASETS.GROUP_ITEMS).map((g) => g.id)).toEqual(['group-8a']);
        expect(store.getDataset(EN_DATASETS.ITEM_COMPARISON_GROUPS).map((g) => g.id)).toEqual([
            'nw-gy',
            'bund',
        ]);
    });

    it('lists every comparison population once across competence levels, styles and items', async () => {
        // The app shows every id of this list at start, and one ⌀ toggle stands for a
        // population in every chart: a population two documents carry is one toggle, one
        // only the items carry still gets its own.
        const store = (
            await createSubjectContext('en', {
                documents: {
                    'competence-levels.json': [
                        ...EN_GROUP_DOMAIN_VALUE_GROUPS,
                        {
                            id: 'nw-gy',
                            type: 'state',
                            name: 'Landesschnitt GY',
                            domain: { id: 'ho', name: 'Hören' },
                            properties: [BOOKLET_PROPERTY],
                            competenceLevels: [],
                        },
                    ],
                    'items.json': [
                        {
                            id: 'nw-gy',
                            type: 'state',
                            name: 'Landesschnitt GY',
                            domain: { id: 'ho', name: 'Hören' },
                            items: [itemRecord('a', 0.5)],
                        },
                        {
                            id: 'bund',
                            type: 'federal',
                            name: 'Bundesschnitt',
                            domain: { id: 'ho', name: 'Hören' },
                            items: [itemRecord('a', 0.4)],
                        },
                    ],
                },
            })
        ).documents;

        expect(store.getDataset(EN_DATASETS.COMPARISON_IDS)).toEqual(['nw-gy', 'bund']);
    });

    it('rejects an aggregation comparison value group without an id as it lands', async () => {
        // The id is the comparison toggle key. A value group without one would seed
        // `undefined` into the comparison state and draw a series no toggle reaches, so
        // the store refuses the document before any card reads it. The cast hides the
        // missing id from the types: the store validates at runtime.
        const withoutId = /** @type {AggregationsValueGroup} */ (
            /** @type {unknown} */ ({
                type: 'state',
                name: 'Landesschnitt',
                domain: { id: 'ho', name: 'Hören' },
                aggregations: [],
            })
        );
        await expect(
            createSubjectContext('en', { documents: { 'aggregations.json': [withoutId] } }).then(
                (context) => context.documents,
            ),
        ).rejects.toThrow(
            /Document 'aggregations\.json'.* is malformed: value group 0 \(state\) id/,
        );
    });
});
