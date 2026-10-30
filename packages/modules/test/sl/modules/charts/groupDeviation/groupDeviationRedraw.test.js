// @vitest-browser

/**
 * Group deviation — a redraw runs against the SVG already drawn.
 *
 * The columns join by name, so a resize or a theme switch moves the bars, labels and
 * rules already drawn: a second pass with the same data changes nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, signal } from '@preact/signals-core';

import { GroupDeviationChart } from '../../../../../src/sl/modules/charts/groupDeviation/groupDeviationChart.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { required } from '../../../../support/required.js';

const CONTAINER_ID = 'sl-group-deviation-redraw-test';

/**
 * The school value box the chart placed in its plot area, if any.
 * @param {HTMLElement} container
 * @returns {HTMLElement|null}
 */
const schoolBoxIn = (container) => container.querySelector('.school-value-box');

/** @typedef {import('../../../../../src/sl/modules/charts/groupDeviation/groupDeviationChart.js').GroupDeviationData} GroupDeviationData */

/**
 * A chart over the test container that draws `data` whatever the metric.
 * @param {GroupDeviationData} data
 * @returns {GroupDeviationChart} Not yet created.
 */
function chartOf(data) {
    return new GroupDeviationChart(
        /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID)),
        {
            context: createTestContext('sl'),
            autoResize: false,
            data,
        },
    );
}

/** @type {any} The metric, as far as the chart reads it. */
const METRIC = {
    id: 'regular',
    label: () => 'Regelstandard erreicht',
    caption: () => 'erreichen den Regelstandard',
    higherIsBetter: true,
    unsupportedMessage: 'metric-unsupported',
};

/** @type {import('../../../../../src/sl/utils/slSchoolSummaryMetrics.js').SummaryRow} */
const ROW = {
    subjectName: 'Deutsch',
    domainId: 'le',
    domainName: 'Lesen',
    rowLabel: 'Deutsch: Lesen',
    schoolValue: 50,
    entries: [
        { name: 'Landesschnitt', label: 'L', kind: 'average', value: 55, deltaPP: 5 },
        { name: '8a', label: '8a', kind: 'group', value: 40, deltaPP: -10 },
        { name: '8b', label: '8b', kind: 'group', value: 62, deltaPP: 12 },
    ],
};

/**
 * The data a pass draws: `ROW` under `METRIC` on a ±20 PP scale, unless overridden.
 * @param {Partial<GroupDeviationData>} [overrides]
 * @returns {GroupDeviationData}
 */
function deviationData(overrides = {}) {
    return {
        row: ROW,
        absence: null,
        yDomain: [-20, 20],
        labelLines: 1,
        neutralKey: false,
        metric: METRIC,
        ...overrides,
    };
}

