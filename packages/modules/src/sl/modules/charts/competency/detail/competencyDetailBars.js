/**
 * The bars of the competency detail chart: the single-domain stacked bars, the
 * multi-domain grouped bars with their uniform-width layout, and the one bar
 * drawer both go through. Free functions over the renderer so the layout maths
 * reads on its own; `chart` supplies tooltips, text measurement and data.
 */

import { levelShareLabelFormatter } from '../../../../../common/charts/stackedBarUtils.js';
import {
    createChartStackedBars,
    createChartStackedBar,
} from '../../../../../common/charts/renderers/barChartRenderer.js';
import {
    LABEL_LINE_HEIGHT,
    fitLabelLine,
    splitLabelLines,
} from '../../../../../common/charts/chartLabelFit.js';
import {
    CHART_CONFIG,
    STYLE_CONFIG,
    COMPETENCY_TOOLTIP_ID,
    BAR_HOVER_CONFIG,
} from '../shared/competencyChartConstants.js';
import { getUniqueValues } from '../shared/competencyChartData.js';
import { getGroupingConfig } from './competencyDetailGrouping.js';
import {
    DETAIL_AXIS_LABEL_GAP,
    measureSubjectDomainLabelGap,
    measureAdjacentSubjectGroupGap,
    renderDomainLabels,
} from './competencyDetailLabels.js';

// ============================================================================
// STANDARD STACKED BARS (single-domain)
// ============================================================================

/**
 * Create stacked bars for single-domain view, delegating to createChartStackedBars.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection} g - The plot group the bars are drawn into.
 * @param {object} chartData - The prepared data.
 * @param {string[]} competencyLevels - The scale's bands, in stack order.
 * @param {(level: string) => string} getColorForLevel - Maps a band to its colour.
 * @param {d3.ScaleBand<string>} xScale - Band scale over the x-axis ticks.
 * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale.
 * @param {Array} stackedData - The d3 stack series.
 * @param {object} [config] - Click handling and class-name overrides for the drawn bars.
 * @returns {d3.Selection} The bar groups, as `createChartStackedBars` returned them.
 */
export function createStandardStackedBars(
    chart,
    g,
    chartData,
    competencyLevels,
    getColorForLevel,
    xScale,
    yScale,
    stackedData,
    config = {},
) {
    const { onClick = () => {}, barClass = 'bar-group', showDomain = true } = config;

    return createChartStackedBars(
        g,
        chartData,
        stackedData,
        competencyLevels,
        getColorForLevel,
        { xScale, yScale },
        {
            barGroupClass: barClass,
            cursor: (segment, data) => (config.getCursor ? config.getCursor(data) : 'default'),
            getTooltipContent: (data, stackedEntry, level) => {
                const typeLabel =
                    data.type === 'class'
                        ? 'Klasse'
                        : data.type === 'school'
                          ? 'Schule'
                          : 'Landesschnitt';
                return chart.formatTooltipContent(
                    { data, stackedData: stackedEntry, level },
                    { type: typeLabel, showDomain },
                );
            },
            tooltipId: COMPETENCY_TOOLTIP_ID,
            hoverEffect: BAR_HOVER_CONFIG,
            onClick: (event, data) => {
                onClick(event, data);
            },
        },
        chart,
    );
}

// ============================================================================
// MULTI-DOMAIN BARS
// ============================================================================

/**
 * Create grouped stacked bars per domain group with uniform width and TQ placeholders.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection} g - The plot group the bars are drawn into.
 * @param {object} chartData - The prepared data.
 * @param {string[]} competencyLevels - The scale's bands, in stack order.
 * @param {(level: string) => string} getColorForLevel - Maps a band to its colour.
 * @param {d3.ScaleBand<string>} xScale - Band scale over the x-axis ticks.
 * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale.
 * @param {Array} stackedData - The d3 stack series.
 * @param {number} height - Plot height in px, the baseline the bars stand on.
 * @param {number} barLabelFontSize - Font size for the in-bar labels.
 * @param {boolean} [hasTeachingQuality] - Whether each group reserves a Unterrichtsqualität slot, so the bars keep a uniform width with and without it.
 */
