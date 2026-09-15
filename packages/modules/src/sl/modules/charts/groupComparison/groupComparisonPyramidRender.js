/**
 * The population-pyramid drawing of the group comparison: both groups' bars mirrored
 * around a centre line, the row labels between them, the two percentage axes and the
 * group-name labels underneath. Pure d3 over a prepared `chartData`; the chart instance
 * is passed in only for tooltips, text measurement and its cached data.
 */

import {
    getCompetencyAppearance,
    getCompetencyColor,
    getThemeColors,
} from '../../../../common/services/themeService.js';
import { addSvgTextChip } from '../../../../common/charts/chartUtils.js';
import { fitLabelLine } from '../../../../common/charts/chartLabelFit.js';
import { createPercentAxis } from '../../../../common/charts/chartAxisUtils.js';
import { createSVGStackedBar } from '../../../../common/charts/renderers/barChartRenderer.js';
import { prefersReducedMotion } from '../../../../common/charts/motionPreference.js';
import { CHART_CONFIG, CHART_TYPE_CONFIG } from './groupComparisonChartTypes.js';
import * as d3 from 'd3';

// ============================================================================
// UNIFIED PYRAMID BAR RENDERER
// ============================================================================

/**
 * The drawable segments of one comparison row for one group, laid out end to end as
 * cumulative percentages. Empty segments are dropped rather than drawn at zero width.
 * @param {object} chartData - The prepared comparison data.
 * @param {string} groupKey - `group1` or `group2`.
 * @param {string} rowKey - The row's canonical key.
 * @param {number} rowIndex - Its position, which indexes the per-group segment arrays.
 * @returns {Array<object>} The non-empty segments, in scale order.
 */
function buildCompetencyRowSegments(chartData, groupKey, rowKey, rowIndex) {
    const segments = chartData[`${groupKey}Segments`]?.[rowIndex] || [];
    const groupCount = chartData[`${groupKey}Count`] || 0;
    let startPercent = 0;

    return segments
        .map((segment) => {
            const percentage = groupCount > 0 ? (segment.count / groupCount) * 100 : 0;
            const rowSegment = {
                field: segment.level,
                value: segment.count,
                color: getCompetencyColor(segment.level, segment.scaleId),
                appearance: getCompetencyAppearance(segment.level, segment.scaleId),
                label: segment.label,
                count: segment.count,
                percentage,
                normalizedValue: percentage,
                startPercent,
                endPercent: startPercent + percentage,
                total: groupCount,
                rowKey,
                rowIndex,
                groupKey,
                level: segment.level,
            };

            startPercent += percentage;
            return rowSegment;
        })
        .filter((segment) => segment.percentage > 0);
}

/**
 * Where a segment starts on its side of the pyramid. The left side grows away from the
 * centre, so it is positioned from its end rather than its start.
 * @param {object} segment - The segment, carrying its cumulative bounds.
 * @param {'left'|'right'} direction - Which side of the pyramid it sits on.
 * @param {Function} xScale - Percentage-to-px scale.
 * @returns {number} Its x offset from the centre line.
 */
function getCompetencySegmentX(segment, direction, xScale) {
    return direction === 'left' ? -xScale(segment.endPercent) : xScale(segment.startPercent);
}

/**
 * Tooltip for one competency segment, read off the chart's cached data so a hover after
 * a control change describes what is on screen rather than what was drawn first.
 * @param {object} chartInstance - The chart, source of the cached data and the tooltip builder.
 * @param {object} chartData - The data this render was built from, used as the fallback.
 * @param {string} groupKey - `group1` or `group2`.
 * @param {object} segment - The hovered segment.
 * @returns {string} The tooltip HTML.
 */
function formatCompetencySegmentTooltip(chartInstance, chartData, groupKey, segment) {
    const currentChartData = chartInstance.chartState.cachedChartData || chartData;
    return chartInstance.formatTooltipContent(
        buildCompetencySegmentTooltipData(currentChartData, groupKey, segment),
        { chartType: 'ks' },
    );
}

/**
 * Unified function to render population pyramid style bar charts
 * Handles competency levels (ks), point distributions, and rating charts
 * @param {object} chartGroup - D3 SVG group selection (already positioned at chart area origin)
 * @param {number} chartWidth - Chart area width (margins already accounted for by layout)
 * @param {number} chartHeight - Chart area height (margins already accounted for by layout)
 * @param {object} chartData - Prepared chart data
 * @param {string} chartType - Chart type: 'ks', 'points', 'selfEfficacy', 'teachingQuality'
 * @param {*} chartInstance - The chart instance for tooltip handling
 */
