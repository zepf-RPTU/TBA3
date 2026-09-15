/**
 * EN item data adapter — solver / non-solver student groups, the class's per-item
 * result counts and shares, and the comparison groups of items.json.
 *
 * The item detail panel decides *by itself* which group of students to show (the
 * smaller one) and marks who never attempted the item. That is only correct if
 * the adapter files every tested student into exactly one of the two groups and
 * flags "Unbearbeitet" apart from "Falsch" — including on the per-student records
 * used by the Student view.
 *
 * The two halves come from different places on purpose: group *membership* is
 * inverted from the per-student payload here, while the Richtig/Falsch/Unbearbeitet
 * *counts* are read from the API's own per-item breakdown. These tests lock both
 * that contract and that division.
 */

import { describe, it, expect } from 'vitest';
import {
    buildItemArray,
    buildItemComparisonGroups,
    buildStudentItemRecords,
} from '../../../../src/en/utils/enItemDataAdapter.js';

const ITEM_A = 'EL1';
const ITEM_B = 'EL2';

const itemsData = [
    {
        domain: { id: 'ho', name: 'Hörverstehen' },
        items: [
            // Listed back to front: `position` is the booklet's order inside an
            // exercise, so the adapter must not hand these on as they arrive.
            {
                iqbId: ITEM_B,
                name: '1.2',
                position: 2,
                exercise: { name: 'Brian' },
                parameters: { competenceLevel: { nameShort: 'A2.1' } },
                descriptiveStatistics: { total: 3, mean: 1, frequency: 3 },
            },
            {
                iqbId: ITEM_A,
                name: '1.1',
                position: 1,
                exercise: { name: 'Brian' },
                parameters: { competenceLevel: { nameShort: 'A1.1' } },
                descriptiveStatistics: { total: 3, mean: 1 / 3, frequency: 1 },
            },
        ],
    },
];

/**
 * @param {string} id - student id
 * @param {string} lastName - last name
 * @param {Array<Array<string>>} byResult - [correct[], incorrect[], notAttempted[]] iqbIds
 */
const student = (id, lastName, byResult) => ({
    id,
    domain: { id: 'ho' },
    properties: [
        { key: 'firstName', value: 'F' },
        { key: 'lastName', value: lastName },
    ],
    aggregations: [
        { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: { mean: 0.5 } },
        { type: 'Ergebnis', value: 'Richtig', includedIqbIds: byResult[0] },
        { type: 'Ergebnis', value: 'Falsch', includedIqbIds: byResult[1] },
        { type: 'Ergebnis', value: 'Unbearbeitet', includedIqbIds: byResult[2] },
    ],
});

const aggregationData = [
    student('s1', 'Solver', [[ITEM_A, ITEM_B], [], []]),
    student('s2', 'Wrong', [[ITEM_B], [ITEM_A], []]),
    student('s3', 'Skipper', [[ITEM_B], [], [ITEM_A]]),
];

/**
 * items_aggregation.json — the API's per-item breakdown.
 *
 * @param {string} iqbId
 * @param {Array<number>} byResult - [Richtig, Falsch, Unbearbeitet] frequencies
 */
const itemAggregation = (iqbId, byResult) => ({
    id: iqbId,
    type: 'item',
    name: iqbId,
    domain: { id: 'ho', name: 'Hörverstehen' },
    aggregations: ['Richtig', 'Falsch', 'Unbearbeitet'].map((value, i) => ({
        type: 'Ergebnis',
        value,
        descriptiveStatistics: {
            total: byResult.reduce((a, b) => a + b, 0),
            mean: byResult[i] / byResult.reduce((a, b) => a + b, 0),
            frequency: byResult[i],
        },
    })),
});

const itemAggData = [itemAggregation(ITEM_A, [1, 1, 1]), itemAggregation(ITEM_B, [3, 0, 0])];

