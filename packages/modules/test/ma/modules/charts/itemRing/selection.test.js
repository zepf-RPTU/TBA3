// Who a ring stands for besides the group: judged once per draw, so the figures, the
// student tick and every line naming the selection agree on it.

import { describe, expect, it } from 'vitest';
import { ringSelection } from '../../../../../src/ma/modules/charts/itemRing/selection.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';

// The label for several is glossary copy (`ma.item.item-ring-grid.tooltips`).
const { glossary } = createTestContext('ma');

describe('ringSelection', () => {
    const students = [
        { studentId: 'a', firstName: 'Ada', lastName: 'Lovelace' },
        { studentId: 'b', firstName: 'Bea', lastName: 'Berg' },
        { studentId: 'c', firstName: 'Cem', lastName: 'Celik' },
    ];

    it('is a subset for a proper, non-empty part of the group', () => {
        expect(ringSelection(glossary, ['a', 'b'], students)).toEqual({
            ids: ['a', 'b'],
            isSubset: true,
            name: 'Ausgewählte Schüler:innen',
        });
    });

    it('is no subset when everyone is selected', () => {
        // Selecting the whole group says the same thing as selecting nobody, and the
        // student tick would then sit on top of the group average it is meant to be
        // compared against.
        expect(ringSelection(glossary, ['a', 'b', 'c'], students)).toMatchObject({
            isSubset: false,
            name: '',
        });
    });

    it('is no subset when nothing is selected, and when no id matches', () => {
        expect(ringSelection(glossary, null, students).isSubset).toBe(false);
        expect(ringSelection(glossary, [], students).isSubset).toBe(false);
        expect(ringSelection(glossary, ['zzz'], students).isSubset).toBe(false);
    });

    it('names one student by their name', () => {
        expect(ringSelection(glossary, ['a'], students).name).toBe('Ada Lovelace');
    });
});
