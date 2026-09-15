// @vitest-browser
// (renders a real d3 chart into a live container)

import { afterEach, describe, expect, it } from 'vitest';
import { ParallelCoordinatesChart } from '@tba3/modules/sl/modules/charts/longitudinal/parallelCoordinatesChart.js';
import { FakeResizeService } from '../../../../support/chartHarness.js';

/**
 * WHY: a series is named by a direct label at its end in both modes; the legend
 * exists in stacked mode only, where an end label sits on a band edge.
 */

const TIMELINE = [
    { year: '2022', measured: false, categories: { I: 20, II: 50, III: 30 } },
    { year: '2023', measured: false, categories: { I: 25, II: 45, III: 30 } },
    { year: '2024', measured: true, categories: { I: 30, II: 40, III: 30 } },
];

function makeContainer(id) {
    const container = document.createElement('div');
    container.id = id;
    container.style.width = '640px';
    container.style.height = '400px';
    document.body.appendChild(container);
    return container;
}

async function renderChart(options = {}) {
    makeContainer('pcc');
    const chart = new ParallelCoordinatesChart('pcc', TIMELINE, {
        resizeService: new FakeResizeService(),
        autoResize: false,
        categoryPrefix: '',
        categoryColors: { I: '#c00', II: '#0c0', III: '#00c' },
        ...options,
    });
    await chart.create();
    return chart;
}

const svgOf = (chart) => chart.svg.node();

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ParallelCoordinatesChart — series identity', () => {
    it('draws every line solid and marks every year with the same plain dot', async () => {
        const chart = await renderChart();
        const svg = svgOf(chart);

        for (const line of svg.querySelectorAll('.line'))
            expect(line.getAttribute('stroke-dasharray')).toBeNull();

        const marker = (cls) => svg.querySelector(`path.dot.${cls}`).getAttribute('d');
        expect(svg.querySelectorAll('path.dot').length).toBe(9);
        expect(new Set([marker('cat-I'), marker('cat-II'), marker('cat-III')]).size).toBe(1);
    });

    it('scales to a y maximum handed in by the view, so sibling cards share one axis', async () => {
        const own = await renderChart();
        expect(own.yScale.domain()[1]).toBe(50);
        document.body.innerHTML = '';
        const shared = await renderChart({ yMax: 80 });
        expect(shared.yScale.domain()[1]).toBe(80);
    });

    it('labels every series directly at its right end, spread apart when they collide', async () => {
        const chart = await renderChart();
        const svg = svgOf(chart);

        const labels = [...svg.querySelectorAll('.series-end-label')];
        expect(labels.map((l) => l.textContent)).toEqual(['I', 'II', 'III']);
        // All three sit right of the last year and none overlap.
        const lastX = chart.xScale('2024');
        const ys = labels.map((l) => parseFloat(l.getAttribute('y'))).sort((a, b) => a - b);
        for (const label of labels)
            expect(parseFloat(label.getAttribute('x'))).toBeGreaterThan(lastX);
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(8);
        // I (30) and III (30) end at the same value — they were pushed apart, not stacked.
        const y = (cls) =>
            parseFloat(svg.querySelector(`.series-end-label.${cls}`).getAttribute('y'));
        expect(Math.abs(y('cat-I') - y('cat-III'))).toBeGreaterThan(8);
    });

    it('switches to stacked bands and back, legend included', async () => {
        const chart = await renderChart();
        const svg = svgOf(chart);
        // Line mode: the end labels are the key, there is no legend to repeat them.
        expect(svg.querySelectorAll('.legend-item').length).toBe(0);

        chart.setViewMode(true);
        expect(svg.querySelectorAll('.line').length).toBe(0);
        expect(svg.querySelectorAll('.area').length).toBe(3);
        expect(svg.querySelectorAll('.series-end-label').length).toBe(3);
        // The legend appears with one swatch per band.
        expect(svg.querySelectorAll('.legend-item').length).toBe(3);

        chart.setViewMode(false);
        expect(svg.querySelectorAll('.area').length).toBe(0);
        expect(svg.querySelectorAll('.line').length).toBe(3);
        expect(svg.querySelectorAll('.legend-item').length).toBe(0);
    });
});

/**
 * WHY: the "Bereich" selector updates the series in place (`updateData`) rather
 * than rebuilding the chart, but that path transitions marks against the scales
 * the last full render built — it never rebuilds the x domain. Two Bereiche can
 * span different years (`buildKsHistory` drops a year with no data) while
 * keeping the same categories, so `updateData` has to report that as a miss the
 * way it reports a changed category set, and let the caller rerender. Taken
 * in place, every year the old domain did not know fell to the `?? 0` fallback
 * at the left edge, under an axis still labelled with the years it replaced.
 */
describe('ParallelCoordinatesChart — year axis after a Bereich switch', () => {
    const LATER_YEARS = [
        { year: '2023', measured: false, categories: { I: 10, II: 60, III: 30 } },
        { year: '2024', measured: false, categories: { I: 20, II: 50, III: 30 } },
        { year: '2025', measured: true, categories: { I: 30, II: 40, III: 30 } },
    ];

    const tickLabels = (chart) =>
        Array.from(chart.svg.node().querySelectorAll('.tick text')).map((t) => t.textContent);

    it('reports a miss when the years change, and rebuilds the x domain on the rerender', async () => {
        const chart = await renderChart();
        expect(tickLabels(chart)).toEqual(expect.arrayContaining(['2022', '2023', '2024']));

        // A miss: the caller (longitudinalKsShareConfig / teachingQualityConfig)
        // answers it with host.rerender().
        expect(chart.updateData(LATER_YEARS)).toBe(false);

        // What that rerender does: a full rebuild off the fresh derivations.
        await chart.refresh();

        expect(chart.xScale.domain()).toEqual(['2023', '2024', '2025']);
        expect(tickLabels(chart)).toEqual(expect.arrayContaining(['2023', '2024', '2025']));
        expect(tickLabels(chart)).not.toContain('2022');
    });

    it('keeps the in-place path for an unchanged year list', async () => {
        const chart = await renderChart();
        const sameYears = [
            { year: '2022', measured: false, categories: { I: 15, II: 55, III: 30 } },
            { year: '2023', measured: false, categories: { I: 25, II: 45, III: 30 } },
            { year: '2024', measured: true, categories: { I: 35, II: 35, III: 30 } },
        ];

        expect(chart.updateData(sameYears)).toBe(true);
        expect(chart.xScale.domain()).toEqual(['2022', '2023', '2024']);
    });

    it('places every year at its own x after the rebuild', async () => {
        const chart = await renderChart();
        chart.updateData(LATER_YEARS);
        await chart.refresh();

        const xs = Array.from(chart.svg.node().querySelectorAll('.dot.cat-I')).map((dot) => {
            const [, x] = /translate\(([-\d.]+),/.exec(dot.getAttribute('transform'));
            return Number(x);
        });

        expect(xs).toHaveLength(3);
        expect(new Set(xs).size).toBe(3);
        // Every year is on the domain, so every marker sits inside the padded
        // plot. A stale domain sent the years it did not know to the `?? 0`
        // fallback, pinning them to the left edge.
        expect(Math.min(...xs)).toBeGreaterThan(0);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
    });
});