describe('Group deviation — redraw in place', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 200 });
    });

    it('changes nothing when it draws the same data again', () => {
        // A pass that appended a second baseline, rule or label row would stack
        // them over the first, and a rebuilt bar drops keyboard focus.
        const container = /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID));
        const chart = chartOf(deviationData());
        chart.create();

        expectStableRedraw(chart, '.deviation-bar');
        expect(container.querySelectorAll('line.zero-baseline')).toHaveLength(1);
        expect(container.querySelectorAll('line.average-divider')).toHaveLength(1);
    });

    it('gives every column a hit band of the plot height, however short its bar', () => {
        // A near-zero deviation draws a 1 px bar, which no pointer could find.
        const container = /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID));
        const flat = { ...ROW, entries: [{ ...ROW.entries[1], value: 50, deltaPP: 0 }] };
        chartOf(deviationData({ row: flat })).create();
        const hits = container.querySelectorAll('rect.deviation-hit');
        const bar = container.querySelector('rect.deviation-bar');

        expect(hits).toHaveLength(1);
        expect(Number(hits[0].getAttribute('height'))).toBeGreaterThan(
            10 * Number(bar?.getAttribute('height')),
        );
        expect(hits[0].getAttribute('aria-label')).toContain('8a');
    });

    it('redraws the bars it has for a metric change, and drops the school box without a row', () => {
        // The renderer follows the metric itself; a host that rebuilt it per metric
        // would re-enter every bar and drop the focused one.
        const container = /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID));
        const metricId = signal('regular');
        /** @type {{[id: string]: GroupDeviationData}} */
        const byMetric = {
            regular: deviationData(),
            minimum: deviationData({
                row: {
                    ...ROW,
                    schoolValue: 0.7,
                    entries: ROW.entries.map((e) => ({ ...e, deltaPP: -e.deltaPP })),
                },
            }),
            optimal: deviationData({ row: null }),
        };
        const chart = new GroupDeviationChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            data: computed(() => byMetric[metricId.value]),
        });
        chart.create();
        const bar = container.querySelector('rect.deviation-bar');
        // The datum the join bound; the bar's geometry follows it in a transition.
        const datum = () => /** @type {any} */ (bar)?.__data__;
        expect(datum().deltaPP).toBe(5);
        expect(schoolBoxIn(container)?.textContent).not.toMatch(/70\s%/);

        metricId.value = 'minimum';

        expect(container.querySelector('rect.deviation-bar')).toBe(bar);
        expect(bar?.isConnected).toBe(true);
        expect(datum().deltaPP).toBe(-5);
        expect(schoolBoxIn(container)?.textContent).toMatch(/70\s%/);

        metricId.value = 'optimal';

        expect(container.querySelector('rect.deviation-bar')).toBeNull();
        expect(schoolBoxIn(container)).toBeNull();
    });

    it('drops the school box when a metric fails to draw', () => {
        // One renderer serves every metric, so the box of the metric drawn before
        // would stand beside the failure sentence as if it were this metric's value.
        const container = /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID));
        const metricId = signal('regular');
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        const chart = new GroupDeviationChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            data: computed(() => {
                if (metricId.value !== 'regular') throw new Error('no summary for this metric');
                return deviationData();
            }),
        });
        chart.create();
        expect(schoolBoxIn(container)).not.toBeNull();

        metricId.value = 'broken';

        expect(logged).toHaveBeenCalled();
        expect(container.querySelector('.chart-message')).not.toBeNull();
        expect(schoolBoxIn(container)).toBeNull();
        logged.mockRestore();
    });

    it('takes the average rule away when a redraw leaves no average column', () => {
        // The renderer redraws in place for a ⌀ toggle; the rule of the pass before
        // would stay where the last average column ended, between two group columns.
        const container = /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID));
        const selection = signal('with-average');
        /** @type {{[id: string]: GroupDeviationData}} */
        const bySelection = {
            'with-average': deviationData(),
            'groups-only': deviationData({
                row: { ...ROW, entries: ROW.entries.filter((entry) => entry.kind === 'group') },
            }),
        };
        const chart = new GroupDeviationChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            data: computed(() => bySelection[selection.value]),
        });
        chart.create();
        expect(container.querySelectorAll('line.average-divider')).toHaveLength(1);

        selection.value = 'groups-only';

        expect(container.querySelectorAll('rect.deviation-bar')).toHaveLength(2);
        expect(container.querySelectorAll('line.average-divider')).toHaveLength(0);

        selection.value = 'with-average';
        expect(container.querySelectorAll('line.average-divider')).toHaveLength(1);
    });
});

describe('Group deviation — what the colours mean', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 240 });
    });

    it('keys both bar colours and names the verdict in each tooltip', () => {
        // A rising bar can be bad news (Landesschnitt above the school), so the
        // colour says nothing without a key and a tooltip line.
        const container = /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID));
        // A padded plot area, as in the app: the box is placed from the SVG's own offset.
        container.style.setProperty('--chart-container-padding', '17px');
        const chart = new GroupDeviationChart(container, {
            context: createTestContext('sl'),
            autoResize: false,
            legend: 'top',
            data: deviationData(),
        });
        chart.create();

        expect(chart.legendPanel?.textContent).toContain('Günstig für die Schule');
        // The key sits over the plot, and the school box still centres on the zero line.
        const box = required(schoolBoxIn(container)).getBoundingClientRect();
        const zero = required(container.querySelector('.zero-baseline')).getBoundingClientRect();
        expect(Math.abs(box.top + box.height / 2 - (zero.top + zero.height / 2))).toBeLessThan(1);
        expect(box.right).toBeLessThanOrEqual(zero.left);
        expect(chart.legendPanel?.textContent).toContain('Ungünstig für die Schule');
        // The Landesschnitt five points above the school is unfavourable for it.
        expect(chart.formatTooltipContent(ROW.entries[0]).rows).toContainEqual({
            label: 'Bewertung',
            value: 'Ungünstig für die Schule',
        });
        expect(chart.formatTooltipContent(ROW.entries[2]).rows).toContainEqual({
            label: 'Bewertung',
            value: 'Günstig für die Schule',
        });
    });
});

