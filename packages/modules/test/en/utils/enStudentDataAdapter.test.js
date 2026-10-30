import { describe, it, expect } from 'vitest';
import { buildGroupStudentRecords } from '../../../src/en/utils/enStudentDataAdapter.js';
import { buildEnConfig } from '../../../src/en/enConfig.js';
import { nameProperties } from '../../support/competenceLevelGroups.js';

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup} StudentCompetenceLevelsValueGroup */
/** @typedef {import('../../../src/common/data/schemas/aggregations.js').StudentAggregationsValueGroup} StudentAggregationsValueGroup */

/** Ada L's Lerngruppe, the `group` covariate every one of her value groups carries. */
const GROUP = { type: 'group', value: '8a' };

/** @type {StudentCompetenceLevelsValueGroup[]} */
const competenceLevelsData = [
    {
        id: 's1',
        type: 'student',
        name: 'Ada L',
        subject: { name: 'Englisch' },
        domain: { id: 'ho', name: 'Hören' },
        competenceLevels: [{ id: '2', nameShort: 'A2', descriptiveStatistics: { mean: 1 } }],
        covariates: [GROUP, { type: 'gender', value: 'male' }],
        properties: [
            ...nameProperties('Ada', 'L'),
            { key: 'itemLevelSpan:1', value: '1-2' },
            { key: 'itemLevelSpan:2', value: '3-4' },
        ],
    },
    {
        id: 's1',
        type: 'student',
        name: 'Ada L',
        subject: { name: 'Englisch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [{ nameShort: 'B1', descriptiveStatistics: { mean: 1 } }],
        covariates: [GROUP],
        properties: nameProperties('Ada', 'L'),
    },
];

/** @type {StudentAggregationsValueGroup[]} */
const styleAggregationData = [
    {
        id: 's1',
        type: 'student',
        name: 'Ada L',
        subject: { name: 'Englisch' },
        domain: { id: 'ho', name: 'Hören' },
        properties: nameProperties('Ada', 'L'),
        covariates: [GROUP],
        aggregations: [
            { type: 'style', value: 'global', descriptiveStatistics: { mean: 0.5 } },
            // Listed before `Richtig`, and no `Unbearbeitet` bucket: the spec fixes no
            // order, and a value group may omit a bucket.
            {
                type: 'result',
                value: 'Falsch',
                descriptiveStatistics: { total: 14, mean: 0.3, frequency: 4 },
            },
            {
                type: 'result',
                value: 'Richtig',
                descriptiveStatistics: { total: 14, mean: 0.7, frequency: 10 },
            },
        ],
    },
    {
        id: 's1',
        type: 'student',
        name: 'Ada L',
        subject: { name: 'Englisch' },
        domain: { id: 'le', name: 'Lesen' },
        properties: nameProperties('Ada', 'L'),
        covariates: [GROUP],
        aggregations: [
            { type: 'style', value: 'global', descriptiveStatistics: { mean: 0.4 } },
            {
                type: 'result',
                value: 'Richtig',
                descriptiveStatistics: { mean: 0.6, frequency: 8 },
            },
        ],
    },
];

describe('buildGroupStudentRecords', () => {
    it('maps competence levels to their domain', () => {
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        const records = buildGroupStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            enConfig,
        );

        expect(records).toHaveLength(1);
        expect(records[0].domains.ho.competenceLevelName).toBe('A2');
        expect(records[0].domains.le.competenceLevelName).toBe('B1');
    });

    it("reads each domain's item-slot span off that domain's own value group", () => {
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        const [record] = buildGroupStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            enConfig,
        );

        expect(record.domains.ho.competenceLevelItemSpan).toEqual({ from: 3, to: 4 });
        // The Lesen value group ships no span: nothing to compare against.
        expect(record.domains.le.competenceLevelItemSpan).toBeNull();
    });

    it('maps style aggregations to per-domain shares and the Richtig result', () => {
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        const [record] = buildGroupStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            enConfig,
        );

        expect(record.domains.ho.styles).toEqual({ global: 50 });
        // The `Richtig` aggregation, not the first result one.
        expect(record.domains.ho.resultCounts?.correct).toBe(10);
        expect(record.domains.ho.percentage).toBe(70);
    });

    it('reads the result counts by value, leaving a missing bucket absent', () => {
        // The group and student-info bars read these counts. Read by position, the
        // `Falsch` listed first here would become the correct count, and a value group without
        // one bucket would shift the next bucket into its place.
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        const [record] = buildGroupStudentRecords(
            competenceLevelsData,
            styleAggregationData,
            enConfig,
        );

        expect(record.domains.ho.resultCounts).toEqual({ total: 14, correct: 10, incorrect: 4 });
        // No `total` on the `le` buckets: the count stays, the denominator is unknown.
        expect(record.domains.le.resultCounts).toEqual({ total: null, correct: 8 });
    });

    it('leaves the Percentage absent for a domain without a Richtig aggregation', () => {
        // The scatterplot drops a student whose Percentage is absent; a stand-in value
        // here would put them on the axis at a result the payload never reported.
        const withoutResult = styleAggregationData.map((entry) =>
            entry.domain?.id === 'le'
                ? {
                      ...entry,
                      aggregations: entry.aggregations.filter((a) => a.type !== 'result'),
                  }
                : entry,
        );
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        const [record] = buildGroupStudentRecords(competenceLevelsData, withoutResult, enConfig);

        expect(record.domains.le.percentage).toBeUndefined();
        expect(record.domains.ho.percentage).toBe(70);
    });

    it("codes one student's items by value, whichever buckets the value group carries", () => {
        // Read by position, a value group without a Falsch bucket would shift Richtig into
        // Falsch's slot, so a solved item would show the cross in the student's item list.
        // Only the item ids are under test; the statistics the schema requires are placeholders.
        const stats = { mean: 0 };
        /** @type {StudentAggregationsValueGroup[]} */
        const withItems = [
            {
                ...styleAggregationData[0],
                aggregations: [
                    {
                        type: 'result',
                        value: 'Unbearbeitet',
                        includedIqbIds: ['EL3'],
                        descriptiveStatistics: stats,
                    },
                    {
                        type: 'result',
                        value: 'Richtig',
                        includedIqbIds: ['EL1'],
                        descriptiveStatistics: stats,
                    },
                ],
            },
            {
                ...styleAggregationData[1],
                aggregations: [
                    {
                        type: 'result',
                        value: 'Falsch',
                        includedIqbIds: ['EL2'],
                        descriptiveStatistics: stats,
                    },
                ],
            },
        ];
        const enConfig = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        const [record] = buildGroupStudentRecords(competenceLevelsData, withItems, enConfig);

        expect(Object.fromEntries(record.itemResults)).toEqual({ EL1: 1, EL2: 0, EL3: -1 });
    });
});
