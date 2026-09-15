/**
 * BaseKsDistributionChartRenderer - Base class for KS distribution renderers
 * Provides common stacked bar functionality for distribution visualization
 * Extended by domain-specific charts (MA, EN) with custom configurations
 */

import {
    BarChartRenderer,
    STACKED_BAR_CHART_DEFAULTS,
    createSVGStackedBar,
} from '../renderers/barChartRenderer.js';
import { TERM_CONSTANTS } from '../../domain/terms.js';
import { isComparisonValueGroup } from '../../domain/comparisonGroupLabels.js';
import { getThemeColors } from '../../services/themeService.js';
import {
    findClassGroup,
    parseCompetenceLevels,
    toStackedChartData,
} from '../competenceLevelAdapter.js';
import { buildStackedSegments, levelShareLabelFormatter } from '../stackedBarUtils.js';
import { getCompetencyLevelClassToken } from '../chartUtils.js';
import * as d3 from 'd3';

/**
 * The bars sit on a band scale keyed by group name, and the name is also the axis
 * label, so two value groups sharing a name would take one slot: one bar drawn over
 * the other under a single label. That misreads the payload without a trace, so it
 * throws instead.
 * @param {string[]} groupNames - The parsed groups' names, in payload order.
 */
function assertDistinctGroupNames(groupNames) {
    const duplicate = groupNames.find((name, index) => groupNames.indexOf(name) !== index);
    if (duplicate !== undefined) {
        throw new Error(
            `KS distribution: two value groups are both named '${duplicate}'; each bar needs a name of its own.`,
        );
    }
}

// ============================================================================
// BASE KS DISTRIBUTION CHART CLASS
// ============================================================================

/**
 * Abstract base class for KS Distribution stacked bar charts
 * Provides common functionality for competency level distribution visualization
 * @abstract
 * @augments BarChartRenderer
 */
export class BaseKsDistributionChartRenderer extends BarChartRenderer {
    /** @type {Array} Competency levels the payload carries, in scale order */
    levels;

    /** @type {{levels: string[], scaleId: string|undefined, groups: import('../competenceLevelAdapter.js').ParsedCompetenceGroup[]}} */
    parsedApiData;

    /**
     * Creates a new BaseKsDistributionChartRenderer instance
     * @param {string} containerId - ID of the container element
     * @param {object} levelColors - Object mapping levels to colors
     * @param {object} [options] - Configuration options
     * @param {Array} [options.apiData] - Pre-aggregated API data; the levels come from it alone
     * @param {*} [options.highlightedLevel] - Initially highlighted competency level
     */
    constructor(containerId, levelColors, options = {}) {
        super(containerId, {
            defaultWidth: 800,
            defaultHeight: 450,
            animationDuration: 200,
            ...options,
        });

        this.levelColors = levelColors;
        this.highlightedLevel = options.highlightedLevel ?? null;
        this.groupNames = [];
        /** @type {string|null} Name of the class's own bar — the `type=group` row, wherever it sits. */
        this.primaryGroupName = null;
        this.groupIdToName = new Map();
        /** @type {string[]} Ids of the comparison groups: every value group whose `type` is not the class's. */
        this.comparisonGroupIds = [];
        /** @type {Set<string>} Group names currently drawn — the primary plus the active comparisons. */
        this.visibleGroups = new Set();

        this.syncParsedApiData(options.apiData ?? []);
    }

    // ============================================================================
    // ABSTRACT METHODS - Must be implemented by subclasses
    // ============================================================================

    /**
     * Publish level selection event via injected callback.
     * Subclasses can override if needed, but the default delegates to options.onLevelSelected.
     * @param {string|null} level - Selected level or null
     */
    publishLevelSelection(level) {
        this.options.onLevelSelected?.(level);
    }

    // ============================================================================
    // SHARED LIFECYCLE METHODS
    // ============================================================================

    /**
     * Validate that required data is present
     * @override
     * @returns {boolean} True when parsed API data is present and carries at least one group.
     */
    validateData() {
        if (!this.parsedApiData || this.parsedApiData.groups.length === 0) {
            console.warn('No API data available for KS distribution chart');
            return false;
        }
        return true;
    }

