import { describe, expect, it } from 'vitest';

import { DataStore } from '../../../../src/common/services/dataStore.js';
import { defineEnDatasets } from '../../../../src/en/enDatasets.js';
import { buildEnConfig, getEnConfig, getEnStyleAverages } from '../../../../src/en/enConfig.js';
import {
    buildStyleCategoryPerformance,
    calculateStyleAveragesForStudents,
} from '@tba3/modules/en/utils/enStyleAggregation.js';

const styleRow = ({ domain }) => ({
    id: 'student-1',
    subject: { id: 'en' },
    domain: { id: domain, name: domain },
    aggregations: [
        { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: { mean: 0.5 } },
        { type: 'Hör-/Lesestil', value: 'detailliert', descriptiveStatistics: { mean: 0.3 } },
        { type: 'Ergebnis', value: 'Richtig', descriptiveStatistics: { mean: 0.7 } },
    ],
});

function makeDataStore() {
    const dataStore = new DataStore();
    defineEnDatasets(dataStore);
    dataStore.setRawData('en.competenceLevels', []);
    dataStore.setRawData('en.styleAggregation', [
        styleRow({ domain: 'ho' }),
        styleRow({ domain: 'le' }),
    ]);
    dataStore.setRawData('en.aggregation', []);
    dataStore.setRawData('en.competenceLevelsClass', []);
    return dataStore;
}

/**
 * What the calculation now takes instead of a store: the caller resolves both, which is
 * what lets a host outside tba3 supply them from wherever it keeps them.
 * @returns {{enConfig: object, styleAverages: object}} The resolved context.
 */
function makeContext() {
    const dataStore = makeDataStore();
    return {
        enConfig: getEnConfig(dataStore),
        styleAverages: getEnStyleAverages(dataStore),
    };
}

describe('calculateStyleAveragesForStudents', () => {
    it('preserves decimal precision for computed class averages in all-domain mode', () => {
        // WHY: comparison averages pass through from the payload as decimals. Rounding
        // only the recomputed class average shifts the point before display formatting.
        const result = calculateStyleAveragesForStudents(
            [
                {
                    ho: { globalPercent: 50.2, detailliertPercent: 20 },
                    le: { globalPercent: 60.4, detailliertPercent: 30 },
                },
                {
                    ho: { globalPercent: 50.5, detailliertPercent: 24 },
                    le: { globalPercent: 60.9, detailliertPercent: 36 },
                },
            ],
            'all',
            makeContext(),
        );

        expect(result.classAverages.ho_global).toBeCloseTo(50.35, 10);
        expect(result.classAverages.le_global).toBeCloseTo(60.65, 10);
    });

    it('preserves decimal precision for computed class averages in single-domain mode', () => {
        const result = calculateStyleAveragesForStudents(
            [
                { globalPercent: 50.2, detailliertPercent: 20 },
                { globalPercent: 50.5, detailliertPercent: 24 },
            ],
            'ho',
            makeContext(),
        );

        expect(result.classAverages.ho_global).toBeCloseTo(50.35, 10);
    });

    it('averages each category over the students who have a value, never counting a gap as 0 %', () => {
        // WHY: a student without a style value counted as 0 % and dragged the class
        // average down; worse, in all-domain mode a student without the first Hören
        // category was dropped from every other category too.
        const result = calculateStyleAveragesForStudents(
            [
                { ho: { globalPercent: 60, detailliertPercent: 20 }, le: { globalPercent: 40 } },
                { ho: { globalPercent: 80 }, le: { globalPercent: 50, detailliertPercent: 30 } },
                { le: { globalPercent: 60 } },
            ],
            'all',
            makeContext(),
        );

        expect(result.classAverages.ho_global).toBeCloseTo(70, 10);
        expect(result.classAverages.ho_detailliert).toBeCloseTo(20, 10);
        expect(result.classAverages.le_global).toBeCloseTo(50, 10);
        expect(result.classAverages.le_detailliert).toBeCloseTo(30, 10);
    });

    it('keeps a student with one missing category in the others, single-domain mode', () => {
        // WHY: one missing category used to drop the student from every category.
        const result = calculateStyleAveragesForStudents(
            [
                { globalPercent: 60, detailliertPercent: null },
                { globalPercent: 80, detailliertPercent: 40 },
            ],
            'ho',
            makeContext(),
        );

        expect(result.classAverages.ho_global).toBeCloseTo(70, 10);
        expect(result.classAverages.ho_detailliert).toBeCloseTo(40, 10);
    });

    it('reports null for a category no selected student has a value for', () => {
        // WHY: an average of nobody is unknown; drawing it at 0 % puts a class pill at
        // the axis origin the selection never scored.
        const result = calculateStyleAveragesForStudents(
            [{ globalPercent: 60 }, { globalPercent: 80 }],
            'ho',
            makeContext(),
        );

        expect(result.classAverages.ho_detailliert).toBeNull();
    });
});

