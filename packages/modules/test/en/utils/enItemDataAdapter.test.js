/**
 * The item detail panel shows the smaller of the solver and non-solver groups and marks
 * who never attempted the item, so the adapter must file every tested student into
 * exactly one group and flag "Unbearbeitet" apart from "Falsch". Group membership is
 * inverted from the per-student payload; the Richtig/Falsch/Unbearbeitet counts are read
 * from the API's per-item breakdown.
 */

import { describe, it, expect } from 'vitest';
import { buildItemArray, buildStudentItemRows } from '../../../src/en/utils/enItemDataAdapter.js';
import { nameProperties } from '../../support/competenceLevelGroups.js';

/** @typedef {import('../../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */
/** @typedef {import('../../../src/common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */
/** @typedef {import('../../../src/common/data/schemas/aggregations.js').StudentAggregationsValueGroup} StudentAggregationsValueGroup */

const ITEM_A = 'EL1';
const ITEM_B = 'EL2';

/** @type {ItemsValueGroup[]} */
const itemsData = [
    {
        id: 'own-group',
        type: 'group',
        name: 'Lerngruppe',
        domain: { id: 'ho', name: 'Hören' },
        items: [
            // Listed back to front: `position` is the booklet's order inside an
            // exercise, so the adapter must not hand these on as they arrive.
            {
                iqbId: ITEM_B,
                name: '1.2',
                position: 2,
                exercise: { name: 'Brian' },
                parameters: { competenceLevel: { id: '3', nameShort: 'A2.1' } },
                descriptiveStatistics: { total: 3, mean: 1, frequency: 3 },
            },
            {
                iqbId: ITEM_A,
                name: '1.1',
                position: 1,
                exercise: { name: 'Brian' },
                parameters: { competenceLevel: { id: '1', nameShort: 'A1.1' } },
                descriptiveStatistics: { total: 3, mean: 1 / 3, frequency: 1 },
            },
        ],
    },
];

/**
 * A student's `result` bucket. The adapter reads only the listed ids, so the
 * statistics the schema requires stay a zero placeholder.
 * @param {string} value - The bucket: Richtig, Falsch or Unbearbeitet.
 * @param {string[]} includedIqbIds - The items the student got this result on.
 * @returns {AggregationsValueGroup['aggregations'][number]}
 */
const resultAggregation = (value, includedIqbIds) => ({
    type: 'result',
    value,
    includedIqbIds,
    descriptiveStatistics: { mean: 0 },
});

/**
 * @param {string} id
 * @param {string} lastName
 * @param {Array<Array<string>>} byResult - [correct[], incorrect[], notAttempted[]] iqbIds
 * @returns {StudentAggregationsValueGroup} The student's students-aggregations.json value group.
 */
const student = (id, lastName, byResult) => ({
    id,
    type: 'student',
    name: lastName,
    domain: { id: 'ho', name: 'Hören' },
    properties: nameProperties('F', lastName),
    covariates: [{ type: 'group', value: 'Lerngruppe' }],
    aggregations: [
        { type: 'style', value: 'global', descriptiveStatistics: { mean: 0.5 } },
        resultAggregation('Richtig', byResult[0]),
        resultAggregation('Falsch', byResult[1]),
        resultAggregation('Unbearbeitet', byResult[2]),
    ],
});

const aggregationData = [
    student('s1', 'Solver', [[ITEM_A, ITEM_B], [], []]),
    student('s2', 'Wrong', [[ITEM_B], [ITEM_A], []]),
    student('s3', 'Skipper', [[ITEM_B], [], [ITEM_A]]),
];

/**
 * items-aggregations.json — the API's per-item breakdown.
 * @param {string} iqbId
 * @param {Array<number>} byResult - [Richtig, Falsch, Unbearbeitet] frequencies
 * @returns {AggregationsValueGroup}
 */
