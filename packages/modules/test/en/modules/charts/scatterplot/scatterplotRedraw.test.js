// @vitest-browser

// Axes join by side, band labels by level, markers by group and points by student: every
// point keeps its node, which keeps keyboard focus on it across a zoom or a resize.

import { beforeEach, describe, expect, it } from 'vitest';

import { Scatterplot } from '../../../../../src/en/modules/charts/scatterplot/scatterplot.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { required } from '../../../../support/required.js';

const CONTAINER_ID = 'scatter-redraw';

/** @param {string} studentId @param {number} x @param {number} y */
const point = (studentId, x, y) => ({
    studentId,
    firstName: studentId,
    lastName: 'L',
    xPercentage: x,
    yPercentage: y,
    xGer: null,
    yGer: null,
});

/**
 * @param {import('../../../../../src/en/utils/enStyleAggregationAdapter.js').StyleComparisonGroup[]} [comparisons]
 * @returns {Scatterplot} On the container `beforeEach` mounted, not yet created.
 */
function makeChart(comparisons = []) {
    return new Scatterplot(required(document.getElementById(CONTAINER_ID), CONTAINER_ID), {
        context: createTestContext(),
        autoResize: false,
        enConfig: {
            domainIds: ['ho', 'le'],
            equivalenceTables: {},
            domainLabels: ['ho', 'le'],
        },
        points: [point('s1', 40, 45), point('s2', 60, 55)],
        groupAverages: { ho: 50, le: 50 },
        groupName: '8a',
        comparisons,
    });
}

const firstPoint = () => document.querySelector(`#${CONTAINER_ID} .student-point`);

describe('EN scatterplot — redraw in place', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 600 });
    });

    it('changes nothing when it draws the same state again', () => {
        const chart = makeChart();
        chart.create();
        expectStableRedraw(chart, '.student-point');
    });

    it('keeps every point and the axes when the zoom is toggled', () => {
        const chart = makeChart();
        chart.create();
        const studentPoint = firstPoint();
        const xAxis = document.querySelector(`#${CONTAINER_ID} .x-axis`);

        chart.state.isZoomed.value = false;

        expect(chart.xScale.domain()).toEqual([0, 100]);
        expect(firstPoint()).toBe(studentPoint);
        expect(document.querySelector(`#${CONTAINER_ID} .x-axis`)).toBe(xAxis);
        expect(document.querySelectorAll(`#${CONTAINER_ID} .student-point`)).toHaveLength(2);
    });

    it('keeps each comparison marker and its ordinal tag when the zoom is toggled', () => {
        // The tag carries its marker's series class, so the comparison toggle fades
        // both; the marker join must still take only markers, or every redraw removes the
        // tag and re-enters it at its end position while the marker is still moving.
        /** @param {string} id @param {string} shortLabel @param {number} roleIndex */
        const state = (id, shortLabel, roleIndex) => ({
            id,
            type: 'state',
            name: `Landesschnitt ${id}`,
            roleIndex,
            shortLabel,
            averages: {},
            domainAverages: { ho: 45 + roleIndex * 10, le: 50 },
        });
        const chart = makeChart([state('gy', 'L1', 0), state('rs', 'L2', 1)]);
        chart.create();
        const tags = () => [
            ...document.querySelectorAll(`#${CONTAINER_ID} .comparison-average-tag`),
        ];
        const markers = () => [
            ...document.querySelectorAll(`#${CONTAINER_ID} .comparison-average-point`),
        ];
        const drawnTags = tags();
        const drawnMarkers = markers();
        expect(drawnTags).toHaveLength(2);
        expect(drawnMarkers).toHaveLength(2);

        chart.state.isZoomed.value = false;

        // The same nodes, moved: identity, not a structural match.
        expect(tags().every((tag, i) => tag === drawnTags[i])).toBe(true);
        expect(markers().every((marker, i) => marker === drawnMarkers[i])).toBe(true);
        expect(tags()).toHaveLength(2);
    });
});
