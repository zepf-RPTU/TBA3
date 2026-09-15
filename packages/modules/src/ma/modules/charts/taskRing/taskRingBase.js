/**
 * Task Ring module for Mathematics Task Analysis
 *
 * Owns the grid cell: the `TaskRingChart` class plus the title layout the grid needs
 * before any ring exists (it must reserve the same band height in every cell, or the
 * rings stop aligning). The ring itself — radii, arcs, ticks, centre text — belongs to
 * `taskRingFigure.js`, which this chart and `taskRingFocus.js` both draw through.
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { motionDuration } from '../../../../common/charts/motionPreference.js';
import { chartLayoutPreset } from '../../../../common/charts/chartAxisUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import {
    RING_CHART_CONFIG,
    TASK_RING_TITLE_LAYOUT,
    getTaskRingFontSize,
    getTaskRingRenderedTitleLines,
    getTaskRingTitleSpace,
    getTaskRingTitleWrapWidth,
} from './taskRingTitleMetrics.js';
import { classStats, selectionStats } from './ringStatistics.js';
import {
    computeTickRadii,
    drawEmptyTaskRing,
    drawTaskRing,
    getTickTooltipTitle,
    isSubsetSelected,
    renderInnerRing,
    renderStudentTick,
} from './taskRingFigure.js';
import * as d3 from 'd3';
import './taskRingBase.css';

// =============================================================================
// SHARED TICK RENDERING & HELPERS
// =============================================================================

/**
 * Normalize selectedStudents to an Array of string IDs. Returns null if no filter.
 * @param {Array|null} selectedStudents - Array of student IDs or student objects
 * @returns {Array<string>|null} The ids, or `null` when nothing is selected — callers treat that as "the whole class".
 */
export function normalizeSelectedStudents(selectedStudents) {
    if (!selectedStudents || !Array.isArray(selectedStudents) || selectedStudents.length === 0)
        return null;
    return selectedStudents.map((s) => s?.studentId ?? s);
}

// =============================================================================
// TASK RING CHART CLASS
// =============================================================================

/**
 * Single task ring chart displaying niveau distribution and success rate
 * @augments ChartRenderer
 */
export class TaskRingChart extends ChartRenderer {
    constructor(containerId, itemArray, studentArray, options = {}) {
        super(containerId, {
            defaultWidth: 200,
            defaultHeight: 200,
            autoResize: false, // Resize handled at grid level
            layout: chartLayoutPreset('compactNoAxis'),
            ...options,
        });

        this.itemArray = itemArray;
        this.studentArray = studentArray;
        this.domainFilter = options.domainFilter || null;
        this.chartTitle = options.title;
        this.titleLayoutMode = options.titleLayoutMode || TASK_RING_TITLE_LAYOUT.SINGLE_LINE;
        this.titleWrapWidth =
            options.titleWrapWidth ?? getTaskRingTitleWrapWidth(this.options.defaultWidth);
        this.titleLines =
            Array.isArray(options.titleLines) && options.titleLines.length > 0
                ? options.titleLines
                : null;

        // Store cached data in chartState for automatic cleanup
        this.chartState.cache = {
            visibilityTransitionInProgress: false,
        };
        // Seeded with the zeroed shape the builders return for no items, so the figures
        // are readable before the first render instead of null — the same seed
        // `#renderEmptyRing` writes.
        this.classTaskData = classStats([]);
        this.taskData = this.classTaskData;
        this.normalizedSelectedStudents = null;

        // Ring geometry the optimised update paths redraw against. Written by the render
        // pass that also creates `mainGroup`, and every read sits behind a `mainGroup`
        // guard — so they are numbers from the first render on, never unset.
        this._cachedRadius = 0;
        this._cachedOuterArcInnerRadius = 0;

        // Seed reactive state from options — getInitialState() runs inside super()
        // before options are readable here, so _state holds bare defaults. Patch
        // directly (not via setState, which would trigger _onStateChanged).
        // _state is the single source of truth for these two values.
        this._state.selectedStudents = options.selectedStudents || null;
        this._state.innerRingVisible = options.innerRingVisible !== false;
    }