describe('buildStyleCategoryPerformance', () => {
    const styleData = [styleRow({ domain: 'ho' }), styleRow({ domain: 'le' })];
    const enConfig = buildEnConfig([], styleData, null);

    it('keys every configured category, null where the student has no value', () => {
        // WHY: the spider and the lollipop look a row up per configured category. A key
        // the payload does not fill must read `null` — drawn as no mark — rather than
        // undefined, or 0 %, which drew the student at the origin.
        const onlyGlobal = [
            {
                id: 'student-1',
                domain: { id: 'ho' },
                aggregations: [
                    {
                        type: 'Hör-/Lesestil',
                        value: 'global',
                        descriptiveStatistics: { mean: 0.5 },
                    },
                ],
            },
        ];

        const result = buildStyleCategoryPerformance(onlyGlobal, 'student-1', enConfig);

        expect(result).toEqual({
            ho_global: 50,
            ho_detailliert: null,
            le_global: null,
            le_detailliert: null,
        });
    });

    it('converts the aggregation mean to a percentage', () => {
        const result = buildStyleCategoryPerformance(styleData, 'student-1', enConfig);

        expect(result.ho_global).toBeCloseTo(50, 10);
        expect(result.ho_detailliert).toBeCloseTo(30, 10);
    });

    it('ignores result aggregations so solved-item rates never land on a style axis', () => {
        // WHY: every style row also carries 'Ergebnis' aggregations. Reading those
        // would paint an unrelated solve rate onto a Hör-/Lesestil axis.
        const withMatchingValue = [
            {
                id: 'student-1',
                domain: { id: 'ho' },
                aggregations: [
                    { type: 'Ergebnis', value: 'global', descriptiveStatistics: { mean: 0.9 } },
                ],
            },
        ];

        const result = buildStyleCategoryPerformance(withMatchingValue, 'student-1', enConfig);

        expect(result.ho_global).toBeNull();
    });

    it('drops a style category the config does not know', () => {
        // WHY: the key set is the config's, not the payload's — an unrecognised
        // category must not add an axis the chart has no geometry for.
        const withExtra = [
            {
                id: 'student-1',
                domain: { id: 'ho' },
                aggregations: [
                    {
                        type: 'Hör-/Lesestil',
                        value: 'selektiv',
                        descriptiveStatistics: { mean: 0.8 },
                    },
                ],
            },
        ];

        const result = buildStyleCategoryPerformance(withExtra, 'student-1', enConfig);

        expect(result).not.toHaveProperty('ho_selektiv');
    });

    it('returns the all-null map without a student id', () => {
        // WHY: the class view holds no selected student, and its charts still read
        // this shape — a null id must yield no values rather than another student's data.
        const result = buildStyleCategoryPerformance(styleData, null, enConfig);

        expect(Object.values(result)).toEqual([null, null, null, null]);
    });

    it('reads only the requested student', () => {
        const others = [
            { ...styleRow({ domain: 'ho' }), id: 'student-2' },
            styleRow({ domain: 'ho' }),
        ];

        const result = buildStyleCategoryPerformance(others, 'student-2', enConfig);

        expect(result.ho_global).toBeCloseTo(50, 10);
        expect(result.le_global).toBeNull();
    });
});
