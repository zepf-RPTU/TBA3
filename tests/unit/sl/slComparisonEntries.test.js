import { describe, it, expect } from 'vitest';
import { findComparisonEntriesForSubjectDomain } from '@tba3/modules/sl/slCompetenceLevelIndex.js';

/**
 * `competence-levels.json` shaped like an NRW school export: one school aggregate,
 * two state tracks and the class rows, all for the same subject/domain.
 */
const SPLIT_STATE_PAYLOAD = [
    { id: '1001', type: 'group', name: '08a', subject: { name: 'Deutsch' }, domain: { id: 'le' } },
    {
        id: 'NW000001',
        type: 'school',
        name: 'Gesamtschule Musterstadt',
        subject: { name: 'Deutsch' },
        domain: { id: 'le' },
    },
    {
        id: 'nw-hsa-gk',
        type: 'state',
        name: 'Landesschnitt HSA-GK',
        subject: { name: 'Deutsch' },
        domain: { id: 'le' },
    },
    {
        id: 'nw-msa',
        type: 'state',
        name: 'Landesschnitt MSA',
        subject: { name: 'Deutsch' },
        domain: { id: 'le' },
    },
    {
        id: 'nw-msa',
        type: 'state',
        name: 'Landesschnitt MSA',
        subject: { name: 'Englisch' },
        domain: { id: 'ho' },
    },
    { id: 'nw-msa', type: 'state', name: 'Landesschnitt MSA', subject: { name: 'Mathematik' } },
];

describe('findComparisonEntriesForSubjectDomain', () => {
    it('returns every state track, not just the first', () => {
        // The domain table draws one row per returned entry. A `find()` here meant
        // nw showed "Landesschnitt HSA-GK" only, and MSA was never rendered at all.
        const entries = findComparisonEntriesForSubjectDomain(SPLIT_STATE_PAYLOAD, 'Deutsch', 'le');

        expect(entries.map((entry) => entry.name)).toEqual([
            'Gesamtschule Musterstadt',
            'Landesschnitt HSA-GK',
            'Landesschnitt MSA',
        ]);
    });

    it('excludes class entries so they cannot be drawn as an average', () => {
        const entries = findComparisonEntriesForSubjectDomain(SPLIT_STATE_PAYLOAD, 'Deutsch', 'le');

        expect(entries.some((entry) => entry.type === 'group')).toBe(false);
    });

    it('keeps subject and domain apart', () => {
        // 'le' exists under Deutsch and Englisch; matching on subject alone would
        // pull another domain's Landesschnitt into the row set.
        const entries = findComparisonEntriesForSubjectDomain(
            SPLIT_STATE_PAYLOAD,
            'Englisch',
            'ho',
        );

        expect(entries).toHaveLength(1);
        expect(entries[0].subject.name).toBe('Englisch');
    });

    it('matches domainless subjects such as Mathematik', () => {
        const entries = findComparisonEntriesForSubjectDomain(
            SPLIT_STATE_PAYLOAD,
            'Mathematik',
            null,
        );

        expect(entries.map((entry) => entry.id)).toEqual(['nw-msa']);
    });

    it('returns an empty list when the payload delivers no average for that domain', () => {
        // The table renders nothing rather than a placeholder "Landesschnitt" row —
        // an empty row would read as a delivered average with no data.
        expect(
            findComparisonEntriesForSubjectDomain(SPLIT_STATE_PAYLOAD, 'Französisch', 'le'),
        ).toEqual([]);
        expect(findComparisonEntriesForSubjectDomain(undefined, 'Deutsch', 'le')).toEqual([]);
    });
});
