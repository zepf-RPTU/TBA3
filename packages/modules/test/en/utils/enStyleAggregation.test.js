import { describe, expect, it } from 'vitest';

import { EN_DATASETS } from '../../../src/en/index.js';
import { buildEnConfig } from '../../../src/en/enConfig.js';
import { buildGroupStudentRecords } from '../../../src/en/utils/enStudentDataAdapter.js';
import {
    buildStyleCategoryPerformance,
    calculateStyleAveragesForStudents,
} from '../../../src/en/utils/enStyleAggregation.js';
import { studentFields } from '../../support/competenceLevelGroups.js';
import { required } from '../../support/required.js';
import { createSubjectContext } from '../../support/subjectContext.js';

/** @typedef {import('../../../src/common/data/schemas/aggregations.js').StudentAggregationsValueGroup} StudentAggregationsValueGroup */
/** @typedef {import('../../../src/en/utils/enStudentDataAdapter.js').EnStudentRecord} EnStudentRecord */

/**
 * One student's students-aggregations.json value group: two style shares and the Richtig mean.
 * @param {{domain: string}} params
 * @returns {StudentAggregationsValueGroup}
 */
const styleValueGroup = ({ domain }) => ({
    id: 'student-1',
    type: 'student',
    name: 'Schüler 1',
    subject: { name: 'Englisch' },
    domain: { id: domain, name: domain },
    ...studentFields('Lerngruppe', 'Schüler'),
    aggregations: [
        { type: 'style', value: 'global', descriptiveStatistics: { mean: 0.5 } },
        { type: 'style', value: 'detailliert', descriptiveStatistics: { mean: 0.3 } },
        { type: 'result', value: 'Richtig', descriptiveStatistics: { mean: 0.7 } },
    ],
});

/** @returns {Promise<import('../../../src/common/data/documentStore.js').DocumentStore>} */
async function makeDataStore() {
    return createSubjectContext('en', {
        documents: {
            'students-aggregations.json': [
                styleValueGroup({ domain: 'ho' }),
                styleValueGroup({ domain: 'le' }),
            ],
        },
    }).then((context) => context.documents);
}

/**
 * The config the calculation takes instead of a store, resolved by the caller.
 * @returns {Promise<import('../../../src/en/enConfig.js').EnConfig>}
 */
async function makeConfig() {
    return (await makeDataStore()).getDataset(EN_DATASETS.CONFIG);
}

/**
 * A student record carrying only style shares. A null share stands for a payload gap the
 * record type rules out, which the calculation must still skip, hence the one cast.
 * @param {{[domainId: string]: {[style: string]: number|null}}} stylesByDomain
 * @returns {Pick<EnStudentRecord, 'domains'>}
 */
const rec = (stylesByDomain) => ({
    domains: Object.fromEntries(
        Object.entries(stylesByDomain).map(([id, styles]) => [
            id,
            { styles: /** @type {{[style: string]: number}} */ (styles) },
        ]),
    ),
});

/**
 * One record per student.
 * @param {...{[domainId: string]: {[style: string]: number|null}}} students
 * @returns {Array<Pick<EnStudentRecord, 'domains'>>}
 */
const recs = (...students) => students.map(rec);

describe('calculateStyleAveragesForStudents', () => {
    it('preserves decimal precision for computed group averages', async () => {
        // Comparison averages pass through from the payload as decimals. Rounding
        // only the recomputed group average shifts the point before display formatting.
        const result = calculateStyleAveragesForStudents(
            recs(
                {
                    ho: { global: 50.2, detailliert: 20 },
                    le: { global: 60.4, detailliert: 30 },
                },
                {
                    ho: { global: 50.5, detailliert: 24 },
                    le: { global: 60.9, detailliert: 36 },
                },
            ),
            await makeConfig(),
        );

        expect(required(result).groupAverages.ho_global).toBeCloseTo(50.35, 10);
        expect(required(result).groupAverages.le_global).toBeCloseTo(60.65, 10);
    });

    it('averages each category over the students who have a value, never counting a gap as 0 %', async () => {
        // A student without a style value counted as 0 % drags the group average
        // down; and a student without the first Hören category must still count in
        // every other category.
        const result = calculateStyleAveragesForStudents(
            recs(
                { ho: { global: 60, detailliert: 20 }, le: { global: 40 } },
                { ho: { global: 80 }, le: { global: 50, detailliert: 30 } },
                { le: { global: 60 } },
            ),
            await makeConfig(),
        );

        expect(required(result).groupAverages.ho_global).toBeCloseTo(70, 10);
        expect(required(result).groupAverages.ho_detailliert).toBeCloseTo(20, 10);
        expect(required(result).groupAverages.le_global).toBeCloseTo(50, 10);
        expect(required(result).groupAverages.le_detailliert).toBeCloseTo(30, 10);
    });

    it('answers null for a selection with no style value at all', async () => {
        // The card then shows its empty state; falling back to the whole group's
        // values would show numbers that do not belong to the filtered students.
        const result = calculateStyleAveragesForStudents(
            recs({ ho: { global: null } }, { le: {} }),
            await makeConfig(),
        );

        expect(result).toBeNull();
    });

    it('reports null for a category no selected student has a value for', async () => {
        // An average of nobody is unknown; drawing it at 0 % puts a group pill at
        // the axis origin the selection never scored.
        const result = calculateStyleAveragesForStudents(
            recs({ ho: { global: 60 } }, { ho: { global: 80 } }),
            await makeConfig(),
        );

        expect(required(result).groupAverages.ho_detailliert).toBeNull();
    });

    it('computes both domains, so the result holds whichever one the chart draws', async () => {
        // The group card switches domain without a new sync; averages for the
        // shown domain only would leave the other on the unfiltered group values.
        const result = calculateStyleAveragesForStudents(
            recs({ ho: { global: 60 }, le: { global: 40 } }),
            await makeConfig(),
        );

        expect(required(result).groupAverages.ho_global).toBe(60);
        expect(required(result).groupAverages.le_global).toBe(40);
    });
});

