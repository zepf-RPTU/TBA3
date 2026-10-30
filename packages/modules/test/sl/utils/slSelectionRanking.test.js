import { describe, it, expect } from 'vitest';
import { finiteRange, pickSelection } from '../../../src/sl/utils/slSelectionRanking.js';

const selections = [
    { groupName: '8b', share: 0.4 },
    { groupName: '8a', share: 0.4 },
    { groupName: '8c', share: 0.1 },
    { groupName: '8d', share: null },
    null,
];
/**
 * @param {import('../../../src/sl/utils/slSelectionRanking.js').InfoBoxSelection} selection
 * @returns {number} Its share; `NaN` when unmeasured.
 */
const byShare = (selection) => Number(selection.share ?? NaN);

describe('finiteRange', () => {
    it('reports both boundaries, skipping unmeasured figures', () => {
        expect(finiteRange([0.4, null, 0.1, NaN])).toEqual({ min: 0.1, max: 0.4 });
    });

    it('returns null when nothing is measurable', () => {
        expect(finiteRange([null])).toBeNull();
    });
});

describe('pickSelection', () => {
    it('picks the highest in max mode and the lowest in min mode, the group name breaking ties', () => {
        expect(pickSelection(selections, byShare, 'max')).toEqual({ groupName: '8a', share: 0.4 });
        expect(pickSelection(selections, byShare, 'min')).toEqual({ groupName: '8c', share: 0.1 });
    });

    it('breaks a tie at the low end by name too', () => {
        const tied = [
            { groupName: '8b', share: 0.1 },
            { groupName: '8a', share: 0.1 },
        ];

        expect(pickSelection(tied, byShare, 'min')).toEqual({ groupName: '8a', share: 0.1 });
    });

    it('breaks a tie between Domänen of one Fach by payload order', () => {
        // Fächer and Domänen keep the order the data delivers them in, so a tie
        // names the one delivered first, never the alphabetically first.
        const tied = [
            { subjectName: 'Deutsch', domainName: 'Zuhören', domainId: 'a', share: 0.5 },
            { subjectName: 'Deutsch', domainName: 'Lesen', domainId: 'b', share: 0.5 },
        ];

        expect(pickSelection(tied, byShare, 'max')?.domainName).toBe('Zuhören');
    });

    it('returns null when no selection has a finite figure', () => {
        expect(pickSelection([null, { share: NaN }], byShare, 'max')).toBeNull();
    });
});
