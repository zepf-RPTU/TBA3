import { describe, it, expect } from 'vitest';

import { DocumentShapeError, DocumentStore } from '../../../src/common/data/index.js';
import {
    BOOKLET_PROPERTY,
    nameProperties,
    studentFields,
} from '../../support/competenceLevelGroups.js';
import { documentsInHand } from '../../support/documentsInHand.js';
import { itemRecord } from '../../support/groupDocumentStoreFixture.js';

/**
 * The rules the document schemas hold every document to, checked through the store that
 * applies them: what a document may leave out, what it may add, and what it must carry.
 */

/**
 * @param {keyof import('../../../src/common/data/documentSchemas.js').Documents} name
 * @param {unknown} document
 * @returns {Promise<*>} The document as it landed.
 */
const land = async (name, document) => {
    const request = { file: name, template: name, documents: [name] };
    const store = new DocumentStore(
        documentsInHand([request], { [name]: /** @type {any} */ (document) }),
    );
    await store.ensure([name]);
    return store.get(name);
};

const level = (/** @type {object} */ fields = {}) => ({
    nameShort: 'KS 1',
    descriptiveStatistics: { mean: 0.5 },
    ...fields,
});
const valueGroup = (/** @type {object} */ fields = {}) => ({
    id: 'g',
    type: 'group',
    name: '8a',
    properties: [BOOKLET_PROPERTY],
    competenceLevels: [level()],
    ...fields,
});
/**
 * Student st1 of Lerngruppe 8a, named, carrying no booklet.
 * @param {object} [fields] - Replace its own.
 * @returns {object}
 */
const student = (fields = {}) =>
    valueGroup({ id: 'st1', type: 'student', ...studentFields('8a'), ...fields });

