// @vitest-browser

// The lollipop's rows join by `${domain}_${style}` key in both modes and the spider's
// vertices by series and spoke: the marks that stay keep their nodes, which keeps keyboard
// focus on them across a table sync, a mode switch or a student switch.

import { beforeEach, describe, expect, it } from 'vitest';
import { select } from 'd3';

import { StyleLollipopChart } from '../../../../../src/en/modules/charts/style/styleLollipopChart.js';
import { StyleSpiderChart } from '../../../../../src/en/modules/charts/style/styleSpiderChart.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { enConfig, groupAverages } from '../../../../support/enStyleFixture.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';

const CONTAINER_ID = 'style-redraw';

/** @type {import('../../../../../src/en/utils/enStyleAggregationAdapter.js').ParsedStyleAggregation} */
const styleAverages = {
    groupName: '8a',
    groupAverages,
    groupDomainAverages: {},
    comparisonGroups: [],
};

/** @type {HTMLDivElement} */
let container;

/**
 * @param {string} selector
 * @returns {Element|null}
 */
const first = (selector) => container.querySelector(selector);

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

describe('EN style charts — redraw in place', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 640, heightPx: 520 });
    });

    function makeLollipop() {
        return new StyleLollipopChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig,
            styleAverages,
            mode: 'ho',
            studentValues: null,
        });
    }

    function makeSpider() {
        return new StyleSpiderChart(container, {
            context: createTestContext(),
            autoResize: false,
            enConfig,
            student: {
                studentId: 's1',
                firstName: 'A',
                lastName: 'L',
                gender: '',
                traits: new Set(),
                itemResults: new Map(),
                domains: {
                    ho: { styles: { global: 50, detailliert: 30 } },
                    le: { styles: { global: 80, detailliert: 60 } },
                },
            },
            groupStyleAverages: styleAverages,
        });
    }

    it('lollipop: changes nothing when it draws the same rows again', () => {
        const chart = makeLollipop();
        chart.create();
        expectStableRedraw(chart, '.lollipop-hit');
    });

    it('lollipop: keeps the row bands through a table sync and a mode switch', () => {
        const chart = makeLollipop();
        chart.create();
        const band = first('.lollipop-hit');

        chart.state.styleAverages.value = {
            ...styleAverages,
            groupAverages: { ...groupAverages, ho_global: 20 },
        };
        expect(first('.lollipop-hit')).toBe(band);

        // `all` keeps the Hören rows, keyed the same, and adds the Lesen ones.
        chart.state.mode.value = 'all';
        expect(first('.lollipop-hit')).toBe(band);
        expect(container.querySelectorAll('.lollipop-hit')).toHaveLength(4);
        expect(first('.lollipop-head')?.classList.contains('ho')).toBe(true);
    });

    it('lollipop: fades a leaving domain out and takes back a row caught leaving', () => {
        const chart = makeLollipop();
        chart.create();
        chart.state.mode.value = 'all';
        const lesenHead = /** @type {SVGElement} */ (first('.lollipop-head.le'));

        // The Lesen rows leave: still drawn while they fade, off the pointer at once.
        chart.state.mode.value = 'ho';
        expect(lesenHead.isConnected).toBe(true);
        expect(lesenHead.style.pointerEvents).toBe('none');

        // Back before the fade ends: the same node, not a new one.
        chart.state.mode.value = 'all';
        expect(first('.lollipop-head.le')).toBe(lesenHead);
    });

    it('spider: changes nothing when it draws the same web again', () => {
        const chart = makeSpider();
        chart.create();
        expectStableRedraw(chart, '.spider-point');
    });

    it("spider: keeps the group's points when the student goes", () => {
        const chart = makeSpider();
        chart.create();
        expect(marksOf(container, '.spider-point', 'student')).toHaveLength(4);
        const [groupPoint] = marksOf(container, '.spider-point', 'group');

        chart.state.student.value = null;

        expect(marksOf(container, '.spider-point', 'group')[0]).toBe(groupPoint);
        // The student's area is leaving: off the pointer at once.
        const leaving = /** @type {SVGElement} */ (
            marksOf(container, '.spider-area', 'student')[0]
        );
        expect(leaving.style.pointerEvents).toBe('none');
    });
});
