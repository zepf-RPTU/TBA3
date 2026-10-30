// @vitest-browser

/**
 * Selbstwirksamkeit charts — a redraw runs against the SVG already drawn.
 *
 * The box plot joins its figures by group and the stacked bar its bars by group, so a
 * second pass with the same data changes nothing, and a row legend toggle moves the bars
 * that stay rather than rebuilding them.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { computed, effect } from '@preact/signals-core';
import * as d3 from 'd3';

import { SelfEfficacyBoxPlot } from '../../../../../src/sl/modules/charts/selfEfficacy/selfEfficacyBoxPlot.js';
import { SelfEfficacyStackedBar } from '../../../../../src/sl/modules/charts/selfEfficacy/selfEfficacyStackedBar.js';
import { calculateDetailedBoxPlotStats } from '../../../../../src/sl/utils/slBoxPlotStats.js';
import { calculateRatingDistribution } from '../../../../../src/sl/utils/slRatingDistribution.js';
import { surveyRowKey } from '../../../../../src/sl/utils/slSurveyDerivation.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { required } from '../../../../support/required.js';
import { legendPill } from '../../../../support/dom.js';

const CONTAINER_ID = 'sl-self-efficacy-redraw-test';

/**
 * One survey row.
 * @param {string} groupName
 * @param {number[]} values - One mean rating per student.
 * @returns {import('../../../../../src/sl/modules/charts/selfEfficacy/selfEfficacyConfig.js').SelfEfficacyRow} The row the configs hand the charts.
 */
const row = (groupName, values) => ({
    groupName,
    count: values.length,
    values,
    statistics: required(calculateDetailedBoxPlotStats(values)),
    distribution: calculateRatingDistribution(values),
});

const ROWS = [row('8a', [1.5, 2, 2.5, 3, 3.5, 4]), row('8b', [2, 2.5, 3, 3, 3.5, 3.8, 1])];

/** @type {HTMLDivElement} The container `beforeEach` mounts. */
let container;

/**
 * A row's bar group, found by the row it is bound to.
 * @param {string} key - The row's key (`surveyRowKey`).
 * @returns {SVGGElement}
 */
const barFor = (key) =>
    required(
        /** @type {d3.Selection<SVGGElement, import('../../../../../src/sl/modules/charts/selfEfficacy/selfEfficacyConfig.js').SelfEfficacyRow, any, any>} */ (
            d3.select(container).selectAll('g.bar-group')
        )
            .filter((d) => surveyRowKey(d) === key)
            .node(),
    );

describe('Selbstwirksamkeit charts — redraw in place', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 400 });
    });

    it('the box plot changes nothing when it draws the same data again', () => {
        const chart = new SelfEfficacyBoxPlot(container, ROWS, {
            context: createTestContext('sl'),
            autoResize: false,
        });
        chart.create();
        expectStableRedraw(chart, '.box-hit-area');
    });

    it('the stacked bar spans each row from 0 % to 100 % of the plot', () => {
        const chart = new SelfEfficacyStackedBar(container, ROWS, {
            context: createTestContext('sl'),
            autoResize: false,
        });
        chart.create();
        const width = required(chart.layout).chart.width;
        const edge = (/** @type {string} */ band, /** @type {'start'|'end'} */ side) => {
            const rect = required(barFor('group:8a').querySelector(`.segment-${band} rect`));
            const x = Number(rect.getAttribute('x'));
            return side === 'start' ? x : x + Number(rect.getAttribute('width'));
        };

        // Within the surface gap that insets each segment.
        expect(Math.abs(edge('low', 'start'))).toBeLessThan(3);
        expect(Math.abs(edge('excellent', 'end') - width)).toBeLessThan(3);
    });

    it('the stacked bar keeps the row that stays when the legend hides the other', () => {
        const chart = new SelfEfficacyStackedBar(container, ROWS, {
            context: createTestContext('sl'),
            autoResize: false,
            legend: 'side',
        });
        chart.create();
        const svg = chart.svg?.node();
        const kept = barFor('group:8a').querySelector('rect.bar-segment');

        // The first bar's first segment: 8a's, drawn in row order.
        expectStableRedraw(chart, 'rect.bar-segment');

        legendPill(required(chart.legendPanel), '8b', 'Lerngruppen').click();

        expect(chart.svg?.node()).toBe(svg);
        expect(barFor('group:8a').querySelector('rect.bar-segment')).toBe(kept);
        // The hidden row is leaving: off the pointer and the keyboard at once.
        expect(barFor('group:8b').style.pointerEvents).toBe('none');
    });

    it('the stacked bar says so over the plot once its pills hide every row, and not before', () => {
        // The chart decides when nothing is left, so a frame without bars reads as
        // the viewer's doing rather than as missing data.
        const chart = new SelfEfficacyStackedBar(container, ROWS, {
            context: createTestContext('sl'),
            autoResize: false,
            legend: 'side',
        });
        chart.create();
        /** @param {string} group - The row's group, its pill's label. */
        const pill = (group) => legendPill(required(chart.legendPanel), group, 'Lerngruppen');

        pill('8a').click();
        expect(container.querySelector('.chart-message')).toBeNull();

        pill('8b').click();
        expect(container.querySelector('.chart-message')?.textContent).toContain(
            'Alle Datenreihen sind ausgeblendet',
        );

        pill('8b').click();
        expect(container.querySelector('.chart-message')).toBeNull();
    });
});