describe('document schemas', () => {
    it('keeps fields it does not know', async () => {
        const [landed] = await land('competence-levels.json', [
            valueGroup({ futureField: { x: 1 } }),
        ]);

        expect(landed.futureField).toEqual({ x: 1 });
    });

    it('takes a comparison population that delivers its shares without headcounts', async () => {
        // A Landesschnitt's source may store no headcounts; readLevelShare reads the mean.
        await expect(
            land('competence-levels.json', [
                valueGroup({
                    type: 'state',
                    competenceLevels: [level({ descriptiveStatistics: { mean: 0.2 } })],
                }),
            ]),
        ).resolves.toBeDefined();
    });

    it('refuses two comparison populations that share a name under different ids', async () => {
        const state = (/** @type {string} */ id) =>
            valueGroup({ id, type: 'state', name: 'Landesschnitt' });

        await expect(land('competence-levels.json', [state('a'), state('b')])).rejects.toThrow(
            /share the name 'Landesschnitt' under different ids/,
        );
    });

    it('takes one comparison id repeated per Fach, and groups that share a name', async () => {
        const state = (/** @type {string} */ subject) =>
            valueGroup({
                id: 'state',
                type: 'state',
                name: 'Landesschnitt',
                subject: { name: subject },
            });
        const group = (/** @type {string} */ id) => valueGroup({ id, name: '8a' });

        await expect(
            land('competence-levels.json', [
                state('Deutsch'),
                state('Mathematik'),
                group('g1'),
                group('g2'),
            ]),
        ).resolves.toBeDefined();
    });

    it('refuses two value groups of one population in one Fach/Domäne and year', async () => {
        const school = valueGroup({
            id: 's',
            type: 'school',
            subject: { name: 'Deutsch' },
            domain: { id: 'lesen', name: 'Lesen' },
            properties: [{ key: 'testPeriod', value: '2025' }, BOOKLET_PROPERTY],
        });
        const state = valueGroup({ id: 'state', type: 'state', name: 'Landesschnitt' });

        await expect(land('competence-levels.json', [school, school])).rejects.toThrow(
            /share the key 'school\|\|s\|Deutsch\|lesen\|2025'/,
        );
        await expect(land('competence-levels.json', [state, state])).rejects.toThrow(
            /share the key 'state\|\|state\|\|\|'/,
        );
    });

    it('takes one population per year, per Domäne, per Fach and per Lerngruppe', async () => {
        const school = (/** @type {string} */ year, /** @type {string} */ domain) =>
            valueGroup({
                id: 's',
                type: 'school',
                subject: { name: 'Deutsch' },
                domain: { id: domain, name: domain },
                properties: [{ key: 'testPeriod', value: year }, BOOKLET_PROPERTY],
            });
        // Student ids repeat across Lerngruppen: 8a's st1 and 8b's st1 are two children.
        const studentOf = (/** @type {string} */ subject, /** @type {string} */ group) =>
            student({ subject: { name: subject }, ...studentFields(group) });

        await expect(
            land('competence-levels.json', [
                school('2024', 'lesen'),
                school('2025', 'lesen'),
                school('2025', 'hoeren'),
            ]),
        ).resolves.toBeDefined();
        await expect(
            land('students-competence-levels.json', [
                studentOf('Deutsch', '8a'),
                studentOf('Mathematik', '8a'),
                studentOf('Deutsch', '8b'),
            ]),
        ).resolves.toBeDefined();
    });

    it('requires a value group to say what it is', async () => {
        for (const missing of ['id', 'type', 'name']) {
            const broken = { ...valueGroup(), [missing]: '  ' };
            await expect(land('competence-levels.json', [broken]), missing).rejects.toThrow(
                DocumentShapeError,
            );
        }
    });

    it('requires every competence-levels.json value group to name its booklet', async () => {
        await expect(
            land('competence-levels.json', [valueGroup({ properties: [] })]),
        ).rejects.toThrow(/properties\[booklet\]/);
        await expect(
            land('competence-levels.json', [
                valueGroup({ properties: [{ key: 'booklet', value: '  ' }] }),
            ]),
        ).rejects.toThrow(/properties\[booklet\]/);
    });

    it('refuses a survey mean off the 1–5 rating scale, in every value group', async () => {
        // A mean of 1–5 answers cannot leave the scale; one that does would count in the
        // Anzahl and the box plot but in no rating band.
        const withMean = (/** @type {string} */ key, /** @type {string} */ value) =>
            valueGroup({ properties: [BOOKLET_PROPERTY, { key, value }] });
        for (const [key, value] of [
            ['sp_mean', '0.5'],
            ['tq_mean', '5.01'],
        ]) {
            await expect(land('competence-levels.json', [withMean(key, value)])).rejects.toThrow(
                new RegExp(`properties\\[${key}\\] on the rating scale`),
            );
        }
        // The scale's ends are on it, and a value that is no number reads as no answer.
        await expect(
            land('competence-levels.json', [
                withMean('sp_mean', '1'),
                { ...withMean('tq_mean', '5'), id: 'h', name: '8b' },
                { ...withMean('sp_mean', 'k. A.'), id: 'i', name: '8c' },
            ]),
        ).resolves.toHaveLength(3);
    });

    it('requires every student value group to carry both names and its Lerngruppe', async () => {
        /** @type {Array<[object, RegExp]>} */
        const broken = [
            [{ properties: [{ key: 'lastName', value: 'Muster' }] }, /properties\[firstName\]/],
            [{ properties: [{ key: 'firstName', value: 'Ada' }] }, /properties\[lastName\]/],
            [{ covariates: [{ type: 'gender', value: 'w' }] }, /covariates\[group\]/],
            [{ covariates: [{ type: 'group', value: ' ' }] }, /covariates\[group\]/],
        ];
        for (const [fields, message] of broken) {
            await expect(
                land('students-competence-levels.json', [student(fields)]),
            ).rejects.toThrow(message);
        }
        await expect(
            land('students-aggregations.json', [
                {
                    id: 'st1',
                    type: 'student',
                    name: 'st1',
                    properties: nameProperties('Ada'),
                    covariates: [{ type: 'gender', value: 'w' }],
                    aggregations: [],
                },
            ]),
        ).rejects.toThrow(/covariates\[group\]/);
        // The gender is the one covariate a student may go without, and a student names no booklet.
        await expect(land('students-competence-levels.json', [student()])).resolves.toHaveLength(1);
    });

    it('trims property and covariate values, so a student joins its group by name', async () => {
        const [landed] = await land('students-competence-levels.json', [
            student({ covariates: [{ type: 'group', value: ' 8a ' }] }),
        ]);

        expect(landed.covariates).toEqual([{ type: 'group', value: '8a' }]);
    });

    it('requires an items value group to name its domain', async () => {
        await expect(
            land('items.json', [{ id: 'g', type: 'group', name: '8a', items: [] }]),
        ).rejects.toThrow(/value group 0 \(group 'g'\) domain: /);
    });

    it('requires a domain to carry its id and its name, in every document', async () => {
        // The spec requires only the name, but every reader keys a Domäne by its id.
        await expect(
            land('competence-levels.json', [valueGroup({ domain: { name: 'Lesen' } })]),
        ).rejects.toThrow(/domain\.id: /);
        await expect(
            land('competence-levels.json', [valueGroup({ domain: { id: 'le' } })]),
        ).rejects.toThrow(/domain\.name: /);
        await expect(
            land('items.json', [
                { id: 'g', type: 'group', name: '8a', domain: { id: 'le' }, items: [] },
            ]),
        ).rejects.toThrow(/domain\.name: /);
    });

    it('refuses an item whose exercise has a blank name', async () => {
        const items = [itemRecord('i1', 0.5, { exercise: ' ' })];
        await expect(
            land('items.json', [
                { id: 'g', type: 'group', name: '8a', domain: { id: 'le', name: 'Lesen' }, items },
            ]),
        ).rejects.toThrow(/items\.0\.exercise\.name: /);
    });

    it('refuses a blank domain or subject name, in every document', async () => {
        const blank = { id: 'zo', name: ' ' };
        await expect(
            land('competence-levels.json', [valueGroup({ domain: blank })]),
        ).rejects.toThrow(DocumentShapeError);
        await expect(
            land('competence-levels.json', [valueGroup({ subject: { name: '' } })]),
        ).rejects.toThrow(DocumentShapeError);
        await expect(
            land('items.json', [{ id: 'g', type: 'group', name: '8a', domain: blank, items: [] }]),
        ).rejects.toThrow(DocumentShapeError);
    });

    it("refuses a domain id of 'all', which names every domain together, in every document", async () => {
        const all = { id: 'all', name: 'Alles' };
        await expect(land('competence-levels.json', [valueGroup({ domain: all })])).rejects.toThrow(
            /domain\.id: 'all' is reserved/,
        );
        await expect(
            land('items.json', [{ id: 'g', type: 'group', name: '8a', domain: all, items: [] }]),
        ).rejects.toThrow(/domain\.id: 'all' is reserved/);
    });

    it('refuses an info-box section of a type the document does not declare', async () => {
        const document = {
            meta: { locale: 'de', materialLinkLabel: 'Material', quotedLabel: 'Zitat' },
            sectionTypes: { general: { icon: 'stars', tooltip: 'Überblick' } },
            boxes: { welcome: { sections: [{ type: 'unknown', blocks: ['Text'] }] } },
        };

        await expect(land('info-boxes.json', document)).rejects.toThrow(
            /Every section type must be declared/,
        );
    });

    it('refuses an info-box repeat block of a type the box cannot roll out', async () => {
        const document = {
            meta: { locale: 'de', materialLinkLabel: 'Material', quotedLabel: 'Zitat' },
            sectionTypes: { general: { icon: 'stars', tooltip: 'Überblick' } },
            boxes: {
                welcome: {
                    sections: [{ type: 'general', blocks: [{ repeat: 'items', template: 'x' }] }],
                },
            },
        };

        await expect(land('info-boxes.json', document)).rejects.toThrow(DocumentShapeError);
    });
});