describe('Group deviation — no difference', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 240 });
    });

    /** @type {import('../../../../../src/sl/utils/slSchoolSummaryMetrics.js').SummaryRow} */
    const LEVEL_ROW = {
        ...ROW,
        entries: [
            { name: 'Landesschnitt', label: 'L', kind: 'average', value: 0.5, deltaPP: 0 },
            { name: '8a', label: '8a', kind: 'group', value: 0.5004, deltaPP: 0.04 },
            { name: '8b', label: '8b', kind: 'group', value: 0.62, deltaPP: 12 },
        ],
    };

    it('gives a bar at 0,0 PP the neutral verdict, a group and an average alike', () => {
        // A Landesschnitt level with the school read "ungünstig", a group level with it
        // "günstig" (the other way round on a lower-is-better metric): a verdict the
        // bar's "0,0 PP" does not show.
        for (const higherIsBetter of [true, false]) {
            const chart = new GroupDeviationChart(
                /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID)),
                {
                    context: createTestContext('sl'),
                    autoResize: false,
                    legend: 'top',
                    data: deviationData({
                        row: LEVEL_ROW,
                        neutralKey: true,
                        metric: { ...METRIC, higherIsBetter },
                    }),
                },
            );
            chart.create();
            const container = /** @type {HTMLElement} */ (document.getElementById(CONTAINER_ID));
            const barOf = (/** @type {string} */ kind) =>
                [...container.querySelectorAll(`rect.deviation-bar--${kind}`)].map(
                    (bar) => /** @type {any} */ (bar).__data__.name,
                );
            const verdictOf = (/** @type {number} */ index) => {
                const rows = chart.formatTooltipContent(required(LEVEL_ROW.entries[index])).rows;
                const rating = rows?.find((row) => row && row.label === 'Bewertung');
                return rating ? rating.value : undefined;
            };
            const table = required(chart.dataTable());

            expect(barOf('neutral')).toEqual(['Landesschnitt', '8a']);
            expect(verdictOf(0)).toBe('Kein Unterschied');
            expect(verdictOf(1)).toBe('Kein Unterschied');
            expect(table.rows.slice(1, 3).map((row) => row[3].text)).toEqual([
                'Kein Unterschied',
                'Kein Unterschied',
            ]);
            // A difference keeps its verdict.
            const verdict = higherIsBetter ? 'Günstig für die Schule' : 'Ungünstig für die Schule';
            expect(barOf(higherIsBetter ? 'favourable' : 'unfavourable')).toEqual(['8b']);
            expect(verdictOf(2)).toBe(verdict);
            expect(table.rows[3][3].text).toBe(verdict);
            expect(chart.legendPanel?.textContent).toContain('Kein Unterschied');
            chart.destroy();
        }
    });

    it('keys the neutral colour only while the view draws it', () => {
        const chart = chartOf(deviationData());
        chart.create();
        expect(chart.chartKey()[0].items.map((item) => item.label)).toEqual([
            'Günstig für die Schule',
            'Ungünstig für die Schule',
        ]);
    });
});

describe('Group deviation — data table', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 200 });
    });

    it('lists the school first, then each column drawn, in percent with its difference', () => {
        const chart = chartOf(
            deviationData({
                row: {
                    ...ROW,
                    schoolValue: 0.5,
                    entries: [
                        {
                            name: 'Landesschnitt',
                            label: 'L',
                            kind: 'average',
                            value: 0.55,
                            deltaPP: 5,
                        },
                        { name: '8a', label: '8a', kind: 'group', value: 0.4, deltaPP: -10 },
                    ],
                },
            }),
        );
        chart.create();
        const table = required(chart.dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Gruppe',
            'Regelstandard erreicht',
            'Differenz',
            'Bewertung',
        ]);
        expect(table.rows.map(([head]) => head.text)).toEqual(['Schule', 'L', '8a']);
        expect(table.rows[0].slice(1, 3).map((cell) => cell.values)).toEqual([[50], [null]]);
        expect(table.rows[2].slice(1, 3).map((cell) => cell.values)).toEqual([[40], [-10]]);
    });

    it('has no table while a sentence stands in for the chart', () => {
        const chart = chartOf(deviationData({ row: null }));
        chart.create();
        expect(chart.dataTable()).toBeNull();
    });
});