export function renderPyramidBars(
    chartGroup,
    chartWidth,
    chartHeight,
    chartData,
    chartType,
    chartInstance,
) {
    // Clear any existing content
    chartGroup.selectAll('*').remove();

    // Determine chart-type specific configuration
    const isPointsChart = chartType === 'points';
    const isRatingChart = chartType === 'selfEfficacy' || chartType === 'teachingQuality';
    const isCompetencyChart = chartType === 'ks';

    // Create chart content group (layout margins are handled by initializeSVG)
    const g = chartGroup.append('g').attr('class', 'chart-content');

    // Get data items and labels based on chart type
    let dataItems, getItemLabel;
    if (isCompetencyChart) {
        dataItems = chartData.levels;
        getItemLabel = (d) => d;
    } else if (isPointsChart) {
        dataItems = chartData.points;
        getItemLabel = (d) => d.label;
    } else {
        dataItems = chartData.buckets;
        getItemLabel = (d) => d;
    }

    // Calculate percentages for each group
    const group1Percentages = chartData.group1.map((count) =>
        chartData.group1Count > 0 ? (count / chartData.group1Count) * 100 : 0,
    );
    const group2Percentages = chartData.group2.map((count) =>
        chartData.group2Count > 0 ? (count / chartData.group2Count) * 100 : 0,
    );

    // Y scale for items
    const yScale = d3
        .scaleBand()
        .domain(dataItems.map(getItemLabel))
        .range([0, chartHeight])
        .padding(0.1);

    // X scale: always 0–100% for consistent cross-group comparison
    const centerX = chartWidth / 2;
    const maxBarWidth = centerX - CHART_CONFIG.barMargin;
    const xScale = d3.scaleLinear().domain([0, 100]).range([0, maxBarWidth]);

    // Get colors based on chart type
    const getBarColor = (d, i) => {
        if (isCompetencyChart) {
            return getCompetencyColor(d);
        } else if (isPointsChart) {
            return null; // Use fixed colors per group
        } else {
            return chartData.colors[i];
        }
    };

    // Fixed colors for point distribution chart
    const group1FixedColor = isPointsChart ? CHART_CONFIG.colors.pointsGroup1 : null;
    const group2FixedColor = isPointsChart ? CHART_CONFIG.colors.pointsGroup2 : null;

    const { group1: group1Opacity, group2: group2Opacity, hoverActive } = CHART_CONFIG.opacity;

    // CSS class prefix for rating charts
    const classPrefix = isRatingChart
        ? chartType === 'selfEfficacy'
            ? 'self-efficacy'
            : 'teaching-quality'
        : '';

    const renderCompetencySideSegments = (groupKey, sideClassName, direction) => {
        const sideGroup = g.append('g').attr('class', `${sideClassName}-segments`);

        dataItems.forEach((rowKey, rowIndex) => {
            const segments = buildCompetencyRowSegments(chartData, groupKey, rowKey, rowIndex);
            if (segments.length === 0) {
                return;
            }

            const rowGroup = sideGroup
                .append('g')
                .attr('class', `${sideClassName}-row row-${rowKey}`)
                .attr('data-row-key', rowKey)
                .attr('transform', `translate(${centerX}, ${yScale(rowKey)})`);

            createSVGStackedBar(
                rowGroup,
                segments,
                {
                    orientation: 'horizontal',
                    isHorizontal: true,
                    barHeight: yScale.bandwidth(),
                    // The two wings differ by weight as in the rating modes.
                    fillOpacity: groupKey === 'group1' ? group1Opacity : group2Opacity,
                    barGroupClass: `${sideClassName}-stacked-bar`,
                    // Injected geometry (the sanctioned escape hatch): these bars are
                    // mirrored/diverging around centerX, which the shared
                    // computeStackedBarRects fallback deliberately does not model.
                    getX: (segment) => getCompetencySegmentX(segment, direction, xScale),
                    getY: () => 0,
                    getWidth: (segment) => xScale(segment.percentage),
                    getHeight: () => yScale.bandwidth(),
                    getTooltipContent: (segment) =>
                        formatCompetencySegmentTooltip(chartInstance, chartData, groupKey, segment),
                    tooltipId: 'group-comparison',
                    cursor: 'default',
                },
                chartInstance,
            );
        });
    };

    // Helper to render one side of simple-rect bars (points/rating charts)
    const renderSimpleRectSide = (
        groupKey,
        sideClassName,
        percentages,
        fixedColor,
        opacity,
        side,
    ) => {
        const rects = g
            .selectAll(`.${sideClassName}`)
            .data(dataItems)
            .enter()
            .append('rect')
            .attr('class', sideClassName)
            .attr('x', (d, i) => (side === 'left' ? centerX - xScale(percentages[i]) : centerX))
            .attr('y', (d) => yScale(getItemLabel(d)))
            .attr('width', (d, i) => xScale(percentages[i]))
            .attr('height', yScale.bandwidth())
            .attr('fill', (d, i) => fixedColor || getBarColor(d, i))
            .attr('opacity', opacity);

        chartInstance.wireTooltipEvents(rects, {
            tooltipId: 'group-comparison',
            getTooltipContent: (d) => {
                const cd = chartInstance.chartState.cachedChartData || chartData;
                const items = cd.levels || cd.points || cd.buckets;
                const index = items.indexOf(d);
                const pcts = cd[groupKey].map((c) =>
                    cd[`${groupKey}Count`] > 0 ? (c / cd[`${groupKey}Count`]) * 100 : 0,
                );
                return chartInstance.formatTooltipContent(
                    buildTooltipData(cd, chartType, groupKey, d, index >= 0 ? index : 0, pcts),
                    { chartType },
                );
            },
            hoverEffect: {
                enter: { opacity: hoverActive },
                leave: { opacity },
            },
        });
    };

    // Draw group1 bars (extending left from center)
    const group1ClassName = classPrefix ? `${classPrefix}-group1-bar` : 'group1-bar';
    if (isCompetencyChart) {
        renderCompetencySideSegments('group1', group1ClassName, 'left');
    } else {
        renderSimpleRectSide(
            'group1',
            group1ClassName,
            group1Percentages,
            group1FixedColor,
            group1Opacity,
            'left',
        );
    }

    // Draw group2 bars (extending right from center)
    const group2ClassName = classPrefix ? `${classPrefix}-group2-bar` : 'group2-bar';
    if (isCompetencyChart) {
        renderCompetencySideSegments('group2', group2ClassName, 'right');
    } else {
        renderSimpleRectSide(
            'group2',
            group2ClassName,
            group2Percentages,
            group2FixedColor,
            group2Opacity,
            'right',
        );
    }

    // The share at each wing's end, so the two groups can be read off without the
    // axis or the tooltip.
    renderWingValueLabels(g, chartInstance, {
        dataItems,
        getItemLabel,
        yScale,
        xScale,
        centerX,
        group1Percentages,
        group2Percentages,
    });

    // Add center divider line
    g.append('line')
        .attr('class', 'center-divider')
        .attr('x1', centerX)
        .attr('x2', centerX)
        .attr('y1', 0)
        .attr('y2', chartHeight)
        .attr('stroke', CHART_CONFIG.colors.divider)
        .attr('stroke-width', 2)
        .attr('stroke-opacity', CHART_CONFIG.opacity.dividerLine);

    // Render center labels based on chart type
    renderCenterLabels(g, chartData, yScale, centerX, chartType);

    // Add X-axes
    renderXAxes(g, centerX, maxBarWidth, chartHeight, 100);

    // Update axis labels with group names and counts
    updateAxisLabels(g, centerX, maxBarWidth, chartHeight, chartData, chartInstance);
}

