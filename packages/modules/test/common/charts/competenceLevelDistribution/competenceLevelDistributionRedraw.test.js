// @vitest-browser

/**
 * competence-level distribution — a redraw runs against the SVG already drawn.
 *
 * The bars join by group id and their segments by level, so a second pass with the same
 * data changes nothing, and a state change patches the drawn chart in place: the marks
 * that stay keep their nodes, which is what keeps keyboard focus on a segment across a
 * resize, a comparison toggle or a level highlight.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { select } from 'd3';

import { CompetenceLevelDistributionChart } from '../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';
import {
    comparisonStateShowing,
    expectStableRedraw,
    makeVisibleChartContainer,
} from '../../../support/chartHarness.js';
import { GROUP, SCHOOL, STATE } from '../../../support/competenceLevelGroups.js';

const CONTAINER_ID = 'competence-level-redraw-test';

/** The comparison toggles the chart follows, both groups on. */
let comparisonState = comparisonStateShowing(['school', 'state']);

function makeChart() {
    return new CompetenceLevelDistributionChart(required(document.getElementById(CONTAINER_ID)), {
        context: createTestContext('en'),
        apiData: [GROUP, SCHOOL, STATE],
        comparisonState,
        autoResize: false,
    });
}

/**
 * The level a segment was drawn for, from the datum the join bound to it.
 * @param {Element} segment
 * @returns {string}
 */
const levelOf = (segment) => /** @type {{field: string}} */ (select(segment).datum()).field;

/** The group's own A1 segment. */
const ownSegment = () =>
    [...document.querySelectorAll(`#${CONTAINER_ID} .bar-group:first-child .bar-segment`)].find(
        (segment) => levelOf(segment) === 'A1',
    );

describe('competence-level distribution — redraw in place', () => {
    beforeEach(() => {
        comparisonState = comparisonStateShowing(['school', 'state']);
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 400 });
    });

    it('changes nothing when it draws the same data again', () => {
        const chart = makeChart();
        chart.create();
        // The group's first segment is its A1.
        const first = '.bar-group:first-child .bar-segment';
        expect(document.querySelector(`#${CONTAINER_ID} ${first}`)).toBe(ownSegment());
        expectStableRedraw(chart, first);
    });

    it('keeps the segments that stay when a comparison group is toggled off', () => {
        // A toggle that rebuilt the whole SVG would drop a keyboard user's focus back
        // to the page.
        const chart = makeChart();
        chart.create();
        const segment = ownSegment();

        comparisonState.setActive('state', false);

        expect(ownSegment()).toBe(segment);
        // The Landesschnitt bar is leaving: off the pointer and the keyboard at once.
        const bars = /** @type {SVGGElement[]} */ ([
            ...document.querySelectorAll(`#${CONTAINER_ID} .bar-group`),
        ]);
        const leaving = bars.filter((bar) => bar.style.pointerEvents === 'none');
        expect(leaving).toHaveLength(1);
    });

    it('keys the level colours over the plot, one chip per level in scale order', () => {
        // A segment too narrow for its `Level · share` label is told by its colour
        // alone; the key says which colour is which level.
        const chart = new CompetenceLevelDistributionChart(
            required(document.getElementById(CONTAINER_ID)),
            {
                context: createTestContext('en'),
                apiData: [GROUP, SCHOOL, STATE],
                legend: 'top',
                autoResize: false,
            },
        );
        chart.create();
        const labels = [...required(chart.legendPanel).querySelectorAll('.legend-swatch-item')].map(
            (item) => item.textContent?.trim(),
        );

        expect(labels).toEqual(chart.levels);
    });

    it('highlights a level on the segment already drawn', () => {
        const chart = makeChart();
        chart.create();
        const segment = ownSegment();

        chart.state.highlightedLevels.value = ['A1'];

        expect(ownSegment()).toBe(segment);
        expect(segment?.classList.contains('highlighted')).toBe(true);
        // Only the group's own bar takes it.
        expect(document.querySelectorAll(`#${CONTAINER_ID} .highlighted`)).toHaveLength(1);
    });

    it('highlights every level of the set, and drops one taken out of it', () => {
        const chart = makeChart();
        chart.create();
        const [first, second] = chart.levels;
        const highlighted = () =>
            [...document.querySelectorAll(`#${CONTAINER_ID} .highlighted`)].map(levelOf);

        chart.state.highlightedLevels.value = [first, second];
        expect(highlighted()).toEqual([first, second]);

        chart.state.highlightedLevels.value = [second];
        expect(highlighted()).toEqual([second]);
    });

    it('reports the clicked level and leaves the highlight to its owner', () => {
        // The owner decides between one level (MA overview) and a toggled set
        // (MA group view); a chart that highlighted on its own would show a selection
        // the owner did not take.
        /** @type {string[]} */
        const clicked = [];
        const chart = new CompetenceLevelDistributionChart(
            required(document.getElementById(CONTAINER_ID)),
            {
                context: createTestContext('en'),
                apiData: [GROUP, SCHOOL, STATE],
                comparisonState,
                autoResize: false,
                highlightedLevels: ['A1'],
                onLevelClicked: (level) => clicked.push(level),
            },
        );
        chart.create();

        /** @type {SVGRectElement} */ (required(ownSegment())).dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );

        expect(clicked).toEqual(['A1']);
        expect(chart.state.highlightedLevels.value).toEqual(['A1']);
    });
});
