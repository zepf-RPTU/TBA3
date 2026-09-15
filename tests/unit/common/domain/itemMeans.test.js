/**
 * `buildItemMeansMap` — the one iqbId → percentage lookup the EN and MA item charts
 * draw their benchmark markers from. Shared so the two apps cannot disagree about
 * what a comparison population scored on an item.
 */

import { describe, expect, it } from 'vitest';

import { buildItemMeansMap } from '@tba3/modules/common/domain/itemMeans.js';

const group = (items) => ({ id: 'state', type: 'state', name: 'Landesschnitt', items });
const item = (iqbId, mean) => ({
    iqbId,
    descriptiveStatistics: mean === undefined ? {} : { mean },
});

describe('buildItemMeansMap', () => {
    it('converts each item mean to a percentage, keyed by iqbId', () => {
        const means = buildItemMeansMap([group([item('A1', 0.625), item('A2', 1)])]);

        expect(means.get('A1')).toBeCloseTo(62.5, 10);
        expect(means.get('A2')).toBe(100);
    });

    it('leaves an item without a finite mean out instead of reporting 0 %', () => {
        // WHY: a marker at 0 % reads as "the state scored nothing on this item". The
        // charts warn about a missing entry and draw no marker; MA's former copy
        // wrote `mean ?? 0` and plotted that 0 as a real value.
        const means = buildItemMeansMap([
            group([item('A1'), item('A2', Number.NaN), item('A3', 0.4)]),
        ]);

        expect([...means.keys()]).toEqual(['A3']);
    });

    it('tolerates a missing group list and groups without items', () => {
        expect(buildItemMeansMap(null).size).toBe(0);
        expect(buildItemMeansMap([{ id: 'x' }]).size).toBe(0);
    });
});