describe('buildItemArray — student groups', () => {
    it('splits students into solvers and non-solvers per item', () => {
        // WHY: the panel's "show the smaller group" default is derived from these
        // two list lengths, so a student landing in the wrong list flips the
        // default group teachers see.
        const [itemA] = buildItemArray(itemsData, aggregationData, itemAggData);

        expect(itemA.solvers.map((s) => s.studentId)).toEqual(['s1']);
        expect(itemA.nonSolvers.map((s) => s.studentId).sort()).toEqual(['s2', 's3']);
    });

    it('flags "Unbearbeitet" students as not attempted, "Falsch" as attempted', () => {
        // WHY: the grid marks skipped items differently from wrong answers — a
        // teacher must be able to tell "got it wrong" from "never tried".
        const [itemA] = buildItemArray(itemsData, aggregationData, itemAggData);
        const byId = Object.fromEntries(itemA.nonSolvers.map((s) => [s.studentId, s.attempted]));

        expect(byId).toEqual({ s2: true, s3: false });
    });

    it('carries the student display identity into both groups', () => {
        // WHY: the grid renders "Nachname, Vorname" and navigates by studentId.
        const [itemA] = buildItemArray(itemsData, aggregationData, itemAggData);

        expect(itemA.solvers[0]).toMatchObject({
            studentId: 's1',
            firstName: 'F',
            lastName: 'Solver',
        });
    });

    it('accounts for every tested student exactly once', () => {
        // WHY: the two groups are presented as complementary ("gelöst (n)" /
        // "nicht gelöst (m)"), so their sum must match the item total — a student
        // counted twice or dropped would make the toggle labels lie.
        for (const item of buildItemArray(itemsData, aggregationData, itemAggData)) {
            expect(item.solvers.length + item.nonSolvers.length).toBe(
                item.descriptiveStatistics.total,
            );
        }
    });

    it('emits an exercise in booklet order, not in payload order', () => {
        // WHY: the item table's task rows, the detail tabs and the lollipop all take
        // their sequence from this array, and within one exercise the booklet's order
        // is `position` — the fixture lists 1.2 before 1.1 precisely so array order
        // cannot pass this.
        const items = buildItemArray(itemsData, aggregationData, itemAggData);

        expect(items.map((i) => i.name)).toEqual(['1.1', '1.2']);
    });

    it('yields empty groups without student aggregation data', () => {
        // WHY: the panel must render its empty state rather than throw when the
        // aggregation payload is missing.
        const [itemA] = buildItemArray(itemsData, null, itemAggData);

        expect(itemA.solvers).toEqual([]);
        expect(itemA.nonSolvers).toEqual([]);
    });
});

describe('Ergebnis aggregations are read by value, not position', () => {
    // A spec-conformant payload unlike the fixtures: the buckets arrive in reverse
    // order, and s1's and s3's rows carry no Falsch bucket at all.
    const reversed = (id, lastName, { richtig = [], falsch, unbearbeitet = [] }) => ({
        id,
        domain: { id: 'ho' },
        properties: [
            { key: 'firstName', value: 'F' },
            { key: 'lastName', value: lastName },
        ],
        aggregations: [
            { type: 'Ergebnis', value: 'Unbearbeitet', includedIqbIds: unbearbeitet },
            ...(falsch ? [{ type: 'Ergebnis', value: 'Falsch', includedIqbIds: falsch }] : []),
            { type: 'Ergebnis', value: 'Richtig', includedIqbIds: richtig },
        ],
    });
    const payload = [
        reversed('s1', 'Solver', { richtig: [ITEM_A, ITEM_B] }),
        reversed('s2', 'Wrong', { richtig: [ITEM_B], falsch: [ITEM_A] }),
        reversed('s3', 'Skipper', { richtig: [ITEM_B], unbearbeitet: [ITEM_A] }),
    ];

    it('files solvers and non-solvers by value', () => {
        // WHY: position 0 was taken as "Richtig". With Unbearbeitet listed first the
        // skipper became the item's only solver and the real solver a non-solver.
        const [itemA] = buildItemArray(itemsData, payload, itemAggData);

        expect(itemA.solvers.map((s) => s.studentId)).toEqual(['s1']);
        expect(Object.fromEntries(itemA.nonSolvers.map((s) => [s.studentId, s.attempted]))).toEqual(
            { s2: true, s3: false },
        );
    });

    it("codes one student's items by value, whichever buckets the row carries", () => {
        // WHY: a row without a Falsch bucket shifted Richtig into Falsch's slot, so a
        // solved item showed the cross in the student's task list.
        const codes = (id) =>
            Object.fromEntries(
                buildStudentItemRecords(itemsData, payload, itemAggData, id).map((r) => [
                    r.iqbId,
                    r.ergebnis,
                ]),
            );

        expect(codes('s1')).toEqual({ [ITEM_A]: 1, [ITEM_B]: 1 });
        expect(codes('s2')).toEqual({ [ITEM_A]: 0, [ITEM_B]: 1 });
        expect(codes('s3')).toEqual({ [ITEM_A]: -1, [ITEM_B]: 1 });
    });
});

