/**
 * enConfig tests — lock in that the injected EnConfig produces the same values
 * the old module-global registries did for the same input data, and that the
 * domain guards still fire.
 */

import { describe, it, expect } from 'vitest';
import { buildEnConfig } from '../../../src/en/enConfig.js';

const competenceLevelsData = [
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'ho', name: 'Hörverstehen' },
        competenceLevels: [{ nameShort: 'A2' }, { nameShort: 'B1' }],
    },
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'le', name: 'Leseverstehen' },
        competenceLevels: [{ nameShort: 'A2' }, { nameShort: 'B1' }],
    },
];

const styleAggregationData = [
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'ho' },
        aggregations: [
            { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: { mean: 0.5 } },
            { type: 'Hör-/Lesestil', value: 'detailliert', descriptiveStatistics: { mean: 0.3 } },
            // Falsch before Richtig and no Unbearbeitet: the spec fixes no order of
            // `aggregations[]`, and a row may omit a bucket another row carries.
            {
                type: 'Ergebnis',
                value: 'Falsch',
                descriptiveStatistics: { mean: 0.2, frequency: 3 },
            },
            {
                type: 'Ergebnis',
                value: 'Richtig',
                descriptiveStatistics: { mean: 0.7, frequency: 10 },
            },
        ],
    },
    {
        id: 's1',
        subject: { id: 'en' },
        domain: { id: 'le' },
        aggregations: [
            {
                type: 'Ergebnis',
                value: 'Unbearbeitet',
                descriptiveStatistics: { mean: 0.1, frequency: 1 },
            },
        ],
    },
];

const parsedAggregate = {
    className: 'Klasse 8a',
    comparisonGroups: [
        { id: 'school', type: 'school', name: 'Schulschnitt', averages: {}, domainAverages: {} },
        { id: 'hb', type: 'state', name: 'Landesschnitt', averages: {}, domainAverages: {} },
    ],
};

/**
 * `competence-levels.json` shaped like an NRW-style class export: the two domains are scored
 * separately and their cut scores genuinely differ, and the state rows sit on other
 * booklets entirely.
 */
const competenceLevelsClassData = [
    {
        id: '1002',
        type: 'group',
        name: '8a',
        domain: { id: 'ho' },
        properties: [
            { key: 'booklet', value: '26-V8-EN-TH-2' },
            {
                key: 'equivalenceTable:26-V8-EN-TH-2',
                value: 'maxScore=37;itemCount=37;studentCount=24;A2=0-20;B1=21-37',
            },
        ],
    },
    {
        id: '1002',
        type: 'group',
        name: '8a',
        domain: { id: 'le' },
        properties: [
            { key: 'booklet', value: '26-V8-EN-TH-2' },
            {
                key: 'equivalenceTable:26-V8-EN-TH-2',
                value: 'maxScore=39;itemCount=39;studentCount=24;A2=0-13;B1=14-39',
            },
        ],
    },
    {
        id: 'nw-gy',
        type: 'state',
        name: 'Landesschnitt GY',
        domain: { id: 'ho' },
        properties: [
            { key: 'booklet', value: '26-V8-EN-TH-3' },
            {
                key: 'equivalenceTable:26-V8-EN-TH-3',
                value: 'maxScore=41;itemCount=41;A2=0-30;B1=31-41',
            },
        ],
    },
];

