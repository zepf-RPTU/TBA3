// @vitest-browser
// (renders a real d3 chart into a live container)

import { describe, expect, it, vi } from 'vitest';
import { select } from 'd3';
import { LongitudinalLineChart } from '../../../../../src/sl/modules/charts/longitudinal/longitudinalLineChart.js';
import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { required } from '../../../../support/required.js';
import { formatPercent } from '../../../../../src/common/utils/numberFormat.js';

/**
 * The marks under `root` matching `selector` that are drawn for one series, found by
 * the datum the join bound to them.
 * @param {ParentNode} root
 * @param {string} selector
 * @param {string} key
 * @returns {Element[]} In document order.
 */
const marksOf = (root, selector, key) =>
    [...root.querySelectorAll(selector)].filter((node) => seriesKeyOf(node) === key);

/**
 * The series a mark is drawn for: its datum's key, or its datum's series' key for a vertex.
 * @param {Element} node
 * @returns {string|undefined}
 */
const seriesKeyOf = (node) => {
    const datum = /** @type {{key?: string, series?: {key: string}}} */ (select(node).datum());
    return datum.series?.key ?? datum.key;
};

/**
 * A series is named by a direct label at its end in both modes; the legend
 * exists in stacked mode only, where an end label sits on a band edge.
 */

const TIMELINE = [
    { year: '2022', categories: { I: 20, II: 50, III: 30 } },
    { year: '2023', categories: { I: 25, II: 45, III: 30 } },
    { year: '2024', categories: { I: 30, II: 40, III: 30 } },
];

/** @type {Record<string, string>} */
const COLORS = { I: '#c00', II: '#0c0', III: '#00c' };

/**
 * @param {string} category
 * @returns {string}
 */
const colorOf = (category) => COLORS[category];

/**
 * A series over its timeline's own years, on the `I`–`III` scale.
 * @param {import('../../../../../src/sl/utils/slHistory.js').LongitudinalYear[]} timeline
 * @param {Partial<import('../../../../../src/sl/modules/charts/longitudinal/longitudinalLineChart.js').LineSeries>} [extras] - What differs.
 * @returns {import('../../../../../src/sl/modules/charts/longitudinal/longitudinalLineChart.js').LineSeries}
 */
const lineSeries = (timeline, extras = {}) => ({
    years: timeline.map(({ year }) => year),
    timeline,
    colorOf,
    categoryOrder: ['I', 'II', 'III'],
    ...extras,
});

/**
 * A drawn chart of `TIMELINE`, lines unstacked.
 * @param {Partial<ConstructorParameters<typeof LongitudinalLineChart>[1]>} [options] - What differs.
 * @returns {LongitudinalLineChart}
 */
function renderChart(options = {}) {
    const chart = new LongitudinalLineChart(
        makeVisibleChartContainer('pcc', { widthPx: 640, heightPx: 400 }),
        {
            context: createTestContext('sl'),
            legend: 'top',
            autoResize: false,
            series: lineSeries(TIMELINE),
            yAxisLabel: 'Anteil (%)',
            isStacked: false,
            yMax: 50,
            ...options,
        },
    );
    chart.create();
    return chart;
}

/**
 * @param {LongitudinalLineChart} chart - A drawn chart.
 * @returns {SVGSVGElement}
 */
const svgOf = (chart) => required(required(chart.svg, 'svg').node(), 'svg node');

/**
 * @param {LongitudinalLineChart} chart
 * @returns {NodeListOf<Element>} The entries of its key.
 */
const keyEntries = (chart) =>
    required(chart.legendPanel, 'key panel').querySelectorAll('.legend-swatch-item');

/**
 * @param {Element} element
 * @param {string} name
 * @returns {number}
 */
const numberAttr = (element, name) => parseFloat(required(element.getAttribute(name), name));

