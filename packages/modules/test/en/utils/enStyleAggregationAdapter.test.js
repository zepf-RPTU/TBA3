/**
 * `aggregations.json` ships the group and its comparison populations as sibling value
 * groups, told apart by `type`. Bucketing by `id` instead (the literals 'school' and
 * 'state' of the demo fixtures) breaks on a state export, whose value groups carry their
 * own keys: they fall into the group bucket and overwrite the group's averages while the
 * state bucket stays empty, so the series labelled "8a" plots Landesschnitt numbers and
 * the Landesschnitt toggle disappears, without an error.
 */

import { describe, it, expect } from 'vitest';
import { parseStyleAggregation } from '../../../src/en/utils/enStyleAggregationAdapter.js';
import { required } from '../../support/required.js';

/**
 * One value group, as aggregations.json ships it — one per group *per domain*.
 * @param {{id: string, type: string, name: string, domain: string, result: number, global: number}} spec
 */
const valueGroup = ({ id, type, name, domain, result, global }) => ({
    id,
    type,
    name,
    domain: { id: domain, name: domain === 'ho' ? 'Hörverstehen' : 'Leseverstehen' },
    aggregations: [
        { type: 'style', value: 'global', descriptiveStatistics: { mean: global } },
        { type: 'result', value: 'Richtig', descriptiveStatistics: { mean: result } },
    ],
});

// A state export's aggregations.json — the group's own id is a number, the state's is a state code.
const STATE_EXPORT = [
    valueGroup({ id: '1001', type: 'group', name: '8a', domain: 'ho', result: 0.65, global: 0.6 }),
    valueGroup({ id: '1001', type: 'group', name: '8a', domain: 'le', result: 0.68, global: 0.61 }),
    valueGroup({
        id: 'school',
        type: 'school',
        name: 'Schulschnitt',
        domain: 'ho',
        result: 0.61,
        global: 0.55,
    }),
    valueGroup({
        id: 'school',
        type: 'school',
        name: 'Schulschnitt',
        domain: 'le',
        result: 0.63,
        global: 0.56,
    }),
    valueGroup({
        id: 'land-a',
        type: 'state',
        name: 'Landesschnitt',
        domain: 'ho',
        result: 0.55,
        global: 0.5,
    }),
    valueGroup({
        id: 'land-a',
        type: 'state',
        name: 'Landesschnitt',
        domain: 'le',
        result: 0.49,
        global: 0.51,
    }),
];