    // ============================================================================
    // REACTIVE STATE
    // ============================================================================

    getInitialState() {
        // Bare defaults — real values are seeded from options in the constructor
        // after super() returns (see the _state patch there).
        return {
            selectedStudents: null,
            innerRingVisible: true,
        };
    }

    _onStateChanged(changedKeys, _prevState) {
        if (!this.mainGroup || !this.svg) {
            this.refresh();
            return;
        }

        if (changedKeys.includes('selectedStudents') && !changedKeys.includes('innerRingVisible')) {
            const handled = this.#updateSelectedStudentOptimized(this._state.selectedStudents);
            if (!handled) this.refresh();
            return;
        }

        if (changedKeys.includes('innerRingVisible') && !changedKeys.includes('selectedStudents')) {
            const handled = this.#updateInnerRingVisibilityOptimized(
                this._state.innerRingVisible,
                _prevState.innerRingVisible,
            );
            if (!handled) this.refresh();
            return;
        }

        this.refresh();
    }

    // ============================================================================
    // LIFECYCLE METHODS
    // ============================================================================

    validateData() {
        if (this.destroyed) return false;
        return !!this.itemArray?.length;
    }

    // ============================================================================
    // TOOLTIP CONTENT
    // ============================================================================

    /**
     * Format tooltip content based on context type
     * @override
     * @param {object} segment - The data segment
     * @param {object} context - Context with type and additional data
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, context = {}) {
        const { type } = context;

        switch (type) {
            case 'niveau':
                return this.buildTooltipHTML({
                    title: `${TERM_CONSTANTS.ITEM_LEVEL} ${segment.niveau}`,
                    rows: [
                        { label: 'Anzahl Aufgaben', value: segment.count },
                        {
                            label: 'Anteil',
                            value: `${((segment.count / context.totalTasks) * 100).toFixed(1)}%`,
                        },
                        { label: 'Lösungsrate', value: `${segment.successRate.toFixed(1)}%` },
                    ],
                });

            case 'classAverage':
                return this.buildTooltipHTML({
                    title: 'Klassen-Durchschnitt',
                    rows: [
                        {
                            label: 'Lösungsrate',
                            value: `${this.classTaskData.successRate.toFixed(1)}%`,
                        },
                        {
                            label: 'Gelöst',
                            value: `${this.classTaskData.totalCorrect} von ${this.classTaskData.totalOpportunities}`,
                        },
                    ],
                });
        }

        return '';
    }

    async renderChart() {
        // Get filtered items
        const filteredItems = this.#getFilteredItems();

        if (filteredItems.length === 0) {
            this.#renderEmptyRing();
            return;
        }

        // Calculate class task data
        this.classTaskData = classStats(filteredItems);

        // Normalize selected students — read from state so deselection (null) is reflected correctly
        this.normalizedSelectedStudents = normalizeSelectedStudents(this._state.selectedStudents);

        // Calculate task data for chart — without a selection the ring draws the class figures
        this.taskData = this.normalizedSelectedStudents
            ? selectionStats(filteredItems, this.normalizedSelectedStudents)
            : this.classTaskData;

        const { svg, g, radius, chartArea } = this.#createRingCanvas();

        const { outerArcInnerRadius } = drawTaskRing(g, radius, this.#ringSpec());
        // The optimised update paths redraw marks against the annulus without re-running
        // the figure, so the edge it resolved has to outlive this call.
        this._cachedOuterArcInnerRadius = outerArcInnerRadius;

        this.renderTitle(svg, chartArea);
    }

    /**
     * The figure's inputs for the ring as it currently stands.
     * @returns {object} The spec `drawTaskRing` consumes.
     */
    #ringSpec() {
        return {
            ringStats: this.taskData,
            classStats: this.classTaskData,
            items: this.#getFilteredItems(),
            students: this.studentArray,
            normalizedSelected: this.normalizedSelectedStudents,
            innerRingVisible: this._state.innerRingVisible,
            chartInstance: this,
            tooltips: {
                niveau: (d) =>
                    this.formatTooltipContent(d.data, {
                        type: 'niveau',
                        totalTasks: this.taskData.totalTasks,
                    }),
                classAverage: () => this.formatTooltipContent(null, { type: 'classAverage' }),
            },
        };
    }

    /**
     * Create the SVG, compute the radius, and place the centered ring group.
     * Shared by the populated and the empty render path so both rings sit identically
     * in their grid cell.
     * @returns {{svg: d3.Selection, g: d3.Selection, radius: number, chartArea: object}} The chart root, the centred ring group, the ring radius, and the measured chart area.
     */
    #createRingCanvas() {
        const { svg, dimensions, layout } = this.initializeSVG({
            axisOverrides: {},
            legendConfigs: [],
        });

        // createSVGElement pins the SVG root to an inline `font-size: var(--fs-base)`, which the
        // ring text would then inherit — leaving it at the token size while the ring shrinks
        // underneath it. Re-point it at the cell's own size, which the grid scaled with the ring.
        // Overriding the inline declaration is the only way to win against it.
        this.svg = svg
            .classed('task-ring-chart-svg', true)
            .attr('overflow', 'visible')
            .style('font-size', `${getTaskRingFontSize(this)}px`);

        // Use layout chart area for centering and radius
        const chartArea = layout
            ? layout.chart
            : {
                  x: 0,
                  y: 0,
                  width: dimensions.containerWidth,
                  height: dimensions.containerHeight,
              };

        // Calculate radius based on available space
        const radius = this.calculateRadius(chartArea);
        this._cachedRadius = radius;

        // Create chart group centered in the ring area (below the title)
        const titleSpace = getTaskRingTitleSpace(this);
        const bottomBuffer = RING_CHART_CONFIG.POSITIONING.BOTTOM_BUFFER;
        const centerX = chartArea.x + chartArea.width / 2;
        const centerY =
            chartArea.y + titleSpace + (chartArea.height - titleSpace - bottomBuffer) / 2;
        const g = svg.append('g').attr('transform', `translate(${centerX}, ${centerY})`);

        // Store main group reference
        this.mainGroup = g;

        return { svg, g, radius, chartArea };
    }

    /**
     * Placeholder ring for a Leitidee the booklet declares but carries no tasks for:
     * grey outer ring, no inner ring, no tick marks, "0 Items" in the center. The ring
     * is drawn (instead of a "no data" message) so the grid stays complete — a Leitidee
     * without tasks is information, not an omission.
     */
    #renderEmptyRing() {
        // Zeroed shape, so the state-update paths and renderCenterText have data to read.
        this.classTaskData = classStats([]);
        this.taskData = this.classTaskData;
        this.normalizedSelectedStudents = null;

        const { svg, g, radius, chartArea } = this.#createRingCanvas();
        const { outerArcInnerRadius } = drawEmptyTaskRing(g, radius, {
            innerRingVisible: this._state.innerRingVisible,
            totalTasks: this.taskData.totalTasks,
        });
        this._cachedOuterArcInnerRadius = outerArcInnerRadius;

        this.renderTitle(svg, chartArea);
    }

    calculateRadius(chartArea) {
        const titleSpace = getTaskRingTitleSpace(this);
        const availableHeight =
            chartArea.height - titleSpace - RING_CHART_CONFIG.POSITIONING.BOTTOM_BUFFER;
        const maxRadiusFromWidth = chartArea.width * 0.5;
        const maxRadiusFromHeight = availableHeight * 0.5;
        return Math.min(maxRadiusFromWidth, maxRadiusFromHeight);
    }

    /**
     * Render title text above the ring chart as an SVG text element.
     * @param {d3.Selection} svg - The root SVG selection
     * @param {object} chartArea - { x, y, width, height }
     */
    renderTitle(svg, chartArea) {
        const titleLines = getTaskRingRenderedTitleLines(this);
        if (titleLines.length === 0) return;

        const title = svg
            .append('text')
            .attr('class', 'task-ring-svg-title')
            .attr('x', chartArea.x + chartArea.width / 2)
            .attr(
                'y',
                chartArea.y +
                    getTaskRingFontSize(this) +
                    RING_CHART_CONFIG.POSITIONING.TITLE_PADDING,
            );

        title
            .selectAll('tspan')
            .data(titleLines)
            .enter()
            .append('tspan')
            .attr('x', chartArea.x + chartArea.width / 2)
            .attr('dy', (_line, index) =>
                index === 0 ? 0 : `${RING_CHART_CONFIG.POSITIONING.TITLE_LINE_HEIGHT_EM}em`,
            )
            .text((line) => line);
    }

    /**
     * Items for the active domain filter, or the full array when unfiltered.
     * @returns {Array} The items this ring currently draws.
     */
    #getFilteredItems() {
        return this.domainFilter
            ? this.itemArray.filter((item) => item.domain === this.domainFilter)
            : this.itemArray;
    }

    /**
     * Optimized update for selected student change
     * @param {Array} selectedStudents - New selected students
     * @returns {boolean} True if handled optimally
     */
    #updateSelectedStudentOptimized(selectedStudents) {
        if (!selectedStudents || !Array.isArray(selectedStudents)) {
            return false;
        }

        // Get filtered items (same as in renderChart)
        const filteredItems = this.#getFilteredItems();

        // An empty ring draws nothing that depends on the selection (no arcs, no ticks),
        // so there is nothing to update — a full re-render would redraw the same picture.
        if (filteredItems.length === 0) {
            return true;
        }

        // Update internal state
        this.normalizedSelectedStudents = normalizeSelectedStudents(selectedStudents);

        // Recalculate task data with new student
        const oldSuccessRate = this.taskData.successRate;
        // Without a selection the ring draws the class figures, and this path is only
        // reached when the item and student arrays are unchanged — so classTaskData
        // still holds exactly what recomputing them would produce.
        this.taskData = this.normalizedSelectedStudents
            ? selectionStats(filteredItems, this.normalizedSelectedStudents)
            : this.classTaskData;
        const newSuccessRate = this.taskData.successRate;

        // Re-render inner ring arcs with updated per-student success rates
        this.#updateInnerRingArcs();

        // Animate the selected student tick mark
        this.#animateTickRotation(oldSuccessRate, newSuccessRate);

        return true;
    }

    /**
     * Replace inner ring arcs with current taskData niveauDistribution.
     * Called from the optimized student-switch path so the solved/unsolved
     * sub-arcs reflect the newly selected student(s).
     */
    #updateInnerRingArcs() {
        if (!this._state.innerRingVisible || !this.mainGroup) return;

        // Remove old inner ring elements
        this.mainGroup.selectAll('.niveau-arc').remove();

        // Re-render with updated data.
        renderInnerRing(this.mainGroup, this._cachedRadius, {
            niveauData: this.taskData.niveauDistribution,
            chartInstance: this,
            tooltipContentFn: (d) =>
                this.formatTooltipContent(d.data, {
                    type: 'niveau',
                    totalTasks: this.taskData.totalTasks,
                }),
        });
    }

    /**
     * Optimized update for inner ring visibility change
     * @param {boolean} visible - New visibility state (already committed to _state)
     * @param {boolean} prevVisible - Visibility before this change (from _prevState)
     * @returns {boolean} True if handled optimally
     */
    #updateInnerRingVisibilityOptimized(visible, prevVisible) {
        const newVisibility = Boolean(visible);

        // No change needed
        if (Boolean(prevVisible) === newVisibility) {
            return true;
        }

        // Defensive guard: destroy() may have been called
        if (this.destroyed) return false;

        // Guard against rapid toggles causing race conditions
        if (this.chartState.cache.visibilityTransitionInProgress) {
            return false; // Fall back to full re-render
        }

        // For visibility changes, animate opacity then re-render
        // This is complex enough that a full refresh is more reliable
        // But we can at least animate the transition
        const g = this.mainGroup;
        const innerElements = g.selectAll(
            '.niveau-arc, .task-ring-niveau-arc, .task-ring-niveau-label',
        );

        // Nothing to fade (an empty ring draws no niveau arcs): the hide transition below
        // would run on an empty selection, so its 'end' callback never fires and the
        // in-progress flag would stay stuck. Re-render instead — it restructures the
        // annulus anyway.
        if (innerElements.empty()) return false;

        if (newVisibility) {
            // Show inner ring - need full re-render to create elements
            return false;
        } else {
            // Hide inner ring with animation
            this.chartState.cache.visibilityTransitionInProgress = true;
            innerElements
                .transition('innerRingFade')
                .duration(motionDuration(ChartRenderer.TRANSITION_DURATION))
                .attr('opacity', 0)
                .on('end', () => {
                    // Defensive guard: chartState may be null if destroy() was called during transition
                    if (this.chartState) {
                        this.chartState.cache.visibilityTransitionInProgress = false;
                        // After fade out, do full refresh to restructure outer ring
                        this.refresh();
                    }
                });

            return true;
        }
    }

    /**
     * Interrupt running D3 transitions before destruction.
     * @override
     */
    destroy() {
        // Interrupt any running D3 transitions to prevent stale callbacks
        if (this.mainGroup) {
            this.mainGroup.selectAll('*').interrupt();
        }

        super.destroy();
    }

    /**
     * Animate the selected student tick mark rotation
     * @param {number} oldRate - Previous success rate (0-100)
     * @param {number} newRate - New success rate (0-100)
     */
    #animateTickRotation(oldRate, newRate) {
        const g = this.mainGroup;
        if (!g) return;

        const { tickInnerRadius, tickOuterRadius } = computeTickRadii(
            this._cachedRadius,
            this._state.innerRingVisible,
            this._cachedOuterArcInnerRadius,
        );

        g.selectAll('.selected-student-tick').remove();
        g.selectAll('.selected-student-icon').remove();
        if (!isSubsetSelected(this.normalizedSelectedStudents, this.studentArray)) return;

        // Pick shortest rotation path
        const oldDeg = (oldRate / 100) * 360;
        const newDeg = (newRate / 100) * 360;
        let delta = newDeg - oldDeg;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const targetDeg = oldDeg + delta;

        // Render tick + icon at old position using shared function (tooltip shows new data)
        const { tickGroup, iconPath, iconCenterRadius, iconScale } = renderStudentTick(
            g,
            this._cachedRadius,
            tickInnerRadius,
            tickOuterRadius,
            {
                successRate: newRate,
                totalCorrect: this.taskData.totalCorrect,
                totalOpportunities: this.taskData.totalOpportunities,
                tooltipTitle: getTickTooltipTitle(
                    this.normalizedSelectedStudents,
                    this.studentArray,
                ),
                chartInstance: this,
                initialAngleDeg: oldDeg,
            },
        );

        // Animate tick group rotation along the arc
        tickGroup
            .transition()
            .duration(motionDuration(ChartRenderer.TRANSITION_DURATION))
            .attrTween('transform', () => {
                const interp = d3.interpolateNumber(oldDeg, targetDeg);
                return (t) => `rotate(${interp(t)})`;
            });

        // Animate icon position along the arc — translate only, no rotation needed
        iconPath
            .transition()
            .duration(motionDuration(ChartRenderer.TRANSITION_DURATION))
            .attrTween('transform', () => {
                const interp = d3.interpolateNumber(oldDeg, targetDeg);
                return (t) => {
                    const rad = (interp(t) * Math.PI) / 180;
                    const x = Math.sin(rad) * iconCenterRadius;
                    const y = -Math.cos(rad) * iconCenterRadius;
                    return `translate(${x}, ${y}) scale(${iconScale})`;
                };
            });
    }
}
