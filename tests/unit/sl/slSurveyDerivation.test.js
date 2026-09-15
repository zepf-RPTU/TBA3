import { describe, it, expect } from 'vitest';

import {
    buildComparisonSelfEfficacy,
    buildComparisonTeachingQuality,
} from '../../../src/sl/slSurveyDerivation.js';
import { filterByCategory } from '@tba3/modules/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';

/**
 * The per-student survey rows behind the SL Vergleich view. Gender is optional in the
 * spec, and only the Geschlecht category splits on it; Klasse and Fach never read it.
 * A student without a gender covariate therefore belongs in the rows, with `gender: null`.
 */

function studentRow({ id, className, subject = 'Deutsch', gender = null, sp = 3, tq = 2.5 }) {
    const covariates = [{ type: 'group', value: className }];
    if (gender !== null) covariates.push({ type: 'gender', value: gender });
    return {
        id,
        type: 'student',
        subject: { name: subject },
        domain: { id: 'le', name: 'Lesen' },
        covariates,
        properties: [
            { key: 'sp_mean', value: String(sp) },
            { key: 'tq_mean', value: String(tq) },
        ],
    };
}

const ROWS = [
    studentRow({ id: 's1', className: '8a', gender: 'female' }),
    studentRow({ id: 's2', className: '8a', gender: 'male' }),
    studentRow({ id: 's3', className: '8b' }),
];

describe('buildComparisonSelfEfficacy', () => {
    it('keeps a student without a gender covariate, with gender null', () => {
        const rows = buildComparisonSelfEfficacy(ROWS);
        expect(rows).toHaveLength(3);
        expect(rows.find((row) => row.studentId === 's3')).toMatchObject({
            gender: null,
            class: '8b',
            subject: null,
        });
    });
});

describe('buildComparisonTeachingQuality', () => {
    it('keeps a student without a gender covariate, with gender null', () => {
        const rows = buildComparisonTeachingQuality(ROWS);
        expect(rows).toHaveLength(3);
        expect(rows.find((row) => row.studentId === 's3')).toMatchObject({
            gender: null,
            class: '8b',
            subject: 'Deutsch',
        });
    });
});

describe('filterByCategory with students lacking a gender', () => {
    it('leaves them out of both Geschlecht groups', () => {
        const rows = buildComparisonTeachingQuality(ROWS);
        const { group1Data, group2Data } = filterByCategory(
            rows,
            'gender',
            'male',
            'female',
            'rating',
        );
        expect(group1Data.map((row) => row.studentId)).toEqual(['s2']);
        expect(group2Data.map((row) => row.studentId)).toEqual(['s1']);
    });

    it('counts them in the Klasse comparison', () => {
        const rows = buildComparisonTeachingQuality(ROWS);
        const { group1Data, group2Data } = filterByCategory(rows, 'class', '8a', '8b', 'rating');
        expect(group1Data).toHaveLength(2);
        expect(group2Data.map((row) => row.studentId)).toEqual(['s3']);
    });
});