describe('buildItemArray — styles', () => {
    it('drops a style entry that carries no name', () => {
        // WHY: the spec requires no field of a `competences[]` entry. An unnamed style
        // reached the Stile column and printed the text "undefined".
        const data = [
            {
                domain: { id: 'ho', name: 'Hörverstehen' },
                items: [
                    {
                        iqbId: 'EL9',
                        name: '9.1',
                        position: 1,
                        exercise: { name: 'Nine' },
                        parameters: {
                            competences: [
                                { type: 'Hör-/Lesestil', name: 'global' },
                                { type: 'Hör-/Lesestil' },
                            ],
                        },
                        descriptiveStatistics: { total: 1, mean: 1, frequency: 1 },
                    },
                ],
            },
        ];

        const [item] = buildItemArray(data, [], []);

        expect(item.style).toEqual(['global']);
    });
});

describe('buildStudentItemRecords — student groups', () => {
    it('exposes the class-wide groups plus the matching counts', () => {
        // WHY: the Student view renders the same detail panel from these records
        // and has no other source for the class-level breakdown; without the
        // counts its "Leistung" block would contradict the group toggle.
        const records = buildStudentItemRecords(itemsData, aggregationData, itemAggData, 's2');
        const recordA = records.find((r) => r.iqbId === ITEM_A);

        expect(recordA.solvers.map((s) => s.studentId)).toEqual(['s1']);
        expect(recordA).toMatchObject({
            correctCount: 1,
            incorrectCount: 1,
            notAttemptedCount: 1,
            total: 3,
        });
    });

    it('emits an exercise in booklet order, like the class-level records', () => {
        // WHY: the Student view renders the same detail panel and must not order one
        // student's items differently from the class's.
        const records = buildStudentItemRecords(itemsData, aggregationData, itemAggData, 's1');

        expect(records.map((r) => r.name)).toEqual(['1.1', '1.2']);
    });

    it('reuses the same group arrays across calls for one aggregation payload', () => {
        // WHY: the groups are rebuilt on every student selection; the WeakMap
        // cache is what keeps that from rescanning every student each time.
        const first = buildStudentItemRecords(itemsData, aggregationData, itemAggData, 's1');
        const second = buildStudentItemRecords(itemsData, aggregationData, itemAggData, 's2');

        expect(second[0].solvers).toBe(first[0].solvers);
    });
});

describe('buildItemComparisonGroups', () => {
    const comparisonRow = ({ id, type = 'state', name = id, mean = 0.5, iqbId = ITEM_A }) => ({
        id,
        type,
        name,
        items: [{ iqbId, descriptiveStatistics: { mean } }],
    });

    it('keeps one item mean map per delivered comparison group id', () => {
        // WHY: the EN item lollipop may receive several Landesschnitt tracks. Their
        // item means must remain addressable by payload id so the chart can draw one
        // marker series per track instead of collapsing to the first state.
        const groups = buildItemComparisonGroups([
            comparisonRow({ id: 'school', type: 'school', mean: 0.61 }),
            comparisonRow({ id: 'nw-gy', mean: 0.58 }),
            comparisonRow({ id: 'nw-msa', mean: 0.51 }),
        ]);

        expect(groups.map((g) => g.id)).toEqual(['school', 'nw-gy', 'nw-msa']);
        expect(groups[0].meanMap.get(ITEM_A)).toBeCloseTo(61, 10);
        expect(groups[1].meanMap.get(ITEM_A)).toBeCloseTo(58, 10);
        expect(groups[2].meanMap.get(ITEM_A)).toBeCloseTo(51, 10);
    });

    it('keeps name and type, and numbers the groups that share a role', () => {
        // WHY: the lollipop draws every group items.json carries, including one
        // aggregation.json does not list — its legend, tooltip and ⌀ entry need the
        // name and role from this document, and several Landesschnitte their L1/L2.
        const groups = buildItemComparisonGroups([
            comparisonRow({ id: 'school', type: 'school', name: 'Schulschnitt' }),
            comparisonRow({ id: 'nw-gy', name: 'Landesschnitt GY' }),
            comparisonRow({ id: 'nw-msa', name: 'Landesschnitt MSA' }),
        ]);

        expect(
            groups.map(({ id, type, name, shortLabel }) => ({ id, type, name, shortLabel })),
        ).toEqual([
            { id: 'school', type: 'school', name: 'Schulschnitt', shortLabel: null },
            { id: 'nw-gy', type: 'state', name: 'Landesschnitt GY', shortLabel: 'L1' },
            { id: 'nw-msa', type: 'state', name: 'Landesschnitt MSA', shortLabel: 'L2' },
        ]);
    });

    it("merges a group's domain rows into one group", () => {
        // WHY: items.json ships every comparison group once per domain. Unmerged, the
        // chart would draw two series with one toggle id, each holding half the items.
        const groups = buildItemComparisonGroups([
            comparisonRow({ id: 'school', type: 'school', iqbId: ITEM_A, mean: 0.4 }),
            comparisonRow({ id: 'school', type: 'school', iqbId: ITEM_B, mean: 0.6 }),
        ]);

        expect(groups).toHaveLength(1);
        expect([...groups[0].meanMap.keys()]).toEqual([ITEM_A, ITEM_B]);
    });

    it('keeps an unrecognised comparison item group type rather than rejecting it', () => {
        // WHY: the spec's `type` is an open string, so an exporter may ship a comparison
        // population this client has no specific styling for. It draws with the catch-all
        // marker; refusing it took the item view down over a row the chart can render.
        const groups = buildItemComparisonGroups([
            comparisonRow({ id: 'district', type: 'district', mean: 0.44 }),
        ]);

        expect(groups.map((g) => g.id)).toEqual(['district']);
        expect(groups[0].meanMap.get(ITEM_A)).toBeCloseTo(44, 10);
    });

    it('rejects a comparison item group with no type at all', () => {
        // WHY: an unrecognised type extends the vocabulary; a missing one is malformed.
        expect(() =>
            buildItemComparisonGroups([comparisonRow({ id: 'mystery', type: '' })]),
        ).toThrow(/missing a value-group type/i);
    });

    it('rejects a comparison row without an id or a name', () => {
        // WHY: the id is the comparison toggle key — without one the app seeded
        // `undefined` into its comparison state — and the name labels the series.
        expect(() =>
            buildItemComparisonGroups([comparisonRow({ id: undefined, name: 'Landesschnitt' })]),
        ).toThrow(/missing required id/);
        expect(() => buildItemComparisonGroups([comparisonRow({ id: 'hb', name: '' })])).toThrow(
            /missing required name/,
        );
    });
});

