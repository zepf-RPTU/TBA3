// buildItemPools derives the group table's pool list (Gesamt + one per Leitidee);
// buildStudentRecordsByDomain takes each student's counts for one Leitidee, which must
// reconcile with the whole-booklet totals.

import { describe, it, expect } from 'vitest';
import { buildItemPools } from '../../../src/ma/utils/maItemPools.js';
import { getItemRingSets } from '../../../src/ma/utils/maItemRings.js';
import {
    buildStudentRecordsByDomain,
    buildStudentRecords,
} from '../../../src/ma/utils/maStudentDataAdapter.js';
import { studentFields } from '../../support/competenceLevelGroups.js';
import { required } from '../../support/required.js';

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup} StudentCompetenceLevelsValueGroup */

// 3 items across 2 populated domains (zo: 2, gm: 1); 'rf' is declared but empty.
const itemArray = [
    { iqbId: 'i1', domain: 'zo' },
    { iqbId: 'i2', domain: 'zo' },
    { iqbId: 'i3', domain: 'gm' },
];

const domains = [
    { domain: 'zo', domainLabel: 'Zahlen und Operationen' },
    { domain: 'gm', domainLabel: 'Größen und Messen' },
    // No items, so no pool.
    { domain: 'rf', domainLabel: 'Raum und Form' },
];

/**
 * One students-aggregations.json value group: a student's result counts in one Leitidee.
 * @param {string} id
 * @param {string} domainId - Leitidee.
 * @param {[number, number, number]} counts - Richtig, Falsch, Unbearbeitet.
 * @returns {import('../../../src/common/data/schemas/aggregations.js').StudentAggregationsValueGroup}
 */
const aggregationValueGroup = (id, domainId, [richtig, falsch, unbearbeitet]) => {
    const total = richtig + falsch + unbearbeitet;
    /** @type {Array<[string, number]>} */
    const buckets = [
        ['Richtig', richtig],
        ['Falsch', falsch],
        ['Unbearbeitet', unbearbeitet],
    ];
    return {
        id,
        type: 'student',
        name: id,
        domain: { id: domainId, name: domainId },
        ...studentFields('3a', id),
        aggregations: buckets.map(([value, frequency]) => ({
            type: 'result',
            value,
            descriptiveStatistics: { frequency, total, mean: frequency / total },
        })),
    };
};

// s1: zo 2/0/0, gm 0/1/0. s2: zo 0/1/1, gm 1/0/0.
const aggregationData = [
    aggregationValueGroup('s1', 'zo', [2, 0, 0]),
    aggregationValueGroup('s1', 'gm', [0, 1, 0]),
    aggregationValueGroup('s2', 'zo', [0, 1, 1]),
    aggregationValueGroup('s2', 'gm', [1, 0, 0]),
];

/**
 * A students-competence-levels.json value group at one level, with the item-slot span its
 * booklet gives that level.
 * @param {string} id
 * @param {string} nameShort
 * @param {string} span - The level's `itemLevelSpan`.
 * @returns {StudentCompetenceLevelsValueGroup}
 */
const levelValueGroup = (id, nameShort, span) => {
    const student = studentFields('3a', id);
    return {
        id,
        type: 'student',
        name: id,
        ...student,
        properties: [...student.properties, { key: 'itemLevelSpan:4', value: span }],
        competenceLevels: [{ id: '4', nameShort, descriptiveStatistics: { mean: 1 } }],
    };
};

// Same level id, different booklets: each student keeps their own booklet's span.
const competenceLevelsData = [
    levelValueGroup('s1', 'III', '3'),
    levelValueGroup('s2', 'B1.1', '5-8'),
];

const baseStudentArray = buildStudentRecords(competenceLevelsData, aggregationData);

describe('buildItemPools', () => {
    const pools = buildItemPools(getItemRingSets(domains, [], itemArray));

    it('puts the whole-booklet "Gesamt" pool first', () => {
        expect(pools[0]).toMatchObject({ id: 'all', type: 'all' });
    });

    it('adds one Leitidee pool per populated domain, in domain order', () => {
        expect(pools.map((p) => p.id)).toEqual(['all', 'zo', 'gm']);
        const zo = pools.find((p) => p.id === 'zo');
        expect(zo).toMatchObject({ type: 'leitidee', label: 'Zahlen und Operationen' });
    });
});

describe('buildStudentRecords', () => {
    it("takes each student's item-slot span from their own value group", () => {
        expect(baseStudentArray.map((r) => r.competenceLevelItemSpan)).toEqual([
            { from: 3, to: 3 },
            { from: 5, to: 8 },
        ]);
    });

    it("sums every Leitidee and counts N against the student's own items", () => {
        expect(baseStudentArray.find((r) => r.studentId === 's1')).toMatchObject({
            totalCount: 3,
            correctCount: 2,
            incorrectCount: 1,
            notAttemptedCount: 0,
        });
        expect(baseStudentArray.find((r) => r.studentId === 's2')).toMatchObject({
            correctCount: 1,
            totalCount: 3,
            notAttemptedCount: 1,
        });
    });

    it('reads a student without aggregation value groups as nothing solved of nothing, with no shares', () => {
        // No results is not 0 % — the bar shows no data rather than an empty bar.
        const [record] = buildStudentRecords(
            [
                {
                    id: 'x',
                    type: 'student',
                    name: 'x',
                    ...studentFields('3a', 'x'),
                    competenceLevels: [],
                },
            ],
            aggregationData,
        );
        expect(record).toMatchObject({ correctCount: 0, totalCount: 0, percentageCorrect: null });
    });
});

describe('buildStudentRecordsByDomain', () => {
    const byDomain = buildStudentRecordsByDomain(baseStudentArray, aggregationData, [
        { domain: 'zo' },
        { domain: 'gm' },
    ]);

    it('restricts counts to the Leitidee and derives the subset shares', () => {
        const scoped = required(byDomain.get('zo'));

        const s1 = scoped.find((r) => r.studentId === 's1');
        expect(s1).toMatchObject({
            correctCount: 2,
            incorrectCount: 0,
            notAttemptedCount: 0,
            totalCount: 2,
        });
        expect(required(s1).percentageCorrect).toBe(100);

        const s2 = scoped.find((r) => r.studentId === 's2');
        expect(s2).toMatchObject({
            correctCount: 0,
            incorrectCount: 1,
            notAttemptedCount: 1,
            totalCount: 2,
        });
    });

    it('reconciles: per-Leitidee counts sum back to the booklet total', () => {
        const zo = required(byDomain.get('zo'));
        const gm = required(byDomain.get('gm'));

        for (const base of baseStudentArray) {
            const zoRow = required(zo.find((r) => r.studentId === base.studentId));
            const gmRow = required(gm.find((r) => r.studentId === base.studentId));
            expect(zoRow.correctCount + gmRow.correctCount).toBe(base.correctCount);
            expect(zoRow.totalCount + gmRow.totalCount).toBe(base.totalCount);
        }
    });
});
