// @vitest-browser

import { describe, expect, it } from 'vitest';
import { StyleLollipopChart } from '../../../../../src/en/modules/charts/style/styleLollipopChart.js';
import { buildLegendItems } from '../../../../../src/en/modules/charts/style/styleLollipopLegend.js';
import { comparisonSeriesClass } from '../../../../../src/common/charts/comparisonSeries.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
} from '../../../../support/chartHarness.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { required } from '../../../../support/required.js';

const enConfig = {
    domainIds: ['ho', 'le'],
    domainLabels: ['Hören', 'Lesen'],
    styleCategories: [
        { value: 'global', fieldName: 'globalPercent', label: 'Global' },
        { value: 'detailliert', fieldName: 'detailliertPercent', label: 'Detailliert' },
        { value: 'selektiv', fieldName: 'selektivPercent', label: 'Selektiv' },
    ],
};

/**
 * The group and a Landesschnitt, neither of which carries a `detailliert` value.
 * @type {import('../../../../../src/en/utils/enStyleAggregationAdapter.js').ParsedStyleAggregation}
 */
const styleAverages = {
    groupName: '8a',
    groupAverages: { ho_global: 60, ho_selektiv: 70 },
    groupDomainAverages: {},
    comparisonGroups: [
        {
            id: 'hb',
            type: 'state',
            name: 'Landesschnitt',
            roleIndex: 0,
            shortLabel: null,
            averages: { ho_global: 55, ho_selektiv: 65 },
            domainAverages: {},
        },
    ],
};

describe('StyleLollipopChart', () => {
    it('draws no group pill and no marker for a category without a value', () => {
        // A missing value drawn as 0 % is a group pill and a Landesschnitt marker
        // at the axis origin, which a reader takes for a real result.
        const container = makeVisibleChartContainer('style-lollipop');
        container.style.width = '640px';
        container.style.height = '420px';
        /** @type {number[]} */
        const minHeights = [];
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            // The rows' floor alone: the key over the plot lists other entries per mode.
            legend: undefined,
            enConfig,
            styleAverages,
            mode: 'ho',
            studentValues: null,
            onMinHeight: (minHeight) => minHeights.push(minHeight),
        });

        chart.create();

        expect(required(chart.svg).selectAll('.lollipop-head').size()).toBe(2);
        // A comparison group's markers are classed by its position among the groups.
        const series = comparisonSeriesClass(
            chart.comparisonGroups.findIndex((group) => group.id === 'hb'),
        );
        expect(required(chart.svg).selectAll(`.${series}-marker`).size()).toBe(2);
        // The first render hands the host the height its rows need.
        expect(minHeights).toHaveLength(1);
        expect(minHeights[0]).toBeGreaterThan(0);
    });

    it('draws the group values over the comparison markers, ringed in the card surface', () => {
        // The Landesschnitt square sits on the group pill; under it the value read "5▪ %".
        const container = makeVisibleChartContainer('style-lollipop-layers');
        container.style.width = '640px';
        container.style.height = '420px';
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig,
            styleAverages,
            mode: 'ho',
            studentValues: null,
            onMinHeight: () => {},
        });

        chart.create();

        const markers = /** @type {Element} */ (
            required(chart.svg).select('.average-markers').node()
        );
        const layers = [...(markers.parentElement?.children ?? [])].map((layer) =>
            layer.getAttribute('class'),
        );
        expect(layers.indexOf('style-head-labels')).toBeGreaterThan(
            layers.indexOf('average-markers'),
        );
        const labels = required(chart.svg).selectAll('.style-head-labels .value-label');
        expect(labels.size()).toBeGreaterThan(0);
        expect(labels.classed('value-label--halo')).toBe(true);
    });

    it('reports its minimum height again only when it changes', () => {
        // The host writes the height as the card's min-height, a style write that
        // relayouts the grid; a redraw at the same rows must not repeat it.
        const container = makeVisibleChartContainer('style-lollipop-min');
        container.style.width = '640px';
        container.style.height = '420px';
        /** @type {number[]} */
        const minHeights = [];
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            // The rows' floor alone: the key over the plot lists other entries per mode.
            legend: undefined,
            enConfig,
            styleAverages,
            mode: 'ho',
            studentValues: null,
            onMinHeight: (minHeight) => minHeights.push(minHeight),
        });
        chart.create();
        expect(minHeights).toHaveLength(1);

        // Every mode lays the style bands out for both domains: a switch keeps the floor,
        // so the card keeps its height.
        chart.state.mode.value = 'all';
        chart.refresh();
        expect(minHeights).toHaveLength(1);
    });

    it('draws its first pass at the height its minimum gives the card', () => {
        // A card below the floor grows once told it; a first draw at the old height would
        // leave a second one, at the grown height, to the resize observer's delay.
        const container = makeVisibleChartContainer('style-lollipop-floor');
        container.style.width = '640px';
        container.style.height = '120px';
        /** @type {number[]} */
        const minHeights = [];
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            legend: undefined,
            enConfig,
            styleAverages,
            mode: 'ho',
            studentValues: null,
            onMinHeight: (minHeight) => {
                minHeights.push(minHeight);
                container.style.minHeight = `${minHeight}px`;
            },
        });

        chart.create();

        expect(minHeights[0]).toBeGreaterThan(120);
        const drawnHeight = Number(required(chart.svg).attr('height'));
        expect(drawnHeight).toBeCloseTo(chart.container.getBoundingClientRect().height, 0);
        expect(drawnHeight).toBeGreaterThan(120);
    });

    it('keeps the style axis and tags every row with its domain in every mode', () => {
        // A Domäne switch neither relabels nor moves the ticks; the domain is the letter at
        // each stem base, never a prefix on the style label.
        const container = makeVisibleChartContainer('style-lollipop-axis');
        container.style.width = '640px';
        container.style.height = '420px';
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig,
            styleAverages: {
                ...styleAverages,
                groupAverages: { ...styleAverages.groupAverages, le_global: 50 },
            },
            mode: 'ho',
            studentValues: null,
        });
        chart.create();
        const ticks = () =>
            [...container.querySelectorAll('.y-axis .tick')].map((tick) => [
                tick.textContent,
                tick.getAttribute('transform'),
            ]);
        const tags = () =>
            [...container.querySelectorAll('.domain-tag')].map((tag) => tag.textContent);
        const atHoeren = ticks();
        expect(atHoeren.map(([text]) => text)).toEqual(['Global', 'Detailliert', 'Selektiv']);
        expect(tags()).toEqual(['H', 'H', 'H']);
        // A single domain's row sits on its style's tick.
        const globalStem = /** @type {SVGLineElement} */ (
            container.querySelector('.lollipop-line.ho')
        );
        expect(atHoeren[0][1]).toBe(`translate(0,${globalStem.getAttribute('y1')})`);

        chart.state.mode.value = 'all';
        expect(ticks()).toEqual(atHoeren);
        expect(tags()).toEqual(['H', 'L', 'H', 'L', 'H', 'L']);

        chart.state.mode.value = 'le';
        expect(ticks()).toEqual(atHoeren);
    });

    it('gives a row back the pointer when its Domäne returns while it fades out', () => {
        // Leaving takes a mark off the pointer and the keyboard at once (`isMarkShown`
        // reads the inline pointer-events); one switched back mid-fade gets back exactly
        // what it had: the stem and the pill the pointer, the labels none.
        const container = makeVisibleChartContainer('style-lollipop-take-back');
        container.style.width = '640px';
        container.style.height = '420px';
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig,
            styleAverages: {
                ...styleAverages,
                groupAverages: { ...styleAverages.groupAverages, le_global: 50 },
            },
            mode: 'all',
            studentValues: null,
        });
        chart.create();
        const lesenPointerEvents = () =>
            [...container.querySelectorAll('.le')].map((mark) => [
                mark.getAttribute('class'),
                /** @type {SVGElement} */ (mark).style.pointerEvents,
            ]);
        const shown = lesenPointerEvents();
        expect(shown.map(([, pointerEvents]) => pointerEvents)).toContain('');

        chart.state.mode.value = 'ho';
        expect(lesenPointerEvents().every(([, pointerEvents]) => pointerEvents === 'none')).toBe(
            true,
        );

        chart.state.mode.value = 'all';
        expect(lesenPointerEvents()).toEqual(shown);
    });

    it('links a style label only to a term the glossary resolves', () => {
        // A key made by lowercasing the label made a term of a style the glossary
        // does not know: a tab stop whose popup has no entry to open.
        const container = makeVisibleChartContainer('style-lollipop-terms');
        container.style.width = '640px';
        container.style.height = '420px';
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig: {
                ...enConfig,
                styleCategories: [
                    ...enConfig.styleCategories,
                    { value: 'inferenz', fieldName: 'inferenzPercent', label: 'Inferenz' },
                ],
            },
            styleAverages,
            mode: 'all',
            studentValues: null,
        });

        chart.create();

        const keyOf = (/** @type {string} */ label) =>
            [...container.querySelectorAll('.y-axis .tick text')]
                .find((text) => text.textContent === label)
                ?.getAttribute('data-glossary-key');
        expect(keyOf('Global')).toBe('global');
        expect(keyOf('Inferenz')).toBeNull();
    });
});

