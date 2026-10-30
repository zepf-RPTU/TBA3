// @vitest-browser
// The figure needs no layout, but the suite draws into detached SVG elements and the
// figure reads `window.matchMedia` for its motion preference.

import { describe, it, expect } from 'vitest';

import * as d3 from 'd3';
import {
    RING_REACH,
    ringGeometry,
} from '../../../../../src/ma/modules/charts/itemRing/itemRingGeometry.js';
import {
    describeItemRing,
    drawItemRing,
    meanPilotSolutionFrequency,
} from '../../../../../src/ma/modules/charts/itemRing/itemRingFigure.js';
import { ringSelection } from '../../../../../src/ma/modules/charts/itemRing/selection.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { required } from '../../../../support/required.js';

/** @typedef {import('../../../../../src/ma/modules/charts/itemRing/itemRingFigure.js').ItemRingSpec} ItemRingSpec */
/** @typedef {import('../../../../../src/ma/modules/charts/itemRing/itemRingFigure.js').TooltipOwner} TooltipOwner */
/** @typedef {import('../../../../../src/common/services/cursorTooltip.js').TooltipContent} TooltipContent */

// The figure's geometry, tick angles and tooltip titles: intent a rendering test would not
// fail on. `itemRingFocus.test.js` and the e2e specs cover the look of the drawing.

const RADIUS_PX = 100;

// Ratios the figure is built on, restated so a change to them fails here rather than
// moving the expectations with the implementation.
const OUTER = 0.85;
const HIDDEN_INNER = 0.35;

const hiddenAnnulusInner = RADIUS_PX * HIDDEN_INNER;

describe('ringGeometry ticks', () => {
    it('keeps the protrusion the same length when the inner ring is hidden', () => {
        // Hiding the level ring widens the annulus inwards, so the tick gets longer. The
        // part past the ring must not grow with it, or a display toggle would lengthen
        // the ticks: the extension is anchored to the visible-ring thickness, not to the
        // annulus the tick spans.
        const visible = ringGeometry(RADIUS_PX, true).tick;
        const hidden = ringGeometry(RADIUS_PX, false).tick;

        expect(hidden[1] - RADIUS_PX * OUTER).toBeCloseTo(visible[1] - RADIUS_PX * OUTER);

        // The tick still reaches further in, following the widened annulus.
        expect(hidden[0]).toBeCloseTo(hiddenAnnulusInner);
        expect(hidden[0]).toBeLessThan(visible[0]);
    });
});

// Every tooltip string is glossary copy (`ma.item.item-ring-grid.tooltips`).
const context = createTestContext('ma');

const students = [
    { studentId: 'a', firstName: 'Ada', lastName: 'Lovelace' },
    { studentId: 'b', firstName: 'Bo', lastName: 'Berg' },
    { studentId: 'c', firstName: 'Cy', lastName: 'Cole' },
];

/**
 * Figures for a two-level ring at one success rate.
 * @param {number} successRate - The rate, 0–100.
 * @returns {import('../../../../../src/ma/modules/charts/itemRing/ringStatistics.js').RingStats}
 */
const stats = (successRate) => ({
    itemCompetenceLevelDistribution: [
        { level: 'I', count: 1, successRate },
        { level: 'II', count: 1, successRate },
    ],
    successRate,
    totalItems: 2,
    totalCorrect: 1,
    totalOpportunities: 2,
});

/**
 * A ring spec whose renderer wires no tooltips.
 * @param {number} successRate
 * @param {string[]|null} selectedStudents
 * @returns {ItemRingSpec}
 */
const spec = (successRate, selectedStudents) => ({
    ringStats: stats(successRate),
    groupStats: stats(50),
    selection: ringSelection(context.glossary, selectedStudents, students),
    // The pilot tick points at 25 %.
    pilotFrequency: 25,
    innerRingVisible: true,
    durationMs: 0,
    chartInstance: { context, wireTooltipEvents: (selection) => selection },
});

/**
 * A detached SVG group to draw a ring into.
 * @returns {import('../../../../../src/ma/modules/charts/itemRing/itemRingFigure.js').RingGroup}
 */
const group = () => d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'g'));

/**
 * Draw one ring and read the tooltip of a mark the way the renderer would on hover: the
 * stub renderer keeps the content callback it is handed for each wired element.
 * @param {Partial<ItemRingSpec>} overrides
 * @param {string} selector
 * @returns {TooltipContent|null} `null` when the mark is not drawn.
 */
function drawnTooltip(overrides, selector) {
    /** @type {Map<Element, () => TooltipContent>} */
    const tooltips = new Map();
    /** @type {TooltipOwner} */
    const chartInstance = {
        context,
        wireTooltipEvents(selection, { getTooltipContent }) {
            selection.each(function (d) {
                tooltips.set(/** @type {Element} */ (this), () => getTooltipContent(d));
            });
            return selection;
        },
    };
    const g = group();
    drawItemRing(g, RADIUS_PX, { ...spec(50, null), ...overrides, chartInstance });
    // Every mark the figure wires is an SVG element.
    const node = /** @type {Element|null} */ (g.select(selector).node());
    return node ? required(tooltips.get(node))() : null;
}

