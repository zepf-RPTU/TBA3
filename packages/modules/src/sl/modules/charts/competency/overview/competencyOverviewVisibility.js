/**
 * What a legend toggle does to the drawn overview chart: re-solving the band scales for
 * the visible Fächer and bar types and animating the groups into place, or re-stacking
 * the KS segments inside every bar. Reads the datum the render left on the SVG.
 */

import { motionDuration } from '../../../../../common/charts/motionPreference.js';
import { CHART_CONFIG, STYLE_CONFIG } from '../shared/competencyChartConstants.js';
import {
    applyKsSegmentPositions,
    computeKsSegmentPositions,
    KS_SEGMENT_RECTS,
} from '../shared/competencyKsGeometry.js';
import { renderOverviewAxisLabels } from './competencyOverviewAxes.js';
import * as d3 from 'd3';
import { glossaryAnnotator } from '../../../../../common/glossary/glossaryAnnotator.js';

/**
 * Gets visible bar types for overview mode's sub-scale recalculation.
 * @param {object} visibilityState - The legend state (`comparison` and `individual-class` groups).
 * @param {string[]} uniqueClassNames - Sorted class names
 * @param {string[]} stateKeys - State-track render keys, one per delivered Landesschnitt
 * @returns {string[]} Array of visible type keys
 */
export function getVisibleBarTypes(visibilityState, uniqueClassNames, stateKeys) {
    const visibleTypes = stateKeys.filter((key) => visibilityState.comparison?.[key] !== false);
    if (visibilityState.comparison?.school !== false) visibleTypes.push('school');

    let visibleClassIndex = 0;
    uniqueClassNames.forEach((className) => {
        if (visibilityState['individual-class']?.[className] !== false) {
            visibleTypes.push(`class-${visibleClassIndex}`);
            visibleClassIndex++;
        }
    });

    return visibleTypes;
}

/**
 * Recalculate scales from visibility state and animate the chart layout.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {string} containerId - Id of the chart container, from which the live SVG is re-selected.
 * @param {object} visibilityState - The live toggle state.
 * @param {number} [duration] - Transition length in ms; defaults to the chart animation.
 */
export function updateChartVisibility(
    chart,
    containerId,
    visibilityState,
    duration = CHART_CONFIG.ANIMATION.DURATION,
) {
    const svg = d3.select(`#${containerId} svg`);
    const chartData = svg.datum();

    if (!chartData) return;

    // Determine visible domains (subject filtering)
    const visibleDomains = chartData.chartData
        .filter((d) => visibilityState.subject[d.subject] !== false)
        .map((d) => d.domain);
    const displayDomainByKey = new Map(
        chartData.chartData.map((d) => [d.domain, d.displayDomain || d.domain]),
    );

    // Determine visible bar types
    const visibleTypes = getVisibleBarTypes(
        visibilityState,
        chartData.uniqueClassNames,
        (chartData.stateTracks ?? []).map((track) => track.key),
    );
    const nothingVisible = visibleDomains.length === 0 || visibleTypes.length === 0;

    // Empty state overlay
    let overlay = svg.select('.no-data-overlay');
    if (nothingVisible) {
        if (overlay.empty()) {
            overlay = chart.renderNoDataOverlay(svg, {
                className: 'no-data-overlay',
                x: chartData.width / 2 + chartData.margin.left,
                y: chartData.height / 2 + chartData.margin.top,
                fill: STYLE_CONFIG.COLORS.TEXT_SECONDARY,
                message: glossaryAnnotator.getRequiredEntryText('general.messages.no-data'),
            });
        }
        overlay.style('display', null);
    } else if (!overlay.empty()) {
        chart.clearNoDataOverlay(svg, 'no-data-overlay');
    }

    // Rebuild xScale with only visible domains
    const newXScale = d3
        .scaleBand()
        .domain(visibleDomains)
        .range([0, chartData.width])
        .padding(CHART_CONFIG.PADDING.X_SCALE);

    // Rebuild sub-scale for visible bar types
    const newXSubScale = d3
        .scaleBand()
        .domain(visibleTypes)
        .range([0, newXScale.bandwidth()])
        .padding(CHART_CONFIG.PADDING.X_SUB_SCALE);

    // Animate domain groups to new positions or hide them
    svg.selectAll('.domain-group').each(function () {
        const group = d3.select(this);
        const domainData = group.datum();
        const isVisible = visibilityState.subject[domainData.subject] !== false;

        if (isVisible) {
            const newX = newXScale(domainData.domain);
            group
                .style('display', 'block')
                .transition()
                .duration(motionDuration(duration))
                .attr('transform', `translate(${newX}, 0)`)
                .style('opacity', 1)
                .style('pointer-events', 'auto');

            // Update bar widths within this domain group
            group.attr('data-bandwidth', newXScale.bandwidth());
        } else {
            group
                .transition()
                .duration(motionDuration(duration))
                .style('opacity', 0)
                .style('pointer-events', 'none')
                .on('end', function () {
                    d3.select(this).style('display', 'none');
                });
        }
    });

    // Rebuild x-axis labels
    const xAxisGroup = svg.select('.x-axis-custom');
    renderOverviewAxisLabels(chart, xAxisGroup, visibleDomains, newXScale, displayDomainByKey, {
        initialOpacity: 0,
        fadeInDuration: duration / 2,
    });

    // Update x-axis line width
    xAxisGroup
        .select('line')
        .transition()
        .duration(motionDuration(duration))
        .attr('x2', newXScale.range()[1]);

    // Animate bar groups within each visible domain
    const stateTracks = chartData.stateTracks ?? [];
    stateTracks.forEach((track, index) => {
        animateBarGroup(
            chart,
            svg,
            `.state-average-bar-group.state-average-${index}`,
            visibilityState.comparison[track.key] !== false,
            newXSubScale,
            track.key,
            (d) => d.hasData,
            duration,
        );
    });
    animateBarGroup(
        chart,
        svg,
        '.school-bar-group',
        visibilityState.comparison.school !== false,
        newXSubScale,
        'school',
        undefined,
        duration,
    );

    let visibleClassIndex = 0;
    chartData.uniqueClassNames.forEach((className) => {
        const isClassVisible = visibilityState['individual-class'][className] !== false;
        const classKey = isClassVisible ? `class-${visibleClassIndex}` : null;

        animateBarGroup(
            chart,
            svg,
            `.class-bar-group[data-class-name="${CSS.escape(className)}"]`,
            isClassVisible,
            newXSubScale,
            classKey,
            undefined,
            duration,
        );

        if (isClassVisible) {
            visibleClassIndex++;
        }
    });
}

