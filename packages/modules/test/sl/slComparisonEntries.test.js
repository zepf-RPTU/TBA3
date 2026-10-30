import { describe, it, expect } from 'vitest';
import { buildCompetenceLevelIndex } from '../../src/sl/slCompetenceLevelIndex.js';
import { levelsValueGroup } from '../support/competenceLevelGroups.js';

/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup} CurrentCompetenceLevelsValueGroup */

/**
 * A `competence-levels.json` with one school aggregate, two state tracks and the
 * groups, all for the same subject/domain.
 */
const SPLIT_STATE_PAYLOAD = [
    {
        id: '1001',
        type: 'group',
        name: '08a',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
    },
    {
        id: 'NW000001',
        type: 'school',
        name: 'Gesamtschule Musterstadt',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
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
        id: 'nw-msa',
        type: 'state',
        name: 'Landesschnitt MSA',
        subject: { name: 'Englisch' },
        domain: { id: 'ho', name: 'Hören' },
    },
    { id: 'nw-msa', type: 'state', name: 'Landesschnitt MSA', subject: { name: 'Mathematik' } },
].map(levelsValueGroup);

/**
 * The lookup the SL domain table draws its Landesschnitt rows from.
 * @param {CurrentCompetenceLevelsValueGroup[]|undefined} payload - `competence-levels.json`, if it arrived.
 * @returns {import('../../src/sl/slCompetenceLevelIndex.js').CompetenceLevelIndex['comparisonsFor']}
 */
const stateRowsFor = (payload) => buildCompetenceLevelIndex(payload).comparisonsFor;

describe('CompetenceLevelIndex.comparisonsFor', () => {
    it('returns every state track, not just the first', () => {
        // The domain table draws one row per returned entry. A `find()` here would
        // show nw's "Landesschnitt HSA-GK" only and never render MSA at all.
        const entries = stateRowsFor(SPLIT_STATE_PAYLOAD)('Deutsch', 'le');

        expect(entries.map((entry) => entry.name)).toEqual([
            'Landesschnitt HSA-GK',
            'Landesschnitt MSA',
        ]);
    });

    it('keeps subject and domain apart', () => {
        // 'le' exists under Deutsch and Englisch; matching on subject alone would
        // pull another domain's Landesschnitt into the row set.
        const entries = stateRowsFor(SPLIT_STATE_PAYLOAD)('Englisch', 'ho');

        expect(entries).toHaveLength(1);
        expect(entries[0].subject?.name).toBe('Englisch');
    });

    it('matches domainless subjects such as Mathematik', () => {
        const entries = stateRowsFor(SPLIT_STATE_PAYLOAD)('Mathematik', null);

        expect(entries.map((entry) => entry.id)).toEqual(['nw-msa']);
    });

    it('returns an empty list when the payload delivers no average for that domain', () => {
        // The table renders nothing rather than a placeholder "Landesschnitt" row —
        // an empty row would read as a delivered average with no data.
        expect(stateRowsFor(SPLIT_STATE_PAYLOAD)('Französisch', 'le')).toEqual([]);
        expect(stateRowsFor(undefined)('Deutsch', 'le')).toEqual([]);
    });
});
