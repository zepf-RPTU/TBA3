// @vitest-browser

// The lollipops, markers and hit bands join by item id: the items that stay keep their
// nodes, which keeps keyboard focus on an item's band across a sync or a resize.

import { beforeEach, describe, expect, it } from 'vitest';

import { ItemLollipopChart } from '../../../../../src/en/modules/charts/itemLollipop/itemLollipopChart.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { lollipopItem } from '../../../../support/groupDocumentStoreFixture.js';

const CONTAINER_ID = 'en-item-lollipop-redraw';

const ITEMS = [
    lollipopItem('a', '1', '1', 40),
    lollipopItem('b', '2', '2', 60),
    lollipopItem('c', '3', '1', 80),
];

/** @type {HTMLDivElement} */
let container;

/** @returns {ItemLollipopChart} Not yet created. */
function makeChart() {
    return new ItemLollipopChart(container, ITEMS, {
        context: createTestContext(),
        autoResize: false,
        resultTypes: [],
        itemCompetenceLevels: ['1', '2'],
        axisLabels: ITEMS.map((item) => item.name),
        itemNames: ITEMS.map((item) => item.name),
        domains: [''],
        comparisonGroups: [],
    });
}

/** The first item's hit band, the item's tab stop. */
const firstBand = () => document.querySelector(`#${CONTAINER_ID} .lollipop-hit`);

describe('EN item lollipop — redraw in place', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 400 });
    });

    it('changes nothing when it draws the same items again', () => {
        const chart = makeChart();
        chart.create();
        expectStableRedraw(chart, '.lollipop-hit');
    });

    it('keeps the bands of the items that stay when the table syncs fewer', () => {
        // A sync that rebuilt the chart on crossing the scroll threshold would drop a
        // keyboard user's focus back to the page.
        const chart = makeChart();
        chart.create();
        const band = firstBand();

        chart.state.items.value = [ITEMS[0], ITEMS[2]];

        expect(firstBand()).toBe(band);
        // The leaving item's head is off the pointer and the keyboard at once.
        const leaving = [
            .../** @type {NodeListOf<SVGElement>} */ (
                document.querySelectorAll(`#${CONTAINER_ID} .lollipop-circle`)
            ),
        ].filter((head) => head.style.pointerEvents === 'none');
        expect(leaving).toHaveLength(1);
        expect(document.querySelectorAll(`#${CONTAINER_ID} .lollipop-hit`)).toHaveLength(2);
    });

    it('keeps the frame and says so over the plot when a sync leaves no item', () => {
        const chart = makeChart();
        chart.create();
        const svg = chart.svg?.node();

        chart.state.items.value = [];

        expect(chart.svg?.node()).toBe(svg);
        expect(document.querySelectorAll(`#${CONTAINER_ID} .lollipop-hit`)).toHaveLength(0);
        expect(document.querySelector(`#${CONTAINER_ID} .chart-message`)).not.toBeNull();
    });
});