    // Note: Tooltip cleanup is automatic via chartState.tooltipIds tracking

    // ============================================================================
    // SHARED UTILITY / TOOLTIP METHODS
    // ============================================================================

    /**
     * Format tooltip content for bar segment.
     * Implements the abstract method from ChartRenderer.
     *
     * The count is the group's own `frequency` for the level, read rather than
     * estimated from the share; every group carries its own, the comparison
     * populations included.
     * @override
     * @param {object} segment - The segment data object from createSVGStackedBar, carrying its group's `count` and `total`
     * @param {object} [_context={}] - Additional context (unused)
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, _context = {}) {
        const rows = [
            { label: 'Kompetenzstufe', value: segment.key || segment.label },
            { label: 'Anteil', value: `${segment.value.toFixed(1)}%` },
        ];

        if (segment.total > 0) {
            rows.push({
                label: 'Anzahl',
                value: `${segment.count} ${segment.count === 1 ? TERM_CONSTANTS.STUDENT : TERM_CONSTANTS.STUDENTS}`,
            });
        }

        return this.buildTooltipHTML({
            title: segment.group,
            rows: rows,
        });
    }

    /**
     * Update highlighted competency level with optional full refresh
     * @param {string|null} level - Level to highlight or null to clear
     * @param {boolean} fullRefresh - Whether to do full chart refresh
     */
    updateHighlightedLevel(level, fullRefresh = false) {
        this.highlightedLevel = level;

        if (fullRefresh) {
            this.refresh();
        } else {
            this.updateHighlightVisuals(level);
        }
    }

    /**
     * Update visual state of highlighted segments without full refresh.
     * Only the primary bar group takes the highlight — the comparison groups
     * beside it are context, not the class the highlight is about.
     * @param {string|null} level - Level to highlight
     * @protected
     */
    updateHighlightVisuals(level) {
        if (!this.svg) return;

        const barGroups = this.svg.selectAll('g.bar-group');

        barGroups.each((d, i, nodes) => {
            if (d.group !== this.primaryGroupName) return;

            const barGroup = d3.select(nodes[i]);

            this.levels.forEach((lvl) => {
                const isHighlighted = !!level && lvl === level;
                // Match the canonical Arabic class the segments emit (see barChartRenderer).
                const elements = barGroup.selectAll(`.level-${getCompetencyLevelClassToken(lvl)}`);
                this.applyHighlightStroke(elements, isHighlighted);
            });
        });
    }

    // ============================================================================
    // API DATA PROCESSING
    // ============================================================================

    /**
     * Parse pre-aggregated API response into an internal format.
     * Delegates to the shared competence-level adapter.
     * @param {Array} apiData - Array of value-group objects from the API
     * @returns {{levels: string[], scaleId: string|undefined, groups: import('../competenceLevelAdapter.js').ParsedCompetenceGroup[]}} The level vocabulary and one entry per value group, with its type, shares and counts.
     */
    parseApiData(apiData) {
        return parseCompetenceLevels(apiData);
    }

    /**
     * Sync parsed API data and shared derived group metadata.
     *
     * The primary bar is the class's own row, found by its `type`; the comparison
     * groups are every row whose `type` says it is not the class. Neither is decided
     * by position or by name.
     * @param {Array} apiData - Array of value-group objects from the API
     */
    syncParsedApiData(apiData) {
        const parsedApiData = this.parseApiData(apiData);
        const { groups } = parsedApiData;
        const groupNames = groups.map((group) => group.name);
        assertDistinctGroupNames(groupNames);

        this.parsedApiData = parsedApiData;
        this.levels = [...parsedApiData.levels];
        this.groupNames = groupNames;
        this.primaryGroupName = findClassGroup(groups)?.name ?? null;
        this.groupIdToName = new Map(groups.map((group) => [group.id, group.name]));
        this.comparisonGroupIds = groups.filter(isComparisonValueGroup).map((group) => group.id);
        this.syncVisibleGroups();
    }

    /**
     * Hook for subclasses to rebuild local derived state from the parsed data. The base
     * constructor parses before the subclass constructor runs, so the subclass calls it.
     */
    onParsedDataUpdated() {}