describe('buildStyleCategoryPerformance', () => {
    const styleData = [styleValueGroup({ domain: 'ho' }), styleValueGroup({ domain: 'le' })];
    const enConfig = buildEnConfig([], styleData, []);
    /**
     * @param {StudentAggregationsValueGroup[]} valueGroups - students-aggregations value groups.
     * @returns {EnStudentRecord[]} The student records the charts hand over.
     */
    const records = (valueGroups) => buildGroupStudentRecords([], valueGroups, enConfig);
    /**
     * @param {StudentAggregationsValueGroup[]} valueGroups - students-aggregations value groups.
     * @param {string} studentId
     * @returns {EnStudentRecord|undefined}
     */
    const recordOf = (valueGroups, studentId) =>
        records(valueGroups).find((record) => record.studentId === studentId);

    it('keys every configured category, null where the student has no value', () => {
        // The spider and the lollipop look a row up per configured category. A key
        // the payload does not fill must read `null` — drawn as no mark — rather than
        // undefined, or 0 %, which would draw the student at the origin.
        /** @type {StudentAggregationsValueGroup[]} */
        const onlyGlobal = [
            {
                id: 'student-1',
                type: 'student',
                name: 'Schüler 1',
                domain: { id: 'ho', name: 'Hören' },
                ...studentFields('Lerngruppe', 'Schüler'),
                aggregations: [
                    {
                        type: 'style',
                        value: 'global',
                        descriptiveStatistics: { mean: 0.5 },
                    },
                ],
            },
        ];

        const result = buildStyleCategoryPerformance(recordOf(onlyGlobal, 'student-1'), enConfig);

        expect(result).toEqual({
            ho_global: 50,
            ho_detailliert: null,
            le_global: null,
            le_detailliert: null,
        });
    });

    it('ignores result aggregations so solved-item rates never land on a style axis', () => {
        // Every style value group also carries 'result' aggregations. Reading those
        // would paint an unrelated solve rate onto a Hör-/Lesestil axis.
        /** @type {StudentAggregationsValueGroup[]} */
        const withMatchingValue = [
            {
                id: 'student-1',
                type: 'student',
                name: 'Schüler 1',
                domain: { id: 'ho', name: 'Hören' },
                ...studentFields('Lerngruppe', 'Schüler'),
                aggregations: [
                    { type: 'result', value: 'global', descriptiveStatistics: { mean: 0.9 } },
                ],
            },
        ];

        const result = buildStyleCategoryPerformance(
            recordOf(withMatchingValue, 'student-1'),
            enConfig,
        );

        expect(result.ho_global).toBeNull();
    });

    it('drops a style category the config does not know', () => {
        // The key set is the config's, not the payload's — an unrecognised
        // category must not add an axis the chart has no geometry for.
        /** @type {StudentAggregationsValueGroup[]} */
        const withExtra = [
            {
                id: 'student-1',
                type: 'student',
                name: 'Schüler 1',
                domain: { id: 'ho', name: 'Hören' },
                ...studentFields('Lerngruppe', 'Schüler'),
                aggregations: [
                    {
                        type: 'style',
                        value: 'selektiv',
                        descriptiveStatistics: { mean: 0.8 },
                    },
                ],
            },
        ];

        const result = buildStyleCategoryPerformance(recordOf(withExtra, 'student-1'), enConfig);

        expect(result).not.toHaveProperty('ho_selektiv');
    });

    it('returns the all-null map without a student', () => {
        // The group view holds no selected student, and its charts still read
        // this shape — no student must yield no values rather than another student's data.
        const result = buildStyleCategoryPerformance(null, enConfig);

        expect(Object.values(result)).toEqual([null, null, null, null]);
    });
});