describe('parseStyleAggregation', () => {
    it('reads the Richtig aggregation, not whichever result aggregation comes first', () => {
        // The spec fixes no order of `aggregations[]`. Taking the first result entry
        // would put the group marker at the Falsch share whenever a payload listed that
        // first.
        const entry = valueGroup({
            id: '1',
            type: 'group',
            name: '8a',
            domain: 'ho',
            result: 0.7,
            global: 0.5,
        });
        entry.aggregations.unshift({
            type: 'result',
            value: 'Falsch',
            descriptiveStatistics: { mean: 0.2 },
        });

        expect(parseStyleAggregation([entry]).groupDomainAverages.ho).toBeCloseTo(70, 5);
    });

    it('buckets on type, so a state value group with its own id does not overwrite the group', () => {
        // An id test files both the group and the state value group under "group",
        // the last one wins, and the overview scatterplot draws the group marker on the
        // state's values (55 / 49) while still labelling it "8a".
        const { groupDomainAverages, comparisonGroups } = parseStyleAggregation(STATE_EXPORT);

        expect(groupDomainAverages.ho).toBeCloseTo(65, 2);
        expect(groupDomainAverages.le).toBeCloseTo(68, 2);

        const state = comparisonGroups.find((g) => g.type === 'state');
        expect(required(state).domainAverages.ho).toBeCloseTo(55, 2);
        expect(required(state).domainAverages.le).toBeCloseTo(49, 2);
    });

    it('resolves the state group name, which is what keeps the Landesschnitt toggle alive', () => {
        // The `en.comparisonIds` dataset derives the ⌀ toggles from these groups. An empty
        // state bucket leaves the Landesschnitt without a toggle in the legend.
        const { comparisonGroups } = parseStyleAggregation(STATE_EXPORT);

        expect(comparisonGroups.map((g) => ({ id: g.id, type: g.type, name: g.name }))).toEqual([
            { id: 'school', type: 'school', name: 'Schulschnitt' },
            { id: 'land-a', type: 'state', name: 'Landesschnitt' },
        ]);
    });

    it('files an unrecognised comparison type as a comparison group, never as the group', () => {
        // A comparison population the client has no shape for, such as a district
        // average, is still not the group: filing it into the group bucket would relabel
        // reference values as 8a and move the group marker. It is not rejected either:
        // `resolveAverageRole` collapses an unrecognised type onto the catch-all mark, so
        // an exporter can ship a new comparison population.
        const unknownType = [
            valueGroup({
                id: '1001',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.65,
                global: 0.6,
            }),
            valueGroup({
                id: 'district',
                type: 'district',
                name: 'Bezirksschnitt',
                domain: 'ho',
                result: 0.58,
                global: 0.5,
            }),
        ];

        const { groupDomainAverages, comparisonGroups } = parseStyleAggregation(unknownType);

        expect(groupDomainAverages.ho).toBeCloseTo(65, 2);
        expect(comparisonGroups).toHaveLength(1);
        expect(comparisonGroups[0]).toMatchObject({
            id: 'district',
            type: 'district',
            name: 'Bezirksschnitt',
        });
        expect(comparisonGroups[0].domainAverages.ho).toBeCloseTo(58, 2);
    });

    it("merges a group's domain value groups into one group rather than duplicating it", () => {
        // Every group appears once per domain. If the value groups were not merged by id the
        // caller would see two "Schulschnitt" comparisons, each holding half the domains,
        // and every chart would render a duplicate series with gaps.
        const { comparisonGroups } = parseStyleAggregation(STATE_EXPORT);

        expect(comparisonGroups).toHaveLength(2);
        const school = comparisonGroups.find((g) => g.id === 'school');
        expect(Object.keys(required(school).domainAverages).sort()).toEqual(['ho', 'le']);
        expect(Object.keys(required(school).averages).sort()).toEqual(['ho_global', 'le_global']);
    });

    it('keeps several Landesschnitte separate instead of collapsing them to one', () => {
        // A Landesschnitt split by track is several alternative comparison
        // populations, not parts of one: merging them averages across tracks and
        // last-wins picks one at random. The client renders every group it is given.
        const trackSplit = [
            valueGroup({
                id: '1002',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.52,
                global: 0.5,
            }),
            valueGroup({
                id: 'nw-gy',
                type: 'state',
                name: 'Landesschnitt GY',
                domain: 'ho',
                result: 0.58,
                global: 0.5,
            }),
            valueGroup({
                id: 'nw-hsa',
                type: 'state',
                name: 'Landesschnitt HSA',
                domain: 'ho',
                result: 0.47,
                global: 0.4,
            }),
            valueGroup({
                id: 'nw-hsa-gk',
                type: 'state',
                name: 'Landesschnitt HSA-GK',
                domain: 'ho',
                result: 0.44,
                global: 0.4,
            }),
            valueGroup({
                id: 'nw-msa',
                type: 'state',
                name: 'Landesschnitt MSA',
                domain: 'ho',
                result: 0.51,
                global: 0.5,
            }),
        ];

        const { groupDomainAverages, comparisonGroups } = parseStyleAggregation(trackSplit);

        expect(groupDomainAverages.ho).toBeCloseTo(52, 2);
        expect(comparisonGroups).toHaveLength(4);
        expect(comparisonGroups.map((g) => g.id)).toEqual([
            'nw-gy',
            'nw-hsa',
            'nw-hsa-gk',
            'nw-msa',
        ]);
        expect(comparisonGroups.map((g) => g.domainAverages.ho.toFixed(2))).toEqual([
            '58.00',
            '47.00',
            '44.00',
            '51.00',
        ]);
        // Four state markers share one shape and one base colour, so an ordinal ties
        // each legend row, marker tag and shade together. Numbering follows payload
        // order, the order the charts draw in.
        expect(comparisonGroups.map((g) => g.shortLabel)).toEqual(['L1', 'L2', 'L3', 'L4']);
        expect(comparisonGroups.map((g) => g.roleIndex)).toEqual([0, 1, 2, 3]);
    });

    it('returns empty structures for an empty payload', () => {
        expect(parseStyleAggregation([])).toEqual({
            groupAverages: {},
            groupDomainAverages: {},
            groupName: null,
            comparisonGroups: [],
        });
    });
});
