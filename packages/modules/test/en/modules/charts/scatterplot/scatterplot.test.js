// @vitest-browser

import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals-core';
import { nothing } from 'lit';
import { Scatterplot } from '../../../../../src/en/modules/charts/scatterplot/scatterplot.js';
import { zoomToggle } from '../../../../../src/en/modules/charts/scatterplot/scatterZoomController.js';
import { toDataTableList } from '../../../../../src/common/charts/host/chartDataTable.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
} from '../../../../support/chartHarness.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { required } from '../../../../support/required.js';

/** @type {import('../../../../../src/en/modules/charts/scatterplot/scatterplot.js').ScatterplotEnConfig} */
const enConfig = {
    domainIds: ['ho', 'le'],
    equivalenceTables: {},
    domainLabels: ['ho', 'le'],
};

/** Two students in the middle of the range, so zooming narrows both axes. */
const points = [
    {
        studentId: 's1',
        firstName: 'A',
        lastName: 'L',
        xPercentage: 40,
        yPercentage: 45,
        xGer: null,
        yGer: null,
    },
    {
        studentId: 's2',
        firstName: 'B',
        lastName: 'M',
        xPercentage: 60,
        yPercentage: 55,
        xGer: null,
        yGer: null,
    },
];

/**
 * @param {object} [overrides] - Options over the defaults (points, selection).
 * @returns {Scatterplot} A drawn chart, zoomed onto its points.
 */
function drawChart(overrides = {}) {
    const container = makeVisibleChartContainer('scatter');
    container.style.width = '600px';
    container.style.height = '600px';
    const chart = new Scatterplot(container, {
        context: createTestContext(),
        autoResize: false,
        enConfig,
        points,
        groupAverages: {},
        groupName: null,
        comparisons: [],
        ...overrides,
    });
    chart.create();
    return chart;
}

describe('Scatterplot zoom', () => {
    it('opens zoomed onto the data and shows the full range once unzoomed', () => {
        const chart = drawChart();
        expect(chart.xScale.domain()).toEqual([35, 65]);

        chart.state.isZoomed.value = false;

        expect(chart.xScale.domain()).toEqual([0, 100]);
    });

    it('keeps the unzoomed view through a re-render', () => {
        // The zoom is state. A resize or refresh that rebuilt the chart zoomed in
        // would undo the reader's choice.
        const chart = drawChart();
        chart.state.isZoomed.value = false;

        chart.refresh();

        expect(chart.xScale.domain()).toEqual([0, 100]);
    });

    it('opens on the full range when the data already fills every band', () => {
        // No zoom toggle is offered then, so a zoomed start could never be left, and a
        // band whose centre fell outside the data's extent lost its label.
        const ladder = {
            competenceLevelNames: ['A1', 'A2', 'B1'],
            competenceLevelPercentageThresholds: [40, 70],
        };
        const spread = [
            [18, 18],
            [50, 50],
            [80, 80],
        ].map(([x, y], i) => ({
            ...points[0],
            studentId: `s${i}`,
            xPercentage: x,
            yPercentage: y,
        }));

        const chart = drawChart({ points: spread, gerThresholds: { ho: ladder, le: ladder } });

        expect(chart.xScale.domain()).toEqual([0, 100]);
        expect(chart.yScale.domain()).toEqual([0, 100]);
        /** @param {Scatterplot} drawn @returns {unknown} The title bar's toggle for it. */
        const toggleFor = (drawn) =>
            zoomToggle(
                /** @type {any} */ ({
                    chart: drawn,
                    options: { context: createTestContext() },
                    state: { isZoomed: signal(true) },
                    showsTable: false,
                }),
            );
        expect(toggleFor(chart)).toBe(nothing);
        expect(toggleFor(drawChart())).not.toBe(nothing);
    });
});

describe('Scatterplot threshold guides', () => {
    it('keeps the value of a regular tick a cut score falls on', () => {
        // A cut score prints no value of its own, but hiding every guide's label also
        // took "40 %" off an axis whose cut score sat exactly on it.
        const chart = drawChart({
            isZoomed: false,
            gerThresholds: {
                le: {
                    competenceLevelNames: ['A1', 'A2', 'B1'],
                    competenceLevelPercentageThresholds: [40, 55],
                },
            },
        });

        const labelDisplay = (/** @type {number} */ value) =>
            required(chart.svg)
                .selectAll('.x-axis .tick')
                .filter((d) => d === value)
                .select('text')
                .style('display');
        expect(labelDisplay(40)).not.toBe('none');
        expect(labelDisplay(55)).toBe('none');
    });

    it('take the colour of the domain each axis plots: the second on x, the first on y', () => {
        const ladder = {
            competenceLevelNames: ['A1', 'A2', 'B1'],
            competenceLevelPercentageThresholds: [40, 55],
        };
        const chart = drawChart({ isZoomed: false, gerThresholds: { ho: ladder, le: ladder } });

        const guideStroke = (/** @type {string} */ axis) =>
            /** @type {SVGElement} */ (
                required(chart.svg).select(`.${axis} .tick line[style]`).node()
            ).style.stroke;
        expect(guideStroke('x-axis')).toBe('var(--chart-domain1-guide)');
        expect(guideStroke('y-axis')).toBe('var(--chart-domain0-guide)');
    });
});

