/**
 * SL Kompetenzstufen tooltips — every count is the bar's own, read off its row.
 *
 * The school here is larger than any class, and the Landesschnitt larger still, so a
 * count borrowed from the wrong population cannot pass for the right one.
 */

import { describe, expect, it } from 'vitest';

import {
    buildCompetencyTooltipRows,
    createStackedData,
    lookupLandesschnittDistribution,
    prepareCompetencyDetailChartData,
} from '@tba3/modules/sl/modules/charts/competency/shared/competencyChartData.js';

function competenceRow({ id, type, name, counts }) {
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
        id,
        type,
        name,
        subject: { id: null, name: 'Deutsch' },
        domain: { id: 'le', name: 'Leseverstehen' },
        competenceLevels: Object.entries(counts).map(([nameShort, frequency]) => ({
            nameShort,
            name: nameShort,
            descriptiveStatistics: {
                total,
                frequency,
                mean: Math.round((frequency / total) * 1e4) / 1e4,
            },
        })),
    };
}

const STATE_ROW = competenceRow({
    id: 'nw-gy',
    type: 'state',
    name: 'Landesschnitt GY',
    counts: { I: 300, II: 700 },
});

describe('buildCompetencyTooltipRows', () => {
    it("reads the bar's own count and headcount", () => {
        const [row] = createStackedData(
            [{ distribution: { I: 25, II: 75 }, counts: { I: 3, II: 9 }, totalStudents: 12 }],
            ['I', 'II'],
        );

        const { rows, studentCount } = buildCompetencyTooltipRows(row, 'I');

        expect(studentCount).toBe(3);
        expect(rows).toContainEqual({ label: 'Gesamtanzahl', value: 12 });
    });

    it('shows no count for a row that carries none, rather than estimating one', () => {
        const [row] = createStackedData(
            [{ distribution: { I: 25, II: 75 }, counts: null, totalStudents: 12 }],
            ['I', 'II'],
        );

        const { rows, studentCount } = buildCompetencyTooltipRows(row, 'I');

        expect(studentCount).toBeNull();
        expect(rows).toHaveLength(1);
    });
});

describe('the detail rows carry their own headcounts', () => {
    it("gives each class, the school and a Landesschnitt its own counts and total, and never lends a Landesschnitt the school's", () => {
        const classRows = [
            competenceRow({ id: '8a', type: 'group', name: '8a', counts: { I: 2, II: 8 } }),
            competenceRow({ id: '8b', type: 'group', name: '8b', counts: { I: 6, II: 4 } }),
        ];

        const chartData = prepareCompetencyDetailChartData(classRows, {
            lookupTeachingQuality: () => null,
            // A reference delivered without a headcount of its own.
            lookupLandesschnittDistribution: () => ({
                entry: STATE_ROW,
                distribution: { I: 30, II: 70 },
            }),
        });

        const byName = (name) => chartData.find((entry) => entry.name === name);
        expect(byName('8a')).toMatchObject({ counts: { I: 2, II: 8 }, totalStudents: 10 });
        expect(byName('Schulschnitt')).toMatchObject({
            counts: { I: 8, II: 12 },
            totalStudents: 20,
        });
        expect(byName('Landesschnitt GY')).toMatchObject({ counts: null, totalStudents: null });
    });

    it("hands a Landesschnitt reference the state row's own counts and total", () => {
        const [reference] = lookupLandesschnittDistribution([STATE_ROW], {
            subject: 'Deutsch',
            domain: 'le',
        });

        expect(reference).toMatchObject({ counts: { I: 300, II: 700 }, totalStudents: 1000 });
        expect(reference.distribution.I).toBeCloseTo(30, 10);
    });
});