describe('result counts come from the API payload', () => {
    // A breakdown that disagrees with both the student rows (1/1/1) and with
    // items.json (total 3, frequency 1). Only reading items_aggregation.json
    // produces these numbers.
    const disagreeing = [itemAggregation(ITEM_A, [7, 2, 1]), itemAggregation(ITEM_B, [3, 0, 0])];

    it('reads the counts off items_aggregation.json, not off the student scan', () => {
        // WHY: the API is the authority for the three-way split. Re-deriving it
        // client-side — tallying Unbearbeitet across students and inferring the
        // rest by subtraction — is the retired stopgap this asserts is gone.
        const [itemA] = buildItemArray(itemsData, aggregationData, disagreeing);

        expect(itemA).toMatchObject({
            correctCount: 7,
            incorrectCount: 2,
            notAttemptedCount: 1,
            total: 10,
        });
    });

    it('takes all three bar shares from the counts and keeps the mean for the lollipop', () => {
        // WHY: the bar's Richtig share came from items.json `mean` (33 %) and the other
        // two from the breakdown (20 %, 10 %); the segments then did not partition the
        // same responses, and the bar rescaled them into a split neither source reports.
        const [itemA] = buildItemArray(itemsData, aggregationData, disagreeing);

        expect(itemA.percentageCorrect).toBeCloseTo(70, 10);
        expect(itemA.percentageIncorrect).toBeCloseTo(20, 10);
        expect(itemA.percentageNotAttempted).toBeCloseTo(10, 10);
        expect(itemA.meanPercentage).toBeCloseTo(100 / 3, 10);
    });

    it('reports the same counts on the per-student records', () => {
        // WHY: the Student view shows the class breakdown beside one student's own
        // result; two derivations of it would let the two views disagree.
        const records = buildStudentItemRecords(itemsData, aggregationData, disagreeing, 's2');

        expect(records.find((r) => r.iqbId === ITEM_A)).toMatchObject({
            correctCount: 7,
            incorrectCount: 2,
            notAttemptedCount: 1,
            total: 10,
        });
    });

    it('reports zero counts and no shares for an item the payload does not cover', () => {
        // WHY: a class whose payload is missing or partial must render rather than
        // throw or fall back to a second, disagreeing derivation — and a share of no
        // responses is unknown, not 0 %, so the bar stays empty.
        const [itemA] = buildItemArray(itemsData, aggregationData, []);

        expect(itemA).toMatchObject({
            correctCount: 0,
            incorrectCount: 0,
            notAttemptedCount: 0,
            total: 0,
            percentageCorrect: null,
            percentageIncorrect: null,
            percentageNotAttempted: null,
        });
    });
});