describe('the pilot tick', () => {
    /**
     * Where the pilot tick points for these items, in degrees; `null` when none is drawn.
     * @param {Parameters<typeof meanPilotSolutionFrequency>[0]} items
     * @returns {number|null}
     */
    const pilotTickDeg = (items) => {
        const g = group();
        drawItemRing(g, RADIUS_PX, {
            ...spec(50, null),
            pilotFrequency: meanPilotSolutionFrequency(items),
        });
        const rotor = g.select('.item-ring-pilot-tick .item-ring-tick-rotor');
        return rotor.empty()
            ? null
            : Number(required(/rotate\((.+)\)/.exec(rotor.attr('transform')))[1]);
    };

    it('points at the mean pilot value, as a percentage', () => {
        // Pilot values arrive as proportions; the ring is drawn in percent: 50 % is 180°.
        expect(
            pilotTickDeg([{ pilotSolutionFrequency: 0.4 }, { pilotSolutionFrequency: 0.6 }]),
        ).toBeCloseTo(180);
    });

    it('skips items whose pilot value is absent, null or unparseable', () => {
        // An item nobody piloted arrives as `pilotSolutionFrequency: null` (the adapter's
        // `selectPilotSolutionFrequency` finds no solution frequency). `Number(null)` is 0, so
        // counted naively it enters the mean as "piloted, nobody solved it" and drags the
        // Ø tick toward 0 %, claiming the group beat a benchmark that was never measured.
        // 80 % is 288°.
        expect(
            pilotTickDeg([
                { pilotSolutionFrequency: 0.8 },
                { pilotSolutionFrequency: null },
                // A string the item type rules out, as a payload could still send it.
                /** @type {{pilotSolutionFrequency?: number|null}} */ (
                    /** @type {unknown} */ ({ pilotSolutionFrequency: 'k.A.' })
                ),
                { pilotSolutionFrequency: undefined },
                {},
            ]),
        ).toBeCloseTo(288);
    });

    it('still counts a real zero — an item piloted and solved by nobody', () => {
        // 25 % is 90°.
        expect(
            pilotTickDeg([{ pilotSolutionFrequency: 0 }, { pilotSolutionFrequency: 0.5 }]),
        ).toBeCloseTo(90);
    });

    it('is not drawn when nothing was piloted', () => {
        // A 50 % fallback would be a benchmark no pilot study measured, with a
        // tooltip naming "Pilotstudien" as its basis. No value, no tick.
        expect(pilotTickDeg([{ pilotSolutionFrequency: null }, {}])).toBeNull();
        expect(pilotTickDeg([])).toBeNull();
    });
});

describe('the student tick tooltip title', () => {
    const named = [
        { studentId: 'a', firstName: 'Ada', lastName: 'Lovelace' },
        { studentId: 'b', firstName: 'Bo', lastName: 'Berg' },
        { studentId: 'c', firstName: 'Cy', lastName: 'Cole' },
    ];
    /**
     * The title of the student tick's tooltip for a selection among `groupStudents`.
     * @param {string[]} selectedStudents
     * @param {Array<{studentId: string, firstName: string, lastName: string}>} groupStudents
     * @returns {string|undefined}
     */
    const tickTitle = (selectedStudents, groupStudents) =>
        required(
            drawnTooltip(
                { selection: ringSelection(context.glossary, selectedStudents, groupStudents) },
                '.selected-student-tick',
            ),
        ).title;

    it('names the student when exactly one is selected', () => {
        expect(tickTitle(['a'], named)).toBe('Ada Lovelace');
    });

    it('falls back to the group label for several students', () => {
        expect(tickTitle(['a', 'b'], named)).toBe('Ausgewählte Schüler:innen');
    });
});

