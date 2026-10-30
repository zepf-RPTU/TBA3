import { describe, expect, it } from 'vitest';

import { comparisonIds } from '../../../src/common/domain/comparisonIds.js';

/**
 * @param {{id: string, type: string, name: string}} fields
 */
const valueGroup = (fields) => ({ competenceLevels: [], properties: [], ...fields });

describe('comparisonIds', () => {
    it("lists the comparison value groups by id and leaves the group's own out", () => {
        const ids = comparisonIds([
            valueGroup({ id: 'g1', type: 'group', name: 'Lerngruppe 3a' }),
            valueGroup({ id: 'school', type: 'school', name: 'Schulschnitt' }),
            valueGroup({ id: 'nw-g', type: 'state', name: 'Landesschnitt GY' }),
        ]);

        expect(ids).toEqual(['school', 'nw-g']);
    });

    it('adds the populations other documents carry, each id once', () => {
        const ids = comparisonIds(
            [valueGroup({ id: 'school', type: 'school', name: 'Schulschnitt' })],
            [{ id: 'school' }, { id: 'state' }],
            [{ id: 'state' }, { id: 'bund' }],
        );

        expect(ids).toEqual(['school', 'state', 'bund']);
    });
});
