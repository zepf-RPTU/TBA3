/**
 * competenceLevelAdapter — the one place a competence-levels payload becomes shares,
 * counts and a class row. The payloads here are spec-conformant but unlike the
 * fixtures: the class row comes last, the comparison populations are far larger than
 * the class, and the class's frequencies are thirds, whose server-rounded `mean` does
 * not stack to 100.
 */

import { describe, expect, it } from 'vitest';

import {
    findClassGroup,
    parseCompetenceLevels,
    toStackedChartData,
} from '@tba3/modules/common/charts/competenceLevelAdapter.js';

/** A value group as the server sends it: `mean` rounded to four decimal places. */
function valueGroup({ id, type, name, frequencies }) {
    const total = Object.values(frequencies).reduce((sum, frequency) => sum + frequency, 0);
    return {
        id,
        type,
        name,
        competenceLevels: Object.entries(frequencies).map(([nameShort, frequency]) => ({
            nameShort,
            descriptiveStatistics: {
                total,
                frequency,
                mean: total > 0 ? Math.round((frequency / total) * 1e4) / 1e4 : 0,
            },
        })),
    };
}

const STATE = valueGroup({
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    frequencies: { A1: 400, A2: 350, B1: 250 },
});
const SCHOOL = valueGroup({
    id: 'school',
    type: 'school',
    name: 'Schulschnitt',
    frequencies: { A1: 7, A2: 13, B1: 10 },
});
const CLASS = valueGroup({
    id: '8a-en',
    type: 'group',
    name: '8a',
    frequencies: { A1: 1, A2: 1, B1: 1 },
});

describe('parseCompetenceLevels', () => {
    it("keeps each value group's type, so the class can be told from a comparison", () => {
        const { groups } = parseCompetenceLevels([STATE, SCHOOL, CLASS]);

        expect(groups.map((group) => group.type)).toEqual(['state', 'school', 'group']);
    });

    it('derives each share from frequency / total, so a stack reaches 100 %', () => {
        // WHY: the server rounds `mean` to four decimal places. Three thirds read off
        // `mean` stack to 99.99 % and leave a sliver of the bar unpainted.
        const classGroup = parseCompetenceLevels([STATE, SCHOOL, CLASS]).groups[2];
        const stacked = Object.values(classGroup.percentages).reduce((sum, v) => sum + v, 0);

        expect(classGroup.percentages.A1).toBeCloseTo(100 / 3, 10);
        expect(stacked).toBeCloseTo(100, 10);
        expect(classGroup.counts).toEqual({ A1: 1, A2: 1, B1: 1 });
        expect(classGroup.total).toBe(3);
    });

    it('gives a group with no students no shares, rather than a row of zeros', () => {
        // WHY: 0 % in every band reads as a measured result. A class nobody sat has no
        // distribution at all.
        const empty = valueGroup({
            id: '8b-en',
            type: 'group',
            name: '8b',
            frequencies: { A1: 0, A2: 0 },
        });

        const [group] = parseCompetenceLevels([empty]).groups;

        expect(group.percentages).toEqual({});
        expect(group.counts).toEqual({ A1: 0, A2: 0 });
        expect(group.total).toBe(0);
    });
});

describe('findClassGroup', () => {
    it('finds the class by its type wherever it sits, never by position', () => {
        const { groups } = parseCompetenceLevels([STATE, SCHOOL, CLASS]);

        expect(findClassGroup(groups)?.id).toBe('8a-en');
    });

    it('finds nothing in a payload that carries only comparison rows', () => {
        expect(findClassGroup(parseCompetenceLevels([STATE, SCHOOL]).groups)).toBeNull();
    });
});

describe('toStackedChartData', () => {
    it("gives every row its own group's counts and total", () => {
        // WHY: the KS tooltip used to multiply every bar's share by the first row's
        // total; each bar has to carry the headcount of its own population.
        const { groups, levels } = parseCompetenceLevels([STATE, SCHOOL, CLASS]);

        const rows = toStackedChartData(groups, levels);

        expect(rows.map((row) => [row.group, row.total])).toEqual([
            ['Landesschnitt', 1000],
            ['Schulschnitt', 30],
            ['8a', 3],
        ]);
        expect(rows[1].counts).toEqual({ A1: 7, A2: 13, B1: 10 });
        expect(rows[2].B1_start).toBeCloseTo(200 / 3, 10);
    });
});
