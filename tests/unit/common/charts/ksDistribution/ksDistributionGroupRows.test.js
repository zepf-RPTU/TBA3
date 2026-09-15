// @vitest-browser

/**
 * KS distribution — which row is the class, and what a segment's tooltip counts.
 *
 * Spec-conformant payloads unlike the fixtures: the class row comes last, and the
 * comparison populations are far larger than the class. Built on the base renderer
 * directly; nothing here depends on the EN or MA layout.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { BaseKsDistributionChartRenderer } from '@tba3/modules/common/charts/ksDistribution/baseKsDistributionChartRenderer.js';
import { TERM_CONSTANTS } from '@tba3/modules/common/domain/terms.js';

const CONTAINER_ID = 'ks-group-rows-test';
const COLORS = { A1: '#111111', A2: '#555555', B1: '#999999' };

function valueGroup({ id, type, name, frequencies }) {
    const total = Object.values(frequencies).reduce((sum, frequency) => sum + frequency, 0);
    return {
        id,
        type,
        name,
        competenceLevels: Object.entries(frequencies).map(([nameShort, frequency]) => ({
            nameShort,
            descriptiveStatistics: {
                total,
                frequency,
                mean: Math.round((frequency / total) * 1e4) / 1e4,
            },
        })),
    };
}

const STATE = valueGroup({
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    frequencies: { A1: 400, A2: 350, B1: 250 },
});
const SCHOOL = valueGroup({
    id: 'school',
    type: 'school',
    name: 'Schulschnitt',
    frequencies: { A1: 7, A2: 13, B1: 10 },
});
const CLASS = valueGroup({
    id: '8a-en',
    type: 'group',
    name: '8a',
    frequencies: { A1: 1, A2: 1, B1: 1 },
});

function makeChart(apiData) {
    return new BaseKsDistributionChartRenderer(CONTAINER_ID, COLORS, { apiData });
}

/** Draw the bars into a bare SVG and return the segment data they were bound to. */
function drawSegments(chart) {
    const g = d3.select(`#${CONTAINER_ID}`).append('svg').append('g');
    const xScale = d3.scaleBand().domain(chart.groupNames).range([0, 300]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);
    chart.createStackedBarsBase(g, chart.prepareChartDataFromApi(), xScale, yScale, {
        chartWidth: 300,
        chartHeight: 200,
    });
    const segments = g.selectAll('[data-level]').data();
    return (group, level) => segments.find((d) => d.group === group && d.key === level);
}

describe('KS distribution — the class row and its comparisons', () => {
    beforeEach(() => {
        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('takes the type=group row as the class, even when it comes last', () => {
        // WHY: the spec fixes no row order. Taking the first row made the Landesschnitt
        // the always-visible "class" bar and put the class itself behind a toggle.
        const chart = makeChart([STATE, SCHOOL, CLASS]);

        expect(chart.primaryGroupName).toBe('8a');
        expect(chart.getDrawableComparisonIds()).toEqual(['state', 'school']);

        chart.syncVisibleGroups([]);
        expect([...chart.visibleGroups]).toEqual(['8a']);
    });

    it("puts each group's own headcount on its segments and in their tooltips", () => {
        // WHY: the tooltip used to estimate share × the first row's total, and only for
        // the primary bar. Every segment now carries its population's real frequency.
        const chart = makeChart([STATE, SCHOOL, CLASS]);

        const segment = drawSegments(chart);

        expect(segment('8a', 'A1')).toMatchObject({ count: 1, total: 3 });
        expect(segment('Schulschnitt', 'A2')).toMatchObject({ count: 13, total: 30 });
        expect(chart.formatTooltipContent(segment('8a', 'A1'))).toContain(
            `1 ${TERM_CONSTANTS.STUDENT}`,
        );
        expect(chart.formatTooltipContent(segment('Landesschnitt', 'B1'))).toContain(
            `250 ${TERM_CONSTANTS.STUDENTS}`,
        );
    });

    it('refuses two value groups that share a name', () => {
        // WHY: the bars sit on a band scale keyed by name. A comparison named like the
        // class would take the class's slot and be drawn over it under the class's label.
        const twin = valueGroup({
            id: 'district',
            type: 'district',
            name: '8a',
            frequencies: { A1: 5, A2: 5, B1: 5 },
        });

        expect(() => makeChart([twin, CLASS])).toThrow(/both named '8a'/);
    });
});