    // ============================================================================
    // COMPARISON GROUP VISIBILITY
    // ============================================================================

    /**
     * @returns {string[]} The comparison groups a header toggle can reveal — the same
     *   rule `syncVisibleGroups` applies: every row the payload carries whose `type` is
     *   not the class's. The class's own row is always drawn, so it is never on offer.
     */
    getDrawableComparisonIds() {
        return [...this.comparisonGroupIds];
    }

    /**
     * Rebuild the visible group set from the app's active comparison ids: the primary
     * group always, plus every active id the payload actually carries. An active id the
     * payload lacks adds nothing — there is no bar to show for it.
     * @param {string[]|null} [activeModes] - Comparison ids toggled on; defaults to the reactive state's `activeModes`. `null` — a host with no comparison state — shows every group the payload carries.
     */
    syncVisibleGroups(activeModes = this._state?.activeModes ?? null) {
        const visibleGroups = new Set();

        if (this.primaryGroupName !== null) {
            visibleGroups.add(this.primaryGroupName);
        }

        for (const groupId of this.comparisonGroupIds) {
            if (activeModes !== null && !activeModes.includes(groupId)) continue;
            visibleGroups.add(this.groupIdToName.get(groupId));
        }

        this.visibleGroups = visibleGroups;
    }

    /**
     * Prepare chart data from parsed API data.
     * Delegates to the shared competence-level adapter.
     * @returns {Array<object>} Stacked rows ready to draw, one per group, each carrying its group's own `counts` and `total`.
     */
    prepareChartDataFromApi() {
        return toStackedChartData(this.parsedApiData.groups, this.parsedApiData.levels);
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Create tooltip for chart
     * @param {string} [id] - Tooltip element id; defaults to this chart’s own.
     * @param {object} [options] - Tooltip behaviour overrides, forwarded to the tooltip service.
     * @returns {object} D3 tooltip selection
     */
    createTooltip(id = this.getTooltipId(), options = {}) {
        return super.createTooltip(id, options);
    }

    /**
     * Get unique tooltip ID for this chart type
     * @protected
     * @returns {string} Unique tooltip identifier
     */
    getTooltipId() {
        return 'ks-distribution';
    }

    /**
     * Build the shared scale pair for KS distribution charts: a band scale over the
     * (visible) groups plus a 0–100% linear scale, oriented by `isHorizontal`.
     * Vertical → groups on x, percent on y (top-down). Horizontal → groups on y,
     * percent on x (left-right). When `allGroups` is provided, also returns a
     * `fullXScale` band scale over the full group set, used to position hidden
     * groups during visibility transitions.
     * @protected
     * @param {object} params - The groups to lay out, the space available, and the orientation.
     * @param {string[]} params.visibleGroups - Groups laid out on the band scale
     * @param {object} params.dimensions - { chartWidth, chartHeight } - Chart width and height in px.
     * @param {boolean} [params.isHorizontal=false] - Put the groups on y and the percentages on x.
     * @param {string[]|null} [params.allGroups=null] - Full group set for `fullXScale`
     * @returns {{ xScale: *, yScale: *, fullXScale: * }} The band and linear scales, plus a band scale over the full group set for positioning hidden groups mid-transition.
     */
    _createBandLinearScales({ visibleGroups, dimensions, isHorizontal = false, allGroups = null }) {
        const bandRange = isHorizontal ? [0, dimensions.chartHeight] : [0, dimensions.chartWidth];
        const makeBand = (groups) =>
            d3.scaleBand().domain(groups).range(bandRange).paddingInner(0.1).paddingOuter(0.1);

        const xScale = makeBand(visibleGroups);
        const yScale = d3
            .scaleLinear()
            .domain([0, 100])
            .range(isHorizontal ? [0, dimensions.chartWidth] : [dimensions.chartHeight, 0]);

        return { xScale, yScale, fullXScale: allGroups ? makeBand(allGroups) : null };
    }

    /**
     * Create stacked bars using shared utility.
     * @protected
     * @param {object} g - D3 selection for main group
     * @param {Array} data - Prepared chart data, one row per group with its `counts` and `total`
     * @param {d3.ScaleBand<string>} xScale - D3 band scale for x-axis
     * @param {Function} yScale - D3 linear scale for y-axis
     * @param {object} dimensions - Chart dimensions
     * @param {object} [options] - Additional options for bar creation
     * @param {boolean} [options.segmentClickEnabled] - Whether bar segments should publish/select on click
     * @param {boolean} [options.isHorizontal] - Render bars horizontally
     * @param {Function} [options.getTransform] - Per-group transform accessor
     * @param {Function} [options.getOpacity] - Per-group opacity accessor
     * @param {Function} [options.getDisplay] - Per-group display accessor
     * @param {object} [options.barOptions] - Extra options merged into createSVGStackedBar
     * @returns {*} The created bar selection, as `createSVGStackedBar` returned it.
     */
    createStackedBarsBase(g, data, xScale, yScale, dimensions, options = {}) {
        const chartInstance = this;
        const chartFontSize = chartInstance.getChartFontSize();
        const minLabelSize =
            STACKED_BAR_CHART_DEFAULTS.THRESHOLDS.MIN_LABEL_SIZE_EM * chartFontSize;

        const isHorizontal = options.isHorizontal || false;
        const segmentClickEnabled = options.segmentClickEnabled !== false;
        const getTransform = options.getTransform || ((d) => `translate(${xScale(d.group)},0)`);
        const getOpacity = options.getOpacity || (() => 1);
        const getDisplay = options.getDisplay || (() => null);

        // Create bar groups for each comparison group
        const barGroups = g
            .selectAll('.bar-group')
            .data(data)
            .enter()
            .append('g')
            .attr('class', 'bar-group')
            .attr('transform', getTransform)
            .style('opacity', getOpacity)
            .style('display', getDisplay);

        // For each bar group, create segments using the unified utility
        barGroups.each(function (groupData) {
            const barGroup = d3.select(this);

            // Each segment carries its own group's headcount for the tooltip.
            const segments = buildStackedSegments(
                groupData,
                chartInstance.levels,
                (level) =>
                    chartInstance.levelColors[level] || getThemeColors().chrome.defaultBarColor,
            ).map((segment) => ({
                ...segment,
                key: segment.field,
                group: groupData.group,
                count: groupData.counts[segment.field] ?? 0,
                total: groupData.total,
            }));

            // Use unified stacked bar utility with modern tooltip approach
            createSVGStackedBar(
                barGroup,
                segments,
                {
                    isHorizontal: isHorizontal,
                    xScale: isHorizontal ? yScale : null,
                    yScale: isHorizontal ? null : yScale,
                    barHeight: xScale.bandwidth(),
                    fillOpacity: STACKED_BAR_CHART_DEFAULTS.STYLES.FILL_OPACITY_DEFAULT,
                    highlightedKey: chartInstance.highlightedLevel,
                    cursor: segmentClickEnabled ? 'pointer' : 'default',
                    barGroupClass: `bar-segments-${groupData.group.toLowerCase().replace(/\s+/g, '-')}`,

                    // Labels
                    showLabels: true,
                    minLabelWidth: minLabelSize,
                    labelFontWeight: 'bold',
                    labelColor: getThemeColors().chrome.chartLabelFill,
                    labelFormatter: levelShareLabelFormatter,

                    // Modern tooltip approach using wireTooltipEvents
                    getTooltipContent: (segment) => chartInstance.formatTooltipContent(segment),
                    tooltipId: chartInstance.getTooltipId(),
                    hoverOpacity: STACKED_BAR_CHART_DEFAULTS.STYLES.FILL_OPACITY_HOVER,

                    // Click handler
                    onClick: segmentClickEnabled
                        ? (event, segment) => {
                              const newLevel = chartInstance.toggleHighlightKey(
                                  chartInstance.highlightedLevel,
                                  segment.key ?? segment.field,
                              );
                              chartInstance.publishLevelSelection(newLevel);
                              chartInstance.updateHighlightedLevel(newLevel);
                          }
                        : null,

                    // Allow additional options to override
                    ...options.barOptions,
                },
                chartInstance,
            ); // Pass chartInstance for wireTooltipEvents support
        });

        return barGroups;
    }
}
