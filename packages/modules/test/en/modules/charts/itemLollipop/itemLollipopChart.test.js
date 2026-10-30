// @vitest-browser

import { describe, expect, it } from 'vitest';
import { ItemLollipopChart } from '../../../../../src/en/modules/charts/itemLollipop/itemLollipopChart.js';
import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { lollipopItem } from '../../../../support/groupDocumentStoreFixture.js';
import { required } from '../../../../support/required.js';
import { itemValueGroups, scaleValueGroup } from '../../../../support/competenceScaleFixture.js';
import { formatPercent } from '../../../../../src/common/utils/numberFormat.js';

/** @typedef {import('../../../../../src/en/modules/charts/itemLollipop/itemLollipopChart.js').ItemData} ItemData */

const ITEMS = [lollipopItem('a', '1', '1', 40), lollipopItem('b', '2', '2', 60)];

/**
 * The Niveau section's entries in a key panel, in order.
 * @param {HTMLElement} panel
 * @returns {Element[]}
 */
const niveauEntries = (panel) =>
    [...panel.querySelectorAll('.legend-section')]
        .filter(
            (node) => node.querySelector('.legend-section-title')?.textContent?.trim() === 'Niveau',
        )
        .flatMap((node) => [...node.querySelectorAll('.legend-swatch-item')]);

/**
 * @param {ItemData[]} items
 * @param {import('../../../../../src/common/domain/resultAggregations.js').ResultType[]} [resultTypes] - The tooltip's result rows.
 * @param {string[]} [itemCompetenceLevels] - The dataset's Aufgabenniveaus.
 * @returns {ItemLollipopChart} Not yet created.
 */
function makeChart(items, resultTypes = [], itemCompetenceLevels = ['1', '2']) {
    const container = makeVisibleChartContainer('en-item-lollipop');
    return new ItemLollipopChart(container, items, {
        context: createTestContext(),
        legend: 'top',
        autoResize: false,
        resultTypes,
        itemCompetenceLevels,
        axisLabels: items.map((item) => item.displayName || item.name),
        itemNames: items.map((item) => item.name),
        domains: [...new Set(items.map((item) => item.domainLabel))],
        comparisonGroups: [],
    });
}

describe('ItemLollipopChart reactive state', () => {
    it('draws the items synced before its owner created it', () => {
        // A ChartHostModule installs its renderers before awaiting the layout
        // settle, so the item table's `applySync` can reach one through `host.chart` in
        // that window, as on a competence-level theme switch. The pending `create()` must
        // plot the latest sync, not the items it was constructed with.
        const chart = makeChart(ITEMS);

        chart.state.items.value = [ITEMS[1]];
        expect(chart.svg).toBeNull();
        chart.create();

        expect(chart.container.querySelectorAll('.lollipop-circle').length).toBe(1);
    });
});

describe('ItemLollipopChart key', () => {
    it("lists the dataset's levels, not only the drawn items'", () => {
        // A sync keeps the drawn key, so one built from the drawn items would
        // name the previous items' levels until the next full render.
        const chart = makeChart([ITEMS[0]], [], ['2', '1', '3', '1']);
        chart.create();

        const panel = /** @type {HTMLElement} */ (chart.legendPanel);
        const labels = niveauEntries(panel).map((node) => node.textContent?.trim());
        // Unregistered levels all take the default fill, so they share one entry.
        expect(labels[0]).toBe('1, 2, 3');
    });

    it('gives levels of one colour one entry, and each its own glossary run', () => {
        // An entry per level promises a distinction the marks do not draw — A1.1 and
        // A1.2 share a fill, so a reader could not tell which of two entries a mark is.
        const chart = makeChart([ITEMS[0]], [], ['A1.1', 'A1.2', 'A2.1']);
        // An item level paints with the reporting level whose span covers its slot: A1.1
        // and A1.2 with A1.
        const { palette } = chart.context;
        palette.registerCompetenceLevelScales([
            scaleValueGroup([
                { nameShort: 'A1', span: '1-2' },
                { nameShort: 'A2', span: '3-4' },
            ]),
        ]);
        palette.registerItemCompetenceScales(itemValueGroups(['A1.1', 'A1.2', 'A2.1']));
        chart.create();

        const entries = niveauEntries(required(chart.legendPanel)).slice(0, 2);
        expect(entries.map((node) => node.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'A1.1, A1.2',
            'A2.1',
        ]);
    });

    it('names the levels without a control to hide one', () => {
        const chart = makeChart(ITEMS);
        chart.create();

        const panel = required(chart.legendPanel);
        expect(niveauEntries(panel)).toHaveLength(1);
        expect(panel.querySelector('button')).toBeNull();
    });
});

