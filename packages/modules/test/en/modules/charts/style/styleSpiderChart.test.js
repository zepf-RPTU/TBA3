// @vitest-browser

import { describe, expect, it } from 'vitest';
import { select } from 'd3';
import { StyleSpiderChart } from '../../../../../src/en/modules/charts/style/styleSpiderChart.js';
import { comparisonSeriesClass } from '../../../../../src/common/charts/comparisonSeries.js';
import { AVERAGE_MARKER } from '../../../../../src/common/charts/chartDefaults.js';
import { markerPath } from '../../../../../src/common/charts/markerSymbols.js';
import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { enConfig, groupAverages } from '../../../../support/enStyleFixture.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { required } from '../../../../support/required.js';

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

/** @type {import('../../../../../src/en/utils/enStyleAggregationAdapter.js').ParsedStyleAggregation} */
const groupStyleAverages = {
    groupName: '8a',
    groupDomainAverages: {},
    groupAverages,
    comparisonGroups: [],
};

/**
 * The student's record carries only the Hören `global` style.
 * @type {import('../../../../../src/en/utils/enStudentDataAdapter.js').EnStudentRecord}
 */
const student = {
    studentId: 's1',
    firstName: 'A',
    lastName: 'L',
    gender: '',
    traits: new Set(),
    itemResults: new Map(),
    domains: { ho: { styles: { global: 50 } } },
};

describe('StyleSpiderChart', () => {
    it("puts no student point on a spoke the student's row has no value for", () => {
        // A missing value drawn as 0 % is a point in the web's centre and a ring
        // collapsing onto it, read as a student who scored nothing there.
        const container = makeVisibleChartContainer('style-spider');
        container.style.width = '640px';
        container.style.height = '520px';
        const chart = new StyleSpiderChart(container, {
            student,
            context: createTestContext(),
            autoResize: false,
            enConfig,
            groupStyleAverages,
        });

        chart.create();

        expect(marksOf(required(chart.svg?.node()), '.spider-point', 'student').length).toBe(1);
        expect(marksOf(required(chart.svg?.node()), '.spider-point', 'group').length).toBe(4);
    });

    it("draws a comparison group's area as well as its role-shape vertices", () => {
        // The vertices join on their own group. Joined on the group the area shares,
        // the marker join takes the area for a stale marker and removes it.
        const container = makeVisibleChartContainer('style-spider');
        container.style.width = '640px';
        container.style.height = '520px';
        const chart = new StyleSpiderChart(container, {
            student,
            context: createTestContext(),
            autoResize: false,
            enConfig,
            groupStyleAverages: {
                ...groupStyleAverages,
                comparisonGroups: [
                    {
                        id: 'school',
                        type: 'school',
                        name: 'Schulschnitt',
                        shortLabel: null,
                        roleIndex: 0,
                        averages: { ho_global: 55, ho_detailliert: 45, le_global: 65 },
                        domainAverages: {},
                    },
                ],
            },
        });

        chart.create();

        expect(marksOf(required(chart.svg?.node()), '.spider-area', 'school').length).toBe(1);
        // A comparison group's markers are classed by its position among the groups.
        const series = comparisonSeriesClass(
            chart.comparisonGroups.findIndex((group) => group.id === 'school'),
        );
        const vertices = required(chart.svg).selectAll(`.spider-point.${series}-marker`);
        expect(vertices.size()).toBe(3);
        // The school's role shape is the diamond, drawn at the shared marker size.
        expect(vertices.select('.marker-shape').attr('d')).toBe(
            markerPath('diamond', AVERAGE_MARKER.sizePx),
        );
    });

    it('takes the hover per spoke, its tooltip listing every series on it', () => {
        // A vertex is a few px across and several series meet on a spoke; one
        // wedge per spoke reaches them all and names every value there.
        const container = makeVisibleChartContainer('style-spider');
        container.style.width = '640px';
        container.style.height = '520px';
        const chart = new StyleSpiderChart(container, {
            student,
            context: createTestContext(),
            autoResize: false,
            enConfig,
            groupStyleAverages,
        });

        chart.create();

        const wedges = [...container.querySelectorAll('path.spider-wedge')];
        expect(wedges).toHaveLength(4);
        const labels = wedges.map((wedge) => wedge.getAttribute('aria-label') ?? '');
        // Hören global carries both the student and the group; the others the group only.
        expect(labels.filter((label) => label.includes('8a:'))).toHaveLength(4);
        const rowCounts = labels.map((label) => (label.match(/: /g) ?? []).length);
        expect(rowCounts.sort()).toEqual([1, 1, 1, 2]);
        expect(container.querySelector('.spider-point')?.hasAttribute('tabindex')).toBe(false);
    });
});

describe('StyleSpiderChart data table', () => {
    it('lists every spoke with the student and the group, a missing value empty', () => {
        const container = makeVisibleChartContainer('style-spider-table');
        container.style.width = '640px';
        container.style.height = '520px';
        const chart = new StyleSpiderChart(container, {
            student,
            context: createTestContext(),
            autoResize: false,
            enConfig,
            groupStyleAverages,
        });
        chart.create();
        const table = chart.dataTable();

        expect(table.columns.map((column) => column.label)).toEqual([
            'Stil',
            'Domäne',
            'L, A',
            '8a',
        ]);
        expect(table.rows).toHaveLength(4);
        const hoGlobal = required(
            table.rows.find(
                ([style, domain]) => style.text === 'Global' && domain.text === 'Hören',
            ),
        );
        expect(hoGlobal.slice(2).map((cell) => cell.values)).toEqual([[50], [60]]);
        const leGlobal = required(
            table.rows.find(
                ([style, domain]) => style.text === 'Global' && domain.text === 'Lesen',
            ),
        );
        expect(leGlobal[2]).toEqual({ text: '', values: [null] });
    });
});

describe('StyleSpiderChart spoke labels', () => {
    it('link each domain prefix to the entry that claims its domain id', () => {
        // The fixture's domains are named `Hören` and `Lesen`, which match no term.
        const container = makeVisibleChartContainer('style-spider-terms');
        container.style.width = '640px';
        container.style.height = '520px';
        const chart = new StyleSpiderChart(container, {
            student,
            context: createTestContext(),
            autoResize: false,
            enConfig,
            groupStyleAverages,
        });
        chart.create();

        const prefixKeys = new Set(
            [...container.querySelectorAll('[data-glossary-key]')]
                .map((node) => node.getAttribute('data-glossary-key'))
                .filter((key) => key === 'hörverstehen' || key === 'leseverstehen'),
        );
        expect([...prefixKeys].sort()).toEqual(['hörverstehen', 'leseverstehen']);
    });
});
