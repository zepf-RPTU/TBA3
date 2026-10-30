import { describe, it, expect } from 'vitest';
import {
    buildCompetenceLevelIndex,
    findSoleStateTrack,
} from '../../src/sl/slCompetenceLevelIndex.js';
import { levelsValueGroup } from '../support/competenceLevelGroups.js';

/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/**
 * A `competence-levels.json` with one school aggregate, two state tracks whose
 * ids/names are track-specific (an id/name test recognises none of them and counts
 * them as groups), plus groups across two subjects.
 */
const SPLIT_STATE_PAYLOAD = [
    {
        id: '1001',
        type: 'group',
        name: '08a',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [
            { nameShort: '1a', name: 'Stufe 1a', descriptiveStatistics: { mean: 1 } },
        ],
    },
    {
        id: '1002',
        type: 'group',
        name: '08b',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [
            { nameShort: '1a', name: 'Stufe 1a', descriptiveStatistics: { mean: 1 } },
        ],
    },
    {
        id: 'NW000001',
        type: 'school',
        name: 'Gesamtschule Musterstadt',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [
            { nameShort: '1a', name: 'Stufe 1a', descriptiveStatistics: { mean: 1 } },
        ],
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
        competenceLevels: [{ nameShort: 'I', name: 'Stufe I', descriptiveStatistics: { mean: 1 } }],
    },
    { id: 'nw-msa', type: 'state', name: 'Landesschnitt MSA', subject: { name: 'Mathematik' } },
].map(levelsValueGroup);

describe('buildCompetenceLevelIndex', () => {
    it('counts only type=group value groups as groups, never another comparison type', () => {
        // Every comparison type the spec allows is a reference, not one of the
        // school's groups. A district average falling through "not school, not
        // state" would be listed, ranked and named as a Lerngruppe.
        const district = levelsValueGroup({
            id: 'bezirk-nord',
            type: 'district',
            name: 'Bezirksschnitt Nord',
            subject: { name: 'Deutsch' },
            domain: { id: 'le', name: 'Lesen' },
            competenceLevels: [
                { nameShort: '1a', name: 'Stufe 1a', descriptiveStatistics: { mean: 1 } },
            ],
        });

        const index = buildCompetenceLevelIndex([...SPLIT_STATE_PAYLOAD, district]);

        expect(index.groups.map((group) => group.name)).toEqual(['08a', '08b', '08a']);
    });

    it('keeps a comparison type it has no name for, as EN and MA do', () => {
        // The spec's `type` is open. Listing `state` as the only comparison would drop
        // every other population from every SL view while the EN and MA dashboards of the
        // same export draw it.
        const district = levelsValueGroup({
            id: 'bezirk-nord',
            type: 'district',
            name: 'Bezirksschnitt Nord',
            subject: { name: 'Deutsch' },
            domain: { id: 'le', name: 'Lesen' },
        });

        const index = buildCompetenceLevelIndex([...SPLIT_STATE_PAYLOAD, district]);

        expect(index.comparisonTracks).toEqual([
            { id: 'nw-hsa-gk', name: 'Landesschnitt HSA-GK', type: 'state' },
            { id: 'nw-msa', name: 'Landesschnitt MSA', type: 'state' },
            { id: 'bezirk-nord', name: 'Bezirksschnitt Nord', type: 'district' },
        ]);
        expect(index.comparisons.some((comparison) => comparison.type === 'school')).toBe(false);
    });

    it('names a sole Landesschnitt only when the payload delivers exactly one state track', () => {
        // A sentence about "der Landesschnitt" has nothing to mean when the state
        // splits it by track, and pooling the tracks yields a number no chart shows.
        const split = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);
        const single = buildCompetenceLevelIndex(
            SPLIT_STATE_PAYLOAD.filter((valueGroup) => valueGroup.id !== 'nw-msa'),
        );

        expect(findSoleStateTrack(split)).toBeNull();
        expect(findSoleStateTrack(single)?.id).toBe('nw-hsa-gk');
        expect(findSoleStateTrack(buildCompetenceLevelIndex([]))).toBeNull();
    });

    it('puts every state track into comparisons and none into groups', () => {
        // Discrimination must be by `type`: the nw tracks carry ids like 'nw-hsa-gk'
        // and names like 'Landesschnitt HSA-GK' that no id/name literal matches.
        // Otherwise every track is drawn as an extra class and the
        // Landesschnitt comparison comes back empty (see `isExternalPopulation`).
        const index = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);

        expect(index.comparisons.map((comparison) => comparison.name)).toEqual([
            'Landesschnitt HSA-GK',
            'Landesschnitt MSA',
            'Landesschnitt MSA',
        ]);
        expect(index.groups.some((group) => group.type === 'state')).toBe(false);
    });

    it('takes schoolId from the type-discriminated school value group and collects its aggregates', () => {
        const index = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);

        expect(index.schoolId).toBe('NW000001');
        expect(index.schools.map((school) => school.name)).toEqual(['Gesamtschule Musterstadt']);
    });

    it('derives one subjectDomains entry per Fach and groups the groups by Fach|Domäne', () => {
        const index = buildCompetenceLevelIndex(SPLIT_STATE_PAYLOAD);

        expect(index.subjectDomains.map((subject) => subject.subjectName)).toEqual([
            'Deutsch',
            'Mathematik',
        ]);
        // One group per (Fach, Domäne) pair the groups sat, in payload order —
        // the shape the Überblick charts render one chart group from.
        expect(
            index.groupsBySubjectDomain.map((groups) => groups.map((group) => group.name)),
        ).toEqual([['08a', '08b'], ['08a']]);
    });

    it('yields the empty index for a missing or empty payload', () => {
        // Callers guard with `if (!index.schoolId) return []` — a missing payload
        // must read as "no school", not throw.
        for (const payload of [[], undefined, null]) {
            const index = buildCompetenceLevelIndex(payload);
            expect(index.schoolId).toBeNull();
            expect(index.schools).toEqual([]);
            expect(index.groups).toEqual([]);
            expect(index.comparisons).toEqual([]);
            expect(index.subjectDomains).toEqual([]);
            expect(index.groupsBySubjectDomain).toEqual([]);
        }
    });

    it('treats every non-state value group as a group when no school value group exists', () => {
        // A payload without a school aggregate still renders its group charts.
        const noSchool = SPLIT_STATE_PAYLOAD.filter((valueGroup) => valueGroup.type !== 'school');
        const index = buildCompetenceLevelIndex(noSchool);

        expect(index.schoolId).toBeNull();
        expect(index.schools).toEqual([]);
        expect(index.groups).toHaveLength(3);
    });
});
