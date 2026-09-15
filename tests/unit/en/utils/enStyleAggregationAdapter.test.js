/**
 * Value-group bucketing in the EN style-aggregation adapter.
 *
 * `aggregation.json` ships the class and its comparison populations as sibling rows,
 * told apart by `type`. The adapter used to tell them apart by `id`, testing for the
 * literal strings 'school' and 'state' — which only the demo fixtures use. A state
 * export carries its own key (a state code such as `nw-gy`), so those rows fell through into the
 * class bucket and *overwrote* the class's own averages, key by key, while the state
 * bucket came back empty. Nothing failed loudly: the series kept the label "8a" and
 * plotted Landesschnitt numbers, and the vanished state group silently removed the
 * Landesschnitt toggle.
 *
 * These cases pin the two halves of the contract that prevents that: `type` decides the
 * bucket, and several state rows stay several rather than collapsing into one.
 */

import { describe, it, expect } from 'vitest';
import { parseStyleAggregation } from '@tba3/modules/en/utils/enStyleAggregationAdapter.js';

/**
 * One value-group row, as aggregation.json ships it — one row per group *per domain*.
 * @param {{id: string, type: string, name: string, domain: string, result: number, global: number}} spec
 */
const row = ({ id, type, name, domain, result, global }) => ({
    id,
    type,
    name,
    domain: { id: domain, name: domain === 'ho' ? 'Hörverstehen' : 'Leseverstehen' },
    aggregations: [
        { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: { mean: global } },
        { type: 'Ergebnis', value: 'Richtig', descriptiveStatistics: { mean: result } },
    ],
});

// A state export's aggregation.json — the class's own id is a number, the state's is a state code.
const STATE_EXPORT = [
    row({ id: '1001', type: 'group', name: '8a', domain: 'ho', result: 0.65, global: 0.6 }),
    row({ id: '1001', type: 'group', name: '8a', domain: 'le', result: 0.68, global: 0.61 }),
    row({
        id: 'school',
        type: 'school',
        name: 'Schulschnitt',
        domain: 'ho',
        result: 0.61,
        global: 0.55,
    }),
    row({
        id: 'school',
        type: 'school',
        name: 'Schulschnitt',
        domain: 'le',
        result: 0.63,
        global: 0.56,
    }),
    row({
        id: 'land-a',
        type: 'state',
        name: 'Landesschnitt',
        domain: 'ho',
        result: 0.55,
        global: 0.5,
    }),
    row({
        id: 'land-a',
        type: 'state',
        name: 'Landesschnitt',
        domain: 'le',
        result: 0.49,
        global: 0.51,
    }),
];

