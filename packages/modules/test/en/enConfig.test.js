import { describe, it, expect } from 'vitest';
import { buildEnConfig } from '../../src/en/enConfig.js';
import { required } from '../support/required.js';

/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../src/common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */

/** @type {CompetenceLevelsValueGroup[]} */
const competenceLevelsData = [
    {
        id: 's1',
        type: 'student',
        name: 'Schüler 1',
        subject: { name: 'Englisch' },
        domain: { id: 'ho', name: 'Hören' },
        competenceLevels: [
            { nameShort: 'A2', descriptiveStatistics: { mean: 0 } },
            { nameShort: 'B1', descriptiveStatistics: { mean: 1 } },
        ],
    },
    {
        id: 's1',
        type: 'student',
        name: 'Schüler 1',
        subject: { name: 'Englisch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [
            { nameShort: 'A2', descriptiveStatistics: { mean: 0 } },
            { nameShort: 'B1', descriptiveStatistics: { mean: 1 } },
        ],
    },
];

/** @type {AggregationsValueGroup[]} */
const styleAggregationData = [
    {
        id: 's1',
        type: 'student',
        name: 'Schüler 1',
        subject: { name: 'Englisch' },
        domain: { id: 'ho', name: 'Hören' },
        aggregations: [
            { type: 'style', value: 'global', descriptiveStatistics: { mean: 0.5 } },
            { type: 'style', value: 'detailliert', descriptiveStatistics: { mean: 0.3 } },
            // Falsch before Richtig and no Unbearbeitet: the spec fixes no order of
            // `aggregations[]`, and a value group may omit a bucket another value group carries.
            {
                type: 'result',
                value: 'Falsch',
                descriptiveStatistics: { mean: 0.2, frequency: 3 },
            },
            {
                type: 'result',
                value: 'Richtig',
                descriptiveStatistics: { mean: 0.7, frequency: 10 },
            },
        ],
    },
    {
        id: 's1',
        type: 'student',
        name: 'Schüler 1',
        subject: { name: 'Englisch' },
        domain: { id: 'le', name: 'Lesen' },
        aggregations: [
            {
                type: 'result',
                value: 'Unbearbeitet',
                descriptiveStatistics: { mean: 0.1, frequency: 1 },
            },
        ],
    },
];

/**
 * `competence-levels.json` whose two domains are scored separately with different cut scores,
 * and whose state value groups sit on other booklets.
 */
/** @type {CompetenceLevelsValueGroup[]} */
const competenceLevelsGroupData = [
    {
        id: '1002',
        type: 'group',
        name: '8a',
        domain: { id: 'ho', name: 'Hören' },
        properties: [
            { key: 'booklet', value: '26-V8-EN-TH-2' },
            {
                key: 'equivalenceTable:26-V8-EN-TH-2',
                value: 'maxScore=37;itemCount=37;A2=0-20;B1=21-37',
            },
        ],
        competenceLevels: [],
    },
    {
        id: '1002',
        type: 'group',
        name: '8a',
        domain: { id: 'le', name: 'Lesen' },
        properties: [
            { key: 'booklet', value: '26-V8-EN-TH-2' },
            {
                key: 'equivalenceTable:26-V8-EN-TH-2',
                value: 'maxScore=39;itemCount=39;A2=0-13;B1=14-39',
            },
        ],
        competenceLevels: [],
    },
    {
        id: 'nw-gy',
        type: 'state',
        name: 'Landesschnitt GY',
        domain: { id: 'ho', name: 'Hören' },
        properties: [
            { key: 'booklet', value: '26-V8-EN-TH-3' },
            {
                key: 'equivalenceTable:26-V8-EN-TH-3',
                value: 'maxScore=41;itemCount=41;A2=0-30;B1=31-41',
            },
        ],
        competenceLevels: [],
    },
];

