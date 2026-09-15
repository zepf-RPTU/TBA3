/**
 * Item lollipop chart — the share of correct solutions per subtask, with the
 * Aufgabenniveau carried by the lollipop's colour.
 *
 * Position-scale terminology, as the local names use it: `edgePadding` is the space
 * reserved each side, `naturalSpacing` the even spread across the available width,
 * `maxSpacing` the upper bound on inter-lollipop distance, `constrainedWidth` the total
 * after clamping, and `centerOffset` what re-centres the clamped group.
 *
 * The two named D3 transitions ('lollipop', 'avg') exist so a pending exit can be
 * cancelled safely when state changes again mid-flight.
 */

import { LollipopChartRenderer } from '../../../../common/charts/renderers/lollipopChartRenderer.js';
import './itemLollipopChart.css';
import {
    findOwningModuleTitle,
    markScrollRegion,
    unmarkScrollRegion,
} from '../../../../common/utils/scrollRegion.js';
import {
    getNiveauColor,
    resolveLegendPlanForChart,
    updateLegendStack,
} from './itemLollipopLegend.js';
import {
    getAverageMarkerData,
    resolveComparisonAverage,
    resolveComparisonGroups,
} from './itemLollipopComparison.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import { prefersReducedMotion } from '../../../../common/charts/motionPreference.js';
import {
    chartLayoutPreset,
    createPercentAxis,
    measureCategoryAxisSpace,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { LEGEND_GAP, legendLayoutFitsSlot } from './itemLollipopLegendPlanner.js';
import { HIDDEN_LEGEND_OPACITY } from '../../../../common/charts/markerSymbols.js';
import {
    comparisonSeriesPaint,
    comparisonSeriesLabel,
    comparisonSeriesVisual,
} from '../../../../common/charts/comparisonSeries.js';
import * as d3 from 'd3';
import { initialActiveModes } from '../../../../common/charts/comparisonState.js';

/**
 * @typedef {object} ItemData
 * @property {string} iqbId - Unique identifier for the item
 * @property {string} name - Item number for display
 * @property {string} [displayName] - Display label with domain prefix (in 'all' mode)
 * @property {number} meanPercentage - The item's solution rate from items.json (`mean` × 100); the stem's height
 * @property {number|null} percentageCorrect - Share of responses scored correct; `null` without responses
 * @property {number|null} percentageIncorrect - Share of responses scored incorrect
 * @property {number|null} percentageNotAttempted - Share of responses left unattempted
 * @property {string|number} competenceLevel - Difficulty level (1-9)
 * @property {string[]} [style] - Style tags for the item
 * @property {object} [exercise] - Exercise object with name property
 * @property {string} [domainLabel] - Domain name
 * @property {boolean} [isTaskRow] - True for aggregated task-grouping parent rows
 * @property {Array<string|number>} [competenceLevelsRaw] - Raw competence levels for task rows
 */

// =========================================================================
// CONSTANTS
// =========================================================================

/**
 * Visual spacing and sizing constants for chart elements
 */
const CHART_CONSTANTS = {
    MARKER_SIZE: 5,
    /**
     * Narrowest pitch between two Teilaufgaben, px. Below it the rotated tick labels
     * overlap into a hatch, so the chart grows past the card and scrolls instead.
     */
    MIN_ITEM_PITCH: 20,
};
/** Class on the host while the chart is wider than the card and scrolls. */
const SCROLL_CLASS = 'item-lollipop--scroll';
// Legend layout constants (LEGEND_GAP, min chart sizes, bottom-legend gaps) now
// live in itemLollipopLegendPlanner.js alongside the fit-to-slot logic that uses them.

/**
 * Style constants for consistent theming across chart elements
 */
const STYLE_CONSTANTS = {
    get WHITE() {
        return getThemeColors().chrome.chartStroke;
    },
    get TEXT_DARK() {
        return getThemeColors().chrome.text;
    },
    get TEXT_LIGHT() {
        return getThemeColors().chrome.textSecondary;
    },
    MARKER_OPACITY_VISIBLE: 0.8,
};

const X_AXIS_TEXT_SIZE = 'sm';

// =========================================================================
// ITEM LOLLIPOP CHART CLASS
// =========================================================================

/**
 * ItemLollipopChart - Displays task performance as a vertical lollipop chart.
 * Shows all items passed to it - no dropdown or task selection.
 *
 * Supports reactive state updates for optimized re-rendering:
 * - Item data changes trigger D3 enter/update/exit transitions (not full re-render)
 * - Comparison mode toggles smoothly transition marker visibility
 * @augments LollipopChartRenderer
 * Items arrive through the host's `applySync` verb (from the item table);
 * comparison visibility through its `setActiveModes` verb.
 */
export class ItemLollipopChart extends LollipopChartRenderer {
    /**
     * @param {string} containerId - Container element ID (without #)
     * @param {Array} itemData - Item data to render
     * @param {object} options - Additional options (passed to ChartRenderer)
     */
    constructor(containerId, itemData, options = {}) {
        super(containerId, {
            ...options,
            layout: chartLayoutPreset('rightLegend', {
                legends: [{ position: 'right', gap: LEGEND_GAP }],
            }),
            title: 'Lösungsquoten pro Item',
        });

        // Store all cleanable state in chartState for automatic cleanup
        this.chartState.data = itemData;

        // Per-instance EN config (result types for the tooltip and the axis title)
        this.enConfig = options.enConfig;
        // The comparison groups items.json carries, each toggleable via the comparison state
        this.comparisonGroups = resolveComparisonGroups(options);
        this.comparisonModes = this.comparisonGroups.map((group) => group.id);

        // Initialize visibility state using inherited ChartRenderer method
        this.visibilityState = this.initVisibilityState(
            this.comparisonModes,
            initialActiveModes(options),
            { includeStudent: false, includeClass: false },
        );
    }

    // ========================================================================
    // REACTIVE STATE
    // ========================================================================

    /**
     * Return initial reactive state from the host's comparison toggles.
     * @returns {{activeModes: string[]|null, items: ItemData[]|null}} Initial state
     */
    getInitialState() {
        const activeComparisons = initialActiveModes(this.options);
        return {
            activeModes: activeComparisons,
            items: this.chartState?.data || null,
        };
    }

    /**
     * React to state changes. Handles optimized partial updates:
     * - activeModes only → delegated to base class visibility system
     * - items changed → D3 join transitions with sort-only detection
     * - other/combined → full refresh
     * @param {string[]} changedKeys - Keys that changed in state
     * @param {object} _prevState - Previous state (unused)
     */
    _onStateChanged(changedKeys, _prevState) {
        // The renderer draws from chartState.data, so an items change is adopted before
        // any early return below. A sync that lands while the host is between building
        // this renderer and creating it (the layout settle on a KS theme switch) would
        // otherwise be dropped, and the pending create() would plot the ids the table
        // last synced *before* that one.
        if (changedKeys.includes('items')) {
            this.chartState.data = this._state.items;
        }

        if (!this.svg) {
            this.refresh();
            return;
        }

        // activeModes-only → base class handles visibility transitions
        if (changedKeys.includes('activeModes') && !changedKeys.includes('items')) {
            super._onStateChanged(changedKeys, _prevState);
            return;
        }

        if (changedKeys.includes('items')) {
            const items = this._state.items;
            if (!items || items.length === 0) {
                this.#showNoDataState();
                return;
            }
            const handled = this.#handleDataUpdate(items);
            if (!handled) this.refresh();
            return;
        }

        this.refresh();
    }

    // Required abstract methods
    validateData() {
        // Defensive guard: bail out if chart was destroyed during async operations
        if (this.destroyed) {
            return false;
        }
        return (
            this.chartState.data &&
            Array.isArray(this.chartState.data) &&
            this.chartState.data.length > 0
        );
    }

    renderChart() {
        // Use items in the order received (preserves table sort order)
        const items = this.chartState.data;
        if (items.length === 0) return;

        // Pre-compute dimensions for axis measurement and geometry.
        const preCalcDims = this.calculateDimensions();
        const { circleRadius, lineStrokeWidth } = preCalcDims.elements;

        // Measure axis space needed
        const axisLeftSpace = measurePercentAxisSpace(this, 'left', {
            axisTitleText: 'Richtig gelöst (%)',
        });

        const measuredAxisBottomSpace = this.#measureBottomAxis(items);

        // Clamp to the maximum ever measured so the bottom axis space never shrinks
        // when switching from 'all' mode (long prefixed labels like "H-3") to a single
        // domain (shorter labels like "3"). This prevents layout jumps.
        const axisBottomSpace = Math.max(
            this.chartState.stableAxisBottomSpace ?? 0,
            measuredAxisBottomSpace,
        );
        this.chartState.stableAxisBottomSpace = axisBottomSpace;

        // Lock the legend position so domain switches don't move the legend.
        // Re-evaluate only when the container itself is resized (window resize etc.).
        const cachedLegendPos = this.chartState.stableLegendPosition;
        const cachedLegendDims = this.chartState.stableLegendDims;
        const containerDimsChanged =
            !cachedLegendDims ||
            Math.abs(cachedLegendDims.width - preCalcDims.containerWidth) > 1 ||
            Math.abs(cachedLegendDims.height - preCalcDims.containerHeight) > 1;

        // Content-driven width: every Teilaufgabe gets at least MIN_ITEM_PITCH. When
        // the card cannot hold that, the SVG is created wider and the host scrolls
        // horizontally (SCROLL_CLASS); the legend then sits below the plot, at its
        // left edge, so it is in view where the scroll starts. The resize observer
        // watches the host, whose width the overflow does not change.
        const requiredWidth = this.#requiredWidth(items.length, axisLeftSpace, circleRadius);
        const scrolls = requiredWidth > preCalcDims.containerWidth;
        const hostElement = /** @type {HTMLElement|null} */ (
            d3.select(this.containerSelector).classed(SCROLL_CLASS, scrolls).node()
        );
        // A region that scrolls has to be keyboard-reachable.
        if (hostElement) {
            if (scrolls) markScrollRegion(hostElement, findOwningModuleTitle(hostElement));
            else unmarkScrollRegion(hostElement);
        }
        if (scrolls) {
            preCalcDims.containerWidth = requiredWidth;
            preCalcDims.chartWidth = requiredWidth;
        }
        this.dimensions = preCalcDims;

        const forcedLegendPosition = scrolls
            ? 'bottom'
            : cachedLegendPos && !containerDimsChanged
              ? cachedLegendPos
              : null;

        const legendPlan = resolveLegendPlanForChart(
            this,
            items,
            {
                containerWidth: preCalcDims.containerWidth,
                containerHeight: preCalcDims.containerHeight,
                axisLeftSpace,
                axisBottomSpace,
            },
            forcedLegendPosition,
        );

        if (scrolls) legendPlan.stackAlign = 'start';
        if (!cachedLegendPos || containerDimsChanged) {
            this.chartState.stableLegendPosition = legendPlan.position;
            this.chartState.stableLegendDims = {
                width: preCalcDims.containerWidth,
                height: preCalcDims.containerHeight,
            };
        }
        this.options.layout.legends[0].position = legendPlan.position;

        const { svg, g, layout } = this.initializeSVG({
            axisOverrides: {
                left: axisLeftSpace,
                bottom: axisBottomSpace,
            },
            legendConfigs: [legendPlan.legendStackConfig],
        });
        this.svg = svg;
        this.g = g;

        const legendStackLayout =
            layout.legendStackLayouts?.[0] ??
            this.legend.resolveStackedLegendLayout(
                legendPlan.legendStackConfig.stacked,
                legendPlan.legendStackConfig.stackOptions,
            );

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        // One theme snapshot per render, handed to `comparisonSeries` at the point of
        // use — an unmapped role key used to yield an undefined fill: SVG-default
        // black, reading as a Schulschnitt. The snapshot persists in renderState so
        // the incremental update path reads the same palette the full render painted
        // with (theme changes rebuild the renderer, so it can never go stale).
        const theme = getThemeColors(true);

        // Set up scales
        const xScale = d3
            .scaleBand()
            .domain(items.map((item) => item.displayName || item.name))
            .range([0, chartWidth])
            .padding(0.1);

        const yScale = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);

        // Create custom position scale that limits spacing between lollipops
        const xPositionScale = this.#createConstrainedPositionScale(
            items,
            xScale,
            circleRadius,
            chartWidth,
        );

        // Store render state for optimized updates (in chartState for auto-cleanup)
        this.chartState.renderState = {
            yScale,
            chartWidth,
            chartHeight,
            circleRadius,
            lineStrokeWidth,
            theme,
            itemIds: new Set(items.map((item) => item.iqbId)),
            scrolls,
            axisLeftSpace,
        };

        // Render chart elements
        this.#updateLollipops(
            items,
            xPositionScale,
            yScale,
            chartHeight,
            circleRadius,
            lineStrokeWidth,
            0,
        );
        this.legend.createLegendStack({
            svg,
            stackLayout: legendStackLayout,
            slot: this.layout?.legends?.[0],
            align: legendPlan.stackAlign,
        });
        this.#updateAverageMarkers(items, xPositionScale, yScale, theme, 0);
        this.#renderAxes(g, items, xScale, xPositionScale, yScale, chartWidth, chartHeight);
    }

    /**
     * Get visibility config mapping CSS selectors to visibility keys.
     * @override
     * @protected
     * @returns {object} Config for applyVisibilityTransitions()
     */
    _getVisibilityConfig() {
        const elements = {};
        const legends = {};
        for (const group of this.comparisonGroups) {
            elements[group.id] = this.svg.selectAll(
                `.${group.markerClass}, .${group.markerClass}-dot`,
            );
            legends[group.id] = this.svg.select(`.${group.legendClass}`);
        }

        return {
            elements,
            legends,
            visibilityState: this.visibilityState,
            visibleOpacity: STYLE_CONSTANTS.MARKER_OPACITY_VISIBLE,
            hiddenOpacity: HIDDEN_LEGEND_OPACITY,
        };
    }

    /**
     * Handle data update from table sync
     * @param {ItemData[]} items - Updated item data
     * @returns {boolean} True if handled successfully
     */
    #handleDataUpdate(items) {
        // Require SVG and render state to be initialized
        if (!this.svg || !this.g || !this.chartState.renderState) {
            return false;
        }

        this.chartState.data = items;

        // Handle empty state
        if (!items || items.length === 0) {
            this.#showNoDataState();
            return true;
        }

        // The SVG's width is decided at render time: a change of item count that
        // crosses the scroll threshold needs the full render, not a transition.
        const rs = this.chartState.renderState;
        const wouldScroll =
            this.#requiredWidth(items.length, rs.axisLeftSpace, rs.circleRadius) >
            this.calculateDimensions().containerWidth;
        if (wouldScroll !== rs.scrolls) return false;

        const {
            chartWidth,
            chartHeight,
            circleRadius,
            lineStrokeWidth,
            theme,
            itemIds: previousItemIds,
        } = this.chartState.renderState;

        // Detect if this is a sort-only change (same items, different order)
        const newItemIds = new Set(items.map((item) => item.iqbId));
        const isSortOnly =
            previousItemIds.size === newItemIds.size &&
            [...previousItemIds].every((id) => newItemIds.has(id));

        // Always animate — domain switches (all↔domain) enter/exit up to ~79 items
        // which is well within what D3 can transition smoothly. The previous
        // enteringCount > 30 instant threshold and ratio bail-out are both removed
        // so that every domain switch goes through D3 enter/update/exit rather than
        // a full SVG rebuild.
        const duration = LollipopChartRenderer.TRANSITION_DURATION;

        const legendSlot = this.layout?.legends?.[0];
        let nextLegendStackLayout = null;

        if (!isSortOnly) {
            const currentDims = this.calculateDimensions();
            const axisLeftSpace = measurePercentAxisSpace(this, 'left', {
                axisTitleText: 'Richtig gelöst (%)',
            });
            // Use the same stable bottom space as renderChart() so legend-fit checks
            // are consistent with the actual rendered layout.
            const axisBottomSpace = Math.max(
                this.chartState.stableAxisBottomSpace ?? 0,
                this.#measureBottomAxis(items),
            );
            // Use the stable legend position so domain switches never trigger a
            // position change here — they stay in the slot established at first render.
            const legendPlan = resolveLegendPlanForChart(
                this,
                items,
                {
                    containerWidth: currentDims.containerWidth,
                    containerHeight: currentDims.containerHeight,
                    axisLeftSpace,
                    axisBottomSpace,
                },
                this.chartState.stableLegendPosition ?? null,
            );

            nextLegendStackLayout = this.legend.resolveStackedLegendLayout(
                legendPlan.legendStackConfig.stacked,
                legendPlan.legendStackConfig.stackOptions,
            );

            if (
                !legendSlot ||
                legendSlot.position !== legendPlan.position ||
                !legendLayoutFitsSlot(nextLegendStackLayout, legendSlot)
            ) {
                this.options.layout.legends[0].position = legendPlan.position;
                return false;
            }
        }

        // Update xScale and position scale for new item order
        const xScale = d3
            .scaleBand()
            .domain(items.map((item) => item.displayName || item.name))
            .range([0, chartWidth])
            .padding(0.1);

        const xPositionScale = this.#createConstrainedPositionScale(
            items,
            xScale,
            circleRadius,
            chartWidth,
        );

        // Store updated render state
        this.chartState.renderState.itemIds = newItemIds;

        // Update lollipops with transitions
        this.#updateLollipops(
            items,
            xPositionScale,
            this.chartState.renderState.yScale,
            chartHeight,
            circleRadius,
            lineStrokeWidth,
            duration,
        );

        // Update average markers
        // Note: #updateAverageMarkers already applies correct visibility in enter/update handlers,
        // so no separate visibility re-application is needed here.
        this.#updateAverageMarkers(
            items,
            xPositionScale,
            this.chartState.renderState.yScale,
            theme,
            duration,
        );

        // Keep x-axis label updates synchronous when the item set changes.
        // Rapid selection/deselection can fire multiple syncs
        // within one transition window; snapping the axis prevents stale rotated
        // tick labels from overlapping while lollipop elements keep animating.
        const axisDuration = isSortOnly ? duration : 0;
        this.#updateXAxis(items, xScale, xPositionScale, chartHeight, axisDuration);

        // Update niveau legend only if items changed (not sort-only)
        if (!isSortOnly) {
            updateLegendStack(this, items, nextLegendStackLayout);
        }

        return true;
    }

    /**
     * Measure the bottom space the rotated x-axis labels need. Shared by the initial
     * render and the data-update legend-fit check so both measure at the render font size.
     * @param {ItemData[]} items - Items whose names become the tick labels
     * @returns {number} Bottom axis space in pixels
     */
    #measureBottomAxis(items) {
        const xLabels = items.map((item) => item.displayName || item.name);
        return measureCategoryAxisSpace(this, 'bottom', xLabels, {
            tickPadding: 8,
            rotation: -45,
            dx: '-.8em',
            dy: '.15em',
            textSize: X_AXIS_TEXT_SIZE,
        });
    }

    /**
     * Display no-data state when filtering results in zero items
     */
    #showNoDataState() {
        if (!this.g) return;

        // Clear chart elements
        this.g.selectAll('.lollipop-line, .lollipop-circle, .comparison-average-marker').remove();

        // Show no data message if not already present
        if (this.g.select('.no-data-message').empty()) {
            const { chartWidth, chartHeight } = this.chartState.renderState;
            this.renderNoDataOverlay(this.g, {
                className: 'no-data-message',
                width: chartWidth,
                height: chartHeight,
                fill: STYLE_CONSTANTS.TEXT_LIGHT,
            });
        }
    }

    /**
     * Update lollipops with D3 enter/update/exit transitions.
     *
     * Uses consistent named transition ('lollipop') so that when elements transition
     * from exit back to update (e.g., domain switch back to 'all'), the update's
     * interrupt('lollipop') cancels the pending exit .remove(), preventing lollipops
     * from being deleted after re-entry.
     * @param {ItemData[]} items - Items to draw, in table sort order.
     * @param {Function} xPositionScale - Position function that takes an item and returns x position.
     * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale for the stick height.
     * @param {number} chartHeight - Baseline the sticks start from.
     * @param {number} circleRadius - Radius of lollipop circles.
     * @param {number} lineStrokeWidth - Stick width in px.
     * @param {number} duration - Transition length in ms; `0` (or reduced motion) applies the change instantly.
     */
    #updateLollipops(
        items,
        xPositionScale,
        yScale,
        chartHeight,
        circleRadius,
        lineStrokeWidth,
        duration,
    ) {
        // Remove no-data message if present
        this.clearNoDataOverlay(this.g, 'no-data-message');

        // Update lines
        // Named transition 'lollipop' ensures update properly cancels pending exit .remove()
        const instant = duration === 0 || prefersReducedMotion();
        const lines = this.g
            .selectAll('.lollipop-line')
            .data(items, (d) => d.iqbId)
            .join(
                (enter) => {
                    const line = enter
                        .append('line')
                        .attr('class', 'lollipop-line')
                        .attr('x1', (d) => xPositionScale(d))
                        .attr('x2', (d) => xPositionScale(d))
                        .attr('y1', chartHeight)
                        .attr('stroke', (d) => getNiveauColor(this, d.competenceLevel, d))
                        .attr('stroke-width', lineStrokeWidth);

                    if (instant) {
                        return line.attr('y2', (d) => yScale(d.meanPercentage)).attr('opacity', 1);
                    }
                    return line
                        .attr('y2', chartHeight)
                        .attr('opacity', 0)
                        .call((enter) =>
                            enter
                                .transition('lollipop')
                                .duration(duration)
                                .attr('y2', (d) => yScale(d.meanPercentage))
                                .attr('opacity', 1),
                        );
                },
                (update) =>
                    update.call((update) => {
                        update.interrupt('lollipop');
                        return this.maybeTransition(update, 'lollipop', duration)
                            .attr('x1', (d) => xPositionScale(d))
                            .attr('x2', (d) => xPositionScale(d))
                            .attr('y2', (d) => yScale(d.meanPercentage))
                            .attr('stroke', (d) => getNiveauColor(this, d.competenceLevel, d))
                            .attr('opacity', 1);
                    }),
                (exit) =>
                    instant
                        ? exit.remove()
                        : exit.call((exit) =>
                              exit
                                  .transition('lollipop')
                                  .duration(duration)
                                  .attr('opacity', 0)
                                  .attr('y2', chartHeight)
                                  .remove(),
                          ),
            );

        // Update circles
        const circles = this.g
            .selectAll('.lollipop-circle')
            .data(items, (d) => d.iqbId)
            .join(
                (enter) => {
                    const circle = enter
                        .append('circle')
                        .attr('class', 'lollipop-circle')
                        .attr('cx', (d) => xPositionScale(d))
                        .attr('r', circleRadius)
                        .attr('fill', (d) => getNiveauColor(this, d.competenceLevel, d))
                        .attr('stroke', STYLE_CONSTANTS.WHITE)
                        .attr('stroke-width', 2);

                    if (instant) {
                        return circle
                            .attr('cy', (d) => yScale(d.meanPercentage))
                            .attr('opacity', 1);
                    }
                    return circle
                        .attr('cy', chartHeight)
                        .attr('opacity', 0)
                        .call((enter) =>
                            enter
                                .transition('lollipop')
                                .duration(duration)
                                .attr('cy', (d) => yScale(d.meanPercentage))
                                .attr('opacity', 1),
                        );
                },
                (update) =>
                    update.call((update) => {
                        update.interrupt('lollipop');
                        return this.maybeTransition(update, 'lollipop', duration)
                            .attr('cx', (d) => xPositionScale(d))
                            .attr('cy', (d) => yScale(d.meanPercentage))
                            .attr('fill', (d) => getNiveauColor(this, d.competenceLevel, d))
                            .attr('opacity', 1);
                    }),
                (exit) =>
                    instant
                        ? exit.remove()
                        : exit.call((exit) =>
                              exit
                                  .transition('lollipop')
                                  .duration(duration)
                                  .attr('opacity', 0)
                                  .attr('cy', chartHeight)
                                  .remove(),
                          ),
            );

        // Wire coordinated hover for stem+head pairs (re-wires on every data update)
        this.wireLollipopPairEvents(lines, circles, {
            getTooltipContent: (d) => this.formatTooltipContent(d),
            tooltipId: 'en-item-lollipop',
            getKey: 'iqbId',
            darkenHead: 0.3,
        });
    }

    /**
     * Update average markers with D3 enter/update/exit transitions.
     *
     * Uses a consistent named transition ('avg') so that when elements transition
     * from exit back to update (e.g., domain switch back to 'all'), the update's
     * interrupt('avg') cancels the pending exit .remove(), preventing markers from
     * being deleted after re-entry. The update handler also explicitly sets opacity
     * and pointer-events based on current visibility state, ensuring re-entering
     * markers correctly reflect the comparison toggle.
     * @param {ItemData[]} items - Items to display
     * @param {Function} xPositionScale - Position scale for x coordinates
     * @param {Function} yScale - Scale for y coordinates
     * @param {object} theme - Theme snapshot; `comparisonSeriesColor` reads each group's role colour out of it
     * @param {number} duration - Transition duration in ms
     */
    #updateAverageMarkers(items, xPositionScale, yScale, theme, duration) {
        const markerSize = CHART_CONSTANTS.MARKER_SIZE;
        const key = (d) => d.iqbId;
        const tooltip = {
            getTooltipContent: (d) => this.formatTooltipContent(d),
            tooltipId: 'en-item-lollipop',
        };
        const shared = {
            key,
            size: markerSize,
            stroke: STYLE_CONSTANTS.WHITE,
            strokeWidth: 1.5,
            visibleOpacity: STYLE_CONSTANTS.MARKER_OPACITY_VISIBLE,
            duration,
            transitionName: 'avg',
            fade: true,
            tooltip,
        };

        for (const group of this.comparisonGroups) {
            const markerData = getAverageMarkerData(this, items, group);
            const paint = comparisonSeriesPaint(group, theme);
            this.joinAverageMarker(this.g, markerData, {
                ...shared,
                selector: group.markerClass,
                classFn: () => `average-marker comparison-average-marker ${group.markerClass}`,
                shape: comparisonSeriesVisual(group).symbol,
                getX: (d) => xPositionScale(d),
                getY: (d) => yScale(d.comparisonValue),
                fill: paint.fill,
                // A hollow marker (second group of a role) outlines in its own colour.
                stroke: paint.hollow ? paint.stroke : shared.stroke,
                strokeWidth: paint.hollow ? paint.strokeWidth : shared.strokeWidth,
                dotFill: paint.dotFill,
                visible: () => this.visibilityState[group.id],
            });
        }
        // Stacking: comparison markers sit behind the class heads.
        this.g.selectAll('.lollipop-circle').raise();
    }

    /**
     * Update x-axis with transitions for new item positions
     * @param {ItemData[]} items - Items in display order
     * @param {*} xScale - Band scale for x-axis
     * @param {*} xPositionScale - Constrained position scale
     * @param {number} chartHeight - Chart height
     * @param {number} duration - Transition duration in ms
     */
    #updateXAxis(items, xScale, xPositionScale, chartHeight, duration) {
        const getLabel = (d) => d.displayName || d.name;
        const instant = duration === 0 || prefersReducedMotion();

        // Update x-axis scale domain
        xScale.domain(items.map(getLabel));

        // Get x-axis group
        const xAxisGroup = this.g.select('.x-axis');
        if (xAxisGroup.empty()) return;

        // Create new axis
        const xAxis = d3.axisBottom(xScale);

        // Build O(1) lookup map for label → item
        const labelToItem = new Map(items.map((item) => [getLabel(item), item]));

        if (instant) {
            // Update axis and reposition ticks immediately — no transitions needed
            xAxisGroup.call(xAxis);
            xAxisGroup.selectAll('.tick').each(function (d) {
                const item = labelToItem.get(d);
                if (item) {
                    d3.select(this).attr('transform', `translate(${xPositionScale(item)}, 0)`);
                }
            });
        } else {
            // Use a single transition for both the axis update and tick repositioning.
            // Sharing the same `t` is critical: if two separate d3.transition() instances
            // are used, the second (higher-ID) instance preempts the first on each tick
            // element, cancelling the D3 axis opacity animation for entering ticks and
            // leaving newly entered labels permanently invisible (opacity ≈ 0).
            const t = d3.transition().duration(duration);
            xAxisGroup.transition(t).call(xAxis);
            xAxisGroup.selectAll('.tick').each(function (d) {
                const item = labelToItem.get(d);
                if (item) {
                    d3.select(this)
                        .transition(t)
                        .attr('transform', `translate(${xPositionScale(item)}, 0)`);
                }
            });
        }

        this.normalizeSvgTypography(xAxisGroup, { textSize: X_AXIS_TEXT_SIZE });

        // Style tick labels - always rotated for consistency
        xAxisGroup
            .selectAll('text')
            .attr('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)');
    }

    /**
     * The width the plot needs to give every Teilaufgabe its minimum pitch.
     * @param {number} itemCount - Teilaufgaben drawn.
     * @param {number} axisLeftSpace - Measured y-axis reserve, px.
     * @param {number} circleRadius - Head radius, from which the edge reserve follows.
     * @returns {number} Required SVG width in px.
     */
    #requiredWidth(itemCount, axisLeftSpace, circleRadius) {
        const padding = this.options.layout?.padding ?? {};
        return (
            (padding.left ?? 0) +
            (padding.right ?? 0) +
            axisLeftSpace +
            circleRadius * 8 +
            itemCount * CHART_CONSTANTS.MIN_ITEM_PITCH
        );
    }

    /**
     * Create a position scale that constrains spacing between lollipops
     * Limits max distance between lollipops and centers the group
     * Uses item array order (table sort order) for positioning
     * @param {Array} items - Items to display (in table sort order)
     * @param {Function} xScale - Original band scale (for calculating natural spacing)
     * @param {number} circleRadius - Radius of lollipop circles
     * @param {number} chartWidth - Total width available for chart
     * @returns {Function} Position function that takes an item and returns x position
     */
    #createConstrainedPositionScale(items, xScale, circleRadius, chartWidth) {
        const maxSpacing = circleRadius * 8;
        const edgePadding = circleRadius * 4;

        // Reserve edge padding on both sides before computing spacing
        const availableWidth = chartWidth - edgePadding * 2;
        const naturalSpacing = items.length > 1 ? availableWidth / (items.length - 1) : 0;
        const spacing = Math.min(naturalSpacing, maxSpacing);

        // Calculate positions based on index order (table sort order)
        const constrainedPositions = items.map((_, i) => i * spacing);

        // Calculate total width of constrained positions
        if (constrainedPositions.length === 0) {
            return () => chartWidth / 2;
        }

        const constrainedWidth =
            items.length > 1
                ? constrainedPositions[constrainedPositions.length - 1] - constrainedPositions[0]
                : 0;

        // Center within available area, offset by edgePadding
        const centerOffset = edgePadding + availableWidth / 2 - constrainedWidth / 2;

        // Create lookup map for fast access
        const positionMap = new Map();
        items.forEach((item, i) => {
            positionMap.set(item.iqbId, constrainedPositions[i] + centerOffset);
        });

        // Return function that looks up position by item
        return (item) => positionMap.get(item.iqbId) ?? chartWidth / 2;
    }

    /**
     * Render chart axes (x-axis with item labels, y-axis with percentage)
     * @param {object} g - D3 selection of main chart group
     * @param {ItemData[]} items - Items in display order
     * @param {*} xScale - Band scale for x-axis
     * @param {*} xPositionScale - Constrained position scale
     * @param {*} yScale - Linear scale for y-axis
     * @param {number} chartWidth - Chart width
     * @param {number} chartHeight - Chart height
     */
    #renderAxes(g, items, xScale, xPositionScale, yScale, chartWidth, chartHeight) {
        // X-axis
        const xAxis = d3.axisBottom(xScale);
        const xAxisGroup = g
            .append('g')
            .attr('class', 'axis x-axis')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(xAxis);

        // Reposition labels and tick marks to constrained positions
        const getLabel = (d) => d.displayName || d.name;

        // Build O(1) lookup map for label → item
        const labelToItem = new Map(items.map((item) => [getLabel(item), item]));

        xAxisGroup.selectAll('.tick').each(function (d) {
            const item = labelToItem.get(d);
            if (item) {
                // Set absolute position (D3 tick groups already have translate, so replace it)
                d3.select(this).attr('transform', `translate(${xPositionScale(item)}, 0)`);
            }
        });

        // Style and rotate labels
        xAxisGroup
            .selectAll('text')
            .attr('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)');
        this.normalizeSvgTypography(xAxisGroup, { textSize: X_AXIS_TEXT_SIZE });

        // Y-axis
        const yAxisGroup = g
            .append('g')
            .attr('class', 'axis y-axis')
            .call(createPercentAxis('left', yScale));
        this.normalizeSvgTypography(yAxisGroup);

        // Y-axis label
        this.renderAxisTitle(g, 'left', 'Richtig gelöst (%)', {
            fontWeight: 'bold',
            className: 'axis-label',
            glossaryKey: this.enConfig.correctResultType?.glossaryKey,
        });
    }

    /**
     * Format tooltip content for item data using structured tooltip builder.
     * Handles both individual items and aggregated task rows.
     * @param {object} segment - Item data object
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment) {
        const d = segment;

        // Each result row reads its own bucket's share, matched by result code — never by
        // the row's position among the result types.
        const shareFieldByCode = {
            1: 'percentageCorrect',
            0: 'percentageIncorrect',
            [-1]: 'percentageNotAttempted',
        };
        const rows = this.enConfig.resultTypes.map((rt) => {
            const share = d[shareFieldByCode[rt.numericCode]];
            return {
                label: rt.label,
                value:
                    typeof share === 'number' && Number.isFinite(share)
                        ? `${share.toFixed(1)}%`
                        : 'N/A',
            };
        });

        for (const group of this.comparisonGroups) {
            if (!this.visibilityState[group.id]) continue;
            const value = resolveComparisonAverage(this, d, group.meanMap);
            if (typeof value === 'number' && Number.isFinite(value)) {
                rows.push({
                    label: comparisonSeriesLabel(group),
                    value: `${value.toFixed(1)}%`,
                });
            }
        }

        if (d.isTaskRow) {
            // Task row: show competence level range and item count
            rows.push(
                { label: 'Niveaubereich', value: d.competenceLevel || 'N/A' },
                { label: 'Anzahl Items', value: String(d.itemCount || 0) },
            );
            return this.buildTooltipHTML({
                title: `Aufgabe: ${d.exercise?.name || d.name}`,
                rows,
            });
        }

        rows.push(
            { label: 'Aufgabenniveau', value: d.competenceLevel || 'N/A' },
            { label: 'Stil', value: d.style?.length > 0 ? d.style.join(', ') : 'N/A' },
        );

        return this.buildTooltipHTML({
            title: `Teilaufgabe ${d.name}`,
            rows,
        });
    }
}