describe('drawItemRing drawn twice into one group', () => {
    it('updates the marks in place instead of stacking a second ring', () => {
        // A selection change redraws the figure into the ring on screen; appended
        // marks would pile up a tick and a level ring per switch.
        const g = group();
        drawItemRing(g, 100, spec(80, ['a']));
        drawItemRing(g, 100, spec(60, ['a']));

        expect(g.selectAll('.selected-student-tick').size()).toBe(1);
        expect(g.selectAll('.level-arc').size()).toBe(2);
        expect(g.selectAll('.item-ring-center-text').size()).toBe(1);

        drawItemRing(g, 100, spec(50, null));
        expect(g.selectAll('.selected-student-tick').size()).toBe(0);
        expect(g.selectAll('.selected-student-icon').size()).toBe(0);
    });

    it('draws the pilot tick as a bare line at the pilot rate', () => {
        // The pilot value is a benchmark, not an average; a sign beside it reads as
        // the Ø of the Schul- and Landesschnitt.
        const g = group();
        drawItemRing(g, 100, spec(26, ['a']));

        expect(g.select('.item-ring-pilot-tick .item-ring-tick-rotor').attr('transform')).toBe(
            'rotate(90)',
        );
        expect(g.select('.item-ring-pilot-tick').selectAll('text, path').size()).toBe(0);
    });

    it('fits the whole figure inside the reach its box reserves', () => {
        // The grid and the focus card size the ring box from RING_REACH; an icon
        // past it crosses the ring title when the tick is at 12 o'clock.
        const { iconRadius, iconScale } = ringGeometry(100, true);
        // The icon's half extent is 5.75 units of its 14-unit drawing; a clearance follows.
        expect(iconRadius + iconScale * 5.75).toBeLessThan(100 * RING_REACH);
        expect(RING_REACH).toBeGreaterThan(1);
        expect(RING_REACH).toBeLessThan(1.2);
    });

    it('draws a ring without items as the annulus, no rate', () => {
        // A Leitidee the booklet declares but carries no items for keeps its place
        // in the grid; a success arc or a tick there would claim a result nobody had.
        const empty = {
            itemCompetenceLevelDistribution: [],
            successRate: 0,
            totalItems: 0,
            totalCorrect: 0,
            totalOpportunities: 0,
        };
        const g = group();
        drawItemRing(g, 100, {
            ringStats: empty,
            groupStats: empty,
            selection: ringSelection(context.glossary, ['a'], students),
            pilotFrequency: null,
            innerRingVisible: true,
            durationMs: 0,
            chartInstance: { context, wireTooltipEvents: (selection) => selection },
        });

        expect(g.selectAll('.item-ring-outer-arc-background').size()).toBe(1);
        expect(g.selectAll('.item-ring-outer-arc-success').size()).toBe(0);
        expect(g.selectAll('.level-arc, .item-ring-tick').size()).toBe(0);
        expect(g.select('.item-ring-center-text').text()).toBe('–');
    });
});

describe('a ring with items nobody was scored on', () => {
    it('claims no rate: no success arc, no student tick, the dash in the centre', () => {
        // Items without responses (no `descriptiveStatistics.total`, no per-student
        // results) segment the ring but give it no rate; a success arc or a tick at
        // 0 % would read as "measured, nobody solved it" beside the centre's dash.
        const unscored = { ...stats(0), totalCorrect: 0, totalOpportunities: 0 };
        const g = group();
        drawItemRing(g, 100, {
            ...spec(0, ['a']),
            ringStats: unscored,
            groupStats: unscored,
        });

        expect(g.selectAll('.level-arc').size()).toBe(2);
        expect(g.selectAll('.item-ring-outer-arc-success').size()).toBe(0);
        expect(g.selectAll('.selected-student-tick').size()).toBe(0);
        expect(g.select('.item-ring-center-text').text()).toBe('–');
    });
});

describe('the student tick turning', () => {
    /**
     * @param {d3.Selection<SVGGElement, unknown, any, any>} g
     * @returns {string|null}
     */
    const tickRotation = (g) =>
        g.select('.selected-student-tick .item-ring-tick-rotor').attr('transform');

    it('starts a turn cut short from where the tick stands, not from its last target', () => {
        // A selection change while the tick still turns: the turn before it never got
        // a frame, so the tick stands where it was placed. Starting from the old turn's
        // target would make it jump there first.
        const g = group();
        drawItemRing(g, 100, { ...spec(25, ['a']), durationMs: 1000 });
        drawItemRing(g, 100, { ...spec(50, ['a']), durationMs: 1000 });
        expect(tickRotation(g)).toBe('rotate(90)');

        drawItemRing(g, 100, { ...spec(75, ['a']), durationMs: 1000 });
        expect(tickRotation(g)).toBe('rotate(90)');
    });
});

describe('describeItemRing', () => {
    it('names the group, the selection, the pilot and each Aufgabenniveau', () => {
        // A selectable ring cell is the keyboard target and its marks are not; with
        // the group rate alone, keyboard users never hear the student tick, the pilot
        // tick or the inner ring.
        const text = describeItemRing(spec(30, ['a', 'b']));

        expect(text.split('. ')).toEqual([
            expect.stringMatching(/^Lösungsquote: 50/),
            expect.stringMatching(/^Ausgewählte Schüler:innen: 30/),
            expect.stringMatching(/^Pilotierung: 25/),
            expect.stringMatching(/^Aufgabenniveau I: 30/),
            expect.stringMatching(/^Aufgabenniveau II: 30/),
        ]);
        expect(describeItemRing(spec(50, null))).not.toContain(': 30');
    });
});
