import { describe, it, expect } from 'vitest';
import {
    aggregateStudentStats,
    collectTraitCodesFromData,
} from '../../../src/sl/utils/slStudentStats.js';

describe('aggregateStudentStats', () => {
    it('returns an empty aggregate for no input', () => {
        const stats = aggregateStudentStats([]);
        expect(stats).toEqual({ nrStudents: 0, traitCounts: {}, genderCounts: {} });
        expect(aggregateStudentStats(null).nrStudents).toBe(0);
    });

    it('counts each student once even when the row repeats per domain', () => {
        // A subject split into Domänen carries one row per (student × Domäne), so
        // the same student recurs; nrStudents and the counts must reflect UNIQUE students.
        const rows = [
            { studentId: 's1', groupName: '8a', gender: 'female', traits: new Set(['migrant']) },
            { studentId: 's1', groupName: '8a', gender: 'female', traits: new Set(['migrant']) },
            {
                studentId: 's2',
                groupName: '8a',
                gender: 'male',
                traits: new Set(['migrant', 'legasthenie']),
            },
        ];

        const stats = aggregateStudentStats(rows);

        expect(stats.nrStudents).toBe(2);
        expect(stats.traitCounts).toEqual({ migrant: 2, legasthenie: 1 });
        expect(stats.genderCounts).toEqual({ female: 1, male: 1 });
    });

    it('counts one id in two groups as two students', () => {
        // Ids are only unique within a group in the SL payloads. The school section
        // of the group table aggregates across groups, so keying on the id alone would
        // merge two children.
        const rows = [
            { studentId: 's1', groupName: '8a', gender: 'female' },
            { studentId: 's1', groupName: '8b', gender: 'male' },
        ];

        const stats = aggregateStudentStats(rows);

        expect(stats.nrStudents).toBe(2);
        expect(stats.genderCounts).toEqual({ female: 1, male: 1 });
    });
});

describe('collectTraitCodesFromData', () => {
    it('gathers the distinct trait codes across all grouped students', () => {
        const groups = [
            {
                students: [
                    { traits: new Set(['migrant']) },
                    { traits: new Set(['migrant', 'legasthenie']) },
                ],
            },
            { students: [{ traits: new Set(['adhs']) }, {}] },
            { students: null },
        ];

        const codes = collectTraitCodesFromData(groups, (group) => group.students);

        expect(new Set(codes)).toEqual(new Set(['migrant', 'legasthenie', 'adhs']));
        expect(codes).toHaveLength(3); // distinct, no duplicates
    });
});
