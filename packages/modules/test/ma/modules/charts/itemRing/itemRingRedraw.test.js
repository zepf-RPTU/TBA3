// @vitest-browser

// Every mark of the figure is joined, and the grid cell and the focus card keep their
// SVG, ring group and title: the marks that stay keep their nodes.

import { describe, expect, it } from 'vitest';

import { ItemRingChart } from '../../../../../src/ma/modules/charts/itemRing/itemRingBase.js';
import { ItemRingFocusChart } from '../../../../../src/ma/modules/charts/itemRing/itemRingFocus.js';
import { RING_REACH } from '../../../../../src/ma/modules/charts/itemRing/itemRingGeometry.js';
import { getItemRingVerticalOverhead } from '../../../../../src/ma/modules/charts/itemRing/itemRingTitleMetrics.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';

const students = [
    { studentId: 's1', firstName: 'Ada', lastName: 'Berg' },
    { studentId: 's2', firstName: 'Bo', lastName: 'Kern' },
];

/**
 * An item of Leitidee `zo` with the students' results.
 * @param {string} iqbId - Also its name.
 * @param {string} competenceLevel - Its Aufgabenniveau.
 * @param {Array<[string, number]>} results - Each student's result.
 * @returns {import('../../../../../src/ma/modules/charts/itemRing/itemRingFocus.js').ItemRingFocusEntry & {iqbId: string}}
 */
const item = (iqbId, competenceLevel, results) => ({
    iqbId,
    name: iqbId,
    exerciseName: `Übung ${iqbId}`,
    competenceLevel,
    responseCount: 2,
    solvedCount: results.filter(([, score]) => score === 1).length,
    total: 2,
    correctCount: results.filter(([, score]) => score === 1).length,
    incorrectCount: results.filter(([, score]) => score !== 1).length,
    notAttemptedCount: 0,
    pilotSolutionFrequency: 0.5,
    results: new Map(results),
});

const items = [
    item('a1', 'II', [
        ['s1', 1],
        ['s2', 0],
    ]),
    item('a2', 'III', [
        ['s1', 0],
        ['s2', 1],
    ]),
];

const zo = {
    id: 'zo',
    title: 'Zahlen und Operationen',
    iqbIds: new Set(['a1', 'a2']),
    isEmpty: false,
};

const twoLineTitle = { fontSize: 16, titleLines: ['Zahlen und', 'Operationen'], titleLineCount: 2 };

/**
 * A grid ring, drawn.
 * @param {{widthPx: number, heightPx: number}} [size] - Its cell.
 * @param {import('../../../../../src/ma/modules/charts/itemRing/itemRingBase.js').RingTitle} [title]
 */
function makeRing(size = { widthPx: 240, heightPx: 280 }, title = twoLineTitle) {
    const container = makeVisibleChartContainer('ring-redraw-test', size);
    const chart = new ItemRingChart(container, items, students, {
        context: createTestContext('ma'),
        ring: zo,
        selectedStudents: null,
    });
    chart.setTitleLayout(title);
    chart.create();
    return { chart, container };
}

/**
 * What a ring drew its SVG at, and how wide its outer ring is.
 * @param {HTMLElement} container
 */
function ringBox(container) {
    const svg = /** @type {SVGSVGElement} */ (container.querySelector('svg.chart-root'));
    const outer = /** @type {SVGGraphicsElement} */ (
        container.querySelector('.item-ring-outer-arc-background')
    );
    return {
        width: svg.getAttribute('width'),
        height: svg.getAttribute('height'),
        outerWidth: Math.round(outer.getBBox().width),
    };
}

function makeFocus() {
    const container = makeVisibleChartContainer('focus-redraw-test', { widthPx: 600 });
    const chart = new ItemRingFocusChart(container, {
        context: createTestContext('ma'),
        items,
        students,
        ring: zo,
        selectedStudents: null,
    });
    chart.create();
    return { chart, container };
}

