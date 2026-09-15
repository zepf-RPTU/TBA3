// @vitest-browser
// (constructs a real renderer against a live container)

import { afterEach, describe, expect, it } from 'vitest';
import { ItemLollipopChart } from '@tba3/modules/en/modules/charts/itemLollipop/itemLollipopChart.js';
import { FakeResizeService, makeVisibleChartContainer } from '../../../../support/chartHarness.js';

const ITEMS = [
    { iqbId: 'a', name: '1', competenceLevel: '1', meanPercentage: 40 },
    { iqbId: 'b', name: '2', competenceLevel: '2', meanPercentage: 60 },
];

function makeChart(items, enConfig = {}) {
    makeVisibleChartContainer('en-item-lollipop');
    return new ItemLollipopChart('en-item-lollipop', items, {
        resizeService: new FakeResizeService(),
        autoResize: false,
        enConfig: { resultTypes: [], ...enConfig },
    });
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ItemLollipopChart reactive state', () => {
    it('adopts synced items even before its owner has created it', () => {
        // WHY: the chart draws from `chartState.data`, but `_onStateChanged` used to return
        // at its no-SVG guard before adopting the new items. A ChartHostModule installs its
        // renderers before awaiting the layout settle, so the item table's `applySync` can
        // reach one through `host.chart` in that window — on a KS theme switch it regularly
        // does. The sync was then dropped and the pending `create()` plotted the ids the
        // table had synced *before* it.
        const chart = makeChart(ITEMS);
        const synced = [ITEMS[1]];

        chart.setState({ items: synced });

        expect(chart.svg).toBeNull();
        expect(chart.chartState.data).toBe(synced);
    });
});

describe('ItemLollipopChart tooltip', () => {
    it("labels each result row with its own bucket's share, whatever the result-type order", () => {
        // WHY: the rows took their share by position — result type i read the i-th share
        // field — so a result-type list that did not start with Richtig put another
        // bucket's label on the correct share.
        const chart = makeChart(ITEMS, {
            resultTypes: [
                { label: 'Falsch', numericCode: 0 },
                { label: 'Richtig', numericCode: 1 },
            ],
        });

        const html = chart.formatTooltipContent({
            ...ITEMS[0],
            percentageCorrect: 70,
            percentageIncorrect: 20,
            percentageNotAttempted: 10,
        });

        expect(html).toMatch(/Falsch[\s\S]*?20\.0%[\s\S]*?Richtig[\s\S]*?70\.0%/);
    });
});