export function createMultiDomainBars(
    chart,
    g,
    chartData,
    competencyLevels,
    getColorForLevel,
    xScale,
    yScale,
    stackedData,
    height,
    barLabelFontSize,
    hasTeachingQuality = false,
) {
    const groupingConfig = getGroupingConfig(chartData, chart.className, hasTeachingQuality);

    const groups = {};
    chartData.forEach((d, i) => {
        const key = groupingConfig.getGroupKey(d);
        if (!groups[key]) groups[key] = [];
        groups[key].push({ data: d, index: i });
    });

    const maxItemsPerGroup = Math.max(
        ...Object.values(groups).map(
            (group) => group.filter(({ data }) => data.type !== 'landesschnitt').length,
        ),
    );
    const showLabels = !groupingConfig.groupByDomain || maxItemsPerGroup > 1;

    const layout = computeMultiDomainBarLayout(
        chart,
        xScale,
        groups,
        groupingConfig,
        hasTeachingQuality,
        barLabelFontSize,
    );
    const {
        groupKeys,
        groupPositions,
        groupBarCounts,
        groupHasQuality,
        groupDomainGaps,
        groupDomainExtraGap,
        groupSortedKeys,
        uniformBarWidth,
        barWidthWithPadding,
        subgroupGap,
    } = layout;

    g.datum({
        groupPositions,
        groupBarCounts,
        uniformBarWidth,
        barWidthWithPadding,
    });

    // Render bars with uniform width
    groupKeys.forEach((key) => {
        const groupData = groups[key];
        const groupPos = groupPositions[key];
        const sortedLocalKeys = groupSortedKeys[key];

        /** @type {{[barKey: string]: number}} */
        const barPositions = {};
        let cumulativeX = 0;
        let lastDomain = null;
        let lastSubject = null;

        sortedLocalKeys.forEach((subKey, idx) => {
            if (subKey === 'teachingQuality' && idx > 0) {
                cumulativeX += subgroupGap;
            } else if (groupingConfig.groupBySubject && groupDomainGaps[key] > 0) {
                const currentDomain = subKey.endsWith('_d0')
                    ? 'd0'
                    : subKey.endsWith('_d1')
                      ? 'd1'
                      : null;
                if (lastDomain === 'd0' && currentDomain === 'd1') {
                    cumulativeX += subgroupGap + (groupDomainExtraGap[key] || 0);
                }
                lastDomain = currentDomain;
            } else if (
                !groupingConfig.groupBySubject &&
                !groupingConfig.groupByDomain &&
                subKey !== 'teachingQuality'
            ) {
                const currentSubject = subKey.split('|')[0];
                if (lastSubject !== null && currentSubject !== lastSubject) {
                    cumulativeX += subgroupGap;
                }
                lastSubject = currentSubject;
            }
            barPositions[subKey] = cumulativeX;
            cumulativeX += barWidthWithPadding;
        });

        const domainGroup = g
            .append('g')
            .attr('class', 'domain-group')
            .attr('data-group-key', key)
            .attr('transform', `translate(${groupPos.x}, 0)`);

        renderDomainLabels(
            chart,
            domainGroup,
            groupData,
            barPositions,
            sortedLocalKeys,
            uniformBarWidth,
            barLabelFontSize,
            groupingConfig,
        );

        // Render bars
        groupData.forEach(({ data, index }) => {
            const subScaleKey = groupingConfig.getSubScaleKey(data);
            const subBarGroup = domainGroup
                .append('g')
                .attr('class', `sub-bar-group sub-bar-${subScaleKey}`)
                .attr('data-sub-key', subScaleKey)
                .attr('transform', `translate(${barPositions[subScaleKey]}, 0)`);

            renderStackedBar(chart, subBarGroup, {
                data,
                index,
                stackedData,
                competencyLevels,
                getColorForLevel,
                yScale,
                barWidth: uniformBarWidth,
                labelText: groupingConfig.getLabelText(data),
                showLabel: showLabels && !chart.compact,
                labelSlot: Math.max(0, barWidthWithPadding - DETAIL_AXIS_LABEL_GAP),
            });
        });

        // Teaching quality placeholder
        if (groupHasQuality[key] && barPositions['teachingQuality'] !== undefined) {
            domainGroup
                .append('g')
                .attr('class', 'sub-bar-group sub-bar-teachingQuality')
                .attr('data-sub-key', 'teachingQuality')
                .attr('data-bar-width', uniformBarWidth)
                .attr('transform', `translate(${barPositions['teachingQuality']}, 0)`);
        }
    });
}

