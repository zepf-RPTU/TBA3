/**
 * The one task ring the MA dashboard draws.
 *
 * Two charts show a task ring — the grid cell (`TaskRingChart`) and the item view's
 * detail card (`TaskRingFocusChart`) — and before this module they shared the drawing
 * but not the *orchestration*: each knew the render order, each computed the tick radii,
 * and each filtered its items by Leitidee a second time on the way to the expected-solution
 * tick. The focus chart reached into `TaskRingChart` for its radius geometry, so the two
 * charts could not be read apart. Adding a third tick was a four-file edit.
 *
 * The figure owns the ring: its radii, its arc classes, the order the marks go down in.
 * Callers own everything around it — the canvas, the title, the empty-state decision, and
 * the tooltip text, which they pass in as `tooltips.niveau` / `tooltips.classAverage`.
 *
 * `radius` is an input, never derived here: the grid cell measures one from its layout and
 * the focus card uses a fixed 250×250 box, and neither may inherit the other's sizing.
 *
 * Unlike `sl/modules/charts/shared/boxPlotFigure.js`, this figure is not free-standing: every mark
 * carries a tooltip, and tooltips are wired through the owning renderer so they are torn
 * down with the chart. That is why `chartInstance` is part of the spec.
 * @module taskRingFigure
 */

import { createOpacityHoverEffect } from '../../../../common/charts/renderers/chartRenderer.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import { inkOn } from '../../../../common/services/colorRamp.js';
import { getItemLevelColor } from '../../../../common/domain/levels.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary/glossaryText.js';
import * as d3 from 'd3';

// =============================================================================
// CONSTANTS
// =============================================================================

const RING_FIGURE_CONFIG = {
    RINGS: {
        INNER_RADIUS_RATIO: 0.35,
        MIDDLE_RADIUS_RATIO: 0.65,
        OUTER_RADIUS_RATIO: 0.85,
        GAP_RATIO: 0.05,
        // When inner ring is hidden
        HIDDEN_OUTER_INNER_RATIO: 0.35,
        HIDDEN_OUTER_RADIUS_RATIO: 0.85,
        ARC_STROKE_WIDTH: 2, // stroke width for all ring arcs (px)
        UNSOLVED_OPACITY_FACTOR: 0.35, // opacity multiplier for the unsolved portion of inner ring arcs
    },
    TICKS: {
        STROKE_WIDTH: 3,
        OUTER_EXTENSION_RATIO: 0.5, // how far the tick extends beyond the outer ring edge, as multiple of ring thickness
        ICON_SCALE: 0.18, // mannequin/avg-symbol size as fraction of radius
        ICON_OFFSET: 0.1, // gap between tick outer end and icon/symbol, as fraction of radius
        ICON_STROKE_WIDTH: 1.5, // base stroke width for mannequin icon (scaled)
        ICON_COORD_SIZE: 14, // mannequin SVG coordinate space size (used for icon scaling)
    },
    CENTER: {
        TEXT_Y_RATIO: 0.065, // fraction of radius above center for task count text
        LABEL_Y_RATIO: 0.15, // fraction of radius below center for "Items" label
    },
};

/** Angular distance below which the Ø symbol and the student icon would overlap, degrees. */
const TICK_CLASH_DEG = 14;

// Person mannequin icon — X-centered at 0, scaled via ICON_COORD_SIZE (14)
const MANNEQUIN_PATH =
    'M2,-3.75 a2,2 0 1,0 -4,0 a2,2 0 1,0 4,0 M0,-1.75 L0,1.75 M-3,0.25 L3,0.25 M-2.5,5.75 L0,1.75 L2.5,5.75';

/**
 * What a task ring draws, and who owns the tooltips it wires.
 * @typedef {object} TaskRingSpec
 * @property {any} ringStats - The figures the inner ring, the centre text and the student tick stand for: the selection's when one is active, otherwise the class's.
 * @property {any} classStats - The class figures. The outer ring always shows these, selection or not.
 * @property {Array} items - The items this ring draws, **already filtered** to its Leitidee. Used for the expected-solution tick.
 * @property {Array} students - The full student array, against which a selection is judged a proper subset.
 * @property {Array<string>|null} normalizedSelected - Selected student ids from `normalizeSelectedStudents`, or `null` for the whole class.
 * @property {boolean} innerRingVisible - Whether the niveau ring is drawn; hiding it widens the outer annulus inwards.
 * @property {object} chartInstance - The renderer that owns the tooltip lifecycle.
 * @property {{niveau: Function, classAverage: Function}} tooltips - `(d) => html` for a niveau arc, `() => html` for the class-average arc.
 */

