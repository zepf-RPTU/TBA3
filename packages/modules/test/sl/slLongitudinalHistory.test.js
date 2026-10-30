import { describe, it, expect } from 'vitest';

import { levelsValueGroup } from '../support/competenceLevelGroups.js';
import { studentValueGroup } from '../support/slValueGroupFactories.js';
import { SL_DATASETS } from '../../src/sl/index.js';
import { createSubjectContext } from '../support/subjectContext.js';

/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../support/competenceLevelGroups.js').CurrentLevelsValueGroup} CurrentLevelsValueGroup */
/** @typedef {import('../support/competenceLevelGroups.js').StudentLevelsValueGroup} StudentLevelsValueGroup */

/**
 * The Entwicklung view's timeline is assembled from three documents of one answer: the
 * current year's competence-levels value groups, its student value groups (both stamped with the year),
 * and the earlier years. None of them repeats another, so the timeline must
 * carry all three and each year exactly once.
 */

/**
 * @param {string} year - The `testPeriod`.
 * @returns {Array<{key: string, value: string}>} The properties stamping a value group with it.
 */
const stamp = (year) => [{ key: 'testPeriod', value: year }];

/**
 * @param {object} documents
 * @param {CurrentLevelsValueGroup[]} documents.competenceLevels - The current year's value groups.
 * @param {StudentLevelsValueGroup[]} documents.students - The current year's student value groups.
 * @param {CompetenceLevelsValueGroup[]} documents.priorYears - The earlier years.
 * @returns {Promise<import('../../src/common/data/index.js').DocumentStore>}
 */
async function storeWith({ competenceLevels, students, priorYears }) {
    const dataStore = (
        await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': competenceLevels,
                'students-competence-levels.json': students,
                'prior-years.json': priorYears,
            },
        })
    ).documents;
    return dataStore;
}

describe('the SL timeline dataset', () => {
    it('joins the current year and the earlier ones into one axis', async () => {
        const store = await storeWith({
            competenceLevels: [
                levelsValueGroup({
                    id: 'schule',
                    type: 'school',
                    properties: stamp('2026'),
                }),
            ],
            students: [
                studentValueGroup({
                    id: 's1',
                    subject: 'Deutsch',
                    groupName: '8a',
                    properties: [...stamp('2026'), { key: 'tq_mean', value: '3' }],
                }),
            ],
            priorYears: [
                levelsValueGroup({ id: 'schule', type: 'school', properties: stamp('2024') }),
                levelsValueGroup({ id: 'schule', type: 'school', properties: stamp('2025') }),
            ],
        });

        expect(store.getDataset(SL_DATASETS.LONGITUDINAL_INDEX).years).toEqual([
            '2024',
            '2025',
            '2026',
        ]);
        expect(store.getDataset(SL_DATASETS.HISTORY_SURVEY_SCALES)).toEqual({
            hasTeachingQuality: true,
            hasSelfEfficacy: false,
            offersBoxPlot: false,
        });
    });

    it('is the current year alone when the answer carries no earlier one', async () => {
        // An answer may carry no earlier year at all; the view must still draw the
        // year it has rather than nothing.
        const store = await storeWith({
            competenceLevels: [
                levelsValueGroup({
                    id: 'schule',
                    type: 'school',
                    properties: stamp('2026'),
                }),
            ],
            students: [],
            priorYears: [],
        });

        expect(store.getDataset(SL_DATASETS.LONGITUDINAL_INDEX).years).toEqual(['2026']);
    });
});
