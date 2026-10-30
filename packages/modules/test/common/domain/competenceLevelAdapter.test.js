/**
 * competenceLevelAdapter — the one place a competence-levels payload becomes shares,
 * counts and the group's own value group.
 */

import { describe, expect, it } from 'vitest';

import {
    parseCompetenceLevels,
    toStackedChartData,
} from '../../../src/common/domain/competenceLevelAdapter.js';
import { CompetenceLevelPalette } from '../../../src/common/context/index.js';

/** An empty palette: the payloads' ladders are unregistered, so no `scaleId` resolves. */
const palette = new CompetenceLevelPalette();
import {
    roundedMeanValueGroup,
    STATE,
    SCHOOL,
    GROUP,
} from '../../support/competenceLevelGroups.js';

describe('parseCompetenceLevels', () => {
    it('derives each share from frequency / total, so a stack reaches 100 %', () => {
        // The server rounds `mean` to four decimal places. Three thirds read off
        // `mean` stack to 99.99 % and leave a sliver of the bar unpainted.
        const groupResultRows = parseCompetenceLevels(palette, [STATE, SCHOOL, GROUP]).groups[2];
        const stacked = Object.values(groupResultRows.percentages).reduce((sum, v) => sum + v, 0);

        expect(groupResultRows.percentages.A1).toBeCloseTo(100 / 3, 10);
        expect(stacked).toBeCloseTo(100, 10);
        expect(groupResultRows.counts).toEqual({ A1: 1, A2: 1, B1: 1 });
        expect(groupResultRows.total).toBe(3);
    });

    it('reads a group with no students as 0 % in every band, with a total of 0', () => {
        // One percent reader serves the bars and the Verlauf timeline, and every
        // band it names gets a number; the group's total of 0 is what says nobody sat.
        const empty = roundedMeanValueGroup({
            id: '8b-en',
            type: 'group',
            name: '8b',
            frequencies: { A1: 0, A2: 0 },
        });

        const [group] = parseCompetenceLevels(palette, [empty]).groups;

        expect(group.percentages).toEqual({ A1: 0, A2: 0 });
        expect(group.counts).toEqual({ A1: 0, A2: 0 });
        expect(group.total).toBe(0);
    });

    it('draws a Landesschnitt that ships shares without headcounts from its means', () => {
        // A state source may store no headcounts; its shares are the same quantity
        // the info-box sentences already read, so the chart must not show an empty bar.
        const meanOnly = {
            id: 'state',
            type: 'state',
            name: 'Landesschnitt',
            competenceLevels: [
                { nameShort: 'A1', descriptiveStatistics: { mean: 0.25 } },
                { nameShort: 'A2', descriptiveStatistics: { mean: 0.75 } },
            ],
        };

        const [group] = parseCompetenceLevels(palette, [meanOnly]).groups;

        expect(group.percentages).toEqual({ A1: 25, A2: 75 });
        expect(group.total).toBe(0);
    });
});

describe('toStackedChartData', () => {
    it("gives every row its own group's counts and total", () => {
        // The competence-level tooltip multiplies each bar's share by that bar's total, never the
        // first row's; each bar has to carry the headcount of its own population.
        const { groups, levels } = parseCompetenceLevels(palette, [STATE, SCHOOL, GROUP]);

        const rows = toStackedChartData(groups, levels);

        expect(rows.map((row) => [row.label, row.total])).toEqual([
            ['Landesschnitt', 1000],
            ['Schulschnitt', 30],
            ['8a', 3],
        ]);
        expect(rows[1].counts).toEqual({ A1: 7, A2: 13, B1: 10 });
        expect(rows[2].B1).toBeCloseTo(100 / 3, 10);
    });
});
