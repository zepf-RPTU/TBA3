import { describe, expect, it } from 'vitest';

import { SL_DATASETS } from '../../src/sl/index.js';
import { levelsValueGroup } from '../support/competenceLevelGroups.js';
import { createSubjectContext } from '../support/subjectContext.js';

describe('SL_DATASETS.COMPARISON_IDS', () => {
    it('names every delivered reference average once, by the id the Überblick plots it under', async () => {
        // The app shows every id of this list at start, and the ⌀ toggles and the
        // summary cards key the same population by its payload id; a track delivered for
        // two subjects is still one population with one toggle.
        const store = (
            await createSubjectContext('sl', {
                documents: {
                    'competence-levels.json': [
                        {
                            id: '1001',
                            type: 'group',
                            subject: { name: 'Deutsch' },
                            domain: { id: 'le', name: 'Lesen' },
                        },
                        {
                            id: 'nw-hsa',
                            type: 'state',
                            subject: { name: 'Deutsch' },
                            domain: { id: 'le', name: 'Lesen' },
                        },
                        {
                            id: 'nw-msa',
                            type: 'state',
                            subject: { name: 'Deutsch' },
                            domain: { id: 'le', name: 'Lesen' },
                        },
                        { id: 'nw-msa', type: 'state', subject: { name: 'Mathematik' } },
                    ].map(levelsValueGroup),
                },
            })
        ).documents;

        expect(store.getDataset(SL_DATASETS.COMPARISON_IDS)).toEqual(['nw-hsa', 'nw-msa']);
    });
});