describe('Selbstwirksamkeit charts — data table', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 400 });
    });

    it('the box plot lists each group with its figures, exported with two decimals', () => {
        const chart = new SelfEfficacyBoxPlot(container, ROWS, {
            context: createTestContext('sl'),
            autoResize: false,
        });
        chart.create();
        const table = required(chart.dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Gruppe',
            'Anzahl Schüler:innen',
            'Median',
            'Mittelwert',
            'Standardabweichung',
            'Q1',
            'Q3',
            'Min',
            'Max',
        ]);
        expect(table.columns[2].digits).toBe(2);
        expect(
            table.rows.map(([head, count, median]) => [head.text, count.values, median.values]),
        ).toEqual(ROWS.map((entry) => [entry.groupName, [entry.count], [entry.statistics.median]]));
    });

    it('the stacked bar lists the groups its pills leave on, per band its share and count', () => {
        const chart = new SelfEfficacyStackedBar(container, ROWS, {
            context: createTestContext('sl'),
            autoResize: false,
            legend: 'side',
        });
        chart.create();
        const table = required(chart.dataTable());
        expect(table.columns.map((column) => column.label).slice(2, 6)).toEqual([
            '1-2 (niedrig)',
            '2-3 (mittel)',
            '3-4 (gut)',
            '4-5 (sehr gut)',
        ]);
        const counts = table.rows[0].slice(2, 6).map((cell) => cell.values?.[1] ?? 0);
        expect(counts.reduce((sum, count) => sum + count, 0)).toBe(ROWS[0].count);

        legendPill(required(chart.legendPanel), '8b', 'Lerngruppen').click();
        expect(required(chart.dataTable()).rows.map(([head]) => head.text)).toEqual(['8a']);
    });

    it('a table read reactively follows the pills, also to no table and back', () => {
        const chart = new SelfEfficacyStackedBar(container, ROWS, {
            context: createTestContext('sl'),
            autoResize: false,
            legend: 'side',
        });
        chart.create();
        // What the host's toggle reads: whether there is a table, as a computed.
        const hasTable = computed(() => chart.dataTable() !== null);
        /** @type {boolean[]} */
        const seen = [];
        const stop = effect(() => {
            seen.push(hasTable.value);
        });
        /** @param {string} group - The row's group, its pill's label. */
        const pill = (group) => legendPill(required(chart.legendPanel), group, 'Lerngruppen');

        pill('8a').click();
        pill('8b').click();
        pill('8a').click();
        stop();

        expect(seen).toEqual([true, false, true]);
    });
});
