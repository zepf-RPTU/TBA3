/**
 * The one item ring the MA dashboard draws.
 *
 * The figure owns the ring: its radii, arc classes, tooltips, mark order and
 * stylesheet. Callers own the canvas and the title.
 *
 * `radius` is an input, never derived here: the caller sizes the ring.
 */

import { MOTION_EASE, motionDuration } from '../../../../common/charts/motionPreference.js';
import { valueLabelInk } from '../../../../common/services/paletteTokens.js';
import { getItemCompetenceLevelFill } from '../../../../common/services/itemCompetenceLevelAppearance.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import * as d3 from 'd3';
import {
    formatCount,
    formatCountOf,
    formatPercent,
    MISSING_VALUE,
} from '../../../../common/utils/numberFormat.js';
import './itemRingFigure.css';
import { percentOf, toPercent } from '../../../../common/domain/itemResultCounts.js';
import { MARK_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { angleDeltaDeg, ringGeometry } from './itemRingGeometry.js';
import { DATA_MARK_CLASS } from '../../../../common/services/dataMark.js';

/** @typedef {import('../../../../common/charts/renderers/chartRenderer.js').ChartRenderer} ChartRenderer */
/** @typedef {import('./ringStatistics.js').ItemCompetenceLevelStats} ItemCompetenceLevelStats */
/**
 * What the figure needs of the renderer that owns its tooltips.
 * @typedef {Pick<ChartRenderer, 'context' | 'wireTooltipEvents'>} TooltipOwner
 */
/** @typedef {d3.Selection<SVGGElement, unknown, any, any>} RingGroup */
/** @typedef {d3.Selection<SVGGElement, string, any, any>} RingLayer One of the figure's layers, its datum the layer's name. */

/**
 * The item fields the figure reads: the ring figures' inputs plus the Pilotierung benchmark.
 * @typedef {import('./ringStatistics.js').RingItem & {pilotSolutionFrequency?: number|null}} ItemRingFigureEntry
 */

const RING_FIGURE_CONFIG = {
    UNSOLVED_OPACITY_FACTOR: 0.35,
    ICON_STROKE_WIDTH_PX: 1.5,
};

// Person mannequin icon — X-centered at 0, scaled via ICON_COORD_SIZE_UNITS
export const MANNEQUIN_PATH =
    'M2,-3.75 a2,2 0 1,0 -4,0 a2,2 0 1,0 4,0 M0,-1.75 L0,1.75 M-3,0.25 L3,0.25 M-2.5,5.75 L0,1.75 L2.5,5.75';

/**
 * What an item ring draws, and who owns the tooltips it wires.
 * @typedef {object} ItemRingSpec
 * @property {import('./ringStatistics.js').RingStats} ringStats - The figures the inner ring, the centre text and the student tick stand for: the selection's when one is active, otherwise the group's.
 * @property {import('./ringStatistics.js').RingStats} groupStats - The outer ring always shows these, selection or not.
 * @property {import('./selection.js').RingSelection} selection - Who the ring stands for besides the group: the student tick and its line in the description follow `isSubset`, and carry `name`.
 * @property {number|null} pilotFrequency - Where the pilot tick points, `meanPilotSolutionFrequency` of the ring's items; `null` draws none.
 * @property {boolean} innerRingVisible - Whether the level ring is drawn; hiding it widens the outer annulus inwards.
 * @property {number} durationMs - How long the student tick turns to a new angle (`ChartRenderer.drawDurationMs`); 0 places it.
 * @property {TooltipOwner} chartInstance - The renderer that owns the tooltip lifecycle.
 */

// =============================================================================
// GEOMETRY
// =============================================================================

/**
 * @param {number} rate - A share in percent.
 * @returns {number} Its angle on the ring, in degrees clockwise from the top.
 */
function rateToDeg(rate) {
    return (rate / 100) * 360;
}

/**
 * The average of the items' pilot values: where the pilot tick points. An item nobody
 * piloted (`pilotSolutionFrequency` null, missing or unparseable) does not count toward
 * the mean.
 * @param {Array<Pick<ItemRingFigureEntry, 'pilotSolutionFrequency'>>} itemArray
 * @returns {number|null} In percent; `null` when no item carries a pilot value.
 */
export function meanPilotSolutionFrequency(itemArray) {
    const mean = d3.mean(itemArray, (item) => item.pilotSolutionFrequency);
    return mean === undefined ? null : toPercent(mean);
}

// =============================================================================
// MARKS
// =============================================================================

/*
 * d3's generators instantiated for the data they draw: `d3.pie<Datum>()` and
 * `d3.arc<Datum>()`, whose type arguments JSDoc cannot pass at the call.
 */
/** @type {() => d3.Pie<any, ItemCompetenceLevelStats>} */
const levelPie = d3.pie;
/** @type {() => d3.Arc<any, d3.PieArcDatum<ItemCompetenceLevelStats>>} */
const levelArc = d3.arc;
/** @type {() => d3.Arc<any, {startAngle: number, endAngle: number}>} */
const spanArc = d3.arc;

/**
 * The figure's layers, bottom to top: the order the marks overlap in. Each mark kind
 * lives in its own layer, so a mark that appears on a later draw (the student tick of a
 * new selection) still lands at its depth instead of on top of everything.
 */
const RING_LAYERS = ['inner-ring', 'outer-ring', 'student-tick', 'pilot-tick', 'center'];

/**
 * One tick across the annulus.
 * @typedef {object} RingTick
 * @property {string} className - The group's class, which identifies the tick.
 * @property {string} lineClass - The line's class, which paints it.
 * @property {number} angleDeg
 * @property {boolean} [mannequin] - Draw the student mannequin past the line's end; a bare line without it.
 * @property {() => import('../../../../common/services/cursorTooltip.js').TooltipContent} getTooltipContent
 * @property {number} durationMs - How long it turns from the angle it stands at; 0 places it.
 */

/** The angle a tick stands at on screen, so the next draw turns it from there. */
const tickAngle = /** @type {d3.Local<number>} */ (d3.local());

/**
 * One element of a kind under `parent`, created on the first draw and reused after.
 * @template T
 * @param {RingLayer} parent
 * @param {string} tag
 * @param {string} className - Its classes; the first one identifies it.
 * @param {T[]} [data] - `[datum]` to draw it, `[]` to remove it.
 * @returns {d3.Selection<d3.BaseType, T, SVGGElement, string>} Empty when `data` is.
 */
function joinMark(parent, tag, className, data = /** @type {T[]} */ ([null])) {
    return parent
        .selectAll(`:scope > .${className.split(' ')[0]}`)
        .data(data)
        .join(tag)
        .attr('class', className);
}

/**
 * Render the inner ring (level distribution pie chart).
 * Each arc is split into a "solved" sub-arc (full opacity) and an "unsolved"
 * sub-arc (reduced opacity) to visualise the per-level success rate. The arcs are
 * keyed by level, so a redraw for another selection moves the solved share of the
 * arcs already on screen.
 * @param {RingLayer} layer
 * @param {import('./itemRingGeometry.js').RingGeometry} geometry
 * @param {object} params
 * @param {ItemCompetenceLevelStats[]} params.levelData - One entry per Aufgabenniveau; empty while the ring is hidden.
 * @param {number} params.totalItems - The ring's item count, which a level's share is of.
 * @param {TooltipOwner} params.chartInstance
 */
function renderInnerRing(layer, geometry, { levelData, totalItems, chartInstance }) {
    const { glossary, palette } = chartInstance.context;
    // Item levels sit on the registered Aufgabenniveau scale; `getItemCompetenceLevelFill` paints
    // each as the reporting level whose item-slot span covers it. Never an unset fill — that
    // renders black.
    const levelFill = (/** @type {d3.PieArcDatum<ItemCompetenceLevelStats>} */ d) =>
        getItemCompetenceLevelFill(palette, d.data.level);
    const unsolvedFactor = RING_FIGURE_CONFIG.UNSOLVED_OPACITY_FACTOR;
    const solvedEndAngle = (/** @type {d3.PieArcDatum<ItemCompetenceLevelStats>} */ d) =>
        d.startAngle + (d.endAngle - d.startAngle) * ((d.data.successRate ?? 0) / 100);

    const pie = levelPie()
        .value((d) => d.count)
        .sort(null);
    const innerArc = levelArc().innerRadius(geometry.inner[0]).outerRadius(geometry.inner[1]);

    const levelArcs =
        /** @type {d3.Selection<SVGGElement, d3.PieArcDatum<ItemCompetenceLevelStats>, SVGGElement, string>} */ (
            layer.selectAll(':scope > .level-arc')
        )
            .data(pie(levelData), (d) => d.data.level)
            .join((enter) => {
                const arc = enter.append('g').attr('class', `level-arc ${DATA_MARK_CLASS}`);
                arc.append('path').attr('class', 'item-ring-level-arc item-ring-level-unsolved');
                arc.append('path').attr('class', 'item-ring-level-arc item-ring-level-solved');
                arc.append('text').attr('class', 'item-ring-level-label').attr('dy', '0.35em');
                return arc;
            });

    levelArcs
        .select('.item-ring-level-unsolved')
        .attr('d', innerArc)
        .style('fill', levelFill)
        .attr('fill-opacity', unsolvedFactor);

    levelArcs
        .select('.item-ring-level-solved')
        .attr('d', (d) => innerArc({ ...d, endAngle: solvedEndAngle(d) }))
        .style('fill', levelFill);

    // One datum, one wired element: the level's group, whose hover dims both arcs
    // and its label together and gives the level a single tab stop.
    chartInstance.wireTooltipEvents(levelArcs, {
        getTooltipContent: (d) => ({
            title: `${TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL} ${d.data.level}`,
            rows: [
                { label: tooltipText(glossary, 'item-count'), value: formatCount(d.data.count) },
                {
                    label: tooltipText(glossary, 'item-share'),
                    value: formatPercent(percentOf(d.data.count, totalItems)),
                },
                {
                    label: tooltipText(glossary, 'success-rate'),
                    value: formatPercent(d.data.successRate),
                },
            ],
        }),
        hoverEffect: 'area',
    });

    levelArcs
        .select('.item-ring-level-label')
        .attr('transform', (d) => `translate(${innerArc.centroid(d)})`)
        // On its own arc, so the arc's fill decides the ink. The label sits at the
        // arc's centroid: on the solved part that is the full band colour, on the
        // unsolved part the band's wash over the surface.
        .style('fill', (d) =>
            valueLabelInk(levelFill(d), {
                opacity: (d.startAngle + d.endAngle) / 2 <= solvedEndAngle(d) ? 1 : unsolvedFactor,
            }),
        )
        .text((d) => d.data.level);
}

/**
 * Render the outer ring: the annulus, and the group's solved share over it. A ring
 * nobody answered (no items, or none with responses) draws the annulus alone.
 * @param {RingLayer} layer
 * @param {import('./itemRingGeometry.js').RingGeometry} geometry
 * @param {import('./ringStatistics.js').RingStats} groupStats
 * @param {TooltipOwner} chartInstance
 */
function renderOuterRing(layer, geometry, groupStats, chartInstance) {
    const { glossary } = chartInstance.context;
    const outerArc = spanArc().innerRadius(geometry.outer[0]).outerRadius(geometry.outer[1]);

    joinMark(
        layer,
        'path',
        `item-ring-outer-arc-background item-ring-outer-arc ${DATA_MARK_CLASS}`,
        [{ startAngle: 0, endAngle: 2 * Math.PI }],
    ).attr('d', outerArc);

    // The share solved is a result: the stylesheet paints it in the tables' richtig
    // colour, not the group-mark ink.
    const successArcPath = joinMark(
        layer,
        'path',
        `item-ring-outer-arc-success item-ring-outer-arc ${DATA_MARK_CLASS}`,
        groupStats.totalOpportunities > 0
            ? [{ startAngle: 0, endAngle: (rateToDeg(groupStats.successRate) * Math.PI) / 180 }]
            : [],
    ).attr('d', outerArc);

    chartInstance.wireTooltipEvents(successArcPath, {
        getTooltipContent: () => ({
            title: tooltipText(glossary, 'group-average-title'),
            rows: [
                {
                    label: tooltipText(glossary, 'success-rate'),
                    value: formatPercent(groupStats.successRate),
                },
                {
                    label: tooltipText(glossary, 'solved'),
                    value: formatCountOf(groupStats.totalCorrect, groupStats.totalOpportunities),
                },
            ],
        }),
        hoverEffect: 'area',
    });
}

/**
 * Render the centre: the success rate large, so rings compare by number and not by
 * angle alone, centred on the hole. A ring nobody answered has no rate. The item count
 * is the caller's to show; the centre never carries it.
 * @param {RingLayer} layer
 * @param {import('./ringStatistics.js').RingStats} ringStats
 */
function renderCenterText(layer, ringStats) {
    joinMark(layer, 'text', 'item-ring-center-text')
        .attr('dy', '0.35em')
        .text(rateText(ringStats, 0));
}

/**
 * A ring's success rate as text; a ring nobody answered has none.
 * @param {import('./ringStatistics.js').RingStats} stats
 * @param {number} [digits] - Fraction digits.
 * @returns {string} The rate, or the missing-value dash.
 */
function rateText(stats, digits) {
    return stats.totalOpportunities > 0 ? formatPercent(stats.successRate, digits) : MISSING_VALUE;
}

/**
 * Everything the ring shows, as one sentence list for a screen reader: the group rate,
 * the selection's rate while one is active, the pilot rate and the rate per
 * Aufgabenniveau. A cell whose marks are not focusable carries it as its label.
 * @param {ItemRingSpec} spec
 * @returns {string}
 */
export function describeItemRing({
    ringStats,
    groupStats,
    selection,
    pilotFrequency,
    chartInstance,
}) {
    const { glossary } = chartInstance.context;
    const parts = [`${tooltipText(glossary, 'success-rate')}: ${rateText(groupStats)}`];
    if (selection.isSubset && ringStats.totalItems > 0) {
        parts.push(`${selection.name}: ${rateText(ringStats)}`);
    }
    if (pilotFrequency !== null) {
        parts.push(`${tooltipText(glossary, 'pilot')}: ${formatPercent(pilotFrequency)}`);
    }
    for (const { level, successRate } of ringStats.itemCompetenceLevelDistribution) {
        parts.push(
            `${TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL} ${level}: ${formatPercent(successRate)}`,
        );
    }
    return parts.join('. ');
}

/**
 * One of the ring's tooltip strings. The grid and the focus chart draw the same figure,
 * so both read the grid's fragment.
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {string} key - Key below `ma.item.item-ring-grid.tooltips`.
 * @returns {string}
 */
function tooltipText(glossary, key) {
    return glossary.getRequiredEntryText(`ma.item.item-ring-grid.tooltips.${key}`);
}

/**
 * One tick across the annulus: a group holding a rotor that turns the line, and any
 * icon past its end, kept upright. The group carries the tooltip and the tab stop. With
 * a `durationMs`, a tick already on screen turns to its new angle the short way round
 * instead of jumping; one tween moves the line and the icon together.
 * @param {RingLayer} layer
 * @param {import('./itemRingGeometry.js').RingGeometry} geometry
 * @param {RingTick|null} tick - `null` removes it.
 * @param {TooltipOwner} chartInstance
 */
function renderTick(layer, geometry, tick, chartInstance) {
    // Each tick has a layer of its own, so an absent one matches by the class every tick
    // carries and removes whatever tick the layer holds.
    const group = /** @type {d3.Selection<SVGGElement, RingTick, SVGGElement, string>} */ (
        layer.selectAll(`:scope > .${tick?.className ?? 'item-ring-tick'}`)
    )
        .data(tick ? [tick] : [])
        .join((enter) => {
            const g = enter.append('g').attr('class', (d) => `item-ring-tick ${d.className}`);
            const rotor = g.append('g').attr('class', 'item-ring-tick-rotor');
            rotor.append('line').attr('class', (d) => d.lineClass);
            // A 2–3 px line is no pointer target: a transparent stroke of the minimum
            // hit size around it takes the hover for the tick.
            rotor
                .append('line')
                .attr('class', 'chart-hit chart-hit--stroke')
                .attr('stroke-width', MARK_DEFAULTS.minHitSizePx);
            g.filter((d) => Boolean(d.mannequin))
                .append('path')
                .attr('class', 'selected-student-icon item-ring-student-icon');
            return g;
        });
    if (!tick) return;

    const rotor = group.select('.item-ring-tick-rotor');
    const icon = tick.mannequin ? group.select('.selected-student-icon') : null;
    rotor
        .selectAll('line')
        .attr('x1', 0)
        .attr('y1', -geometry.tick[0])
        .attr('x2', 0)
        .attr('y2', -geometry.tick[1]);
    icon?.attr('d', MANNEQUIN_PATH).attr(
        'stroke-width',
        RING_FIGURE_CONFIG.ICON_STROKE_WIDTH_PX / geometry.iconScale,
    );
    chartInstance.wireTooltipEvents(group, { getTooltipContent: tick.getTooltipContent });

    // The tick was joined above, so the group holds its one element.
    const node = /** @type {SVGGElement} */ (group.node());
    const place = (/** @type {number} */ deg) => {
        // The angle on screen, also mid-turn: a turn cut short starts from there. Kept
        // in [0, 360), where `angleDeltaDeg` finds the short way.
        tickAngle.set(node, ((deg % 360) + 360) % 360);
        rotor.attr('transform', `rotate(${deg})`);
        if (!icon) return;
        const [x, y] = d3.pointRadial((deg * Math.PI) / 180, geometry.iconRadius);
        icon.attr('transform', `translate(${x}, ${y}) scale(${geometry.iconScale})`);
    };

    const fromDeg = tick.durationMs > 0 ? (tickAngle.get(node) ?? tick.angleDeg) : tick.angleDeg;
    const delta = angleDeltaDeg(tick.angleDeg, fromDeg);

    group.interrupt();
    place(fromDeg);
    if (delta === 0) return;
    group
        .transition()
        .duration(motionDuration(tick.durationMs))
        .ease(MOTION_EASE)
        .tween('turn', () => (t) => place(fromDeg + delta * t));
}

/**
 * Draw one item ring, or bring the one already drawn into `g` to a new spec.
 *
 * Every mark is joined, not appended, so a second call on the same group updates the
 * ring in place: the caller redraws the whole figure for a new selection and only
 * what changed moves. The layers fix the order the marks overlap in: the level ring
 * first, then the outer annulus around it, then the two ticks that cross the annulus,
 * then the centre text.
 *
 * A ring without items — a Leitidee the booklet declares but carries no items for —
 * draws the annulus and the missing-value dash alone: every data-driven mark joins empty.
 * @param {RingGroup} g - The centred group the ring is drawn into. The caller sizes and places it.
 * @param {number} radius - The ring's outer radius in px.
 * @param {ItemRingSpec} spec
 */
export function drawItemRing(g, radius, spec) {
    const {
        ringStats,
        groupStats,
        selection,
        pilotFrequency,
        innerRingVisible,
        durationMs,
        chartInstance,
    } = spec;
    const geometry = ringGeometry(radius, innerRingVisible);
    const { glossary } = chartInstance.context;

    const layers = /** @type {d3.Selection<SVGGElement, string, SVGGElement, unknown>} */ (
        g.selectAll(':scope > .item-ring-layer')
    )
        .data(RING_LAYERS, (name) => name)
        .join('g')
        .attr('class', (name) => `item-ring-layer item-ring-layer--${name}`);
    const layer = (/** @type {string} */ name) => layers.filter((layerName) => layerName === name);

    renderInnerRing(layer('inner-ring'), geometry, {
        levelData: innerRingVisible ? ringStats.itemCompetenceLevelDistribution : [],
        totalItems: ringStats.totalItems,
        chartInstance,
    });
    renderOuterRing(layer('outer-ring'), geometry, groupStats, chartInstance);

    // Without a scored item the selection has no rate: the centre prints the dash, so
    // no tick may claim 0 %.
    const studentDrawn = selection.isSubset && ringStats.totalOpportunities > 0;
    renderTick(
        layer('student-tick'),
        geometry,
        studentDrawn
            ? {
                  className: 'selected-student-tick',
                  lineClass: 'item-ring-student-tick-line',
                  angleDeg: rateToDeg(ringStats.successRate),
                  mannequin: true,
                  getTooltipContent: () => ({
                      title: selection.name,
                      rows: [
                          {
                              label: tooltipText(glossary, 'success-rate'),
                              value: formatPercent(ringStats.successRate),
                          },
                          {
                              label: tooltipText(glossary, 'solved'),
                              value: formatCountOf(
                                  ringStats.totalCorrect,
                                  ringStats.totalOpportunities,
                              ),
                          },
                      ],
                  }),
                  durationMs,
              }
            : null,
        chartInstance,
    );

    // No piloted item, no pilot tick. It is the item table's Pilotierung marker turned
    // radial: a bare line without a sign.
    renderTick(
        layer('pilot-tick'),
        geometry,
        pilotFrequency === null
            ? null
            : {
                  className: 'item-ring-pilot-tick',
                  lineClass: 'item-ring-pilot-tick-line',
                  angleDeg: rateToDeg(pilotFrequency),
                  getTooltipContent: () => ({
                      rows: [
                          {
                              label: tooltipText(glossary, 'pilot'),
                              value: formatPercent(pilotFrequency),
                          },
                      ],
                  }),
                  durationMs: 0,
              },
        chartInstance,
    );

    renderCenterText(layer('center'), ringStats);
}
