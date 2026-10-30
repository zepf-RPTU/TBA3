// @vitest-browser

/**
 * competence-level distribution — which value group is the group, and what a segment's tooltip counts.
 * Built on the base renderer directly; nothing here depends on the EN or MA layout.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { CompetenceLevelDistributionChart } from '../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';
import { createComparisonState } from '../../../../src/common/charts/comparisonState.js';
import { TERM_CONSTANTS } from '../../../../src/common/domain/terms.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
} from '../../../support/chartHarness.js';
import {
    roundedMeanValueGroup,
    STATE,
    SCHOOL,
    GROUP,
} from '../../../support/competenceLevelGroups.js';

const CONTAINER_ID = 'competence-level-group-rows-test';

/** @typedef {import('../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js').CompetenceLevelDistributionSegment} CompetenceLevelDistributionSegment */

/**
 * A chart over the value groups, drawn.
 * @param {import('../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} apiData
 * @param {import('../../../../src/common/charts/comparisonState.js').ComparisonState|null} [comparisonState] - The comparison toggles; none draws every value group.
 * @returns {CompetenceLevelDistributionChart}
 */
function drawChart(apiData, comparisonState = null) {
    const chart = new CompetenceLevelDistributionChart(
        required(document.getElementById(CONTAINER_ID)),
        {
            context: createTestContext('en'),
            apiData,
            comparisonState,
            autoResize: false,
        },
    );
    chart.create();
    return chart;
}

/** @returns {string[]} The names of the bars drawn, in drawing order. */
const drawnLabels = () =>
    d3
        .selectAll(`#${CONTAINER_ID} .bar-group`)
        .data()
        .map((row) => /** @type {{label: string}} */ (row).label);

/**
 * The segment a group's level was drawn with.
 * @param {string} group - The group's name.
 * @param {string} level
 * @returns {CompetenceLevelDistributionSegment|undefined} Its bound data.
 */
const drawnSegment = (group, level) =>
    /** @type {CompetenceLevelDistributionSegment[]} */ (
        d3.selectAll(`#${CONTAINER_ID} .bar-segment`).data()
    ).find((d) => d.rowLabel === group && d.field === level);

describe("competence-level distribution — the group's own value group and its comparisons", () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 400 });
    });

    it('takes the type=group value group as the group, even when it comes last', () => {
        // The spec fixes no order. Taking the first value group would make the
        // Landesschnitt the always-visible "group" bar and put the group itself behind a
        // toggle.
        const chart = drawChart([STATE, SCHOOL, GROUP], createComparisonState());

        expect(chart.comparisonModeEntries.map((group) => group.id)).toEqual(['state', 'school']);

        expect(drawnLabels()).toEqual(['8a']);
    });

    it('draws the group first and its comparisons after it, in payload order', () => {
        // The bar the card is about leads whatever the payload order; drawn in payload
        // order, a group listed last would sit under the averages.
        drawChart([STATE, SCHOOL, GROUP], comparisonStateShowing(['state', 'school']));

        expect(drawnLabels()).toEqual(['8a', 'Landesschnitt', 'Schulschnitt']);
    });

    it("puts each group's own headcount on its segments and in their tooltips", () => {
        // Share × the first value group's total is right only for the primary bar. Every
        // segment carries its population's real frequency.
        const chart = drawChart([STATE, SCHOOL, GROUP]);
        const segment = drawnSegment;

        expect(segment('8a', 'A1')).toMatchObject({ count: 1, total: 3 });
        expect(segment('Schulschnitt', 'A2')).toMatchObject({ count: 13, total: 30 });
        const countRow = (/** @type {string} */ group, /** @type {string} */ level) =>
            chart
                .formatTooltipContent(required(segment(group, level)))
                .rows?.find((row) => row && row.label === TERM_CONSTANTS.STUDENT_COUNT) ||
            undefined;
        expect(countRow('8a', 'A1')?.value).toBe('1 von 3');
        expect(countRow('Landesschnitt', 'B1')?.value).toMatch(/^250 von /);
    });

    it('refuses two value groups that share a name', () => {
        // The bars sit on a band scale keyed by name. A comparison named like the
        // group would take the group's slot and be drawn over it under the group's label.
        const twin = roundedMeanValueGroup({
            id: 'district',
            type: 'district',
            name: '8a',
            frequencies: { A1: 5, A2: 5, B1: 5 },
        });

        expect(() => drawChart([twin, GROUP])).toThrow(/both named '8a'/);
    });
});
