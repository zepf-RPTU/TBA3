// @vitest-browser

/**
 * competence-level distribution — its data table: one row per bar drawn, so a comparison
 * toggled off leaves the table too, and per level the share with its headcount, which
 * export as two numbers. A Landesschnitt that delivers shares alone shows and exports no
 * headcount: 0 would read as a measured group of nobody.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { CompetenceLevelDistributionChart } from '../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';
import { formatPercent } from '../../../../src/common/utils/numberFormat.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
} from '../../../support/chartHarness.js';
import { required } from '../../../support/required.js';
import { GROUP, SCHOOL, STATE } from '../../../support/competenceLevelGroups.js';

const CONTAINER_ID = 'competence-level-data-table-test';

/** A Landesschnitt as a source without headcounts sends it: the share per level alone. */
const SHARES_ONLY_STATE = {
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    competenceLevels: [
        { nameShort: 'A1', descriptiveStatistics: { mean: 0.25 } },
        { nameShort: 'A2', descriptiveStatistics: { mean: 0.5 } },
        { nameShort: 'B1', descriptiveStatistics: { mean: 0.25 } },
    ],
};

/**
 * @param {import('../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} apiData
 * @param {string[]} activeModes - The comparison ids toggled on.
 * @returns {CompetenceLevelDistributionChart} Drawn.
 */
function drawChart(apiData, activeModes) {
    const chart = new CompetenceLevelDistributionChart(
        required(document.getElementById(CONTAINER_ID)),
        {
            context: createTestContext('en'),
            apiData,
            comparisonState: comparisonStateShowing(activeModes),
            autoResize: false,
        },
    );
    chart.create();
    return chart;
}

describe('competence-level distribution — data table', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 400 });
    });

    it('lists the bars drawn, with the group headcount and each level share and count', () => {
        const chart = drawChart([GROUP, SCHOOL, STATE], ['school']);
        const table = required(chart.dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Gruppe',
            'Anzahl Schüler:innen',
            'A1',
            'A2',
            'B1',
        ]);
        expect(table.columns[2].fields).toEqual(['A1 Anteil (%)', 'A1 Anzahl Schüler:innen']);
        // The Landesschnitt is toggled off: it has no bar, and no row.
        expect(table.rows.map(([head]) => head.text)).toEqual(['8a', 'Schulschnitt']);

        const school = required(chart.rows.find((row) => row.id === 'school'));
        const [, total, a1] = table.rows[1];
        expect(total).toEqual({ text: '30', values: [30] });
        expect(a1).toEqual({
            text: `${formatPercent(school.A1)} (7)`,
            values: [school.A1, 7],
        });
    });

    it('gives a group without headcounts its shares alone', () => {
        const chart = drawChart([GROUP, SHARES_ONLY_STATE], ['state']);
        const [, total, a1] = required(chart.dataTable()).rows[1];

        expect(total).toEqual({ text: '', values: [null] });
        expect(a1).toEqual({ text: formatPercent(25), values: [25, null] });
    });

    it('leaves the shares of a counted group of nobody empty, not 0 %', () => {
        const nobody = {
            id: 'state',
            type: 'state',
            name: 'Landesschnitt',
            competenceLevels: ['A1', 'A2', 'B1'].map((nameShort) => ({
                nameShort,
                descriptiveStatistics: { mean: 0, frequency: 0, total: 0 },
            })),
        };
        const chart = drawChart([GROUP, nobody], ['state']);
        const [, total, ...levels] = required(chart.dataTable()).rows[1];

        expect(total).toEqual({ text: '', values: [null] });
        expect(levels).toEqual(
            Array.from({ length: 3 }, () => ({ text: '', values: [null, null] })),
        );
    });
});
