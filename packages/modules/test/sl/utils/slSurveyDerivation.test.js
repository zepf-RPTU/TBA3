import { describe, it, expect } from 'vitest';

import {
    buildComparisonSelfEfficacy,
    buildComparisonTeachingQuality,
    buildSelfEfficacyByGroup,
    buildSelfEfficacyIndex,
    buildSelfEfficacySchool,
    buildTeachingQualityByGroupSubject,
    buildTeachingQualityIndex,
    surveyRowKey,
    teachingQualityKey,
} from '../../../src/sl/utils/slSurveyDerivation.js';
import { filterByCategory } from '../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';
import { calculateDetailedBoxPlotStats } from '../../../src/sl/utils/slBoxPlotStats.js';
import { calculateRatingDistribution } from '../../../src/sl/utils/slRatingDistribution.js';
import { required } from '../../support/required.js';
import { studentValueGroup } from '../../support/slValueGroupFactories.js';

/**
 * The per-student survey rows behind the SL Vergleich view. Gender is optional in the
 * spec, and only the Geschlecht category splits on it; Lerngruppe and Fach never read it.
 * A student without a gender covariate therefore belongs in the rows, with `gender: null`.
 */

/**
 * A student's value group with both survey means.
 * @param {object} params
 * @param {string} params.id - The student id, also its name.
 * @param {string} params.groupName
 * @param {string} [params.subject]
 * @param {string|null} [params.gender] - The `gender` covariate; none when `null`.
 * @param {number} [params.sp] - The Selbstwirksamkeit mean.
 * @param {number} [params.tq] - The Unterrichtsqualität mean.
 * @returns {import('../../../src/common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup}
 */
function surveyStudent({ id, groupName, subject = 'Deutsch', gender = null, sp = 3, tq = 2.5 }) {
    return studentValueGroup({
        id,
        subject,
        groupName,
        gender,
        domain: { id: 'le', name: 'Lesen' },
        properties: [
            { key: 'sp_mean', value: String(sp) },
            { key: 'tq_mean', value: String(tq) },
        ],
    });
}

const STUDENTS = [
    surveyStudent({ id: 's1', groupName: '8a', gender: 'female' }),
    surveyStudent({ id: 's2', groupName: '8a', gender: 'male' }),
    surveyStudent({ id: 's3', groupName: '8b' }),
];

describe('buildComparisonSelfEfficacy', () => {
    it('keeps a student without a gender covariate, with gender null', () => {
        const rows = buildComparisonSelfEfficacy(STUDENTS);
        expect(rows).toHaveLength(3);
        expect(rows.find((row) => row.studentId === 's3')).toMatchObject({
            gender: null,
            groupName: '8b',
            subject: null,
        });
    });
});

describe('buildComparisonTeachingQuality', () => {
    it('keeps a student without a gender covariate, with gender null', () => {
        const rows = buildComparisonTeachingQuality(STUDENTS);
        expect(rows).toHaveLength(3);
        expect(rows.find((row) => row.studentId === 's3')).toMatchObject({
            gender: null,
            groupName: '8b',
            subject: 'Deutsch',
        });
    });
});

describe('a student with two values in one group', () => {
    // One value group per Domäne; a payload that disagrees with itself still counts the
    // student once, with the first value, in the aggregates and the comparison rows alike.
    const twice = [
        surveyStudent({ id: 's1', groupName: '8a', sp: 2, tq: 1.5 }),
        {
            ...surveyStudent({ id: 's1', groupName: '8a', sp: 4, tq: 3.5 }),
            domain: { id: 'rs', name: 'Rechtschreibung' },
        },
    ];

    it('keeps the first value in the group and school aggregates', () => {
        expect(buildSelfEfficacyByGroup(twice).map((row) => row.values)).toEqual([[2]]);
        expect(buildSelfEfficacySchool(twice)?.values).toEqual([2]);
        expect(buildTeachingQualityByGroupSubject(twice).map((row) => row.values)).toEqual([
            [1.5],
            [1.5],
        ]);
    });

    it('keeps the first value in the comparison rows', () => {
        expect(buildComparisonSelfEfficacy(twice).map((row) => row.mean)).toEqual([2]);
        expect(buildComparisonTeachingQuality(twice).map((row) => row.mean)).toEqual([1.5]);
    });
});

describe('filterByCategory with students lacking a gender', () => {
    it('leaves them out of both Geschlecht groups', () => {
        const rows = buildComparisonTeachingQuality(STUDENTS);
        const [group1, group2] = required(filterByCategory(rows, 'gender', 'male', 'female'));
        expect(group1.records.map((row) => row.studentId)).toEqual(['s2']);
        expect(group2.records.map((row) => row.studentId)).toEqual(['s1']);
    });

    it('counts them in the Lerngruppe comparison', () => {
        const rows = buildComparisonTeachingQuality(STUDENTS);
        const [group1, group2] = required(filterByCategory(rows, 'group', '8a', '8b'));
        expect(group1.records).toHaveLength(2);
        expect(group2.records.map((row) => row.studentId)).toEqual(['s3']);
    });
});

describe('survey rows of a group named „Schule“', () => {
    // The school's survey row is displayed as „Schule“. Keyed by that name, a group
    // with the same name would overwrite it in the index and share its band in the charts.
    const groupRow = {
        groupName: 'Schule',
        count: 1,
        values: [2],
        statistics: calculateDetailedBoxPlotStats([2]),
        distribution: calculateRatingDistribution([2]),
    };
    const schoolRow = {
        groupName: 'Schule',
        isSchool: true,
        count: 1,
        values: [3],
        statistics: calculateDetailedBoxPlotStats([3]),
        distribution: calculateRatingDistribution([3]),
    };

    it('keeps the group and the school apart in the Selbstwirksamkeit index', () => {
        const index = buildSelfEfficacyIndex([groupRow], schoolRow);

        expect(index.get('Schule')).toBe(groupRow);
        expect(index.get(null)).toBe(schoolRow);
    });

    it('keeps them apart in the Unterrichtsqualität index', () => {
        const index = buildTeachingQualityIndex([
            { ...groupRow, subjectName: 'Deutsch' },
            { ...schoolRow, subjectName: 'Deutsch' },
        ]);

        expect(index.get(teachingQualityKey('Schule', 'Deutsch'))?.isSchool).toBeUndefined();
        expect(index.get(teachingQualityKey(null, 'Deutsch'))?.isSchool).toBe(true);
    });

    it('gives them different chart row keys', () => {
        expect(surveyRowKey(groupRow)).not.toBe(surveyRowKey(schoolRow));
    });
});