describe('Scatterplot pointer targets', () => {
    /** Two students a jitter step apart: their 24 px targets would overlap. */
    const neighbours = [
        points[0],
        { ...points[0], studentId: 's2', firstName: 'B', xPercentage: 40.3 },
        { ...points[1], studentId: 's3' },
    ];

    /**
     * @param {Element} element - A drawn point.
     * @returns {{clientX: number, clientY: number}} Its centre on screen.
     */
    const centre = (element) => {
        const box = element.getBoundingClientRect();
        return { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    };

    /**
     * Press and release at one spot, then click there, as a mouse does.
     * @param {Element} svg
     * @param {{clientX: number, clientY: number}} at
     * @param {{clientX: number, clientY: number}} [to] - Where the release lands, for a drag.
     */
    const press = (svg, at, to = at) => {
        const init = { bubbles: true, button: 0, isPrimary: true, pointerId: 1 };
        svg.dispatchEvent(new PointerEvent('pointerdown', { ...init, ...at }));
        if (to !== at) svg.dispatchEvent(new PointerEvent('pointermove', { ...init, ...to }));
        svg.dispatchEvent(new PointerEvent('pointerup', { ...init, ...to }));
        svg.dispatchEvent(new MouseEvent('click', { bubbles: true, ...to }));
    };

    /**
     * @param {Scatterplot} chart
     * @param {string} id
     * @returns {Element}
     */
    const pointOf = (chart, id) =>
        /** @type {Element} */ (
            [...chart.container.querySelectorAll('circle.student-point')].find(
                (el) => /** @type {any} */ (el).__data__.studentId === id,
            )
        );

    it('picks the point nearest the pointer, not the one painted last', () => {
        // With one target shape per point, neighbouring targets overlap and the one
        // painted last takes the pointer, so a click on one student's visible centre
        // selects the student beside it.
        const selectedIds = signal(/** @type {ReadonlySet<string>} */ (new Set()));
        const chart = drawChart({ points: neighbours, enableSelection: true, selectedIds });
        const svg = /** @type {Element} */ (chart.svg?.node());
        const [a, b] = [pointOf(chart, 's1'), pointOf(chart, 's2')];
        const gap = Math.hypot(
            /** @type {any} */ (a).__data__.x - /** @type {any} */ (b).__data__.x,
            /** @type {any} */ (a).__data__.y - /** @type {any} */ (b).__data__.y,
        );
        expect(gap).toBeLessThan(24);

        press(svg, centre(a));
        expect([...selectedIds.value]).toEqual(['s1']);
        press(svg, centre(b));
        expect([...selectedIds.value].sort()).toEqual(['s1', 's2']);
    });

    it('starts a marquee on a point instead of clicking it', () => {
        const selectedIds = signal(/** @type {ReadonlySet<string>} */ (new Set()));
        const chart = drawChart({ points: neighbours, enableSelection: true, selectedIds });
        const svg = /** @type {Element} */ (chart.svg?.node());
        const a = centre(pointOf(chart, 's1'));
        const c = centre(pointOf(chart, 's3'));

        // Past s3, away from s1, so the marquee spans both.
        const past = (/** @type {number} */ from, /** @type {number} */ to) =>
            to + Math.sign(to - from) * 10;
        press(svg, a, { clientX: past(a.clientX, c.clientX), clientY: past(a.clientY, c.clientY) });

        expect([...selectedIds.value]).toEqual(expect.arrayContaining(['s1', 's3']));
    });

    it('lets the visible points take the keyboard, with no target shapes beside them', () => {
        const chart = drawChart();
        const drawn = [...chart.container.querySelectorAll('circle')];

        expect(drawn.every((el) => el.classList.contains('student-point'))).toBe(true);
        expect(drawn[0].hasAttribute('tabindex')).toBe(true);
        expect(drawn[0].getAttribute('aria-label')).toBeTruthy();
    });
});

describe('Scatterplot data table', () => {
    const state = {
        id: 'state',
        type: 'state',
        name: 'Landesschnitt',
        roleIndex: 0,
        shortLabel: null,
        averages: {},
        domainAverages: { ho: 50, le: 52 },
    };

    it('lists the students, y axis (the first domain) first, then the averages drawn', () => {
        const chart = drawChart({
            groupAverages: { ho: 48, le: 51 },
            groupName: '8a',
            comparisons: [state],
            comparisonState: comparisonStateShowing(['state']),
        });
        const [students, averages] = toDataTableList(chart.dataTable());

        expect(students.columns.map((column) => column.label)).toEqual([
            'Schüler:in',
            'ho',
            'le',
            'GER ho',
            'GER le',
        ]);
        expect(students.rows.map((row) => row[1].values)).toEqual([[45], [55]]);
        expect(averages.rows.map((row) => row.map((cell) => cell.values ?? cell.text))).toEqual([
            ['8a', [48], [51]],
            ['Landesschnitt', [50], [52]],
        ]);
    });

    it('leaves out a comparison toggled off, and the averages without a marker', () => {
        const chart = drawChart({
            comparisons: [state],
            comparisonState: comparisonStateShowing([]),
        });
        expect(toDataTableList(chart.dataTable())).toHaveLength(1);
    });
});

describe('Scatterplot axis titles', () => {
    it('link the entry that claims each axis domain, whatever the payload names it', () => {
        // `Hören` and `Lesen` match no term: only the domain id finds the entry.
        const chart = drawChart({ enConfig: { ...enConfig, domainLabels: ['Hören', 'Lesen'] } });

        const titles = [...required(chart.svg?.node()).querySelectorAll('text.axis-label')].map(
            (title) => [
                title.textContent,
                /** @type {SVGTextElement} */ (title).dataset.glossaryKey,
            ],
        );
        expect(titles).toEqual(
            expect.arrayContaining([
                ['Hören', 'hörverstehen'],
                ['Lesen', 'leseverstehen'],
            ]),
        );
    });
});