const itemAggregation = (iqbId, byResult) => ({
    id: iqbId,
    type: 'item',
    name: iqbId,
    domain: { id: 'ho', name: 'Hören' },
    aggregations: ['Richtig', 'Falsch', 'Unbearbeitet'].map((value, i) => ({
        type: 'result',
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
        // The panel's "show the smaller group" default is derived from these
        // two list lengths, so a student landing in the wrong list flips the
        // default group teachers see.
        const [itemA] = buildItemArray(itemsData, aggregationData, itemAggData);

        expect(itemA.solvers.map((s) => s.studentId)).toEqual(['s1']);
        expect(itemA.nonSolvers.map((s) => s.studentId).sort()).toEqual(['s2', 's3']);
    });

    it('flags "Unbearbeitet" students as not attempted, "Falsch" as attempted', () => {
        // The grid marks skipped items differently from wrong answers.
        const [itemA] = buildItemArray(itemsData, aggregationData, itemAggData);
        const byId = Object.fromEntries(itemA.nonSolvers.map((s) => [s.studentId, s.attempted]));

        expect(byId).toEqual({ s2: true, s3: false });
    });

    it('accounts for every tested student exactly once', () => {
        // The two groups are presented as complementary ("gelöst (n)" /
        // "nicht gelöst (m)"), so their sum must match the item total: a student
        // counted twice or dropped would falsify the toggle labels.
        for (const item of buildItemArray(itemsData, aggregationData, itemAggData)) {
            expect(item.solvers.length + item.nonSolvers.length).toBe(
                item.descriptiveStatistics.total,
            );
        }
    });

    it('emits an exercise in booklet order, not in payload order', () => {
        // The item table, the detail tabs and the lollipop all take
        // their sequence from this array, and within one exercise the booklet's order
        // is `position`. The fixture lists 1.2 before 1.1 so array order cannot pass.
        const items = buildItemArray(itemsData, aggregationData, itemAggData);

        expect(items.map((i) => i.name)).toEqual(['1.1', '1.2']);
    });

    it('yields empty groups without student aggregation data', () => {
        // The panel must render its empty state rather than throw when the
        // aggregation payload is missing.
        const [itemA] = buildItemArray(itemsData, null, itemAggData);

        expect(itemA.solvers).toEqual([]);
        expect(itemA.nonSolvers).toEqual([]);
    });
});

describe('result aggregations are read by value, not position', () => {
    // A spec-conformant payload unlike the fixtures: the buckets arrive in reverse
    // order, and s1's and s3's value groups carry no Falsch bucket at all.
    /**
     * @param {string} id
     * @param {string} lastName
     * @param {{richtig?: string[], falsch?: string[], unbearbeitet?: string[]}} byResult - iqbIds per bucket; no `falsch` drops that bucket.
     * @returns {StudentAggregationsValueGroup} Buckets in reverse order.
     */
    const reversed = (id, lastName, { richtig = [], falsch, unbearbeitet = [] }) => ({
        id,
        type: 'student',
        name: lastName,
        domain: { id: 'ho', name: 'Hören' },
        properties: nameProperties('F', lastName),
        covariates: [{ type: 'group', value: 'Lerngruppe' }],
        aggregations: [
            resultAggregation('Unbearbeitet', unbearbeitet),
            ...(falsch ? [resultAggregation('Falsch', falsch)] : []),
            resultAggregation('Richtig', richtig),
        ],
    });
    const payload = [
        reversed('s1', 'Solver', { richtig: [ITEM_A, ITEM_B] }),
        reversed('s2', 'Wrong', { richtig: [ITEM_B], falsch: [ITEM_A] }),
        reversed('s3', 'Skipper', { richtig: [ITEM_B], unbearbeitet: [ITEM_A] }),
    ];

    it('files solvers and non-solvers by value', () => {
        // Taking position 0 as "Richtig" breaks when Unbearbeitet is listed first:
        // the skipper becomes the item's only solver and the real solver a non-solver.
        const [itemA] = buildItemArray(itemsData, payload, itemAggData);

        expect(itemA.solvers.map((s) => s.studentId)).toEqual(['s1']);
        expect(Object.fromEntries(itemA.nonSolvers.map((s) => [s.studentId, s.attempted]))).toEqual(
            { s2: true, s3: false },
        );
    });
});

describe('buildItemArray — styles', () => {
    it('drops a style entry that carries no name', () => {
        // The spec requires no field of a `competences[]` entry. An unnamed style
        // would reach the Stile column and print the text "undefined".
        /** @type {ItemsValueGroup[]} */
        const data = [
            {
                id: 'own-group',
                type: 'group',
                name: 'Lerngruppe',
                domain: { id: 'ho', name: 'Hören' },
                items: [
                    {
                        iqbId: 'EL9',
                        name: '9.1',
                        position: 1,
                        exercise: { name: 'Nine' },
                        parameters: {
                            competenceLevel: { id: '1', nameShort: 'A1.1' },
                            competences: [{ type: 'style', name: 'global' }, { type: 'style' }],
                        },
                        descriptiveStatistics: { total: 1, mean: 1, frequency: 1 },
                    },
                ],
            },
        ];

        const [item] = buildItemArray(data, [], []);

        expect(item.style).toEqual(['global']);
    });

    it("sorts the styles into the dataset's category order, unregistered ones last", () => {
        // Every reader of the record (the Stile column, its sorter) takes the order
        // as given, so the record is the one place it is decided.
        /** @type {ItemsValueGroup[]} */
        const data = [
            {
                id: 'own-group',
                type: 'group',
                name: 'Lerngruppe',
                domain: { id: 'ho', name: 'Hören' },
                items: [
                    {
                        iqbId: 'EL9',
                        name: '9.1',
                        position: 1,
                        exercise: { name: 'Nine' },
                        parameters: {
                            competenceLevel: { id: '1', nameShort: 'A1.1' },
                            competences: [
                                { type: 'style', name: 'unbekannt' },
                                { type: 'style', name: 'detail' },
                                { type: 'style', name: 'global' },
                            ],
                        },
                        descriptiveStatistics: { total: 1, mean: 1, frequency: 1 },
                    },
                ],
            },
        ];

        const [item] = buildItemArray(
            data,
            [],
            [],
            [
                { value: 'global', fieldName: 'globalPercent', label: 'Global' },
                { value: 'detail', fieldName: 'detailPercent', label: 'Detail' },
            ],
        );

        expect(item.style).toEqual(['global', 'detail', 'unbekannt']);
    });
});

describe('buildStudentItemRows', () => {
    it("lists the items the student was tested on, with the student's result code", () => {
        const items = buildItemArray(itemsData, aggregationData, itemAggData);
        const rows = buildStudentItemRows(items, new Map([[ITEM_A, 0]]));

        expect(rows).toEqual([expect.objectContaining({ iqbId: ITEM_A, resultCode: 0 })]);
    });

    it('emits an exercise in booklet order, like the group-level records', () => {
        // The Student view renders the same detail panel and must not order one
        // student's items differently from the group's.
        const items = buildItemArray(itemsData, aggregationData, itemAggData);
        const rows = buildStudentItemRows(
            items,
            new Map([
                [ITEM_B, 1],
                [ITEM_A, 1],
            ]),
        );

        expect(rows.map((r) => r.name)).toEqual(['1.1', '1.2']);
    });
});

describe('result counts come from the API payload', () => {
    // A breakdown that disagrees with both the student value groups (1/1/1) and with
    // items.json (total 3, frequency 1). Only reading items-aggregations.json
    // produces these numbers.
    const disagreeing = [itemAggregation(ITEM_A, [7, 2, 1]), itemAggregation(ITEM_B, [3, 0, 0])];

    it('reads the counts off items-aggregations.json, not off the student scan', () => {
        // The API is the authority for the three-way split; the client does not
        // re-derive it by tallying Unbearbeitet across students and inferring the rest
        // by subtraction.
        const [itemA] = buildItemArray(itemsData, aggregationData, disagreeing);

        expect(itemA).toMatchObject({
            correctCount: 7,
            incorrectCount: 2,
            notAttemptedCount: 1,
            total: 10,
        });
    });

    it('takes all three bar shares from the counts and keeps the mean for the lollipop', () => {
        // A Richtig share from items.json `mean` (33 %) beside the other two from the
        // breakdown (20 %, 10 %) would not partition the same responses, and the bar
        // would rescale them into a split neither source reports.
        const [itemA] = buildItemArray(itemsData, aggregationData, disagreeing);

        expect(itemA.percentageCorrect).toBeCloseTo(70, 10);
        expect(itemA.percentageIncorrect).toBeCloseTo(20, 10);
        expect(itemA.percentageNotAttempted).toBeCloseTo(10, 10);
        expect(itemA.meanPercentage).toBeCloseTo(100 / 3, 10);
    });

    it('reports zero counts and no shares for an item the payload does not cover', () => {
        // A group whose payload is missing or partial must render rather than
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
