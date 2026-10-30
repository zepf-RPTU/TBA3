// @vitest-browser

// The lollipops, hit bands and comparison markers join by item id, the Leitidee
// separators and labels by Leitidee: a resize leaves the items' nodes in place.

import { describe, expect, it } from 'vitest';

import { ItemSuccessLollipopChart } from '../../../../../src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopChart.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import {
    itemComparisonGroup,
    maLollipopItem,
} from '../../../../support/groupDocumentStoreFixture.js';

const items = [
    maLollipopItem('a1', 'Zahlen und Operationen', 40),
    maLollipopItem('a2', 'Zahlen und Operationen', 70),
    maLollipopItem('b1', 'Raum und Form', 55),
];

const comparisonGroups = [
    itemComparisonGroup('school', 'Schulschnitt', [
        ['a1', 45],
        ['a2', 60],
        ['b1', 50],
    ]),
];

function makeChart() {
    const container = makeVisibleChartContainer('ma-lollipop-redraw-test', {
        widthPx: 700,
        heightPx: 400,
    });
    const chart = new ItemSuccessLollipopChart(container, items, {
        context: createTestContext('ma'),
        comparisonGroups,
        autoResize: false,
    });
    chart.create();
    return { chart, container };
}

describe('MA item lollipop — redraw in place', () => {
    it('changes nothing when it draws the same data again', () => {
        // An axis baseline, separators or Leitidee labels appended per pass would
        // stack on a redraw into the drawn SVG.
        const { chart, container } = makeChart();

        expectStableRedraw(chart, '.lollipop-hit');
        expect(container.querySelectorAll('.domain-label')).toHaveLength(2);
        expect(container.querySelectorAll('.domain-separator')).toHaveLength(1);
    });

    it('resizes the marks it keeps when the box changes', () => {
        // A resize redraws in place; a mark rebuilt would drop keyboard focus, and
        // a label written only on enter would stay where the old width put it.
        const { chart, container } = makeChart();
        const hit = container.querySelector('.lollipop-hit');
        const label = container.querySelector('.domain-label');
        const before = label?.getAttribute('x');

        container.style.width = '500px';
        // The resize observer's measure and draw, in one call.
        if (chart.measureIfStale()) chart.drawMeasured();

        expect(container.querySelector('.lollipop-hit')).toBe(hit);
        expect(container.querySelector('.domain-label')).toBe(label);
        expect(label?.getAttribute('x')).not.toBe(before);
        expect(container.querySelectorAll('.axis-baseline')).toHaveLength(1);
        expect(container.querySelectorAll('.lollipop-hit')).toHaveLength(items.length);
    });
});