describe('buildEnConfig', () => {
    it('derives domains with data-key field mapping and labels', () => {
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, parsedAggregate);
        expect(cfg.domainIds).toEqual(['ho', 'le']);
        expect(cfg.fieldName('ho', 'CompLevel')).toBe('en-hoCompLevel');
        expect(cfg.fieldName('le', 'Percentage')).toBe('en-lePercentage');
        expect(cfg.fieldName('xx', 'CompLevel')).toBeNull();
        expect(cfg.domainFieldPrefix('ho')).toBe('ho');
        expect(cfg.domainLabel('ho')).toBe('Hörverstehen');
        expect(cfg.domainLabels).toEqual(['Hörverstehen', 'Leseverstehen']);
    });

    it('derives style categories with Percent field names and capitalized labels', () => {
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, parsedAggregate);
        expect(cfg.styleCategories).toEqual([
            { value: 'global', fieldName: 'globalPercent', label: 'Global' },
            { value: 'detailliert', fieldName: 'detailliertPercent', label: 'Detailliert' },
        ]);
    });

    it('derives result types by value, in the fixed Richtig, Falsch, Unbearbeitet order', () => {
        // WHY: the spec fixes no order of `aggregations[]`. Assigned by position, a row
        // listing Falsch first gave Falsch the check mark and code 1, and a first row
        // without an Unbearbeitet bucket dropped that type for every student.
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, parsedAggregate);
        expect(cfg.resultTypes.map((r) => [r.value, r.numericCode, r.icon])).toEqual([
            ['Richtig', 1, 'check_circle'],
            ['Falsch', 0, 'cancel'],
            ['Unbearbeitet', -1, 'block'],
        ]);
        expect(cfg.correctResultType.value).toBe('Richtig');
    });

    it('keys comparison groups by the value group’s own id, glossary key by type', () => {
        // WHY: the toggle id must be the group's own key so several Landesschnitte get
        // one toggle each. The glossary key cannot follow the label for the same reason
        // — packages/modules/src/common/glossary/glossary.json defines only klassen-/schul-/landesschnitt, while a
        // track-split state labels its rows "Landesschnitt GY", "Landesschnitt MSA", …
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, parsedAggregate);
        // `shortLabel` stays null on both: each type delivers exactly one group here,
        // so nothing needs an ordinal and the markers render as they always did.
        expect(cfg.comparisonGroups).toEqual([
            {
                id: 'school',
                type: 'school',
                name: 'Schulschnitt',
                shortLabel: null,
                typeIndex: 0,
                glossaryKey: 'schulschnitt',
            },
            {
                id: 'hb',
                type: 'state',
                name: 'Landesschnitt',
                shortLabel: null,
                typeIndex: 0,
                glossaryKey: 'landesschnitt',
            },
        ]);
        expect(cfg.comparisonModeIds).toEqual(['school', 'hb']);
    });

    it('yields one comparison group per delivered state row', () => {
        // WHY: nw ships four Landesschnitte, one per Abschlusstrack. Which one a class
        // should be compared against is the exporter's decision; the app renders every
        // group it is given rather than silently picking one.
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, {
            className: 'Klasse 8a',
            comparisonGroups: [
                {
                    id: 'school',
                    type: 'school',
                    name: 'Schulschnitt',
                    shortLabel: null,
                    typeIndex: 0,
                    averages: {},
                    domainAverages: {},
                },
                {
                    id: 'nw-gy',
                    type: 'state',
                    name: 'Landesschnitt GY',
                    shortLabel: 'L1',
                    typeIndex: 0,
                    averages: {},
                    domainAverages: {},
                },
                {
                    id: 'nw-msa',
                    type: 'state',
                    name: 'Landesschnitt MSA',
                    shortLabel: 'L2',
                    typeIndex: 1,
                    averages: {},
                    domainAverages: {},
                },
            ],
        });
        expect(cfg.comparisonModeIds).toEqual(['school', 'nw-gy', 'nw-msa']);
        expect(cfg.comparisonGroups.map((g) => g.glossaryKey)).toEqual([
            'schulschnitt',
            'landesschnitt',
            'landesschnitt',
        ]);
        // The ordinals are derived once, in parseStyleAggregation, and only carried
        // here — otherwise the four EN chart families could drift onto two orderings.
        expect(cfg.comparisonGroups.map((g) => g.shortLabel)).toEqual([null, 'L1', 'L2']);
        expect(cfg.comparisonGroups.map((g) => g.typeIndex)).toEqual([0, 0, 1]);
    });

    it('reads a separate equivalence table per domain', () => {
        // WHY: Hören and Lesen are scored on different item sets, so their cut scores
        // and their maxima differ (37 vs 39 points here). Collapsing them onto one
        // table draws one axis's competence bands over the other axis's scale.
        const cfg = buildEnConfig(
            competenceLevelsData,
            styleAggregationData,
            parsedAggregate,
            competenceLevelsClassData,
        );

        expect(cfg.equivalenceTables.ho).toMatchObject({
            maxScore: 37,
            itemCount: 37,
            bands: [
                { nameShort: 'A2', minScore: 0, maxScore: 20 },
                { nameShort: 'B1', minScore: 21, maxScore: 37 },
            ],
        });
        expect(cfg.equivalenceTables.le.bands[1].minScore).toBe(14);
        expect(cfg.equivalenceTables.le.maxScore).toBe(39);
    });

    it('takes the class row, not a comparison row on another booklet', () => {
        // WHY: nw's Landesschnitt tracks sit on booklets the class never saw, with their
        // own cut scores. Reading the first row of a domain rather than the `group` row
        // would draw the state's boundaries behind the class's students.
        const cfg = buildEnConfig(
            competenceLevelsData,
            styleAggregationData,
            parsedAggregate,
            // State row first, so a first-match implementation picks the wrong one.
            [competenceLevelsClassData[2], ...competenceLevelsClassData.slice(0, 2)],
        );

        expect(cfg.equivalenceTables.ho.maxScore).toBe(37);
    });

    it('reports no table for a payload that ships none', () => {
        // WHY: null is what makes the scatterplot draw no bands. A `{}` or a default
        // table here would put invented boundaries on screen.
        const cfg = buildEnConfig(competenceLevelsData, styleAggregationData, parsedAggregate);

        expect(cfg.equivalenceTables).toEqual({ ho: null, le: null });
    });

    it('throws for an empty domain registry and enforces the dual-domain guard', () => {
        const empty = buildEnConfig([], [], null);
        expect(() => empty.domainIds).toThrow(/No domains registered/);
        expect(() => empty.assertExactlyTwoDomains()).toThrow(/No domains registered/);

        const oneDomain = buildEnConfig(
            [
                {
                    subject: { id: 'en' },
                    domain: { id: 'ho', name: 'Hörverstehen' },
                    competenceLevels: [],
                },
            ],
            [],
            null,
        );
        expect(() => oneDomain.assertExactlyTwoDomains()).toThrow(/Expected exactly 2 domains/);

        const twoDomains = buildEnConfig(
            competenceLevelsData,
            styleAggregationData,
            parsedAggregate,
        );
        expect(() => twoDomains.assertExactlyTwoDomains()).not.toThrow();
    });
});