// =============================================================================
// GEOMETRY
// =============================================================================

/**
 * Radii of the outer ring annulus. Hiding the inner ring widens the annulus inwards.
 * @param {number} radius - Outer radius
 * @param {boolean} innerRingVisible - Whether the inner ring is drawn; hiding it frees the space inwards.
 * @returns {{ outerArcInnerRadius: number, outerArcOuterRadius: number }} The annulus bounds in px.
 */
function getOuterRingRadii(radius, innerRingVisible) {
    const R = RING_FIGURE_CONFIG.RINGS;

    return {
        outerArcInnerRadius: innerRingVisible
            ? radius * (R.MIDDLE_RADIUS_RATIO + R.GAP_RATIO)
            : radius * R.HIDDEN_OUTER_INNER_RATIO,
        outerArcOuterRadius: innerRingVisible
            ? radius * R.OUTER_RADIUS_RATIO
            : radius * R.HIDDEN_OUTER_RADIUS_RATIO,
    };
}

/**
 * Compute tick radii so that the tick spans the full outer ring
 * and extends beyond it by OUTER_EXTENSION_RATIO × the normal (inner-ring-visible)
 * ring thickness. The extension is anchored to the normal thickness so that hiding
 * the inner ring (which widens the outer ring) does not inflate the tick length.
 * @param {number} radius - The ring's outer radius in px.
 * @param {boolean} innerRingVisible - Whether the inner ring is drawn.
 * @param {number} outerArcInnerRadius - Inner edge of the outer annulus.
 * @returns {{tickInnerRadius: number, tickOuterRadius: number}} Where a tick starts and ends, in px from the centre.
 */
export function computeTickRadii(radius, innerRingVisible, outerArcInnerRadius) {
    const R = RING_FIGURE_CONFIG.RINGS;
    const actualOuterRadius = innerRingVisible
        ? radius * R.OUTER_RADIUS_RATIO
        : radius * R.HIDDEN_OUTER_RADIUS_RATIO;

    // Always use the normal (inner-ring-visible) thickness for the extension so
    // hiding the inner ring doesn't scale up how far the tick protrudes.
    const normalThickness = radius * (R.OUTER_RADIUS_RATIO - R.MIDDLE_RADIUS_RATIO - R.GAP_RATIO);

    const tickInnerRadius = outerArcInnerRadius;
    const tickOuterRadius =
        actualOuterRadius + normalThickness * RING_FIGURE_CONFIG.TICKS.OUTER_EXTENSION_RATIO;
    return { tickInnerRadius, tickOuterRadius };
}

/**
 * The average of the items' pilot values, as a percentage — where the expected-solution
 * tick points. An item nobody piloted (`pilotierungswert` null, missing or unparseable)
 * does not count toward the mean; with no piloted item there is no expected rate at all.
 * @param {Array} itemArray - The items the ring draws.
 * @returns {number|null} The expected solution rate in percent, or `null` when no item carries a pilot value.
 */
export function expectedSolutionRate(itemArray) {
    const pilotValues = (itemArray ?? [])
        .filter((item) => item.pilotierungswert != null)
        .map((item) => Number(item.pilotierungswert))
        .filter((value) => Number.isFinite(value));

    if (pilotValues.length === 0) return null;
    return (pilotValues.reduce((sum, value) => sum + value, 0) / pilotValues.length) * 100;
}

// =============================================================================
// MARKS
// =============================================================================

/**
 * Wire a tooltip whose content does not depend on the hovered datum, routed through the
 * renderer so the tooltip stays tracked and is torn down with the chart.
 * @param {any} selection - D3 selection of the elements to make hoverable.
 * @param {object} chartInstance - The renderer that owns the tooltip lifecycle.
 * @param {string} tooltipId - Id the renderer tracks this tooltip under.
 * @param {() => string} getTooltipContent - Produces the tooltip HTML on each hover.
 */
