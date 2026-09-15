import { describe, expect, it } from 'vitest';

import { competenceLevelComparisonIds } from '../../../../src/ma/utils/maComparisonGroups.js';

const row = (fields) => ({ competenceLevels: [], properties: [], ...fields });

describe('competenceLevelComparisonIds', () => {
    it('lists the comparison rows by id and leaves the class row out', () => {
        const ids = competenceLevelComparisonIds([
            row({ id: 'g1', type: 'group', name: 'Klasse 3a' }),
            row({ id: 'school', type: 'school', name: 'Schulschnitt' }),
            row({ id: 'nw-g', type: 'state', name: 'Landesschnitt GY' }),
        ]);

        expect(ids).toEqual(['school', 'nw-g']);
    });

    it('throws on a comparison row without an id instead of seeding the key "undefined"', () => {
        // WHY: the spec leaves a value group's `id` optional. Seeded as `undefined`, such a
        // row put a ticked toggle into the ⌀ menu that drew nothing and switched nothing.
        expect(() =>
            competenceLevelComparisonIds([
                row({ id: 'g1', type: 'group', name: 'Klasse 3a' }),
                row({ type: 'state', name: 'Landesschnitt' }),
            ]),
        ).toThrow(/missing required id: Landesschnitt/);
    });

    it('treats a blank id as missing', () => {
        expect(() =>
            competenceLevelComparisonIds([row({ id: '  ', type: 'school', name: 'Schulschnitt' })]),
        ).toThrow(/missing required id/);
    });
});
