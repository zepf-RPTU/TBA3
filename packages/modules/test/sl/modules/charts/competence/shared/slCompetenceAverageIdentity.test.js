import { describe, expect, it } from 'vitest';

import { prepareCompetenceDetailChartData } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailData.js';
import { buildCompetenceLevelIndex } from '../../../../../../src/sl/slCompetenceLevelIndex.js';
import { readingValueGroup as competenceValueGroup } from '../../../../../support/slValueGroupFactories.js';
import { createTestContext } from '../../../../../support/glossaryFixture.js';

const { palette } = createTestContext('sl');

describe('prepareCompetenceDetailChartData average identity', () => {
    it('keeps multiple persisted Landesschnitt tracks as separate chart entries', () => {
        // An export can ship several state tracks for one subject/domain. Each needs
        // its own render key so the layout gives it a slot instead of overwriting the
        // first Landesschnitt.
        const groups = [
            competenceValueGroup({ id: '8a', type: 'group', name: '8a', counts: { I: 2, II: 8 } }),
        ];
        const comparisons = [
            competenceValueGroup({
                id: 'nw-gy',
                type: 'state',
                name: 'Landesschnitt GY',
                counts: { I: 3, II: 7 },
            }),
            competenceValueGroup({
                id: 'nw-msa',
                type: 'state',
                name: 'Landesschnitt MSA',
                counts: { I: 4, II: 6 },
            }),
        ];

        const chartData = prepareCompetenceDetailChartData(palette, [groups], {
            index: buildCompetenceLevelIndex([...groups, ...comparisons]),
        });

        const states = chartData.filter((entry) => entry.type === 'comparison');
        expect(states[0].percentages.I).toBeCloseTo(30, 10);
        expect(states[1].percentages.I).toBeCloseTo(40, 10);
        expect(states.map((entry) => entry.renderKey)).toEqual([
            'comparison:nw-gy',
            'comparison:nw-msa',
        ]);
        expect(states.map((entry) => entry.name)).toEqual([
            'Landesschnitt GY',
            'Landesschnitt MSA',
        ]);
    });

    it('omits the Landesschnitt entry when no persisted distribution exists', () => {
        // Copying the school distribution makes missing data look like a perfect
        // match. Missing comparison data removes the comparison instead; comparison value groups
        // are optional, so their absence is no warning.
        const groups = [
            competenceValueGroup({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Mathematik Missing State',
                domainId: null,
                domainName: null,
                counts: { I: 2, II: 8 },
            }),
        ];

        const chartData = prepareCompetenceDetailChartData(palette, [groups], {
            index: buildCompetenceLevelIndex(groups),
        });

        expect(chartData.some((entry) => entry.type === 'comparison')).toBe(false);
    });
});
