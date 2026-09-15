import { describe, expect, it } from 'vitest';

import { createStackedData } from '@tba3/modules/sl/modules/charts/competency/shared/competencyChartData.js';

describe('createStackedData', () => {
    it('stacks each level onto the running total, in the order it is given the levels', () => {
        const stacked = createStackedData(
            [{ name: '8a', distribution: { I: 20, II: 30, III: 50 } }],
            ['I', 'II', 'III'],
        );

        expect(stacked[0]).toMatchObject({
            name: '8a',
            I_start: 0,
            I_end: 20,
            I_value: 20,
            II_start: 20,
            II_end: 50,
            II_value: 30,
            III_start: 50,
            III_end: 100,
            III_value: 50,
        });
    });

    it('treats a row with no distribution as all-zero instead of throwing', () => {
        // WHY: the Landesschnitt tracks of the Kompetenzstufen overview are drawn from
        // `stateDistributions`, whose entries need not carry a `distribution` — a state
        // that reported no figures for a domain still has a row. That case used to be
        // handled by a private copy of this function in competencyOverviewRenderer.js;
        // the copy was deleted, so the guard has to live here or the overview throws.
        const stacked = createStackedData([{ key: 'nrw', name: 'Landesschnitt' }], ['I', 'II']);

        expect(stacked[0]).toMatchObject({
            key: 'nrw',
            I_start: 0,
            I_end: 0,
            I_value: 0,
            II_start: 0,
            II_end: 0,
            II_value: 0,
        });
    });
});