describe('parseStyleAggregation', () => {
    it('reads the Richtig aggregation, not whichever Ergebnis aggregation comes first', () => {
        // WHY: the spec fixes no order of `aggregations[]`. Taking the first Ergebnis entry
        // put the class marker at the Falsch share whenever a payload listed that first.
        const entry = row({
            id: '1',
            type: 'group',
            name: '8a',
            domain: 'ho',
            result: 0.7,
            global: 0.5,
        });
        entry.aggregations.unshift({
            type: 'Ergebnis',
            value: 'Falsch',
            descriptiveStatistics: { mean: 0.2 },
        });

        expect(parseStyleAggregation([entry]).classDomainAverages.ho).toBeCloseTo(70, 5);
    });

    it('buckets on type, so a state row with its own id does not overwrite the class', () => {
        // WHY: this is the defect itself. When the class row is `id: '1001'` and the
        // state row is `id: 'land-a'`, an id test files both under "class", last row wins, and
        // the overview scatterplot draws the class marker on the state's values (55 / 49)
        // while still labelling it "8a". The class must keep its own numbers.
        const { classDomainAverages, comparisonGroups } = parseStyleAggregation(STATE_EXPORT);

        expect(classDomainAverages.ho).toBeCloseTo(65, 2);
        expect(classDomainAverages.le).toBeCloseTo(68, 2);

        const state = comparisonGroups.find((g) => g.type === 'state');
        expect(state.domainAverages.ho).toBeCloseTo(55, 2);
        expect(state.domainAverages.le).toBeCloseTo(49, 2);
    });

    it('resolves the state group name, which is what keeps the Landesschnitt toggle alive', () => {
        // WHY: buildEnConfig derives the comparison toggles from these groups. When the
        // state bucket came back empty the toggle disappeared from the legend — while the
        // marker still rendered, because an absent comparison mode defaults to visible.
        // An untoggleable marker drawn from nothing is the visible symptom of this bug.
        const { comparisonGroups } = parseStyleAggregation(STATE_EXPORT);

        expect(comparisonGroups.map((g) => ({ id: g.id, type: g.type, name: g.name }))).toEqual([
            { id: 'school', type: 'school', name: 'Schulschnitt' },
            { id: 'land-a', type: 'state', name: 'Landesschnitt' },
        ]);
    });

    it('rejects comparison groups without a payload name instead of inventing a label', () => {
        // WHY: a comparison average is a named reference population. Falling back to an
        // id such as `nw-gy` makes the chart look data-backed while hiding that the
        // exporter omitted the user-facing identity.
        const missingName = [
            row({
                id: '1001',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.65,
                global: 0.6,
            }),
            row({
                id: 'nw-gy',
                type: 'state',
                name: '',
                domain: 'ho',
                result: 0.58,
                global: 0.5,
            }),
        ];

        expect(() => parseStyleAggregation(missingName)).toThrow(/comparison group.*name/i);
    });

    it('files an unrecognised comparison type as a comparison group, never as the class', () => {
        // WHY: a comparison population the client has no shape for — a district average,
        // say — is still not the class. Filing it into the class bucket would relabel
        // reference values as 8a and silently move the class marker, which is the same
        // defect an id-based bucketing caused. `type` decides the bucket, and only the
        // literal class type `group` lands in it.
        //
        // It is no longer *rejected*, though: `resolveAverageRole` collapses any
        // unrecognised type onto the catch-all mark, so the exporter can ship a new
        // comparison population without taking the dashboard down.
        const unknownType = [
            row({
                id: '1001',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.65,
                global: 0.6,
            }),
            row({
                id: 'district',
                type: 'district',
                name: 'Bezirksschnitt',
                domain: 'ho',
                result: 0.58,
                global: 0.5,
            }),
        ];

        const { classDomainAverages, comparisonGroups } = parseStyleAggregation(unknownType);

        expect(classDomainAverages.ho).toBeCloseTo(65, 2);
        expect(comparisonGroups).toHaveLength(1);
        expect(comparisonGroups[0]).toMatchObject({
            id: 'district',
            type: 'district',
            name: 'Bezirksschnitt',
        });
        expect(comparisonGroups[0].domainAverages.ho).toBeCloseTo(58, 2);
    });

    it('numbers every unrecognised type through one ordinal sequence, not one per type', () => {
        // WHY: the ordinal and the shade ramp exist to separate marks that share a shape
        // and a base colour. Every unrecognised type draws the same catch-all cross, so
        // bucketing the ordinal on the raw type would restart at `V1` for each one and
        // put the identical label on two different populations — cardinality without
        // identity, the defect the `L1`/`L2` work already fixed for Landesschnitte.
        const twoUnknownTypes = [
            row({
                id: '1001',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.65,
                global: 0.6,
            }),
            row({
                id: 'district',
                type: 'district',
                name: 'Bezirksschnitt',
                domain: 'ho',
                result: 0.58,
                global: 0.5,
            }),
            row({
                id: 'region',
                type: 'region',
                name: 'Regionsschnitt',
                domain: 'ho',
                result: 0.57,
                global: 0.5,
            }),
        ];

        const { comparisonGroups } = parseStyleAggregation(twoUnknownTypes);

        expect(comparisonGroups.map((g) => g.shortLabel)).toEqual(['V1', 'V2']);
        expect(comparisonGroups.map((g) => g.typeIndex)).toEqual([0, 1]);
    });

    it('rejects a comparison group with no type at all', () => {
        // WHY: an unrecognised type is an extension of the vocabulary; a *missing* one is
        // a malformed payload. It cannot be told apart from the class, so folding it into
        // the catch-all would hide a broken export behind a plausible-looking mark.
        const missingType = [
            row({
                id: '1001',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.65,
                global: 0.6,
            }),
            row({
                id: 'mystery',
                type: undefined,
                name: 'Unbekannt',
                domain: 'ho',
                result: 0.58,
                global: 0.5,
            }),
        ];

        expect(() => parseStyleAggregation(missingType)).toThrow(/missing a value-group type/i);
    });

    it("merges a group's domain rows into one group rather than duplicating it", () => {
        // WHY: every group appears once per domain. If the rows were not merged by id the
        // caller would see two "Schulschnitt" comparisons, each holding half the domains,
        // and every chart would render a duplicate series with gaps.
        const { comparisonGroups } = parseStyleAggregation(STATE_EXPORT);

        expect(comparisonGroups).toHaveLength(2);
        const school = comparisonGroups.find((g) => g.id === 'school');
        expect(Object.keys(school.domainAverages).sort()).toEqual(['ho', 'le']);
        expect(Object.keys(school.averages).sort()).toEqual(['ho_global', 'le_global']);
    });

    it('keeps several Landesschnitte separate instead of collapsing them to one', () => {
        // WHY: nw splits its Landesschnitt by track. They are alternative comparison
        // populations, not parts of one — merging them averages across tracks and
        // last-wins picks one at random. Choosing between them is the exporter's job;
        // the client renders every group it is given.
        const trackSplit = [
            row({
                id: '1002',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.52,
                global: 0.5,
            }),
            row({
                id: 'nw-gy',
                type: 'state',
                name: 'Landesschnitt GY',
                domain: 'ho',
                result: 0.58,
                global: 0.5,
            }),
            row({
                id: 'nw-hsa',
                type: 'state',
                name: 'Landesschnitt HSA',
                domain: 'ho',
                result: 0.47,
                global: 0.4,
            }),
            row({
                id: 'nw-hsa-gk',
                type: 'state',
                name: 'Landesschnitt HSA-GK',
                domain: 'ho',
                result: 0.44,
                global: 0.4,
            }),
            row({
                id: 'nw-msa',
                type: 'state',
                name: 'Landesschnitt MSA',
                domain: 'ho',
                result: 0.51,
                global: 0.5,
            }),
        ];

        const { classDomainAverages, comparisonGroups } = parseStyleAggregation(trackSplit);

        expect(classDomainAverages.ho).toBeCloseTo(52, 2);
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
        // Four state markers share one shape and one base colour, so each needs an
        // ordinal — it is what ties a legend row, a marker tag and a shade together.
        // Numbering follows payload order, the same order the charts draw in.
        expect(comparisonGroups.map((g) => g.shortLabel)).toEqual(['L1', 'L2', 'L3', 'L4']);
        expect(comparisonGroups.map((g) => g.typeIndex)).toEqual([0, 1, 2, 3]);
    });

    it('leaves the short label off when a type delivers a single group', () => {
        // WHY: the ordinal exists to disambiguate. Stamping "L1" on a lone
        // Landesschnitt would add an index that decodes nothing, and would change how
        // every currently shipped single-state dataset renders.
        const { comparisonGroups } = parseStyleAggregation(STATE_EXPORT);

        expect(comparisonGroups.map((g) => [g.type, g.shortLabel])).toEqual([
            ['school', null],
            ['state', null],
        ]);
    });

    it('still reads the demo fixtures, whose ids happen to be the literal type names', () => {
        // WHY: 8a_mid/8b_good/8c_bad use id 'school'/'state'. Switching the discriminator
        // must not break them — they are what every other e2e spec runs against.
        const demo = [
            row({
                id: '8a-englisch',
                type: 'group',
                name: '8a',
                domain: 'ho',
                result: 0.6151,
                global: 0.6071,
            }),
            row({
                id: 'school',
                type: 'school',
                name: 'Schulschnitt',
                domain: 'ho',
                result: 0.5548,
                global: 0.55,
            }),
            row({
                id: 'state',
                type: 'state',
                name: 'Landesschnitt',
                domain: 'ho',
                result: 0.5367,
                global: 0.53,
            }),
        ];

        const { classDomainAverages, className, comparisonGroups } = parseStyleAggregation(demo);

        expect(className).toBe('8a');
        expect(classDomainAverages.ho).toBeCloseTo(61.51, 2);
        expect(comparisonGroups.map((g) => g.type)).toEqual(['school', 'state']);
    });

    it('leaves a style without a mean out rather than reading 0 %', () => {
        // WHY: a class or comparison style value the payload does not carry read as 0 %,
        // and the style charts drew it at the axis origin as if the group had scored it.
        const { comparisonGroups } = parseStyleAggregation([
            row({
                id: 'land-a',
                type: 'state',
                name: 'Landesschnitt',
                domain: 'ho',
                result: 0.5,
                global: undefined,
            }),
        ]);

        expect(comparisonGroups[0].averages).toEqual({});
    });

    it('returns empty structures for an empty or missing payload', () => {
        // WHY: a scope with no comparisons ships empty arrays, and a class with no aggregation.json must
        // render no comparisons rather than throw on the way to the chart.
        for (const input of [[], null, undefined]) {
            expect(parseStyleAggregation(input)).toEqual({
                classAverages: {},
                classDomainAverages: {},
                className: null,
                comparisonGroups: [],
            });
        }
    });
});
