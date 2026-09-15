import { describe, it, expect } from 'vitest';
import { buildCompetenceLevelIndex } from '@tba3/modules/sl/slCompetenceLevelIndex.js';

/**
 * `competence-levels.json` shaped like an NRW school export: one school aggregate,
 * two state tracks whose ids/names are track-specific (an id/name test recognises
 * none of them — the bug that once counted 13 "classes" for a five-class school),
 * plus class rows across two subjects.
 */
const SPLIT_STATE_PAYLOAD = [
    {
        id: '1001',
        type: 'group',
        name: '08a',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [{ nameShort: '1a', name: 'Stufe 1a' }],
    },
    {
        id: '1002',
        type: 'group',
        name: '08b',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [{ nameShort: '1a', name: 'Stufe 1a' }],
    },
    {
        id: 'NW000001',
        type: 'school',
        name: 'Gesamtschule Musterstadt',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [{ nameShort: '1a', name: 'Stufe 1a' }],
    },
    {
        id: 'nw-hsa-gk',
        type: 'state',
        name: 'Landesschnitt HSA-GK',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
    },
    {
        id: 'nw-msa',
        type: 'state',
        name: 'Landesschnitt MSA',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
    },
    {
        id: '1001',
        type: 'group',
        name: '08a',
        subject: { name: 'Mathematik' },
        competenceLevels: [{ nameShort: 'I', name: 'Stufe I' }],
    },
    { id: 'nw-msa', type: 'state', name: 'Landesschnitt MSA', subject: { name: 'Mathematik' } },
];

describe('buildCompetenceLevelIndex', () => {
    it('counts only type=group rows as classes, never another comparison type', () => {
        // WHY: every comparison type the spec allows is a reference, not one of the
        // school's classes. A district average once fell through "not school, not
        // state" and was listed, ranked and named as a Klasse.
        const district = {
            id: 'bezirk-nord',
            type: 'district',
            name: 'Bezirksschnitt Nord',
            subject: { name: 'Deutsch' },
            domain: { id: 'le', name: 'Lesen' },
            competenceLevels: [{ nameShort: '1a', name: 'Stufe 1a' }],
        };

        const index = buildCompetenceLevelIndex([...SPLIT_STATE_PAYLOAD, district]);

        expect(index.classRows.map((row) => row.name)).toEqual(['08a', '08b', '08a']);
    });

    it('puts every state track into stateRows and none into classRows', () => {
        // Discrimination must be by `type`: the nw tracks carry ids like 'nw-hsa-gk'
        // and names like 'Landesschnitt HSA-GK' that no id/name literal matches.
        // When this broke, every track row was drawn as an extra class and the
        // Landesschnitt comparison came back empty (slDataService isStateEntry doc).
        const index = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);

        expect(index.stateRows.map((row) => row.name)).toEqual([
            'Landesschnitt HSA-GK',
            'Landesschnitt MSA',
            'Landesschnitt MSA',
        ]);
        expect(index.classRows.some((row) => row.type === 'state')).toBe(false);
    });

    it('takes schoolId from the type-discriminated school row and collects its aggregates', () => {
        const index = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);

        expect(index.schoolId).toBe('NW000001');
        expect(index.schoolRows.map((row) => row.name)).toEqual(['Gesamtschule Musterstadt']);
    });

    it('keeps only group rows as classes', () => {
        const index = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);

        expect(index.classRows.every((row) => row.type === 'group')).toBe(true);
        expect(index.classRows).toHaveLength(3);
    });

    it('derives one subjectDomains entry per Fach and groups classRows by Fach|Domäne', () => {
        const index = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);

        expect(index.subjectDomains.map((subject) => subject.subjectName)).toEqual([
            'Deutsch',
            'Mathematik',
        ]);
        // One group per (Fach, Domäne) pair the classes sat, in payload order —
        // the shape the Überblick charts render one chart group from.
        expect(index.classGroups.map((group) => group.map((row) => row.name))).toEqual([
            ['08a', '08b'],
            ['08a'],
        ]);
    });

    it('yields the empty index for a missing or empty payload', () => {
        // Callers guard with `if (!index.schoolId) return []` — a missing payload
        // must read as "no school", not throw.
        for (const payload of [[], undefined, null]) {
            const index = buildCompetenceLevelIndex(payload);
            expect(index.schoolId).toBeNull();
            expect(index.schoolRows).toEqual([]);
            expect(index.classRows).toEqual([]);
            expect(index.stateRows).toEqual([]);
            expect(index.subjectDomains).toEqual([]);
            expect(index.classGroups).toEqual([]);
        }
    });

    it('treats every non-state row as a class when no school row exists', () => {
        // Preserves filterClassEntries(data, null) semantics: a payload without a
        // school aggregate still renders its class charts.
        const noSchool = SPLIT_STATE_PAYLOAD.filter((row) => row.type !== 'school');
        const index = buildCompetenceLevelIndex(noSchool);

        expect(index.schoolId).toBeNull();
        expect(index.schoolRows).toEqual([]);
        expect(index.classRows).toHaveLength(3);
    });
});
