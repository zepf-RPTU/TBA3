import { describe, it, expect } from 'vitest';
import {
    aggregateStudentStats,
    collectTraitNamesFromData,
} from '@tba3/modules/sl/utils/slStudentStats.js';

describe('aggregateStudentStats', () => {
    it('returns an empty aggregate for no input', () => {
        const { stats } = aggregateStudentStats([]);
        expect(stats).toEqual({ nrStudents: 0, traitCounts: {}, genderCounts: {} });
        expect(aggregateStudentStats(null).stats.nrStudents).toBe(0);
    });

    it('counts each student once even when the row repeats per domain', () => {
        // WHY: a subject split into Domänen carries one row per (student × Domäne), so
        // the same student recurs; nrStudents and the counts must reflect UNIQUE students.
        const rows = [
            { studentId: 's1', stammklasse: '8a', gender: 'w', traits: new Set(['migrant']) },
            { studentId: 's1', stammklasse: '8a', gender: 'w', traits: new Set(['migrant']) },
            {
                studentId: 's2',
                stammklasse: '8a',
                gender: 'm',
                traits: new Set(['migrant', 'legasthenie']),
            },
        ];

        const { stats } = aggregateStudentStats(rows);

        expect(stats.nrStudents).toBe(2);
        expect(stats.traitCounts).toEqual({ migrant: 2, legasthenie: 1 });
        expect(stats.genderCounts).toEqual({ w: 1, m: 1 });
    });

    it('counts one id in two classes as two students', () => {
        // WHY: ids are only unique within a class in the SL payloads. The school section
        // of the class table aggregates across classes, so keying on the id alone would
        // merge two children.
        const rows = [
            { studentId: 's1', stammklasse: '8a', gender: 'female' },
            { studentId: 's1', stammklasse: '8b', gender: 'male' },
        ];

        const { stats } = aggregateStudentStats(rows);

        expect(stats.nrStudents).toBe(2);
        expect(stats.genderCounts).toEqual({ female: 1, male: 1 });
    });
});

describe('collectTraitNamesFromData', () => {
    it('gathers the distinct trait names across all grouped students', () => {
        const groups = [
            {
                students: [
                    { traits: new Set(['migrant']) },
                    { traits: new Set(['migrant', 'legasthenie']) },
                ],
            },
            { students: [{ traits: new Set(['adhs']) }, { traits: null }] },
            { students: null },
        ];

        const names = collectTraitNamesFromData(groups, (group) => group.students);

        expect(new Set(names)).toEqual(new Set(['migrant', 'legasthenie', 'adhs']));
        expect(names).toHaveLength(3); // distinct, no duplicates
    });
});
