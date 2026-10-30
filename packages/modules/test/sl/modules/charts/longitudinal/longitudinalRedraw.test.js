// @vitest-browser

/**
 * Longitudinal charts — a redraw runs against the SVG already drawn.
 *
 * The box plot joins each measure's figures by year inside the measure's own layer, and
 * the line charts join their series by category, so a second pass with the same
 * data changes nothing, and a stacking switch keeps the drawn marks.
 */

import { signal } from '@preact/signals-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { LongitudinalBoxPlotChart } from '../../../../../src/sl/modules/charts/longitudinal/longitudinalBoxPlotChart.js';
import { LongitudinalLineChart } from '../../../../../src/sl/modules/charts/longitudinal/longitudinalLineChart.js';
import { calculateDetailedBoxPlotStats } from '../../../../../src/sl/utils/slBoxPlotStats.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { required } from '../../../../support/required.js';

const CONTAINER_ID = 'sl-longitudinal-redraw-test';

/**
 * One year of both measures.
 * @param {string} label - The year.
 * @param {number} shift - How far its ratings sit above the first year's.
 * @returns {import('../../../../../src/sl/utils/slLongitudinalTimelines.js').LongitudinalBoxPlotYear}
 */
const year = (label, shift) => ({
    year: label,
    teachingQuality: required(
        calculateDetailedBoxPlotStats([2, 2.5, 3, 3.5, 4].map((v) => v + shift)),
    ),
    selfEfficacy: required(
        calculateDetailedBoxPlotStats([1.5, 2, 3, 3.2, 4].map((v) => v + shift)),
    ),
});

/** @type {HTMLDivElement} The container `beforeEach` mounts. */
let container;

describe('Longitudinal charts — redraw in place', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 700, heightPx: 500 });
    });

    it('the box plot changes nothing when it draws the same data again', () => {
        const chart = new LongitudinalBoxPlotChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            timeline: [year('2023', 0), year('2024', 0.3), year('2025', 0.5)],
        });
        chart.create();
        expectStableRedraw(chart, '.box-hit-area');
        // Both measures share the left column, so each must keep a grid and a title
        // of its own rather than the second taking over the first's.
        expect(container.querySelectorAll('.grid')).toHaveLength(2);
        expect(container.querySelectorAll('text.axis-label')).toHaveLength(2);
    });

    it('the box plot moves its figures in place for another Bereich', () => {
        // A Bereich switch hands the same renderer other years; rebuilding it would drop
        // the figures a reader is looking at and redraw them from nothing.
        const timeline = signal([year('2023', 0), year('2024', 0.3)]);
        const chart = new LongitudinalBoxPlotChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            timeline,
        });
        chart.create();
        const figure = container.querySelector('.box-figure');

        timeline.value = [year('2023', 0.5), year('2024', 0.1)];

        expect(container.querySelector('.box-figure')).toBe(figure);
        expect(required(chart.dataTable()).rows[0][4].values).toEqual([
            timeline.value[0].teachingQuality.median,
        ]);
    });

    it('the line chart changes nothing when they draw the same data again', () => {
        const chart = new LongitudinalLineChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            series: {
                years: ['2023', '2024'],
                timeline: [
                    { year: '2023', categories: { I: 20, II: 80 } },
                    { year: '2024', categories: { I: 30, II: 70 } },
                ],
                colorOf: () => '#888888',
                categoryOrder: ['I', 'II'],
            },
            yAxisLabel: 'Anteil (%)',
            isStacked: false,
            yMax: 80,
        });
        chart.create();
        expectStableRedraw(chart, '.dot');

        const dot = container.querySelector('.dot');
        chart.state.isStacked.value = true;
        expect(container.querySelector('.dot')).toBe(dot);
    });
});

describe('Longitudinal box plot — data table', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 700, heightPx: 500 });
    });

    it('lists one row per year and measure, oldest first', () => {
        const timeline = [year('2023', 0), year('2024', 0.3)];
        const chart = new LongitudinalBoxPlotChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            timeline,
        });
        chart.create();
        const table = required(chart.dataTable());

        expect(table.rows.map(([yearCell, measure]) => [yearCell.text, measure.text])).toEqual([
            ['2023', 'Unterrichtsqualität (kogn. Aktivierung)'],
            ['2023', 'Selbstwirksamkeit'],
            ['2024', 'Unterrichtsqualität (kogn. Aktivierung)'],
            ['2024', 'Selbstwirksamkeit'],
        ]);
        expect(table.rows[2][4].values).toEqual([timeline[1].teachingQuality.median]);
    });
});
