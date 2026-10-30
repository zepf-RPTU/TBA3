// @vitest-browser

/**
 * competence-level distribution — which comparison groups are drawn follows the app's comparison state.
 *
 * The app toggles comparison *ids* (`school`, `state`, …) — the same ids the item
 * lollipop's averages carry, which is what lets one ⌀ toggle drive every MA chart. The
 * competence-level chart keeps each row's id beside its name, so EN and MA share the rule.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { CompetenceLevelDistributionChart } from '../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
} from '../../../support/chartHarness.js';
import { required } from '../../../support/required.js';
import { GROUP, SCHOOL, STATE } from '../../../support/competenceLevelGroups.js';

const CONTAINER_ID = 'competence-level-group-visibility-test';

/**
 * A chart over the group and its two comparison populations, drawn.
 * @param {import('../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} apiData
 * @param {string[]|null} activeModes - The comparison ids toggled on; null for a host without toggles.
 * @returns {CompetenceLevelDistributionChart}
 */
function drawChart(apiData, activeModes) {
    const chart = new CompetenceLevelDistributionChart(
        required(document.getElementById(CONTAINER_ID)),
        {
            context: createTestContext('en'),
            apiData,
            comparisonState: activeModes ? comparisonStateShowing(activeModes) : null,
            autoResize: false,
        },
    );
    chart.create();
    return chart;
}

/**
 * @param {string[]|null} activeModes
 * @returns {string[]} The names of the bars drawn, in drawing order.
 */
function drawnGroups(activeModes) {
    drawChart([GROUP, SCHOOL, STATE], activeModes);
    return d3
        .selectAll(`#${CONTAINER_ID} .bar-group`)
        .data()
        .map((row) => /** @type {{label: string}} */ (row).label);
}

describe('competence-level distribution — visible groups follow the comparison state', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 400 });
    });

    it('reveals exactly the active ids the payload carries, by name', () => {
        // An active id the payload lacks (`state:hb` here) has no bar to show and
        // must add nothing — the toggle menu never offered it, and drawing a substitute
        // would be a comparison the data does not contain.
        expect(drawnGroups(['state', 'state:hb'])).toEqual(['8a', 'Landesschnitt']);
    });

    it('draws every row for a host without comparison toggles', () => {
        expect(drawnGroups(null)).toEqual(['8a', 'Schulschnitt', 'Landesschnitt']);
    });

    it('offers every payload comparison group to the toggle, but never the primary row', () => {
        // The same rule as above, seen from the menu — toggling the primary row
        // would change nothing, so it is not on offer. Paired with the shared control's
        // empty ⇒ remove rule, a group-only payload takes the button away.
        expect(drawChart([GROUP, SCHOOL, STATE], null).comparisonModeEntries).toEqual([
            { id: 'school', label: 'Schulschnitt' },
            { id: 'state', label: 'Landesschnitt' },
        ]);
        document.getElementById(CONTAINER_ID)?.replaceChildren();
        expect(drawChart([GROUP], null).comparisonModeEntries).toEqual([]);
    });
});
