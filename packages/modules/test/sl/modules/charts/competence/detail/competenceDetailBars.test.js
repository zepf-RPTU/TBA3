// @vitest-browser
/**
 * The detail bars' redraw: a legend toggle hides the rows it turns off and lays the
 * rest out again, and a visible row's bar stays visible and keeps its node.
 */

import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import { ChartRenderer } from '../../../../../../src/common/charts/renderers/chartRenderer.js';
import { createDetailBars } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBars.js';
import { getGroupingConfig } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailGrouping.js';
import { ALL_VISIBLE } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBarLayout.js';
import { makeVisibleChartContainer } from '../../../../../support/chartHarness.js';
import { createTestContext } from '../../../../../support/glossaryFixture.js';

const LEVELS = ['A1', 'A2'];
/** One Fach with one Domäne: grouped by group, one bar per group. */
const ROWS = [
    { name: '8a', type: 'group', percentages: { A1: 20, A2: 80 } },
    { name: 'Schule', type: 'school', percentages: { A1: 40, A2: 60 } },
].map((row) => ({
    ...row,
    subject: 'de',
    domain: 'le',
    domainLabel: 'Lesen',
    displayDomainLabel: 'Lesen',
    subjectDomainCount: 1,
    domainIndex: 0,
    teachingQuality: null,
}));

/** @type {HTMLElement|null} */
let container = null;

afterEach(() => {
    container?.remove();
    container = null;
});

/**
 * Draw the two rows' bars, as the watermark does (no labels), and hand back their plot
 * group and a redraw for another visibility.
 * @returns {{g: d3.Selection<SVGGElement, unknown, null, undefined>, redraw: Function}}
 */
function drawBars() {
    container = makeVisibleChartContainer('detail-bars-fixture');
    const g = d3.select(container).append('svg').append('g');
    const groupingConfig = getGroupingConfig(/** @type {any} */ (ROWS), null);
    const model = {
        chartData: ROWS,
        hasTeachingQuality: false,
        groupingConfig,
        xDomain: ['8a', 'Schule'],
        groups: { '8a': [ROWS[0]], Schule: [ROWS[1]] },
        levels: {
            competenceLevelNames: LEVELS,
            scaleIdForLevel: () => undefined,
        },
        showBarLabels: false,
        bottomLabels: [],
    };
    // A real renderer, since it owns the bars' visibility; the tooltip text is beside the point.
    const chart = Object.assign(
        new ChartRenderer(container, {
            autoResize: false,
            context: createTestContext('sl'),
        }),
        {
            chartData: ROWS,
            formatTooltipContent: () => '',
        },
    );
    /**
     * @param {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBarLayout.js').BarVisibility} visibility
     */
    const redraw = (visibility) =>
        createDetailBars(/** @type {any} */ (chart), g, {
            model: /** @type {any} */ (model),
            labelSpace: null,
            yScale: d3.scaleLinear().domain([0, 100]).range([200, 0]),
            width: 200,
            barLabelFontSize: 12,
            visibility,
            isLevelShown: () => true,
            durationMs: 0,
        });
    redraw(ALL_VISIBLE);
    return { g, redraw };
}

/**
 * @param {d3.Selection<SVGGElement, unknown, null, undefined>} g
 * @returns {Map<string, number>} Each row bar's effective opacity right now
 *     (the lowest of its group, the bar and every group inside it), by row name.
 */
function effectiveOpacities(g) {
    return new Map(
        g
            .selectAll('.sub-bar-group')
            .nodes()
            .map((node) => {
                const element = /** @type {Element} */ (node);
                const layers = [element.parentElement, element, ...element.querySelectorAll('g')];
                return [
                    /** @type {any} */ (d3.select(element).datum()).name,
                    Math.min(
                        ...layers.map((el) =>
                            Number(getComputedStyle(/** @type {Element} */ (el)).opacity),
                        ),
                    ),
                ];
            }),
    );
}

describe('createDetailBars — redraw', () => {
    it('hides a row turned off and keeps the visible row’s bar shown', async () => {
        const { g, redraw } = drawBars();
        const shown = g.select('.sub-bar-group').node();

        redraw({
            row: (/** @type {{name: string}} */ row) => row.name !== 'Schule',
            teachingQuality: true,
        });
        expect(g.select('.sub-bar-group').node()).toBe(shown);

        // The hidden row at 0 is where the transitions end.
        await expect.poll(() => effectiveOpacities(g).get('Schule')).toBe(0);
        expect(effectiveOpacities(g).get('8a')).toBe(1);
        // No nested group answers the row selector, so nothing inside a shown bar fades.
        expect(g.selectAll('.bar-group .bar-group').size()).toBe(0);
    });

    it('reports empty once the legend hides every row, and not before', () => {
        const { redraw } = drawBars();

        expect(redraw(ALL_VISIBLE).empty).toBe(false);
        expect(redraw({ ...ALL_VISIBLE, row: () => false }).empty).toBe(true);
    });
});
