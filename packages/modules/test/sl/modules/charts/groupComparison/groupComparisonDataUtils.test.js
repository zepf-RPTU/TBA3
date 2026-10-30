// @vitest-browser
// (rating colours register their palette tokens on <html>)
import { describe, expect, it } from 'vitest';

import {
    buildComparisonData,
    prepareRatingGroupData,
} from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';
import { prepareCompetenceGroupData } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonCompetenceData.js';
import { preparePointGroupData } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonPointData.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';

const { palette } = createTestContext('sl');

/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').RatingRecord} RatingRecord */
/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').PointRecord} PointRecord */
/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').CompetenceStudentRecord} CompetenceStudentRecord */
/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').ComparisonGroup} ComparisonGroup */

/**
 * Every chart type prepares one row model — rows, and per group its segments laid end
 * to end as shares of the group — so the pyramid draws all four through one path.
 */

/**
 * Two groups labelled A and B.
 * @template T
 * @param {T[]} group1Data - Group A's records.
 * @param {T[]} group2Data - Group B's records.
 * @returns {[import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').GroupSide<T>, import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').GroupSide<T>]}
 */
const split = (group1Data, group2Data) => [
    { records: group1Data, label: 'A' },
    { records: group2Data, label: 'B' },
];

describe('buildComparisonData', () => {
    it('gives each row and segment its share of the group', () => {
        const data = buildComparisonData(
            'Stufe',
            split([1, 2, 3, 4], [1, 2]),
            [{ key: 'r', labels: ['R'] }],
            (records) => [
                [
                    { key: 'x', count: records.length / 2, paint: {} },
                    { key: 'y', count: 1, paint: {} },
                ],
            ],
        );

        expect(data.groups.map((group) => [group.key, group.label, group.count])).toEqual([
            ['group1', 'A', 4],
            ['group2', 'B', 2],
        ]);
        const [row1] = data.groups[0].rows;
        expect(row1.share).toBe(75);
        expect(row1.segments.map((segment) => segment.share)).toEqual([50, 25]);
    });

    it('gives a group without members no row share, rather than 0 %', () => {
        // The same rule as `percentOf` — 0 % would read as a group where
        // nobody reached the row, which is a claim about students who are not there.
        const data = buildComparisonData(
            'Stufe',
            split([], [1]),
            [{ key: 'r', labels: ['R'] }],
            (records) => [[{ key: 'r', count: records.length, paint: {} }]],
        );

        expect(data.groups[0].rows[0].share).toBeNull();
        expect(data.groups[1].rows[0].share).toBe(100);
    });
});

describe('the preparers', () => {
    /**
     * A student of 8a, named after its gender.
     * @param {string} gender - Also the student id.
     * @returns {{studentId: string, gender: string, groupName: string}}
     */
    const student = (gender) => ({ studentId: gender, gender, groupName: '8a' });

    it('names rating rows with their description and paints them by band', () => {
        const data = prepareRatingGroupData(
            [
                { ...student('female'), subject: null, mean: 4.5 },
                { ...student('male'), subject: null, mean: 1.5 },
            ],
            'gender',
            'female',
            'male',
            'Selbstwirksamkeit',
        );

        expect(data.measureLabel).toBe('Selbstwirksamkeit');
        expect(data.rows[0]).toEqual({ key: 'excellent', labels: ['4-5 (sehr gut)'] });
        expect(data.groups[0].rows[0].segments[0].paint).toEqual({ ratingKey: 'excellent' });
        expect(data.groups[0].rows[0].share).toBe(100);
    });

    it('bins Lösungsquoten in ten 10-point rows, 100 % in the top one', () => {
        // Only the top bin is closed, so a full score joins 90–100 % rather than
        // opening a bin of its own, and a 90 lands there too, not in 80–90 %.
        /**
         * @param {string} gender
         * @param {number} solutionRatePercent
         * @returns {PointRecord}
         */
        const rate = (gender, solutionRatePercent) => ({
            ...student(gender),
            subject: 'Deutsch',
            domainId: null,
            domainName: null,
            rawPoints: solutionRatePercent,
            maxPoints: 100,
            solutionRatePercent,
        });
        const data = preparePointGroupData(
            [rate('female', 100), rate('female', 90), rate('female', 89.9), rate('male', 0)],
            'gender',
            'female',
            'male',
        );

        expect(data.rows.map((row) => row.key)).toEqual([
            '90-100',
            '80-90',
            '70-80',
            '60-70',
            '50-60',
            '40-50',
            '30-40',
            '20-30',
            '10-20',
            '0-10',
        ]);
        /**
         * @param {ComparisonGroup} group
         * @returns {number[]} Its students per row.
         */
        const counts = (group) => group.rows.map((row) => row.segments[0].count);
        expect(counts(data.groups[0])).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect(counts(data.groups[1])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    });

    it('draws nothing for a Lösungsquote comparison whose groups have no records', () => {
        const data = preparePointGroupData(
            [
                {
                    ...student('diverse'),
                    subject: 'Deutsch',
                    domainId: null,
                    domainName: null,
                    rawPoints: 5,
                    maxPoints: 10,
                    solutionRatePercent: 50,
                },
            ],
            'gender',
            'female',
            'male',
        );

        expect(data.rows).toEqual([]);
    });

    it('gives each Kompetenzstufe row one label when both groups name it alike', () => {
        /**
         * @param {string} gender
         * @param {string} level - The level reached.
         * @returns {CompetenceStudentRecord}
         */
        const record = (gender, level) => ({
            ...student(gender),
            competenceLevelName: level,
            competenceScaleId: undefined,
            subject: 'Deutsch',
        });
        const data = prepareCompetenceGroupData(
            palette,
            [record('female', 'II'), record('male', 'I')],
            'gender',
            'female',
            'male',
            [
                { key: 'level-0', labels: ['II'], sourceLevels: ['II'] },
                { key: 'level-1', labels: ['I'], sourceLevels: ['I'] },
            ],
        );

        expect(data.rows).toEqual([
            { key: 'level-0', labels: ['II'] },
            { key: 'level-1', labels: ['I'] },
        ]);
        // Every level keeps its segment; the renderer leaves out an empty one.
        expect(
            data.groups[0].rows.map((row) =>
                row.segments.filter((s) => s.count > 0).map((s) => s.key),
            ),
        ).toEqual([['II'], []]);
    });

    it('splits a row label per group when their ladders name it differently', () => {
        /**
         * @param {string} subject
         * @param {string} level - The level reached.
         * @returns {CompetenceStudentRecord}
         */
        const record = (subject, level) => ({
            ...student('female'),
            subject,
            competenceLevelName: level,
            competenceScaleId: undefined,
        });
        const data = prepareCompetenceGroupData(
            palette,
            [record('Deutsch', 'II'), record('Englisch', 'B1')],
            'subject',
            'Deutsch',
            'Englisch',
            [{ key: 'level-0', labels: ['II', 'B1'], sourceLevels: ['II', 'B1'] }],
        );

        expect(data.rows).toEqual([{ key: 'level-0', labels: ['II', 'B1'] }]);
    });
});