/**
 * The values a competency segment's tooltip reports.
 * @param {object} chartData - The prepared comparison data.
 * @param {string} groupKey - `group1` or `group2`.
 * @param {object} segment - The hovered segment.
 * @returns {object} The group's label plus the segment's level, count and share.
 */
function buildCompetencySegmentTooltipData(chartData, groupKey, segment) {
    const groupLabel = groupKey === 'group1' ? chartData.group1Label : chartData.group2Label;

    return {
        group: groupLabel,
        level: segment.label || segment.level,
        count: segment.count,
        percentage: segment.percentage.toFixed(1),
    };
}

/**
 * Builds tooltip data object based on chart type
 * @param {object} chartData - Chart data
 * @param {string} chartType - Chart type
 * @param {string} groupKey - 'group1' or 'group2'
 * @param {*} item - Data item
 * @param {number} index - Item index
 * @param {Array} percentages - Group percentages array
 * @returns {object} Tooltip data object
 */
function buildTooltipData(chartData, chartType, groupKey, item, index, percentages) {
    const groupLabel = groupKey === 'group1' ? chartData.group1Label : chartData.group2Label;
    const groupData = chartData[groupKey];

    if (chartType === 'selfEfficacy' || chartType === 'teachingQuality') {
        return {
            group: groupLabel,
            bucket: item,
            description: chartData.categoryDescriptions[index],
            count: groupData[index],
            percentage: percentages[index].toFixed(1),
            dataType: chartData.dataType,
        };
    } else if (chartType === 'points') {
        return {
            group: groupLabel || (groupKey === 'group1' ? 'Group 1' : 'Group 2'),
            level: item.label,
            count: groupData[index],
            percentage: percentages[index].toFixed(1),
        };
    } else {
        // Competency chart
        const levelLabel =
            Array.isArray(chartData.levelPairLabels) && chartData.levelPairLabels[index]
                ? chartData.levelPairLabels[index][
                      groupKey === 'group1' ? 'group1Label' : 'group2Label'
                  ]
                : chartData.levelLabels?.[index] || item;

        return {
            group: groupLabel,
            level: levelLabel,
            count: groupData[index],
            percentage: percentages[index].toFixed(1),
        };
    }
}