/**
 * Computes the full layout for multi-domain bars: group positions, bar widths, gaps.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.ScaleBand<string>} xScale - Band scale over the x-axis ticks.
 * @param {object} groups - The bars grouped by domain.
 * @param {object} groupingConfig - How the groups nest, from `getGroupingConfig`.
 * @param {boolean} hasTeachingQuality - Whether each group reserves a Unterrichtsqualität slot.
 * @param {number} barLabelFontSize - Font size for the in-bar labels, which sets the minimum a bar may shrink to.
 * @returns {object} Layout data including groupKeys, groupPositions, uniformBarWidth, etc.
 */
function computeMultiDomainBarLayout(
    chart,
    xScale,
    groups,
    groupingConfig,
    hasTeachingQuality,
    barLabelFontSize,
) {
    const groupBarCounts = {};
    const groupHasQuality = {};
    const groupDomainGaps = {};
    const groupDomainExtraGap = {};
    const groupPairExtraGap = {};
    const groupSortedKeys = {};
    const groupKeys = [];
    let totalBars = 0;
    let totalDomainGaps = 0;

    xScale.domain().forEach((key) => {
        const groupData = groups[key];
        if (!groupData) return;

        groupKeys.push(key);

        const localSubScaleKeys = new Set();
        groupData.forEach(({ data }) => {
            localSubScaleKeys.add(groupingConfig.getSubScaleKey(data));
        });

        const hasQuality =
            hasTeachingQuality &&
            groupData.some(({ data }) => data.teachingQuality && data.type !== 'landesschnitt');
        if (hasQuality) localSubScaleKeys.add('teachingQuality');
        groupHasQuality[key] = hasQuality;

        let domainGaps = 0;
        if (groupingConfig.groupBySubject && groupingConfig.subjectDomainCounts) {
            const subject = groupData[0]?.data?.subject;
            if (subject && groupingConfig.subjectDomainCounts[subject]) {
                const domainCount = groupingConfig.subjectDomainCounts[subject].size;
                domainGaps = Math.max(0, domainCount - 1);
            }
        }
        if (
            !groupingConfig.groupBySubject &&
            !groupingConfig.groupByDomain &&
            groupingConfig.subjectGapsCount !== undefined
        ) {
            domainGaps = groupingConfig.subjectGapsCount;
        }
        groupDomainGaps[key] = domainGaps;
        totalDomainGaps += domainGaps;

        groupSortedKeys[key] = Array.from(localSubScaleKeys).sort((a, b) => {
            const aIndex = groupingConfig.subScaleDomain.indexOf(a);
            const bIndex = groupingConfig.subScaleDomain.indexOf(b);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.localeCompare(b);
        });

        groupBarCounts[key] = localSubScaleKeys.size;
        totalBars += localSubScaleKeys.size;
    });

    // Calculate uniform bar width and spacing
    const chartWidth = xScale.range()[1] - xScale.range()[0];
    const barPadding = CHART_CONFIG.PADDING.BAR_PADDING_RATIO;
    const numGroups = groupKeys.length;

    const subgroupGapRatio = barPadding;
    const groupGapRatio = barPadding * 3;

    const numGroupsWithQuality = Object.values(groupHasQuality).filter(Boolean).length;
    const totalSubgroupGaps = totalDomainGaps + numGroupsWithQuality;

    const outerPaddingRatio = CHART_CONFIG.PADDING.OUTER_COMPACT;
    const totalOuterPadding = chartWidth * outerPaddingRatio * 2;
    const numGroupGaps = numGroups - 1;
    const effectiveBars =
        totalBars + totalSubgroupGaps * subgroupGapRatio + numGroupGaps * groupGapRatio;
    const availableWidth = chartWidth - totalOuterPadding;

    const computeMetrics = (extraGapWidth = 0) => {
        const widthForBars = Math.max(0, availableWidth - extraGapWidth);
        const widthWithPadding = widthForBars / effectiveBars;
        return {
            barWidthWithPadding: widthWithPadding,
            uniformBarWidth: widthWithPadding * (1 - barPadding),
            groupGap: widthWithPadding * groupGapRatio,
            subgroupGap: widthWithPadding * subgroupGapRatio,
        };
    };

    let metrics = computeMetrics(0);

    for (let iteration = 0; iteration < 2; iteration++) {
        let totalDomainExtraGap = 0;
        groupKeys.forEach((key) => {
            if (!groupingConfig.groupBySubject || groupDomainGaps[key] === 0) {
                groupDomainExtraGap[key] = 0;
                return;
            }

            groupDomainExtraGap[key] = measureSubjectDomainLabelGap(
                chart,
                groups[key],
                groupingConfig,
                barLabelFontSize,
                metrics.uniformBarWidth,
                metrics.barWidthWithPadding,
            );
            totalDomainExtraGap += groupDomainExtraGap[key];
        });

        let totalPairExtraGap = 0;
        groupKeys.forEach((key, index) => {
            if (index >= groupKeys.length - 1) {
                groupPairExtraGap[key] = 0;
                return;
            }

            const nextKey = groupKeys[index + 1];
            groupPairExtraGap[key] = measureAdjacentSubjectGroupGap(
                chart,
                groups[key],
                groups[nextKey],
                groupingConfig,
                barLabelFontSize,
                metrics.uniformBarWidth,
                metrics.barWidthWithPadding,
                groupDomainExtraGap[key] || 0,
                groupDomainExtraGap[nextKey] || 0,
                groupHasQuality[key],
                groupHasQuality[nextKey],
                metrics.groupGap,
            );
            totalPairExtraGap += groupPairExtraGap[key];
        });

        metrics = computeMetrics(totalDomainExtraGap + totalPairExtraGap);
    }

    // Calculate group positions
    const groupPositions = {};
    let currentX = chartWidth * outerPaddingRatio;

    groupKeys.forEach((key, groupIndex) => {
        const qualityGapWidth = groupHasQuality[key] ? metrics.subgroupGap : 0;
        const domainGapsWidth = groupDomainGaps[key] * metrics.subgroupGap;
        const domainExtraGapWidth = groupDomainExtraGap[key] || 0;
        groupPositions[key] = {
            x: currentX,
            width:
                groupBarCounts[key] * metrics.barWidthWithPadding +
                qualityGapWidth +
                domainGapsWidth +
                domainExtraGapWidth,
        };
        currentX +=
            groupBarCounts[key] * metrics.barWidthWithPadding +
            qualityGapWidth +
            domainGapsWidth +
            domainExtraGapWidth;
        if (groupIndex < numGroups - 1)
            currentX += metrics.groupGap + (groupPairExtraGap[key] || 0);
    });

    return {
        groupKeys,
        groupPositions,
        groupBarCounts,
        groupHasQuality,
        groupDomainGaps,
        groupDomainExtraGap,
        groupPairExtraGap,
        groupSortedKeys,
        uniformBarWidth: metrics.uniformBarWidth,
        barWidthWithPadding: metrics.barWidthWithPadding,
        subgroupGap: metrics.subgroupGap,
        groupGap: metrics.groupGap,
    };
}

