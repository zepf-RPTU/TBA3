/**
 * SL Kompetenzstufen tooltips — every count is the bar's own, read off its row.
 *
 * The school here is larger than any group, and the Landesschnitt larger still, so a
 * count borrowed from the wrong population cannot pass for the right one.
 */

import { describe, expect, it, vi } from 'vitest';

import {
    buildCompetenceTooltipRows,
    competenceBarCells,
    lookupComparisonDistributions,
} from '../../../../../../src/sl/modules/charts/competence/shared/competenceChartData.js';
import { prepareCompetenceDetailChartData } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailData.js';
import { buildCompetenceLevelIndex } from '../../../../../../src/sl/slCompetenceLevelIndex.js';
import { readingValueGroup as competenceValueGroup } from '../../../../../support/slValueGroupFactories.js';
import { required } from '../../../../../support/required.js';
import { TERM_CONSTANTS } from '../../../../../../src/common/domain/terms.js';
import { createTestContext } from '../../../../../support/glossaryFixture.js';

const { palette } = createTestContext('sl');

const STATE_ROW = competenceValueGroup({
    id: 'nw-gy',
    type: 'state',
    name: 'Landesschnitt GY',
    counts: { I: 300, II: 700 },
});

describe('buildCompetenceTooltipRows', () => {
    it('shows no count for a row that carries none, rather than estimating one', () => {
        const row = { percentages: { I: 25, II: 75 }, counts: null, total: 12 };

        const rows = buildCompetenceTooltipRows(row, 'I');

        expect(required(rows).map((r) => (r ? r.label : undefined))).not.toContain(
            TERM_CONSTANTS.STUDENT_COUNT,
        );
    });
});

describe('a Landesschnitt that delivers its shares alone', () => {
    // Its source stores no headcounts: every band states its `mean`, none a `total`.
    const sharesOnly = {
        ...STATE_ROW,
        competenceLevels: STATE_ROW.competenceLevels.map((level) => ({
            ...level,
            descriptiveStatistics: { mean: level.descriptiveStatistics.mean },
        })),
    };
    const [reference] = lookupComparisonDistributions(palette, [sharesOnly]);

    it('shows its share in the tooltip of the bar it draws, without a count', () => {
        const rows = required(buildCompetenceTooltipRows(reference, 'II'));
        const labels = rows.map((r) => (r ? r.label : undefined));

        expect(labels).toContain(TERM_CONSTANTS.SHARE);
        expect(labels).not.toContain(TERM_CONSTANTS.STUDENT_COUNT);
    });

    it('lists its shares in the data table, with no headcount and no counts', () => {
        const [headcount, first, second] = competenceBarCells(reference, ['I', 'II'], ['I', 'II']);

        expect(headcount.values).toEqual([null]);
        expect(first.values?.[0]).toBeCloseTo(30, 10);
        expect(first.values?.[1]).toBeNull();
        expect(second.values?.[0]).toBeCloseTo(70, 10);
    });
});

describe('the detail rows carry their own headcounts', () => {
    it("gives each group, the school and a Landesschnitt its own counts and total, and never lends a Landesschnitt the school's", () => {
        const groups = [
            competenceValueGroup({ id: '8a', type: 'group', name: '8a', counts: { I: 2, II: 8 } }),
            competenceValueGroup({ id: '8b', type: 'group', name: '8b', counts: { I: 6, II: 4 } }),
        ];

        const school = competenceValueGroup({
            id: 'school',
            type: 'school',
            name: 'Schule',
            counts: { I: 8, II: 12 },
        });

        const chartData = prepareCompetenceDetailChartData(palette, [groups], {
            index: buildCompetenceLevelIndex([...groups, school, STATE_ROW]),
        });

        /**
         * @param {string} name - A row's display name.
         * @returns {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailData.js').CompetenceChartRow|undefined}
         */
        const byName = (name) => chartData.find((entry) => entry.name === name);
        expect(byName('8a')).toMatchObject({ counts: { I: 2, II: 8 }, total: 10 });
        expect(byName('Schulschnitt')).toMatchObject({
            counts: { I: 8, II: 12 },
            total: 20,
        });
        expect(byName('Landesschnitt GY')).toMatchObject({
            counts: { I: 300, II: 700 },
            total: 1000,
        });
    });

    it('leaves the Schulschnitt empty when the payload ships no school value group', () => {
        // The groups' sum is another population — a student in no listed group is
        // missing from it — and the Überblick states the same gap as `NO_SCHOOL`.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const groups = [
            competenceValueGroup({ id: '8a', type: 'group', name: '8a', counts: { I: 2, II: 8 } }),
        ];

        const chartData = prepareCompetenceDetailChartData(palette, [groups], {
            index: buildCompetenceLevelIndex(groups),
        });

        expect(chartData.find((entry) => entry.type === 'school')).toMatchObject({
            percentages: {},
            total: 0,
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('No school value group'));
        warn.mockRestore();
    });

    it("reads the Schulschnitt from the school's own value group when the payload ships one", () => {
        // The school tested 30 students; its two listed groups hold only 20 of them.
        const groups = [
            competenceValueGroup({ id: '8a', type: 'group', name: '8a', counts: { I: 2, II: 8 } }),
            competenceValueGroup({ id: '8b', type: 'group', name: '8b', counts: { I: 6, II: 4 } }),
        ];
        const school = competenceValueGroup({
            id: 'school',
            type: 'school',
            name: 'Schule',
            counts: { I: 12, II: 18 },
        });

        const chartData = prepareCompetenceDetailChartData(palette, [groups], {
            index: buildCompetenceLevelIndex([...groups, school]),
        });

        expect(chartData.find((entry) => entry.type === 'school')).toMatchObject({
            counts: { I: 12, II: 18 },
            total: 30,
        });
    });

    it("hands a Landesschnitt reference the state value group's own counts and total", () => {
        const [reference] = lookupComparisonDistributions(palette, [STATE_ROW]);

        expect(reference).toMatchObject({ counts: { I: 300, II: 700 }, total: 1000 });
        expect(reference.percentages.I).toBeCloseTo(30, 10);
    });

    it('drops a Landesschnitt value group of nobody rather than drawing a bar of zeros', () => {
        // The percent reader gives a counted value group of nobody 0 in every band; a bar
        // of zeros would read as a measured Landesschnitt.
        const emptyState = competenceValueGroup({
            id: 'nw-gy',
            type: 'state',
            name: 'Landesschnitt GY',
            counts: { I: 0, II: 0 },
        });

        expect(lookupComparisonDistributions(palette, [emptyState])).toEqual([]);
    });
});