/** Gap between a wing's end and its value label, px. */
const WING_LABEL_GAP = 4;

/**
 * Print each wing's share just outside its end, in the page ink. A wing at 0 % gets no
 * label — the empty row already says so.
 * @param {any} g - The plot group.
 * @param {any} chartInstance - The renderer, for the text size helper.
 * @param {{dataItems: Array, getItemLabel: Function, yScale: any, xScale: any, centerX: number, group1Percentages: number[], group2Percentages: number[]}} spec - Rows, scales and the two groups' shares.
 */
function renderWingValueLabels(
    g,
    chartInstance,
    { dataItems, getItemLabel, yScale, xScale, centerX, group1Percentages, group2Percentages },
) {
    const format = (share) => `${Math.round(share)}\u00a0%`;
    const rowY = (d) => yScale(getItemLabel(d)) + yScale.bandwidth() / 2;
    // The centre label sits over the wings' inner ends; a wing shorter than half of
    // it would print its share under that label, so it stays unlabelled (tooltip).
    const centreLabels = dataItems.map((d) => String(getItemLabel(d)));
    const minLabelledWing =
        chartInstance.measureTexts(centreLabels, { fontWeight: 'bold' }).maxWidth / 2 +
        WING_LABEL_GAP * 2;
    const labels = g.append('g').attr('class', 'wing-value-labels');
    const side = (percentages, className, x, anchor) =>
        labels
            .selectAll(`.${className}`)
            .data(dataItems.map((d, i) => ({ d, share: percentages[i] })))
            .join('text')
            .attr('class', className)
            .attr('x', ({ share }) => x(share))
            .attr('y', ({ d }) => rowY(d))
            .attr('dy', '0.35em')
            .attr('text-anchor', anchor)
            .style('fill', CHART_CONFIG.colors.text)
            .style('pointer-events', 'none')
            .text(({ share }) => (xScale(share) >= minLabelledWing ? format(share) : ''));
    chartInstance.applyChartTextSize(
        side(
            group1Percentages,
            'wing-value-label--group1',
            (s) => centerX - xScale(s) - WING_LABEL_GAP,
            'end',
        ),
        'sm',
    );
    chartInstance.applyChartTextSize(
        side(
            group2Percentages,
            'wing-value-label--group2',
            (s) => centerX + xScale(s) + WING_LABEL_GAP,
            'start',
        ),
        'sm',
    );
}

/**
 * Renders center labels for all chart types (competency, points, rating)
 * Handles color circles and descriptions for rating charts
 * @param {any} g - The plot group the labels are drawn into. `any`, not `d3.Selection`: a label's text shadow is set with `.style(name, condition ? value : null)`, and d3's typed overloads take either a string or `null`, not the union.
 * @param {object} chartData - The prepared comparison data.
 * @param {any} yScale - Row band scale.
 * @param {number} centerX - The pyramid's centre line, which the labels are centred on.
 * @param {string} chartType - Selects which item list the labels come from and whether a colour circle is drawn.
 */
