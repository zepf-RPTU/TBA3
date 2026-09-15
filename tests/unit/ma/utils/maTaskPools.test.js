/**
 * MA task pools + pool-scoped student records.
 *
 * buildTaskPools derives the class-table pool list (Gesamt + one per Leitidee);
 * buildScopedStudentRecords re-counts each student over a pool's items. These
 * tests lock the pool derivation and, crucially, that per-Leitidee counts
 * reconcile back to the whole-booklet totals (the correctness anchor for the
 * differentiation view).
 */

import { describe, it, expect } from 'vitest';
import { buildTaskPools } from '../../../../src/ma/utils/maTaskPools.js';
import { buildScopedStudentRecords } from '../../../../src/ma/utils/maStudentDataAdapter.js';

// 3 items across 2 populated domains (zo: 2, gm: 1); 'rf' is declared but empty.
const itemArray = [
    {
        iqbId: 'i1',
        domain: 'zo',
        results: [
            ['s1', 1],
            ['s2', 0],
        ],
    },
    {
        iqbId: 'i2',
        domain: 'zo',
        results: [
            ['s1', 1],
            ['s2', -1],
        ],
    },
    {
        iqbId: 'i3',
        domain: 'gm',
        results: [
            ['s1', 0],
            ['s2', 1],
        ],
    },
];

const domains = [
    { domain: 'zo', domainLabel: 'Zahlen und Operationen' },
    { domain: 'gm', domainLabel: 'Größen und Messen' },
    { domain: 'rf', domainLabel: 'Raum und Form' }, // no items → omitted
];

// Whole-booklet records (as buildStudentRecords would produce for this data).
const baseStudentArray = [
    {
        studentId: 's1',
        firstName: 'Ada',
        lastName: 'L',
        gender: 'w',
        ks: 'III',
        traits: new Set(['lrs']),
        summedResult: 2,
        percentage: '66.7%',
        correctCount: 2,
        incorrectCount: 1,
        notAttemptedCount: 0,
    },
    {
        studentId: 's2',
        firstName: 'Bo',
        lastName: 'M',
        gender: 'm',
        ks: 'II',
        traits: new Set(),
        summedResult: 1,
        percentage: '33.3%',
        correctCount: 1,
        incorrectCount: 1,
        notAttemptedCount: 1,
    },
];

describe('buildTaskPools', () => {
    const pools = buildTaskPools(itemArray, domains);

    it('puts the whole-booklet "Gesamt" pool first with every item', () => {
        expect(pools[0]).toMatchObject({ id: 'all', type: 'all', nrItems: 3 });
        expect([...pools[0].iqbIds]).toEqual(['i1', 'i2', 'i3']);
    });

    it('adds one Leitidee pool per populated domain, in domain order', () => {
        expect(pools.map((p) => p.id)).toEqual(['all', 'zo', 'gm']);
        const zo = pools.find((p) => p.id === 'zo');
        expect(zo).toMatchObject({ type: 'leitidee', label: 'Zahlen und Operationen', nrItems: 2 });
        expect([...zo.iqbIds]).toEqual(['i1', 'i2']);
    });

    it('omits Leitideen that have no items in the booklet', () => {
        expect(pools.some((p) => p.id === 'rf')).toBe(false);
    });
});

describe('buildScopedStudentRecords', () => {
    it('reproduces the whole-booklet counts when scoped to every item', () => {
        const allIds = new Set(itemArray.map((i) => i.iqbId));
        const scoped = buildScopedStudentRecords(baseStudentArray, itemArray, allIds);

        for (const base of baseStudentArray) {
            const row = scoped.find((r) => r.studentId === base.studentId);
            expect(row.correctCount).toBe(base.correctCount);
            expect(row.incorrectCount).toBe(base.incorrectCount);
            expect(row.notAttemptedCount).toBe(base.notAttemptedCount);
            expect(row.summedResult).toBe(base.summedResult);
        }
    });

    it('restricts counts to the pool and derives the subset percentage', () => {
        const zoIds = new Set(['i1', 'i2']);
        const scoped = buildScopedStudentRecords(baseStudentArray, itemArray, zoIds);

        const s1 = scoped.find((r) => r.studentId === 's1');
        expect(s1).toMatchObject({
            correctCount: 2,
            incorrectCount: 0,
            notAttemptedCount: 0,
            summedResult: 2,
        });
        expect(s1.percentage).toBe('100.0%');
        expect(s1.percentageCorrect).toBe(100);

        const s2 = scoped.find((r) => r.studentId === 's2');
        expect(s2).toMatchObject({
            correctCount: 0,
            incorrectCount: 1,
            notAttemptedCount: 1,
            summedResult: 0,
        });
        expect(s2.percentage).toBe('0.0%');
    });

    it('reconciles: per-Leitidee correct counts sum back to the booklet total', () => {
        const zo = buildScopedStudentRecords(baseStudentArray, itemArray, new Set(['i1', 'i2']));
        const gm = buildScopedStudentRecords(baseStudentArray, itemArray, new Set(['i3']));

        for (const base of baseStudentArray) {
            const zoCorrect = zo.find((r) => r.studentId === base.studentId).correctCount;
            const gmCorrect = gm.find((r) => r.studentId === base.studentId).correctCount;
            expect(zoCorrect + gmCorrect).toBe(base.correctCount);
        }
    });

    it('preserves student identity, gender, Kompetenzstufe and traits', () => {
        const scoped = buildScopedStudentRecords(baseStudentArray, itemArray, new Set(['i3']));
        const s1 = scoped.find((r) => r.studentId === 's1');
        expect(s1).toMatchObject({ firstName: 'Ada', lastName: 'L', gender: 'w', ks: 'III' });
        expect(s1.traits).toBeInstanceOf(Set);
        expect([...s1.traits]).toEqual(['lrs']);
    });
});