describe('StyleLollipopChart data table', () => {
    /**
     * @param {string} mode - `all`, or the domain drawn.
     * @param {string[]} activeModes - The comparison ids toggled on.
     * @returns {StyleLollipopChart} Drawn.
     */
    function drawTable(mode, activeModes) {
        const container = makeVisibleChartContainer('style-lollipop-table', {
            widthPx: 640,
            heightPx: 420,
        });
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig,
            styleAverages,
            mode,
            studentValues: null,
            comparisonState: comparisonStateShowing(activeModes),
        });
        chart.create();
        return chart;
    }

    it('lists the styles drawn, with the group and each shown comparison', () => {
        const table = required(drawTable('ho', ['hb']).dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Stil',
            '8a',
            'Landesschnitt',
        ]);
        // `detailliert` has no value in any column: nothing drawn, no row.
        expect(table.rows.map(([head]) => head.text)).toEqual(['Global', 'Selektiv']);
        expect(table.rows[0].slice(1).map((cell) => cell.values)).toEqual([[60], [55]]);
    });

    it('drops a comparison toggled off, and names the domain of each grouped row', () => {
        const table = required(drawTable('all', []).dataTable());

        expect(table.columns.map((column) => column.label)).toEqual(['Stil', 'Domäne', '8a']);
        expect(table.rows.map((row) => row.slice(0, 2).map((cell) => cell.text))).toEqual([
            ['Global', 'Hören'],
            ['Selektiv', 'Hören'],
        ]);
    });
});

describe('StyleLollipopChart legend', () => {
    it('links each domain pill by its id, never by matching its name', () => {
        const container = makeVisibleChartContainer('style-lollipop-legend');
        container.style.width = '640px';
        container.style.height = '420px';
        const chart = new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig,
            styleAverages,
            mode: 'all',
            studentValues: null,
        });
        chart.create();

        const domainPills = buildLegendItems(chart, true).slice(0, 2);
        expect(domainPills.map((item) => item.labelSegments)).toEqual([
            [{ text: 'Hören', glossaryKey: 'hörverstehen' }],
            [{ text: 'Lesen', glossaryKey: 'leseverstehen' }],
        ]);
    });
});
