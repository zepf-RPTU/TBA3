// @vitest-browser

/**
 * Group comparison — a redraw runs against the SVG already drawn.
 *
 * Every selector change redraws the pyramid in place, its marks joined by key, so a
 * second pass with the same selection changes nothing, and a group swap keeps the
 * pyramid's layers and the bars whose key stays.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { writeState } from '@tba3/module-base';

import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { groupComparisonChartOn } from '../../../../support/slGroupComparisonChart.js';
import { required } from '../../../../support/required.js';
import { AXIS_DEFAULTS } from '../../../../../src/common/charts/chartDefaults.js';
import { LABEL_LINE_HEIGHT_EM } from '../../../../../src/common/charts/chartLabelFit.js';

const CONTAINER_ID = 'sl-group-comparison-redraw-test';

const DOMAIN_RESULTS = [
    {
        subjectName: 'Deutsch',
        domainId: 'LV',
        domainName: 'LV',
        stats: { scaleId: 'sl' },
        studentResults: [
            ['s1', '8a', 'III', 'female'],
            ['s2', '8a', 'II', 'male'],
            ['s3', '8b', 'II', 'female'],
            ['s4', '8b', 'IV', 'male'],
            ['s5', '8c', 'III', 'female'],
        ].map(([studentId, groupName, competenceLevelName, gender]) => ({
            studentId,
            gender,
            groupName,
            competenceLevelName,
        })),
    },
];

/** Selbstwirksamkeit means: one per student, the groups split by gender. */
const SELF_EFFICACY = DOMAIN_RESULTS[0].studentResults.map(
    ({ studentId, gender, groupName }, i) => ({
        studentId,
        gender,
        groupName,
        subject: 'Deutsch',
        mean: 1.5 + (i % 3),
    }),
);

/** @type {HTMLDivElement} The container `beforeEach` mounts. */
let container;

describe('Group comparison — redraw in place', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 700, heightPx: 400 });
    });

    it('changes nothing when it draws the same selection again, and swaps groups in place', async () => {
        const chart = await groupComparisonChartOn(container, {
            domainResults: DOMAIN_RESULTS,
            selfEfficacy: SELF_EFFICACY,
        });
        // Ratings need no registered scale, so the pyramid draws from the fixture alone.
        writeState(chart.state, { chartType: 'selfEfficacy' });
        chart.create();
        const svg = chart.svg?.node();
        const layers = [...container.querySelectorAll('.pyramid-layer')];
        expect(container.querySelectorAll('rect.pyramid-bar').length).toBeGreaterThan(0);

        expectStableRedraw(chart, 'rect.pyramid-bar');

        // A selector change must not clear the plot, even when the frame changes.
        writeState(chart.state, { category: 'group', group1: '8a', group2: '8b' });
        expect(chart.svg?.node()).toBe(svg);
        expect([...container.querySelectorAll('.pyramid-layer')]).toEqual(layers);
    });
});

describe('Group comparison — resize', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 700, heightPx: 400 });
    });

    it('moves the axes, their title and the group names to the new frame', async () => {
        const chart = await groupComparisonChartOn(container, {
            domainResults: DOMAIN_RESULTS,
            selfEfficacy: SELF_EFFICACY,
        });
        writeState(chart.state, { chartType: 'selfEfficacy' });
        chart.create();
        const heightBefore = required(chart.layout).chart.height;

        // A smaller box at a larger root font: the plot shrinks, the header lines spread.
        container.style.height = '300px';
        document.documentElement.style.fontSize = '20px';
        try {
            if (chart.measureIfStale()) chart.drawMeasured();
        } finally {
            document.documentElement.style.fontSize = '';
        }

        const { chart: plot, axes } = required(chart.layout);
        expect(plot.height).toBeLessThan(heightBefore);
        for (const key of ['group1', 'group2']) {
            expect(
                container.querySelector(`.pyramid-axis--${key}`)?.getAttribute('transform'),
            ).toBe(`translate(0, ${plot.height})`);
        }
        const title = required(container.querySelector('.pyramid-axes > text.axis-label'));
        expect(Number(title.getAttribute('y'))).toBeCloseTo(
            plot.height + axes.bottom - chart.resolveChartTextSize() / 2,
        );
        const lineStep = chart.resolveChartTextSize('base') * LABEL_LINE_HEIGHT_EM;
        const names = [...container.querySelectorAll('.wing-header-name')];
        // One per wing: an empty list would leave the spread unchecked.
        expect(names).toHaveLength(2);
        for (const name of names) {
            expect(Number(name.getAttribute('y'))).toBeCloseTo(
                -(AXIS_DEFAULTS.titleGapPx + lineStep),
            );
        }
    });
});

describe('Group comparison — data table', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 700, heightPx: 400 });
    });

    it('lists the bands, best first, with each group share and headcount', async () => {
        const chart = await groupComparisonChartOn(container, {
            domainResults: DOMAIN_RESULTS,
            selfEfficacy: SELF_EFFICACY,
        });
        writeState(chart.state, {
            chartType: 'selfEfficacy',
            category: 'group',
            group1: '8a',
            group2: '8b',
        });
        chart.create();
        const table = required(chart.dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Selbstwirksamkeit',
            '8a',
            '8b',
        ]);
        expect(table.columns[1].fields).toEqual(['8a Anteil (%)', '8a Anzahl Schüler:innen']);
        for (const groupIndex of [1, 2]) {
            const values = table.rows.map((row) => row[groupIndex].values ?? []);
            expect(values.reduce((sum, [share]) => sum + (share ?? 0), 0)).toBeCloseTo(100);
            expect(values.reduce((sum, [, count]) => sum + (count ?? 0), 0)).toBe(2);
        }
    });

    it('has no table while a message stands in for the pyramid', async () => {
        const chart = await groupComparisonChartOn(container, { domainResults: DOMAIN_RESULTS });
        writeState(chart.state, { chartType: 'selfEfficacy' });
        chart.create();
        expect(chart.dataTable()).toBeNull();
    });
});
