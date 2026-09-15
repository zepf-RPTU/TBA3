/**
 * EN student data adapter — pure transform.
 *
 * buildClassStudentRecords merges competence-level and style-aggregation JSON
 * into flat per-student records, reading domain/field config from an injected
 * EnConfig (never module globals). These tests lock that mapping and its
 * statelessness.
 */

import { describe, it, expect } from 'vitest';
import { buildClassStudentRecords } from '../../../../src/en/utils/enStudentDataAdapter.js';
import { buildEnConfig } from '../../../../src/en/enConfig.js';

const competenceLevelsData = [
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'ho', name: 'Hörverstehen' },
        competenceLevels: [{ nameShort: 'A2' }],
        covariates: [{ type: 'gender', value: 'male' }],
        properties: [
            { key: 'firstName', value: 'Ada' },
            { key: 'lastName', value: 'L' },
        ],
    },
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'le', name: 'Leseverstehen' },
        competenceLevels: [{ nameShort: 'B1' }],
        covariates: [],
        properties: [],
    },
];

const styleAggregationData = [
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'ho' },
        aggregations: [
            { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: { mean: 0.5 } },
            // Listed before `Richtig` on purpose, and no `Unbearbeitet` bucket: the spec
            // fixes no order, and a row may omit a bucket.
            {
                type: 'Ergebnis',
                value: 'Falsch',
                descriptiveStatistics: { total: 14, mean: 0.3, frequency: 4 },
            },
            {
                type: 'Ergebnis',
                value: 'Richtig',
                descriptiveStatistics: { total: 14, mean: 0.7, frequency: 10 },
            },
        ],
    },
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'le' },
        aggregations: [
            { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: { mean: 0.4 } },
            {
                type: 'Ergebnis',
                value: 'Richtig',
                descriptiveStatistics: { mean: 0.6, frequency: 8 },
            },
        ],
    },
];

describe('buildClassStudentRecords', () => {
    it('maps competence levels to domain-keyed CompLevel fields via the injected config', () => {
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, null);
        const records = buildClassStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            enConfig,
        );

        expect(records).toHaveLength(1);
        // dataKey for domain 'ho' is 'en-ho' → field 'en-hoCompLevel'
        expect(records[0]['en-hoCompLevel']).toBe('A2');
        expect(records[0]['en-leCompLevel']).toBe('B1');
    });

    it('maps style aggregations to per-domain percent sub-objects and primary result counts', () => {
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, null);
        const [record] = buildClassStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            enConfig,
        );

        // Style percentages nested under the domain id (mean 0.5 → 50%)
        expect(record.ho.globalPercent).toBe(50);
        // The `Richtig` aggregation, not the first Ergebnis one → SummedResult + Percentage
        expect(record['en-hoSummedResult']).toBe(10);
        expect(record['en-hoPercentage']).toBe('70.0%');
    });

    it('reads the Ergebnis counts by value, leaving a missing bucket absent', () => {
        // WHY: the class and student-info bars read these counts. Read by position, the
        // `Falsch` listed first here became the correct count, and a row without one
        // bucket shifted the next bucket into its place.
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, null);
        const [record] = buildClassStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            enConfig,
        );

        expect(record.hoResultCounts).toEqual({ total: 14, correct: 10, incorrect: 4 });
        // No `total` on the `le` buckets: the count stays, the denominator is unknown.
        expect(record.leResultCounts).toEqual({ total: null, correct: 8 });
    });

    it('leaves a style category without a mean absent rather than 0 %', () => {
        // WHY: a style value the payload does not carry read as 0 % and was drawn and
        // averaged as a real score.
        const withoutMean = styleAggregationData.map((entry) =>
            entry.domain.id === 'le'
                ? {
                      ...entry,
                      aggregations: [
                          { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: {} },
                      ],
                  }
                : entry,
        );
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, null);
        const [record] = buildClassStudentRecords(competenceLevelsData, withoutMean, enConfig);

        expect(record.le).toEqual({});
        expect(record.ho.globalPercent).toBe(50);
    });

    it('leaves the Percentage absent for a domain without a Richtig aggregation', () => {
        // WHY: the scatterplot drops a student whose Percentage is absent; a stand-in value
        // here would put them on the axis at a result the payload never reported.
        const withoutResult = styleAggregationData.map((entry) =>
            entry.domain.id === 'le'
                ? {
                      ...entry,
                      aggregations: entry.aggregations.filter((a) => a.type !== 'Ergebnis'),
                  }
                : entry,
        );
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, null);
        const [record] = buildClassStudentRecords(competenceLevelsData, withoutResult, enConfig);

        expect(record['en-lePercentage']).toBeUndefined();
        expect(record['en-hoPercentage']).toBe('70.0%');
    });

    it('is stateless — the transform reads only the injected config, not shared globals', () => {
        // Two independent runs over the same data (each with a freshly built
        // config) must produce identical records; nothing leaks between calls.
        const first = buildClassStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            buildEnConfig(competenceLevelsData, styleAggregationData, null),
        );
        const second = buildClassStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            buildEnConfig(competenceLevelsData, styleAggregationData, null),
        );
        expect(first).toEqual(second);
    });
});