describe('LongitudinalLineChart — series identity', () => {
    it('scales to the y maximum the view shares, rounded up to a tick', () => {
        const chart = renderChart({ yMax: 73 });
        expect(chart.yScale.domain()[1]).toBe(80);
        document.body.innerHTML = '';
        // Nothing to show anywhere: a [0, 0] domain would collapse the axis.
        expect(renderChart({ yMax: 0 }).yScale.domain()[1]).toBe(100);
    });

    it('labels every series directly at its right end, spread apart when they collide', () => {
        const chart = renderChart();
        const svg = svgOf(chart);

        const labels = [...svg.querySelectorAll('.series-end-label')];
        // Each names its series and its last value, so the latest year reads directly.
        expect(labels.map((l) => l.textContent?.split(' · ')[0])).toEqual(['I', 'II', 'III']);
        expect(labels[0].textContent).toBe(`I · ${formatPercent(30, 0)}`);
        const lastX = required(chart.xScale('2024'));
        const ys = labels.map((l) => numberAttr(l, 'y')).sort((a, b) => a - b);
        for (const label of labels) expect(numberAttr(label, 'x')).toBeGreaterThan(lastX);
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(8);
        // I (30) and III (30) end at the same value — they were pushed apart, not stacked.
        /**
         * @param {string} series
         * @returns {number} Its end label's y.
         */
        const y = (series) =>
            numberAttr(required(marksOf(svg, '.series-end-label', series)[0]), 'y');
        expect(Math.abs(y('I') - y('III'))).toBeGreaterThan(8);
        // A label pushed off its line's end is joined back to it.
        const leaders = [...svg.querySelectorAll('.series-end-leader')].map((line) =>
            seriesKeyOf(line),
        );
        expect(leaders.length).toBeGreaterThan(0);
        expect(leaders).not.toContain('II');
    });

    it('takes the hover and the tab stop per year, its tooltip listing every series', () => {
        // A year's dots are 10 px across and meet where levels converge; one band
        // per year reaches them all and names every value that year.
        const svg = svgOf(renderChart());
        const hits = [...svg.querySelectorAll('rect.line-year-hit')];

        expect(hits).toHaveLength(3);
        const label = hits[2].getAttribute('aria-label') ?? '';
        expect(label).toContain('2024');
        for (const series of ['I', 'II', 'III']) expect(label).toContain(`${series}:`);
        expect(svg.querySelector('.dot')?.hasAttribute('tabindex')).toBe(false);
    });

    it('draws the categories in the given order', () => {
        const chart = renderChart({
            series: lineSeries(TIMELINE, { categoryOrder: ['III', 'II', 'I'] }),
        });
        const order = [...svgOf(chart).querySelectorAll('path.series')].map((p) => seriesKeyOf(p));
        expect(order).toEqual(['III', 'II', 'I']);
    });

    it('switches to stacked bands and back on the same paths, legend included', () => {
        const chart = renderChart();
        const svg = svgOf(chart);
        const paths = [...svg.querySelectorAll('path.series')].map(
            (path) => /** @type {SVGPathElement} */ (path),
        );
        // Line mode: the end labels are the key, there is no legend to repeat them.
        expect(keyEntries(chart).length).toBe(0);
        expect(paths.map((p) => p.style.fill)).toEqual(['none', 'none', 'none']);

        chart.state.isStacked.value = true;
        expect([...svg.querySelectorAll('path.series')]).toEqual(paths);
        expect(paths.map((p) => p.style.fill)).toEqual([
            'rgb(204, 0, 0)',
            'rgb(0, 204, 0)',
            'rgb(0, 0, 204)',
        ]);
        expect(svg.querySelectorAll('.series-end-label').length).toBe(3);
        expect(keyEntries(chart).length).toBe(3);

        chart.state.isStacked.value = false;
        expect(paths.map((p) => p.style.fill)).toEqual(['none', 'none', 'none']);
        expect(keyEntries(chart).length).toBe(0);
    });
});

/**
 * The "Bereich" selector hands the chart a new series, which it moves in place
 * against the scales the last full render built — it never rebuilds the x domain there.
 * A new series can span other years while keeping the same categories, so that path
 * has to give way to a full redraw the way a changed category set does. Taken in place, every year the current domain
 * does not know would fall to the `?? 0` fallback at the left edge, under an axis still
 * labelled with the previous years.
 */
