// @vitest-browser

/**
 * MA item lollipop — its data table: one row per item drawn, by Leitidee as the plot
 * groups them, with its solution rate and each shown comparison group's mean. A
 * comparison toggled off leaves the table; a group without a mean for an item leaves its
 * cell empty.
 */

import { describe, expect, it } from 'vitest';

import { ItemSuccessLollipopChart } from '../../../../../src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopChart.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
} from '../../../../support/chartHarness.js';
import { required } from '../../../../support/required.js';
import {
    itemComparisonGroup,
    maLollipopItem,
} from '../../../../support/groupDocumentStoreFixture.js';

// The records split the first Leitidee: the plot draws it as one.
const ITEMS = [
    maLollipopItem('a1', 'Zahlen und Operationen', 40),
    maLollipopItem('b1', 'Raum und Form', 55, 'III'),
    maLollipopItem('a2', 'Zahlen und Operationen', 70),
];

const COMPARISON_GROUPS = [
    itemComparisonGroup('school', 'Schulschnitt', [
        ['a1', 45],
        ['a2', 60],
    ]),
    itemComparisonGroup('state', 'Landesschnitt', [
        ['a1', 50],
        ['a2', 52],
        ['b1', 48],
    ]),
];

/**
 * @param {string[]} activeModes - The comparison ids toggled on.
 * @returns {ItemSuccessLollipopChart} Drawn.
 */
function drawChart(activeModes) {
    const container = makeVisibleChartContainer('ma-lollipop-data-table-test', {
        widthPx: 700,
        heightPx: 400,
    });
    const chart = new ItemSuccessLollipopChart(container, ITEMS, {
        context: createTestContext('ma'),
        comparisonGroups: COMPARISON_GROUPS,
        comparisonState: comparisonStateShowing(activeModes),
        legend: 'side',
        autoResize: false,
    });
    chart.create();
    return chart;
}

/**
 * @param {ItemSuccessLollipopChart} chart
 * @returns {import('../../../../../src/common/charts/host/chartDataTable.js').ChartDataTable}
 */
const tableOf = (chart) => required(chart.dataTable());

describe('MA item lollipop — data table', () => {
    it('lists the items by Leitidee, with the rate and each shown comparison', () => {
        const table = tableOf(drawChart(['school']));

        expect(table.columns.map((column) => column.label)).toEqual([
            'Teilaufgabe',
            'Aufgabe',
            'Leitidee',
            'Aufgabenniveau',
            'Lösungsquote',
            'Schulschnitt',
        ]);
        expect(table.columns[4].fields).toEqual(['Lösungsquote (%)']);
        expect(table.rows.map(([head]) => head.text)).toEqual(['a1', 'a2', 'b1']);
        expect(table.rows[0].slice(1, 4).map((cell) => cell.text)).toEqual([
            'Übung a1',
            'Zahlen und Operationen',
            'II',
        ]);
        expect(table.rows[0][4].values).toEqual([40]);
        expect(table.rows[0][5].values).toEqual([45]);
    });

    it('leaves a comparison without a mean for the item empty, never 0', () => {
        const table = tableOf(drawChart(['school']));
        const b1 = required(table.rows.find(([head]) => head.text === 'b1'));
        expect(b1[5]).toEqual({ text: '', values: [null] });
    });

    it('follows the comparison toggles', () => {
        const table = tableOf(drawChart(['school', 'state']));
        expect(table.columns.slice(5).map((column) => column.label)).toEqual([
            'Schulschnitt',
            'Landesschnitt',
        ]);
        expect(tableOf(drawChart([])).columns).toHaveLength(5);
    });
});