describe('item ring — redraw in place', () => {
    it('changes nothing when the grid ring draws the same data again', () => {
        // A pass that rebuilt or appended anything would stack a second ring or
        // title over the first and drop a focused level arc.
        expectStableRedraw(makeRing().chart, '.level-arc');
    });

    it('moves the grid ring for a selection and the inner-ring toggle', () => {
        const { chart, container } = makeRing();
        const outer = container.querySelector('.item-ring-outer-arc-background');

        chart.state.selectedStudents.value = ['s1'];
        expect(container.querySelectorAll('.selected-student-tick')).toHaveLength(1);

        chart.state.innerRingVisible.value = false;
        expect(container.querySelectorAll('.level-arc')).toHaveLength(0);
        expect(container.querySelector('.item-ring-outer-arc-background')).toBe(outer);
        expect(container.querySelectorAll('.item-ring-svg-title')).toHaveLength(1);
    });

    it('draws into its resized cell with the title layout the grid hands it', () => {
        // The grid shrinks the cell through CSS and hands over the new title layout;
        // the measured pass must read the new box, not the one the last draw measured.
        const { chart, container } = makeRing();
        const oneLineTitle = { fontSize: 12, titleLines: ['Zahlen'], titleLineCount: 1 };
        const smaller = { widthPx: 160, heightPx: 200 };
        const fresh = makeRing(smaller, oneLineTitle);
        const expected = ringBox(fresh.container);
        fresh.chart.destroy();
        fresh.container.remove();

        container.style.width = `${smaller.widthPx}px`;
        container.style.height = `${smaller.heightPx}px`;
        chart.setTitleLayout(oneLineTitle);
        if (chart.measureIfStale()) chart.drawMeasured();

        expect(ringBox(container)).toEqual(expected);
        expect(container.querySelectorAll('.item-ring-svg-title tspan')).toHaveLength(1);
    });

    it.each([
        ['as wide as its footprint', 0],
        ['wider than its footprint, so its height binds', 40],
    ])('draws the diameter its cell was sized for, %s', (_case, spareWidthPx) => {
        // The grid sizes a cell as `diameter · RING_REACH` plus the title band and the
        // room under the ring, reports that diameter, and the focus card draws it: a ring
        // smaller than its cell would stand beside a larger focus ring.
        const diameter = 240;
        const footprint = diameter * RING_REACH;
        const { container } = makeRing(
            {
                widthPx: footprint + spareWidthPx,
                heightPx: footprint + getItemRingVerticalOverhead(16, 2),
            },
            twoLineTitle,
        );
        const outerArc = /** @type {SVGGraphicsElement} */ (
            container.querySelector('.item-ring-outer-arc-background')
        );

        // The outer annulus ends at 0.85 of the radius (`ringGeometry`).
        expect(outerArc.getBBox().width).toBeCloseTo(diameter * 0.85, 0);
    });

    it('names the item count under the title', () => {
        // The rate over few items reads with caution, so the count stands at every size.
        const { container } = makeRing();
        const count = container.querySelectorAll('.item-ring-svg-count');
        expect(count).toHaveLength(1);
        expect(count[0].textContent).toBe('2 Teilaufgaben');
        // The SVG is an img, whose drawn text a screen reader skips: its name says it.
        expect(container.querySelector('svg.chart-root')?.getAttribute('aria-label')).toBe(
            'Zahlen und Operationen. 2 Teilaufgaben',
        );
    });

    it('changes nothing when the focus card draws the same data again', () => {
        expectStableRedraw(makeFocus().chart, '.level-arc');
    });

    it('keeps the focus card in place for a selection, and draws again after a message', () => {
        // The card keeps its ring box across passes; one that showed a message
        // must take the ring back on the next draw, not stack it beside the message.
        const { chart, container } = makeFocus();
        const arc = container.querySelector('.level-arc');

        chart.state.selectedStudents.value = ['s2'];
        expect(container.querySelector('.level-arc')).toBe(arc);
        expect(container.querySelectorAll('.selected-student-tick')).toHaveLength(1);

        chart.state.ring.value = null;
        expect(container.querySelector('.item-ring-focus-svg')).toBeNull();

        chart.state.ring.value = zo;
        expect(container.querySelectorAll('.item-ring-focus-svg')).toHaveLength(1);
        expect(container.querySelectorAll('.item-ring-focus-text-blocks')).toHaveLength(1);
        expect(container.textContent).not.toContain('Keine Aufgabenringe verfügbar');
    });
});