describe('LongitudinalLineChart — a Bereich switch', () => {
    const LATER_YEARS = [
        { year: '2023', categories: { I: 10, II: 60, III: 30 } },
        { year: '2024', categories: { I: 20, II: 50, III: 30 } },
        { year: '2025', categories: { I: 30, II: 40, III: 30 } },
    ];

    /**
     * @param {LongitudinalLineChart} chart
     * @returns {Array<string|null>}
     */
    const tickLabels = (chart) =>
        Array.from(svgOf(chart).querySelectorAll('.tick text')).map((t) => t.textContent);

    it('redraws the x domain when the years change', () => {
        const chart = renderChart();
        expect(tickLabels(chart)).toEqual(expect.arrayContaining(['2022', '2023', '2024']));

        chart.state.series.value = lineSeries(LATER_YEARS);

        expect(chart.xScale.domain()).toEqual(['2023', '2024', '2025']);
        expect(tickLabels(chart)).toEqual(expect.arrayContaining(['2023', '2024', '2025']));
        expect(tickLabels(chart)).not.toContain('2022');
    });

    it('moves the drawn series in place for an unchanged year list', () => {
        const chart = renderChart();
        const firstPath = svgOf(chart).querySelector('path.series');
        const sameYears = [
            { year: '2022', categories: { I: 15, II: 55, III: 30 } },
            { year: '2023', categories: { I: 25, II: 45, III: 30 } },
            { year: '2024', categories: { I: 35, II: 35, III: 30 } },
        ];

        chart.state.series.value = lineSeries(sameYears);

        expect(chart.xScale.domain()).toEqual(['2022', '2023', '2024']);
        expect(svgOf(chart).querySelector('path.series')).toBe(firstPath);
    });

    it('repaints the stacked legend with the new series colours', () => {
        const chart = renderChart({ isStacked: true });
        const swatchColour = () =>
            /** @type {HTMLElement} */ (
                required(keyEntries(chart)[0]?.querySelector('.legend-swatch'), 'legend swatch')
            ).style.backgroundColor;
        expect(swatchColour()).toBe('rgb(204, 0, 0)');

        chart.state.series.value = lineSeries(TIMELINE, { colorOf: () => '#abc' });

        expect(swatchColour()).toBe('rgb(170, 187, 204)');
    });

    it('places every year at its own x after the redraw', async () => {
        const chart = renderChart();
        chart.state.series.value = lineSeries(LATER_YEARS);
        const dotXs = () =>
            marksOf(svgOf(chart), '.series-dots', 'I')
                .flatMap((dots) => [...dots.querySelectorAll('.dot')])
                .map((dot) => {
                    const [, x] = required(
                        /translate\(([-\d.]+),/.exec(required(dot.getAttribute('transform'))),
                    );
                    return Number(x);
                });
        // The kept years move there and the dropped one fades out: the redraw has landed
        // once one dot per year sits at its year's place on the scale.
        await vi.waitFor(() => {
            const landed = dotXs();
            expect(landed).toHaveLength(LATER_YEARS.length);
            LATER_YEARS.forEach(({ year }, i) =>
                expect(landed[i]).toBeCloseTo(required(chart.xScale(year)), 1),
            );
        });

        const xs = dotXs();
        expect(xs).toHaveLength(3);
        expect(new Set(xs).size).toBe(3);
        // Every year is on the domain, so every marker sits inside the padded
        // plot. A stale domain would send the years it did not know to the `?? 0`
        // fallback, pinning them to the left edge.
        expect(Math.min(...xs)).toBeGreaterThan(0);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
    });

    it('shows a year in full again when the Bereich comes back during its fade-out', async () => {
        const chart = renderChart();
        const dotOf = (/** @type {string} */ year) =>
            /** @type {SVGCircleElement} */ (
                required(
                    marksOf(svgOf(chart), '.series-dots', 'I')
                        .flatMap((dots) => [...dots.querySelectorAll('.dot')])
                        .find(
                            (dot) =>
                                /** @type {{year: string}} */ (select(dot).datum()).year === year,
                        ),
                    `dot of ${year}`,
                )
            );
        const leaving = dotOf('2022');

        chart.state.series.value = lineSeries(LATER_YEARS);
        await vi.waitFor(
            () => {
                const opacity = Number(leaving.style.opacity);
                expect(opacity).toBeGreaterThan(0);
                expect(opacity).toBeLessThan(1);
            },
            { interval: 5 },
        );
        chart.state.series.value = lineSeries(TIMELINE);

        expect(dotOf('2022')).toBe(leaving);
        expect(leaving.style.opacity).toBe('1');
    });

    it('draws a new leader line at its place, not swept in from the corner', () => {
        // Apart at the end, so no label is moved and no leader drawn.
        const chart = renderChart({
            yMax: 100,
            series: lineSeries([
                { year: '2023', categories: { I: 10, II: 50, III: 90 } },
                { year: '2024', categories: { I: 10, II: 50, III: 90 } },
            ]),
        });
        expect(svgOf(chart).querySelectorAll('.series-end-leader')).toHaveLength(0);

        // I and III now end together: the spread moves a label, and a leader enters.
        chart.state.series.value = lineSeries(TIMELINE);

        const leaders = [...svgOf(chart).querySelectorAll('.series-end-leader')];
        expect(leaders.length).toBeGreaterThan(0);
        const lastX = required(chart.xScale('2024'));
        for (const leader of leaders) {
            expect(numberAttr(leader, 'x1')).toBeGreaterThan(lastX);
            expect(numberAttr(leader, 'x2')).toBeGreaterThan(numberAttr(leader, 'x1'));
        }
    });
});

describe('LongitudinalLineChart data table', () => {
    it('lists one row per year and one column per series, in draw order', () => {
        const chart = renderChart({
            series: lineSeries(TIMELINE, {
                categoryOrder: ['III', 'II', 'I'],
                categoryLabels: { III: 'Stufe III' },
            }),
        });
        const table = required(chart.dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Jahr',
            'Stufe III',
            'II',
            'I',
        ]);
        expect(table.columns[1].fields).toEqual(['Stufe III (%)']);
        expect(table.rows.map((row) => row.map((cell) => cell.text))).toEqual(
            TIMELINE.map(({ year, categories }) => [
                year,
                formatPercent(categories.III),
                formatPercent(categories.II),
                formatPercent(categories.I),
            ]),
        );
    });
});