describe('ItemLollipopChart domain strips', () => {
    /**
     * @param {string} id
     * @param {string} name
     * @param {string} domainLabel
     * @returns {ItemData}
     */
    const domainItem = (id, name, domainLabel) => ({
        ...lollipopItem(id, name, '1', 50),
        domainLabel,
        displayName: `${domainLabel[0]}-${name}`,
    });
    const BOTH = [
        domainItem('h1', '1.1', 'Hören'),
        domainItem('h2', '1.2', 'Hören'),
        domainItem('l1', '6.1', 'Lesen'),
        domainItem('l2', '6.2', 'Lesen'),
        domainItem('l3', '6.3', 'Lesen'),
    ];
    /** @param {ItemLollipopChart} chart */
    const strips = (chart) => [...chart.container.querySelectorAll('g.item-strip')];
    /** @param {Element} strip */
    const headsX = (strip) =>
        [...strip.querySelectorAll('.lollipop-circle')].map((c) => c.getAttribute('cx'));
    /** @param {Element} strip */
    const ticks = (strip) =>
        [...strip.querySelectorAll('.x-axis .tick text')].map((t) => t.textContent);

    it('stacks one strip per domain, item i at the same x in each, ticks unprefixed', () => {
        const chart = makeChart(BOTH);
        chart.create();

        const [hoeren, lesen] = strips(chart);
        expect(strips(chart)).toHaveLength(2);
        expect(hoeren.querySelector('.domain-label')?.textContent).toBe('Hören');
        expect(lesen.querySelector('.domain-label')?.textContent).toBe('Lesen');
        expect(headsX(hoeren)).toEqual(headsX(lesen).slice(0, 2));
        expect(ticks(hoeren)).toEqual(['1.1', '1.2']);
        expect(ticks(lesen)).toEqual(['6.1', '6.2', '6.3']);
    });

    it('draws one domain as one unheaded strip, ticks as the table labels them', () => {
        const chart = makeChart(BOTH.slice(2));
        chart.create();

        expect(strips(chart)).toHaveLength(1);
        expect(chart.container.querySelector('.domain-label')).toBeNull();
        expect(ticks(strips(chart)[0])).toEqual(['L-6.1', 'L-6.2', 'L-6.3']);
    });

    it('keeps each strip node across a sync', () => {
        const chart = makeChart(BOTH);
        chart.create();
        const before = strips(chart);

        chart.state.items.value = [BOTH[1], BOTH[0], ...BOTH.slice(2)];

        // Identity, not `toEqual`: that compares DOM nodes by structure.
        expect(strips(chart)).toHaveLength(before.length);
        strips(chart).forEach((strip, i) => expect(strip).toBe(before[i]));
    });

    it("stacks the strips in the dataset's domain order, whatever order the table syncs", () => {
        const chart = makeChart(BOTH);
        chart.create();

        // A table sorted so a Lesen row comes first.
        chart.state.items.value = [BOTH[2], BOTH[0], BOTH[3], BOTH[1], BOTH[4]];

        const labels = strips(chart).map((strip) => strip.querySelector('.domain-label'));
        expect(labels.map((label) => label?.textContent)).toEqual(['Hören', 'Lesen']);
        const [hoerenTop, lesenTop] = labels.map(
            (label) => required(label).getBoundingClientRect().top,
        );
        expect(hoerenTop).toBeLessThan(lesenTop);
    });
});

describe('ItemLollipopChart tooltip', () => {
    it("labels each result row with its own bucket's share, whatever the result-type order", () => {
        // Taking the share by position — result type i reads the i-th share field —
        // would put another bucket's label on the correct share whenever the result-type
        // list does not start with Richtig.
        const chart = makeChart(ITEMS, [
            { value: 'Falsch', glossaryKey: 'falsch', numericCode: 0 },
            { value: 'Richtig', glossaryKey: 'richtig', numericCode: 1 },
        ]);

        const { rows } = chart.formatTooltipContent({
            ...ITEMS[0],
            percentageCorrect: 70,
            percentageIncorrect: 20,
            percentageNotAttempted: 10,
        });

        expect(required(rows).slice(1, 3)).toEqual([
            { label: 'Falsch', value: '20,0 %' },
            { label: 'Richtig', value: '70,0 %' },
        ]);
    });

    it('prints the stem value first, apart from the Richtig share', () => {
        // The stem is the item mean, the Richtig row the aggregation's share; the two
        // can differ, and without its own row the tooltip omits the plotted value.
        const chart = makeChart(ITEMS);

        const { rows } = chart.formatTooltipContent({
            ...ITEMS[0],
            meanPercentage: 64,
            percentageCorrect: 70,
        });

        expect(required(rows)[0]).toEqual({ label: 'Lösungsquote', value: formatPercent(64) });
    });

    it('names the item as its axis tick does, domain prefix included', () => {
        // In `all` mode a Hören and a Lesen item can share the number "1"; the raw
        // number titled both tooltips alike.
        const chart = makeChart(ITEMS);

        const { title } = chart.formatTooltipContent({ ...ITEMS[0], displayName: 'H-1' });

        expect(title).toBe('H-1');
    });
});

describe('ItemLollipopChart data table', () => {
    it('lists the synced items in table order, headed as the axis names them', () => {
        const chart = makeChart([
            { ...ITEMS[1], displayName: 'LV 2' },
            { ...ITEMS[0], displayName: 'LV 1' },
        ]);
        chart.create();
        const table = required(chart.dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Teilaufgabe',
            'Aufgabenniveau',
            'Lösungsquote',
        ]);
        expect(table.rows.map((row) => row.map((cell) => cell.text))).toEqual([
            ['LV 2', '2', formatPercent(60)],
            ['LV 1', '1', formatPercent(40)],
        ]);
    });

    it('has no table while no items are synced', () => {
        const chart = makeChart([]);
        chart.create();
        expect(chart.dataTable()).toBeNull();
    });
});