/**
 * Restack visible KS segments within each bar after a competency-level toggle.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {d3.Selection} svg - The chart root holding the bars.
 * @param {object} visibilityState - The live toggle state.
 * @param {any} chartData - The datum bound to the SVG, read for the plot height the scale is rebuilt from.
 * @param {Map<string,string>} ksLevelToGroup - Level → legend group of this render.
 * @param {number} [duration] - Transition length in ms; defaults to the chart animation.
 */
export function updateKsSegmentVisibility(
    chart,
    svg,
    visibilityState,
    chartData,
    ksLevelToGroup,
    duration = CHART_CONFIG.ANIMATION.DURATION,
) {
    const yScale = d3.scaleLinear().domain([0, 100]).range([chartData.height, 0]);

    const apply = (selection, distribution) =>
        applyKsSegmentPositions(
            selection,
            computeKsSegmentPositions(
                ksLevelToGroup,
                visibilityState['competency-level'],
                distribution || {},
                yScale,
            ),
            yScale,
            duration,
        );

    svg.selectAll('.domain-group').each(function (domainEntry, i) {
        const data = chartData.chartData[i];
        if (!data) return;
        const domainGroup = d3.select(this);
        (data.stateDistributions || []).forEach((state) => {
            apply(
                domainGroup.selectAll(
                    `.state-average-bar-group[data-state-key="${CSS.escape(state.key)}"] ${KS_SEGMENT_RECTS}`,
                ),
                state.distribution,
            );
        });
        apply(domainGroup.selectAll(`.school-bar-group ${KS_SEGMENT_RECTS}`), data.distribution);
        (data.classDistributions || []).forEach((cls) => {
            apply(
                domainGroup.selectAll(
                    `.class-bar-group[data-class-name="${CSS.escape(cls.className)}"] ${KS_SEGMENT_RECTS}`,
                ),
                cls.distribution,
            );
        });
    });
}

/**
 * Animate bar group position, width, and label position on visibility toggle.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {d3.Selection} svg - The chart root holding the bars.
 * @param {string} selector - Selects the bar groups this call moves.
 * @param {boolean} isVisible - Whether the group stays shown.
 * @param {any} newXSubScale - The re-solved inner band scale.
 * @param {string|null} scaleKey - The group's slot in that scale; `null` for a group being hidden, which is collapsed to the origin instead of positioned.
 * @param {Function} [hasData] - Per-datum test; a group with no data is faded out rather than moved.
 * @param {number} [duration] - Transition length in ms; defaults to the chart animation.
 */
function animateBarGroup(
    chart,
    svg,
    selector,
    isVisible,
    newXSubScale,
    scaleKey,
    hasData = (_datum) => true,
    duration = CHART_CONFIG.ANIMATION.DURATION,
) {
    const transform =
        isVisible && scaleKey ? `translate(${newXSubScale(scaleKey)}, 0)` : 'translate(0, 0)';

    const bandwidth = newXSubScale.bandwidth();
    const halfBandwidth = bandwidth / 2;

    const elements = svg.selectAll(selector);
    const barRects = svg.selectAll(`${selector} rect`);
    const textLabels = svg.selectAll(`${selector} text.bar-label, ${selector} text.domain-label`);

    elements
        .style('display', (d) => (isVisible && hasData(d) ? 'block' : 'none'))
        .transition()
        .duration(motionDuration(duration))
        .attr('transform', transform);

    barRects.transition().duration(motionDuration(duration)).attr('width', bandwidth);

    textLabels.transition().duration(motionDuration(duration)).attr('x', halfBandwidth);

    // Wrapped class labels carry their x on tspans, which do not inherit the
    // parent text's — recentre them too or only the first line would move.
    svg.selectAll(`${selector} text.bar-label tspan`)
        .transition()
        .duration(motionDuration(duration))
        .attr('x', halfBandwidth);
}