function renderCenterLabels(g, chartData, yScale, centerX, chartType) {
    const config = CHART_TYPE_CONFIG[chartType];
    const items = chartData[config.itemKey];
    const isRating = chartType === 'selfEfficacy' || chartType === 'teachingQuality';
    const isPoints = chartType === 'points';
    const getLabel = isPoints ? (d) => d.label : (d) => d;
    const hasPairLabels =
        Array.isArray(chartData.levelPairLabels) && chartData.levelPairLabels.length > 0;
    // Offset from center divider for dual-label mode; leaves a small gap around the divider line
    const DUAL_LABEL_OFFSET = 6;

    // A label names a level of one group's ladder; the row's own ladder decides the chip.
    const resolveCompetencyLabelAppearance = (labelText, groupIndex) => {
        if (chartType !== 'ks' || !labelText) {
            return null;
        }
        const scaleId = chartData.levelScaleIds?.[groupIndex];

        const directAppearance = getCompetencyAppearance(labelText, scaleId);
        if (directAppearance) {
            return directAppearance;
        }

        return (
            String(labelText)
                .split('/')
                .map((part) => part.trim())
                .filter(Boolean)
                .map((part) => getCompetencyAppearance(part, scaleId))
                .find(Boolean) || null
        );
    };

    const appendCenterLabel = (labelText, x, y, textAnchor, groupIndex = 0) => {
        const competencyAppearance = resolveCompetencyLabelAppearance(labelText, groupIndex);
        const label = g
            .append('text')
            .attr('class', `${config.itemKey}-label`)
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', textAnchor)
            .attr('dy', '0.35em')
            // The chip case takes its ink from addSvgTextChip below.
            .style('fill', CHART_CONFIG.colors.text)
            .style('font-weight', 'bold')
            .style(
                'text-shadow',
                competencyAppearance
                    ? 'none'
                    : isRating
                      ? null
                      : '1px 1px 1px rgba(255,255,255,0.8)',
            )
            .text(labelText);

        if (competencyAppearance) {
            addSvgTextChip(label, {
                className: 'group-comparison-label-chip',
                paddingX: 4,
                paddingY: 2,
            });
        }

        return label;
    };

    items.forEach((item, i) => {
        const label = getLabel(item);
        const displayLabel = chartType === 'ks' ? chartData.levelLabels?.[i] || label : label;
        const y = yScale(label) + yScale.bandwidth() / 2;

        // Color indicator circle (rating only)
        if (isRating) {
            g.append('circle')
                .attr('cx', centerX - 25)
                .attr('cy', y)
                .attr('r', 6)
                .attr('fill', chartData.colors[i]);
        }

        if (hasPairLabels) {
            // ── Dual-label mode (group-specific notation differs) ────────────
            const pair = chartData.levelPairLabels[i];

            // Group-1 label: right-aligned left of divider
            appendCenterLabel(pair.group1Label, centerX - DUAL_LABEL_OFFSET, y, 'end', 0);

            // Group-2 label: left-aligned right of divider
            appendCenterLabel(pair.group2Label, centerX + DUAL_LABEL_OFFSET, y, 'start', 1);
        } else {
            // ── Single center label (normal mode) ────────────────────────────
            appendCenterLabel(displayLabel, centerX, y, 'middle');
        }

        // Description text (rating only)
        if (isRating && chartData.categoryDescriptions?.[i]) {
            g.append('text')
                .attr('class', 'bucket-description')
                .attr('x', centerX + 30)
                .attr('y', y)
                .attr('text-anchor', 'start')
                .attr('dy', '0.35em')
                .style('fill', CHART_CONFIG.colors.descriptionText)
                .text(`(${chartData.categoryDescriptions[i]})`);
        }
    });
}

/**
 * Renders X-axes for both sides of the pyramid
 * @param {d3.Selection} g - The plot group the axes are drawn into.
 * @param {number} centerX - The pyramid's centre line, where both axes start.
 * @param {number} maxBarWidth - How far each side reaches.
 * @param {number} chartHeight - Where the axes sit.
 * @param {number} maxPercentage - The value at the far end of each side.
 */
