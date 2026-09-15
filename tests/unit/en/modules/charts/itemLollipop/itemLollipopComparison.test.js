import { describe, expect, it } from 'vitest';

import { resolveComparisonGroups } from '@tba3/modules/en/modules/charts/itemLollipop/itemLollipopComparison.js';

const group = (id, means) => ({
    id,
    type: 'state',
    name: id,
    typeIndex: 0,
    shortLabel: null,
    meanMap: new Map(means),
});

describe('resolveComparisonGroups', () => {
    it('draws every group the items document carries, whatever aggregation.json lists', () => {
        // WHY: the markers were drawn only for groups aggregation.json names, while the
        // app seeds a toggle for every group items.json carries — a group only the items
        // document delivered got a ⌀ toggle and never a marker.
        const groups = resolveComparisonGroups({
            // aggregation.json lists only the Schulschnitt here.
            enConfig: { comparisonModeIds: ['school'] },
            itemComparisonGroups: [
                group('school', [['EL1', 50]]),
                group('items-only', [['EL1', 40]]),
            ],
        });

        expect(groups.map((g) => g.id)).toEqual(['school', 'items-only']);
        expect(groups[1]).toMatchObject({
            name: 'items-only',
            markerClass: 'comparison-average-marker-1',
            legendClass: 'comparison-legend-1',
        });
    });

    it('skips a group without any item mean', () => {
        // WHY: a group with no values would get a legend row and a toggle for a series
        // that draws nothing.
        const groups = resolveComparisonGroups({
            itemComparisonGroups: [group('empty', []), group('hb', [['EL1', 40]])],
        });

        expect(groups.map((g) => g.id)).toEqual(['hb']);
    });
});