/**
 * Render a single stacked bar with tooltip, label, and hover effects via createChartStackedBar.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection} g - The group this bar is drawn into.
 * @param {object} spec - Everything that distinguishes this bar from its neighbours.
 * @param {object} spec.data - The row the bar stands for.
 * @param {number} spec.index - Its position in `stackedData`.
 * @param {Array} spec.stackedData - The d3 stack series for all bars.
 * @param {string[]} spec.competencyLevels - The scale's bands, in stack order.
 * @param {(level: string) => string} spec.getColorForLevel - Maps a band to its colour.
 * @param {d3.ScaleLinear<number, number>} spec.yScale - Percentage scale.
 * @param {number} spec.barWidth - Bar width in px.
 * @param {string} spec.labelText - Text above the bar.
 * @param {number} [spec.labelY] - Label offset from the bar's top.
 * @param {boolean} [spec.showLabel] - Whether the label is drawn at all.
 * @param {number|null} [spec.labelSlot] - Width per label line in px; a free-text label is wrapped and fitted to it.
 * @returns {d3.Selection} The bar group, already wired for hover and tooltip.
 */
function renderStackedBar(
    chart,
    g,
    {
        data,
        index,
        stackedData,
        competencyLevels,
        getColorForLevel,
        yScale,
        barWidth,
        labelText,
        labelY = -5,
        showLabel = true,
        labelSlot = null,
    },
) {
    const stackedEntry = stackedData[index];
    const showDomain = getUniqueValues(chart.chartData, (d) => d.domain).length > 1;

    const barGroup = createChartStackedBar(
        g,
        data,
        stackedEntry,
        competencyLevels,
        getColorForLevel,
        { yScale },
        {
            xPosition: 0,
            barWidth,
            cursor: 'default',
            getTooltipContent: (barData, entry, level) => {
                const typeLabel =
                    barData.type === 'class'
                        ? 'Klasse'
                        : barData.type === 'school'
                          ? 'Schule'
                          : 'Landesschnitt';
                return chart.formatTooltipContent(
                    { data: barData, stackedData: entry, level },
                    { type: typeLabel, showDomain },
                );
            },
            tooltipId: COMPETENCY_TOOLTIP_ID,
            hoverEffect: BAR_HOVER_CONFIG,
            // Segment labels: `III · 24 %` where a segment holds it, the level alone
            // where only that fits; the watermark preview stays unlabelled.
            showLabels: !chart.compact,
            minLabelWidth: chart.resolveChartTextSize('base') * LABEL_LINE_HEIGHT,
            labelFormatter: levelShareLabelFormatter,
            showLabel,
            labelText,
            labelY,
            labelFontWeight: 'bold',
            fontFamily: chart.getChartFont(),
            labelColor:
                labelY < 0 ? STYLE_CONFIG.COLORS.TEXT_SECONDARY : STYLE_CONFIG.COLORS.TEXT_PRIMARY,
        },
        chart,
    );

    // Free-text class names are re-drawn wrapped: split over up to two lines
    // (stacked upwards, so the last line keeps the single-line baseline) and
    // each line middle-ellipsed to the bar pitch as a last resort. Fixed tags
    // (`S`, `L1`, domain abbreviations) never split and always fit, so they
    // come back out unchanged.
    if (showLabel && labelText && labelSlot !== null) {
        const labelNode = barGroup.select(labelY < 0 ? 'text.domain-label' : 'text.bar-label');
        const lines = splitLabelLines(labelText);

        if (!labelNode.empty()) {
            const lineHeight = chart.resolveChartTextSize('base') * LABEL_LINE_HEIGHT;
            labelNode.text(null);
            lines.forEach((line, lineIndex) => {
                labelNode
                    .append('tspan')
                    .attr('x', labelNode.attr('x'))
                    .attr('y', labelNode.attr('y'))
                    .attr('dy', `${-(lines.length - 1 - lineIndex) * lineHeight}px`)
                    .text(fitLabelLine(chart, line, labelSlot, { fontWeight: 'bold' }));
            });
        }
    }

    return barGroup;
}