export function renderXAxes(g, centerX, maxBarWidth, chartHeight, maxPercentage) {
    // Left X-axis (reversed percentages)
    const leftXScale = d3.scaleLinear().domain([maxPercentage, 0]).range([0, maxBarWidth]);

    g.append('g')
        .attr('class', 'left-x-axis')
        .attr('transform', `translate(${centerX - maxBarWidth}, ${chartHeight})`)
        .call(createPercentAxis('bottom', leftXScale));

    // Right X-axis
    const rightXScale = d3.scaleLinear().domain([0, maxPercentage]).range([0, maxBarWidth]);

    g.append('g')
        .attr('class', 'right-x-axis')
        .attr('transform', `translate(${centerX}, ${chartHeight})`)
        .call(createPercentAxis('bottom', rightXScale));
}

// ============================================================================
// AXIS LABEL UTILITIES
// ============================================================================

/** Breathing room between the two group labels across the divider, in px. */
const AXIS_LABEL_GAP = 8;
/** Line height between a group label's name and count lines, as a factor of the font size. */
const AXIS_LABEL_LINE_HEIGHT = 1.1;

/**
 * Creates or updates axis labels with group names and counts
 * Handles both initial creation and animated updates
 * @param {object} g - D3 selection of the chart group
 * @param {number} centerX - Center X position of the chart
 * @param {number} maxBarWidth - Maximum width of bars
 * @param {number} height - Chart height
 * @param {object} chartData - Chart data with group labels and counts
 * @param {object} chart - The chart instance, whose measurement fits the name line
 * @param {object} options - Options for label handling
 * @param {boolean} [options.animate] - Whether to animate the text change
 * @param {number} [options.duration] - Animation duration in ms (default: 300)
 */
export function updateAxisLabels(g, centerX, maxBarWidth, height, chartData, chart, options = {}) {
    const { animate = false, duration = 300 } = options;

    // Get the correct labels and counts (handle both chart types)
    const group1Label = chartData.group1Label || 'Group 1';
    const group2Label = chartData.group2Label || 'Group 2';
    const group1Count = chartData.group1Count || 0;
    const group2Count = chartData.group2Count || 0;

    const leftX = centerX - maxBarWidth / 2;
    const rightX = centerX + maxBarWidth / 2;
    const labelY = height + 50;
    // Two lines: the group name (a free-text class label can be as long as the
    // half it names), then the count — side by side they collided across the
    // divider. The name is middle-ellipsed to the centre-to-centre distance as
    // a last resort; the group select above carries it in full.
    const nameSlot = Math.max(0, maxBarWidth - AXIS_LABEL_GAP);
    const lineHeight = chart.resolveChartTextSize('base') * AXIS_LABEL_LINE_HEIGHT;
    const applyLabel = (label, name, count, x) => {
        label.text(null);
        label
            .append('tspan')
            .attr('x', x)
            .attr('y', labelY)
            .text(fitLabelLine(chart, name, nameSlot));
        label
            .append('tspan')
            .attr('x', x)
            .attr('y', labelY)
            .attr('dy', `${lineHeight}px`)
            .text(`(n=${count})`);
    };

    // Check if labels exist
    let leftLabel = g.select('.left-x-label');
    let rightLabel = g.select('.right-x-label');

    // Create labels if they don't exist
    if (leftLabel.empty()) {
        leftLabel = g
            .append('text')
            .attr('class', 'left-x-label')
            .attr('x', leftX)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .style('fill', getThemeColors().chrome.text);
    }

    if (rightLabel.empty()) {
        rightLabel = g
            .append('text')
            .attr('class', 'right-x-label')
            .attr('x', rightX)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .style('fill', getThemeColors().chrome.text);
    }

    // Update text with or without animation
    if (animate && !prefersReducedMotion()) {
        // Fade out, swap the lines at the low point, fade in
        const swap = (label, name, count, x) =>
            label
                .transition()
                .duration(duration / 2)
                .style('opacity', 0)
                .on('end', () => applyLabel(label, name, count, x))
                .transition()
                .duration(duration / 2)
                .style('opacity', 1);

        swap(leftLabel, group1Label, group1Count, leftX);
        swap(rightLabel, group2Label, group2Count, rightX);
    } else {
        applyLabel(leftLabel, group1Label, group1Count, leftX);
        applyLabel(rightLabel, group2Label, group2Count, rightX);
    }
}