describe('buildEnConfig', () => {
    it('derives domains and their labels', () => {
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        expect(cfg.domainIds).toEqual(['ho', 'le']);
        expect(cfg.domainLabels).toEqual(['Hören', 'Lesen']);
    });

    it('takes the Fach from the payload, empty when no value group names one', () => {
        // The welcome header names it; a payload without `subject` still loads.
        expect(buildEnConfig(competenceLevelsData, styleAggregationData, []).subjectName).toBe(
            'Englisch',
        );
        const unnamed = competenceLevelsData.map(({ subject: _subject, ...entry }) => entry);
        expect(buildEnConfig(unnamed, [], []).subjectName).toBe('');
    });

    it('derives style categories with Percent field names and capitalized labels', () => {
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        expect(cfg.styleCategories).toEqual([
            { value: 'global', fieldName: 'globalPercent', label: 'Global' },
            { value: 'detailliert', fieldName: 'detailliertPercent', label: 'Detailliert' },
        ]);
    });

    it('reads the style categories from every value group, not only the first', () => {
        // A value group with result buckets only may come first.
        const cfg = buildEnConfig(competenceLevelsData, [...styleAggregationData].reverse(), []);
        expect(cfg.styleCategories.map((c) => c.value)).toEqual(['global', 'detailliert']);
    });

    it('derives result types by value, in the fixed Richtig, Falsch, Unbearbeitet order', () => {
        // The spec fixes no order of `aggregations[]`. Assigned by position, a value group
        // listing Falsch first would give Falsch the check mark and code 1, and a first
        // value group without an Unbearbeitet bucket would drop that type for every student.
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, []);
        expect(cfg.resultTypes.map((r) => [r.value, r.numericCode])).toEqual([
            ['Richtig', 1],
            ['Falsch', 0],
            ['Unbearbeitet', -1],
        ]);
    });

    it('reads a separate equivalence table per domain', () => {
        // Hören and Lesen are scored on different item sets, so their cut scores
        // and their maxima differ (37 vs 39 points here). Collapsing them onto one
        // table draws one axis's competence bands over the other axis's scale.
        const cfg = buildEnConfig(
            competenceLevelsData,
            styleAggregationData,
            competenceLevelsGroupData,
        );

        expect(cfg.equivalenceTables.ho).toMatchObject({
            maxScore: 37,
            itemCount: 37,
            bands: [
                { nameShort: 'A2', minScore: 0, maxScore: 20 },
                { nameShort: 'B1', minScore: 21, maxScore: 37 },
            ],
        });
        expect(required(cfg.equivalenceTables.le).bands[1].minScore).toBe(14);
        expect(required(cfg.equivalenceTables.le).maxScore).toBe(39);
    });

    it('takes the group value group, not a comparison value group on another booklet', () => {
        // The Landesschnitt tracks sit on booklets the group never saw, with their own
        // cut scores. Reading a domain's first value group rather than its `group` value group
        // would draw the state's boundaries behind the group's students.
        const cfg = buildEnConfig(
            competenceLevelsData,
            styleAggregationData,
            // State value group first, so a first-match implementation picks the wrong one.
            [competenceLevelsGroupData[2], ...competenceLevelsGroupData.slice(0, 2)],
        );

        expect(required(cfg.equivalenceTables.ho).maxScore).toBe(37);
    });

    it('reports no table for a payload that ships none', () => {
        // Null is what makes the scatterplot draw no bands. A `{}` or a default
        // table here would put invented boundaries on screen.
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, []);

        expect(cfg.equivalenceTables).toEqual({ ho: null, le: null });
    });

    it('fails once, at build, unless the payload carries exactly two domains', () => {
        // Every EN card and table is laid out for a pair of domains; one message
        // when the config is built beats a throw in whichever card reads it first.
        expect(() => buildEnConfig([], [], [])).toThrow(/Expected exactly 2 domains, but found 0/);
        /** @type {CompetenceLevelsValueGroup[]} */
        const oneDomain = [
            {
                id: 's1',
                type: 'student',
                name: 'Schüler 1',
                subject: { name: 'Englisch' },
                domain: { id: 'ho', name: 'Hören' },
                competenceLevels: [],
            },
        ];
        expect(() => buildEnConfig(oneDomain, [], [])).toThrow(/found 1: ho/);
        expect(() => buildEnConfig(competenceLevelsData, styleAggregationData, [])).not.toThrow();
    });
});