function wireStaticTooltip(selection, chartInstance, tooltipId, getTooltipContent) {
    chartInstance.wireTooltipEvents(selection, {
        getTooltipContent: () => getTooltipContent(),
        tooltipId,
    });
}

/**
 * Render the inner ring (niveau distribution pie chart).
 * Each arc is split into a "solved" sub-arc (full opacity) and an "unsolved"
 * sub-arc (reduced opacity) to visualise the per-niveau success rate.
 *
 * Exported for `TaskRingChart`'s optimised selection path, which replaces these arcs in
 * place rather than redrawing the whole figure.
 * @param {any} g - Center group to render into
 * @param {number} radius - Outer radius
 * @param {object} params - Rendering parameters
 * @param {Array} params.niveauData - Array of { niveau, count, successRate } objects
 * @param {object} params.chartInstance - Chart instance for tooltip wiring
 * @param {Function} params.tooltipContentFn - (d) => tooltip HTML string
 */
export function renderInnerRing(g, radius, params) {
    const { niveauData, chartInstance, tooltipContentFn } = params;
    const themeColors = getThemeColors();
    // Item levels sit on the registered Aufgabenniveau scale; `getItemLevelColor` bridges
    // them to the reporting scale's colors. Never an unset fill — that renders black.
    const niveauFill = (d) =>
        getItemLevelColor(d.data.niveau) ?? themeColors.chrome.defaultBarColor;
    const unsolvedFactor = RING_FIGURE_CONFIG.RINGS.UNSOLVED_OPACITY_FACTOR;

    const pie = d3
        .pie()
        .value((d) => /** @type {any} */ (d).count)
        .sort(null);

    const innerArc = d3
        .arc()
        .innerRadius(radius * RING_FIGURE_CONFIG.RINGS.INNER_RADIUS_RATIO)
        .outerRadius(radius * RING_FIGURE_CONFIG.RINGS.MIDDLE_RADIUS_RATIO);

    const niveauArcs = g
        .selectAll('.niveau-arc')
        .data(/** @type {any[]} */ (pie(niveauData)))
        .enter()
        .append('g')
        .attr('class', 'niveau-arc');

    // Unsolved sub-arc (full span, reduced opacity — rendered first as background)
    const unsolvedPaths = niveauArcs
        .append('path')
        .attr(
            'class',
            'task-ring-niveau-arc task-ring-niveau-unsolved task-ring-opacity-transition',
        )
        .attr('d', /** @type {any} */ (innerArc))
        .attr('fill', niveauFill)
        .attr('fill-opacity', unsolvedFactor)
        .attr('stroke', themeColors.chrome.chartStroke)
        .attr('stroke-width', RING_FIGURE_CONFIG.RINGS.ARC_STROKE_WIDTH);

    // Solved sub-arc (partial span, full opacity — overlaid on top, no stroke)
    const solvedPaths = niveauArcs
        .append('path')
        .attr('class', 'task-ring-niveau-arc task-ring-niveau-solved task-ring-opacity-transition')
        .attr('d', (d) => {
            const rate = (d.data.successRate ?? 0) / 100;
            const solvedEnd = d.startAngle + (d.endAngle - d.startAngle) * rate;
            return innerArc({ ...d, endAngle: solvedEnd });
        })
        .attr('fill', niveauFill)
        .attr('fill-opacity', 1)
        .attr('stroke', 'none');

    // Tooltips on both sub-arcs
    [unsolvedPaths, solvedPaths].forEach((paths) => {
        chartInstance.wireTooltipEvents(paths, {
            getTooltipContent: tooltipContentFn,
            tooltipId: 'task-ring',
            hoverEffect: createOpacityHoverEffect(),
        });
    });

    niveauArcs
        .append('text')
        .attr('class', 'task-ring-niveau-label')
        .attr('transform', (d) => {
            const centroid = innerArc.centroid(d);
            return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .attr('dy', '0.35em')
        // On its own arc, so the arc's fill decides the ink — not the chart's label
        // colour. The label sits at the arc's centroid: on the solved part that is the
        // full band colour, on the unsolved part a pale wash the page ink reads on.
        .attr('fill', (d) => {
            const rate = (d.data.successRate ?? 0) / 100;
            const midAngle = (d.startAngle + d.endAngle) / 2;
            const solvedEnd = d.startAngle + (d.endAngle - d.startAngle) * rate;
            return midAngle <= solvedEnd ? inkOn(niveauFill(d)) : themeColors.chrome.text;
        })
        .text((d) => d.data.niveau);
}

/**
 * Render the outer ring (success rate arc).
 * @param {any} g - Center group to render into
 * @param {number} radius - Outer radius
 * @param {object} params - Rendering parameters
 * @param {number} params.successRate - Success rate percentage (0-100)
 * @param {boolean} params.innerRingVisible - Whether inner ring is shown (affects radii)
 * @param {object} params.chartInstance - Chart instance for tooltip wiring
 * @param {Function} params.tooltipContentFn - () => tooltip HTML string
 * @returns {{outerArcInnerRadius: number}} The annulus inner edge, which the ticks start from.
 */
function renderOuterRing(g, radius, params) {
    const { successRate, innerRingVisible, chartInstance, tooltipContentFn } = params;
    const themeColors = getThemeColors();

    const { outerArcInnerRadius, outerArcOuterRadius } = getOuterRingRadii(
        radius,
        innerRingVisible,
    );

    const outerArc = d3.arc().innerRadius(outerArcInnerRadius).outerRadius(outerArcOuterRadius);

    const successAngle = (successRate / 100) * 2 * Math.PI;

    // Background arc
    g.append('path')
        .attr(
            'class',
            'task-ring-outer-arc task-ring-outer-arc-background task-ring-opacity-transition',
        )
        .datum({ startAngle: 0, endAngle: 2 * Math.PI })
        .attr('d', outerArc)
        .attr('fill', themeColors.chart.gridColor)
        .attr('stroke', themeColors.chrome.chartStroke)
        .attr('stroke-width', RING_FIGURE_CONFIG.RINGS.ARC_STROKE_WIDTH);

    // Success rate arc
    const successArcPath = g
        .append('path')
        .attr(
            'class',
            'task-ring-outer-arc task-ring-outer-arc-success task-ring-opacity-transition',
        )
        .datum({ startAngle: 0, endAngle: successAngle })
        .attr('d', outerArc)
        // The share solved is a result, so it takes the result colour the tables use
        // for richtig — not the class-mark ink.
        .attr('fill', themeColors.result.correct)
        .attr('stroke', themeColors.chrome.chartStroke)
        .attr('stroke-width', RING_FIGURE_CONFIG.RINGS.ARC_STROKE_WIDTH);

    chartInstance.wireTooltipEvents(successArcPath, {
        getTooltipContent: tooltipContentFn,
        tooltipId: 'task-ring',
        hoverEffect: createOpacityHoverEffect(),
    });

    return { outerArcInnerRadius };
}

/**
 * Render center text (task count + label). Fill color is owned by the
 * `.task-ring-center-text` / `.task-ring-center-label` CSS classes.
 * @param {any} g - Center group to render into
 * @param {number} totalTasks - Number to display
 * @param {number} radius - Chart radius (used for positioning)
 */
function renderCenterText(g, totalTasks, radius) {
    const C = RING_FIGURE_CONFIG.CENTER;

    g.append('text')
        .attr('class', 'task-ring-center-text')
        .attr('y', -(radius * C.TEXT_Y_RATIO))
        .text(totalTasks);

    g.append('text')
        .attr('class', 'task-ring-center-label')
        .attr('y', radius * C.LABEL_Y_RATIO)
        .text(TERM_CONSTANTS.ITEMS);
}

/**
 * Returns true when normalizedStudents is a strict non-empty subset of studentArray.
 * @param {Array<string>|null} normalizedStudents - From normalizeSelectedStudents
 * @param {Array} studentArray - Full student array
 * @returns {boolean} True only for a proper, non-empty subset — a selection of everyone reads as no selection.
 */
export function isSubsetSelected(normalizedStudents, studentArray) {
    if (!normalizedStudents?.length) return false;
    const idSet = new Set(normalizedStudents);
    const matchCount = studentArray.filter((s) => idSet.has(s.studentId)).length;
    return matchCount > 0 && matchCount < studentArray.length;
}

/**
 * One of the ring's tooltip strings. The grid and the focus chart draw the same figure,
 * so both read the grid's fragment.
 * @param {string} key - Key below `ma.items.item-donuts.tooltips`.
 * @returns {string} The glossary text.
 */
function tooltipText(key) {
    return glossaryAnnotator.getRequiredEntryText(`ma.items.item-donuts.tooltips.${key}`);
}

/**
 * Builds the display name for the selected-student tick tooltip.
 * @param {Array<string>|null} normalizedStudents - From normalizeSelectedStudents
 * @param {Array} studentArray - Full student array
 * @returns {string} The student's name for a single selection, otherwise a label for the group.
 */
export function getTickTooltipTitle(normalizedStudents, studentArray) {
    if (normalizedStudents?.length === 1) {
        const studentId = normalizedStudents[0];
        const student = studentArray.find((s) => s.studentId === studentId);
        if (student?.firstName && student?.lastName) {
            return `${student.firstName} ${student.lastName}`;
        }
    }
    return tooltipText('selected-students');
}

/**
 * Renders the selected-student tick mark with mannequin icon.
 *
 * Exported for `TaskRingChart`'s tick rotation animation, which re-renders the tick at its
 * *previous* angle (`initialAngleDeg`) and then transitions it into place.
 * @param {any} g - The ring center group
 * @param {number} radius - Chart radius
 * @param {number} tickInnerRadius - Inner tick radius
 * @param {number} tickOuterRadius - Outer tick radius
 * @param {object} opts - The values the tick stands for plus the renderer that owns its tooltip.
 * @param {number} opts.successRate - Student success rate (0-100), used for tooltip and default angle
 * @param {number} opts.totalCorrect - Solved count for tooltip
 * @param {number} opts.totalOpportunities - Total count for tooltip
 * @param {string} opts.tooltipTitle - Tooltip header text
 * @param {object} opts.chartInstance - Chart instance for tooltip methods
 * @param {number} [opts.initialAngleDeg] - Override starting angle (for animation)
 * @returns {{ tickGroup: any, iconPath: any, iconCenterRadius: number, iconScale: number }} The tick group and its icon, plus the geometry the caller needs to animate them.
 */
export function renderStudentTick(g, radius, tickInnerRadius, tickOuterRadius, opts) {
    const {
        successRate,
        totalCorrect,
        totalOpportunities,
        tooltipTitle,
        chartInstance,
        initialAngleDeg,
    } = opts;
    const angleDeg = initialAngleDeg ?? (successRate / 100) * 360;
    const strokeWidth = RING_FIGURE_CONFIG.TICKS.STROKE_WIDTH;
    const themeColors = getThemeColors();
    const buildTooltipContent = () =>
        chartInstance.buildTooltipHTML({
            title: tooltipTitle,
            rows: [
                { label: tooltipText('success-rate'), value: `${successRate.toFixed(1)}%` },
                {
                    label: tooltipText('solved'),
                    value: applyTemplateTokens(tooltipText('solved-of'), {
                        correct: totalCorrect,
                        total: totalOpportunities,
                    }),
                },
            ],
        });

    const tickGroup = g
        .append('g')
        .attr('class', 'selected-student-tick')
        .attr('transform', `rotate(${angleDeg})`);

    const tickLine = tickGroup
        .append('line')
        .attr('class', 'task-ring-student-tick-line')
        .attr('x1', 0)
        .attr('y1', -tickInnerRadius)
        .attr('x2', 0)
        .attr('y2', -tickOuterRadius)
        .attr('stroke', themeColors.chrome.text)
        .attr('stroke-width', strokeWidth);

    wireStaticTooltip(tickLine, chartInstance, 'task-ring-student-tick', buildTooltipContent);

    // Mannequin icon positioned with sin/cos — always screen-upright
    const iconScale =
        (radius * RING_FIGURE_CONFIG.TICKS.ICON_SCALE) / RING_FIGURE_CONFIG.TICKS.ICON_COORD_SIZE;
    const iconCenterRadius = tickOuterRadius + radius * RING_FIGURE_CONFIG.TICKS.ICON_OFFSET;
    const iconStrokeWidth = RING_FIGURE_CONFIG.TICKS.ICON_STROKE_WIDTH / iconScale;
    const angleRad = (angleDeg * Math.PI) / 180;
    const iconX = Math.sin(angleRad) * iconCenterRadius;
    const iconY = -Math.cos(angleRad) * iconCenterRadius;

    const iconPath = g
        .append('path')
        .attr('class', 'selected-student-icon task-ring-student-icon')
        .attr('d', MANNEQUIN_PATH)
        .attr('transform', `translate(${iconX}, ${iconY}) scale(${iconScale})`)
        .attr('fill', 'none')
        .attr('stroke', themeColors.chrome.text)
        .attr('stroke-width', iconStrokeWidth);

    wireStaticTooltip(iconPath, chartInstance, 'task-ring-student-tick', buildTooltipContent);

    return { tickGroup, iconPath, iconCenterRadius, iconScale };
}

/**
 * Renders the expected solution rate tick mark with the Ø averages symbol.
 * @param {any} g - The ring center group
 * @param {number} radius - Chart radius
 * @param {number} tickInnerRadius - Inner tick radius
 * @param {number} tickOuterRadius - Outer tick radius
 * @param {object} opts - The rate the tick points at plus the renderer that owns the tooltip.
 * @param {number} opts.rate - Expected solution rate in percent, from {@link expectedSolutionRate}.
 * @param {object} opts.chartInstance - Chart instance for tooltip methods
 * @param {number|null} [opts.avoidAngleDeg] - Angle of the student tick, when one is drawn; a Ø symbol within {@link TICK_CLASH_DEG} of it steps outward so the two never overlap.
 */
function renderExpectedSolutionTick(g, radius, tickInnerRadius, tickOuterRadius, opts) {
    const { rate, chartInstance, avoidAngleDeg = null } = opts;
    const angleDeg = (rate / 100) * 360;
    const clashes =
        avoidAngleDeg !== null &&
        Math.abs(((angleDeg - avoidAngleDeg + 540) % 360) - 180) < TICK_CLASH_DEG;
    const strokeWidth = RING_FIGURE_CONFIG.TICKS.STROKE_WIDTH;
    const themeColors = getThemeColors();
    const buildTooltipContent = () =>
        chartInstance.buildTooltipHTML({
            title: tooltipText('expected-title'),
            rows: [
                { label: tooltipText('expected-value'), value: `${rate.toFixed(1)}%` },
                {
                    label: tooltipText('expected-basis'),
                    value: tooltipText('expected-basis-value'),
                },
            ],
        });

    const tickGroup = g.append('g').attr('transform', `rotate(${angleDeg})`);

    const tickLine = tickGroup
        .append('line')
        .attr('class', 'task-ring-expected-tick-line')
        .attr('x1', 0)
        .attr('y1', -tickInnerRadius)
        .attr('x2', 0)
        .attr('y2', -tickOuterRadius)
        .attr('stroke', themeColors.chrome.ringInactive)
        .attr('stroke-width', strokeWidth);

    wireStaticTooltip(tickLine, chartInstance, 'task-ring-expected-tick', buildTooltipContent);

    // Ø symbol positioned with sin/cos — always upright; one icon step further out
    // when the student icon sits at the same angle.
    const iconCenterRadius =
        tickOuterRadius +
        radius *
            (RING_FIGURE_CONFIG.TICKS.ICON_OFFSET +
                (clashes ? RING_FIGURE_CONFIG.TICKS.ICON_SCALE * 1.3 : 0));
    const angleRad = (angleDeg * Math.PI) / 180;
    const avgX = Math.sin(angleRad) * iconCenterRadius;
    const avgY = -Math.cos(angleRad) * iconCenterRadius;

    const avgSymbol = g
        .append('text')
        .attr('class', 'task-ring-expected-tick-symbol')
        .attr('x', avgX)
        .attr('y', avgY)
        .attr('dy', '0.35em')
        .attr('fill', themeColors.chrome.ringInactive)
        .text('Ø');

    wireStaticTooltip(avgSymbol, chartInstance, 'task-ring-expected-tick', buildTooltipContent);
}

// =============================================================================
// THE FIGURE
// =============================================================================

/**
 * Draw one task ring.
 *
 * Marks go down in the order they overlap in: the niveau ring first, then the outer
 * annulus around it, then the two ticks that cross the annulus, then the centre text.
 * Both callers drew them in exactly this order before the figure existed; the order is
 * the figure's now, not theirs.
 * @param {any} g - The centred group the ring is drawn into. The caller sizes and places it.
 * @param {number} radius - The ring's outer radius in px.
 * @param {TaskRingSpec} spec - What to draw and whose tooltips to wire.
 * @returns {{outerArcInnerRadius: number, tickInnerRadius: number, tickOuterRadius: number}} The radii the figure resolved, for callers that update marks in place afterwards.
 */
export function drawTaskRing(g, radius, spec) {
    const {
        ringStats,
        classStats,
        items,
        students,
        normalizedSelected,
        innerRingVisible,
        chartInstance,
        tooltips,
    } = spec;

    if (innerRingVisible) {
        renderInnerRing(g, radius, {
            niveauData: ringStats.niveauDistribution,
            chartInstance,
            tooltipContentFn: tooltips.niveau,
        });
    }

    const { outerArcInnerRadius } = renderOuterRing(g, radius, {
        successRate: classStats.successRate,
        innerRingVisible,
        chartInstance,
        tooltipContentFn: tooltips.classAverage,
    });

    const { tickInnerRadius, tickOuterRadius } = computeTickRadii(
        radius,
        innerRingVisible,
        outerArcInnerRadius,
    );

    const studentDrawn = isSubsetSelected(normalizedSelected, students);
    if (studentDrawn) {
        renderStudentTick(g, radius, tickInnerRadius, tickOuterRadius, {
            successRate: ringStats.successRate,
            totalCorrect: ringStats.totalCorrect,
            totalOpportunities: ringStats.totalOpportunities,
            tooltipTitle: getTickTooltipTitle(normalizedSelected, students),
            chartInstance,
        });
    }

    // Without a piloted item there is no benchmark to point at, so no Ø tick either.
    const expectedRate = expectedSolutionRate(items);
    if (expectedRate !== null) {
        renderExpectedSolutionTick(g, radius, tickInnerRadius, tickOuterRadius, {
            rate: expectedRate,
            chartInstance,
            avoidAngleDeg: studentDrawn ? (ringStats.successRate / 100) * 360 : null,
        });
    }

    renderCenterText(g, ringStats.totalTasks, radius);

    return { outerArcInnerRadius, tickInnerRadius, tickOuterRadius };
}

/**
 * Draw the placeholder ring for a Leitidee the booklet declares but carries no tasks for:
 * grey outer ring, no inner ring, no tick marks, "0 Items" in the center. A ring is drawn
 * (instead of a "no data" message) so the grid stays complete — a Leitidee without tasks is
 * information, not an omission.
 * @param {any} g - The centred group the ring is drawn into.
 * @param {number} radius - The ring's outer radius in px.
 * @param {object} opts - The annulus geometry the empty ring still has to match.
 * @param {boolean} opts.innerRingVisible - Whether the inner ring *would* be drawn, so the annulus lands where a populated ring's does.
 * @param {number} opts.totalTasks - The count in the centre; zero for a genuinely empty ring.
 * @returns {{outerArcInnerRadius: number}} The annulus inner edge, for callers that cache it.
 */
export function drawEmptyTaskRing(g, radius, opts) {
    const { innerRingVisible, totalTasks } = opts;
    const themeColors = getThemeColors();
    const { outerArcInnerRadius, outerArcOuterRadius } = getOuterRingRadii(
        radius,
        innerRingVisible,
    );

    g.append('path')
        .attr('class', 'task-ring-outer-arc task-ring-empty-arc')
        .datum({ startAngle: 0, endAngle: 2 * Math.PI })
        .attr('d', d3.arc().innerRadius(outerArcInnerRadius).outerRadius(outerArcOuterRadius))
        .attr('fill', themeColors.chart.gridColor)
        .attr('stroke', themeColors.chrome.chartStroke)
        .attr('stroke-width', RING_FIGURE_CONFIG.RINGS.ARC_STROKE_WIDTH);

    renderCenterText(g, totalTasks, radius);

    return { outerArcInnerRadius };
}