/**
 * An untested year is a gap, never a 0. A level on the scale (`categoryOrder`) that a
 * tested year does not list is one nobody reached, 0 % everywhere the chart says it; a
 * level off the scale is not drawn (earlier years are assumed to use the current ladder,
 * ASSUMPTION-SL-HISTORY-SAME-LADDER).
 */
describe('LongitudinalLineChart — gaps and zeros', () => {
    /**
     * @param {Element} node - A dot or a hit band.
     * @returns {string} The year its datum is of.
     */
    const yearOf = (node) => /** @type {{year: string}} */ (select(node).datum()).year;

    /**
     * @param {SVGSVGElement} svg
     * @param {string} key
     * @returns {string[]} The years its dots stand at.
     */
    const dotYears = (svg, key) =>
        marksOf(svg, '.series-dots', key).flatMap((dots) =>
            [...dots.querySelectorAll('.dot')].map(yearOf),
        );

    /**
     * @param {SVGSVGElement} svg
     * @param {string} key
     * @returns {string} Its line's path data.
     */
    const pathOf = (svg, key) =>
        required(required(marksOf(svg, 'path.series', key)[0]).getAttribute('d'), 'd');

    /**
     * @param {string} d - Path data.
     * @returns {number[]} The x of every vertex.
     */
    const vertexXs = (d) => [...d.matchAll(/[ML]([-\d.e]+),/g)].map(([, x]) => Number(x));

    /**
     * @param {LongitudinalLineChart} chart
     * @returns {string[]} The years with a hit band, so a tooltip.
     */
    const hitYears = (chart) =>
        [...svgOf(chart).querySelectorAll('rect.line-year-hit')].map(yearOf);

    /**
     * @param {LongitudinalLineChart} chart
     * @param {string} year
     * @returns {import('../../../../../src/common/services/cursorTooltip.js').TooltipContent} What its year's tooltip shows.
     */
    const tooltipOf = (chart, year) => {
        const hit = required(
            [...svgOf(chart).querySelectorAll('rect.line-year-hit')].find(
                (node) => yearOf(node) === year,
            ),
            `hit band of ${year}`,
        );
        return chart.formatTooltipContent(
            /** @type {{year: string, points: any[]}} */ (select(hit).datum()),
        );
    };

    it('reads a level on the scale that a year does not list as 0 %, in the table too', () => {
        const chart = renderChart({
            series: lineSeries(
                [
                    { year: '2022', categories: { I: 20, II: 50, III: 30 } },
                    { year: '2023', categories: { II: 60, III: 40 } },
                    { year: '2024', categories: { I: 30, II: 40, III: 30 } },
                ],
                { categoryOrder: ['I', 'II', 'III'] },
            ),
        });
        const svg = svgOf(chart);

        expect(dotYears(svg, 'I')).toEqual(['2022', '2023', '2024']);
        const dot = required(
            marksOf(svg, '.series-dots', 'I')
                .flatMap((dots) => [...dots.querySelectorAll('.dot')])
                .find((node) => yearOf(node) === '2023'),
        );
        expect(dot.getAttribute('transform')).toContain(`, ${chart.yScale(0)})`);
        expect(tooltipOf(chart, '2023').rows).toContainEqual({
            label: 'I',
            value: formatPercent(0),
        });
        expect(required(chart.dataTable()).rows[1][1]).toEqual({
            text: formatPercent(0),
            values: [0],
        });
    });

    it('does not draw a level only an earlier year lists, off the current ladder', () => {
        // `I` is listed by 2022 alone; the current ladder runs II–III.
        const chart = renderChart({
            series: lineSeries(
                [
                    { year: '2022', categories: { I: 10, II: 40, III: 50 } },
                    { year: '2023', categories: { II: 50, III: 50 } },
                ],
                { categoryOrder: ['II', 'III'] },
            ),
        });
        const svg = svgOf(chart);

        expect([...svg.querySelectorAll('path.series')].map(seriesKeyOf)).toEqual(['II', 'III']);
        expect(dotYears(svg, 'I')).toEqual([]);
        expect(tooltipOf(chart, '2022').rows?.map((row) => row && row.label)).toEqual([
            'II',
            'III',
        ]);
        expect(required(chart.dataTable()).columns.map((column) => column.label)).toEqual([
            'Jahr',
            'II',
            'III',
        ]);
    });

    it('spans every year of the history, an untested one a gap', () => {
        const chart = renderChart({
            series: {
                ...lineSeries([
                    { year: '2021', categories: { I: 20, II: 50, III: 30 } },
                    { year: '2022', categories: { I: 25, II: 45, III: 30 } },
                    { year: '2024', categories: { I: 30, II: 40, III: 30 } },
                ]),
                years: ['2021', '2022', '2023', '2024'],
            },
        });
        const svg = svgOf(chart);

        expect(chart.xScale.domain()).toEqual(['2021', '2022', '2023', '2024']);
        expect([...svg.querySelectorAll('.x-axis .tick text')].map((t) => t.textContent)).toEqual([
            '2021',
            '2022',
            '2023',
            '2024',
        ]);
        const d = pathOf(svg, 'I');
        // Two runs, and no vertex in 2023: no segment bridges the untested year.
        expect(d.match(/M/g)).toHaveLength(2);
        expect(vertexXs(d)).not.toContainEqual(required(chart.xScale('2023')));
        expect(dotYears(svg, 'I')).toEqual(['2021', '2022', '2024']);
        expect(hitYears(chart)).toEqual(['2021', '2022', '2024']);
        expect(required(chart.dataTable()).rows[2].map((cell) => cell.text)).toEqual([
            '2023',
            '',
            '',
            '',
        ]);
    });

    it('titles a tooltip with the bare year, as the box plot beside it does', () => {
        expect(tooltipOf(renderChart(), '2024').title).toBe('2024');
    });
});
