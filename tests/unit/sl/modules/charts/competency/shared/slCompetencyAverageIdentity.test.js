import { describe, expect, it, vi } from 'vitest';

import { prepareCompetencyDetailChartData } from '@tba3/modules/sl/modules/charts/competency/shared/competencyChartData.js';

function competenceRow({
    id,
    type,
    name,
    subject = 'Deutsch',
    domainId = 'le',
    domainName = 'Leseverstehen',
    counts,
}) {
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
        id,
        type,
        name,
        subject: { id: null, name: subject },
        domain: { id: domainId, name: domainName },
        competenceLevels: Object.entries(counts).map(([nameShort, frequency]) => ({
            nameShort,
            name: nameShort,
            descriptiveStatistics: { total, mean: total > 0 ? frequency / total : 0, frequency },
        })),
    };
}

describe('prepareCompetencyDetailChartData average identity', () => {
    it('preserves persisted Landesschnitt identity separately from render type', () => {
        // WHY: the chart still needs its `landesschnitt` layout slot, but the payload
        // identity must survive so a split state track can stay "Landesschnitt GY".
        const classRows = [
            competenceRow({ id: '8a', type: 'group', name: '8a', counts: { I: 2, II: 8 } }),
        ];
        const stateRow = competenceRow({
            id: 'nw-gy',
            type: 'state',
            name: 'Landesschnitt GY',
            counts: { I: 3, II: 7 },
        });

        const chartData = prepareCompetencyDetailChartData(classRows, {
            lookupTeachingQuality: () => null,
            lookupLandesschnittDistribution: () => ({
                entry: stateRow,
                distribution: { I: 30, II: 70 },
                totalStudents: 10,
            }),
        });

        const state = chartData.find((entry) => entry.type === 'landesschnitt');
        expect(state).toMatchObject({
            name: 'Landesschnitt GY',
            renderType: 'landesschnitt',
            renderKey: 'state:nw-gy',
            sourceId: 'nw-gy',
            sourceName: 'Landesschnitt GY',
            sourceType: 'state',
        });
        expect(state.distribution).toEqual({ I: 30, II: 70 });
    });

    it('keeps multiple persisted Landesschnitt tracks as separate chart entries', () => {
        // WHY: NRW-style exports can ship multiple state tracks for the same
        // subject/domain. Each one needs its own render key so layout can allocate a
        // separate slot instead of overwriting the first Landesschnitt.
        const classRows = [
            competenceRow({ id: '8a', type: 'group', name: '8a', counts: { I: 2, II: 8 } }),
        ];
        const stateRows = [
            competenceRow({
                id: 'nw-gy',
                type: 'state',
                name: 'Landesschnitt GY',
                counts: { I: 3, II: 7 },
            }),
            competenceRow({
                id: 'nw-msa',
                type: 'state',
                name: 'Landesschnitt MSA',
                counts: { I: 4, II: 6 },
            }),
        ];

        const chartData = prepareCompetencyDetailChartData(classRows, {
            lookupTeachingQuality: () => null,
            lookupLandesschnittDistribution: () =>
                stateRows.map((entry) => ({
                    entry,
                    distribution: entry.id === 'nw-gy' ? { I: 30, II: 70 } : { I: 40, II: 60 },
                    totalStudents: 10,
                })),
        });

        const states = chartData.filter((entry) => entry.type === 'landesschnitt');
        expect(states.map((entry) => entry.sourceId)).toEqual(['nw-gy', 'nw-msa']);
        expect(states.map((entry) => entry.renderKey)).toEqual(['state:nw-gy', 'state:nw-msa']);
        expect(states.map((entry) => entry.name)).toEqual([
            'Landesschnitt GY',
            'Landesschnitt MSA',
        ]);
    });

    it('omits the Landesschnitt entry when no persisted distribution exists', () => {
        // WHY: copying the school distribution makes missing data look like a perfect
        // match. Missing comparison data should remove the comparison and warn instead.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const classRows = [
            competenceRow({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Mathematik Missing State',
                domainId: null,
                domainName: null,
                counts: { I: 2, II: 8 },
            }),
        ];

        const chartData = prepareCompetencyDetailChartData(classRows, {
            lookupTeachingQuality: () => null,
            lookupLandesschnittDistribution: () => null,
        });

        expect(chartData.some((entry) => entry.type === 'landesschnitt')).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('Missing Landesschnitt distribution'),
        );
        warn.mockRestore();
    });
});
