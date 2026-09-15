/**
 * What a legend toggle does to the drawn detail chart: redistributing the bars over the
 * freed width when a Domäne, a comparison track or a class is hidden, re-stacking the KS
 * segments inside every bar when a Kompetenzstufe is, and sliding the D0/D1 domain labels
 * after their bars. Reads the datum and the `data-sub-key` attributes the render left on
 * the SVG; the predicates deciding what stays visible are pure.
 */

import { motionDuration } from '../../../../../common/charts/motionPreference.js';
import { CHART_CONFIG } from '../shared/competencyChartConstants.js';
import {
    KS_SEGMENT_RECTS,
    applyKsSegmentPositions,
    computeKsSegmentPositions,
} from '../shared/competencyKsGeometry.js';
import { getSortedClassNames, isStateRenderKey } from './competencyDetailLegend.js';
import { updateTeachingQualityLayout } from './competencyTeachingQuality.js';
import * as d3 from 'd3';

/** Selector for bar labels (used in visibility updates) */
const BAR_LABEL_SELECTOR = 'text.domain-label, text.bar-label, text.teaching-quality-label';

/**
 * Redistributes bars to fill available space evenly when some are hidden.
 * Local to this module; the overview redistributes via getVisibleBarTypes + an xSubScale recalc instead.
 * @param {Array} bars - Array of bar objects with {group, subKey, visible} properties
 * @param {number} barWidthWithPadding - Original bar width including padding
 * @param {number} duration - Animation duration in ms
 * @param {number} paddingRatio - Padding ratio between bars
 * @param {boolean} scaleWidth - Whether to scale bar widths (true for multi-domain, false for single-domain)
 * @param {Function|null} [updateTeachingQualityLayoutFn] - Callback to update TQ layout (detail only, null for overview)
 * @returns {number|null} New bar width (if scaleWidth is true), or null
 */
function redistributeBars(
    bars,
    barWidthWithPadding,
    duration,
    paddingRatio,
    scaleWidth,
    updateTeachingQualityLayoutFn = null,
) {
    duration = motionDuration(duration);
    const visibleBars = bars.filter((b) => b.visible);

    if (visibleBars.length === 0) {
        bars.forEach((bar) => {
            bar.group
                .transition()
                .duration(duration)
                .style('opacity', 0)
                .style('pointer-events', 'none');
        });
        return null;
    }

    const totalWidth = bars.length * barWidthWithPadding;
    const newBarWidthWithPadding = totalWidth / visibleBars.length;
    const newBarWidth = scaleWidth
        ? newBarWidthWithPadding * (1 - paddingRatio)
        : newBarWidthWithPadding;

    let visibleIndex = 0;
    bars.forEach((bar) => {
        if (bar.visible) {
            const newX = visibleIndex * newBarWidthWithPadding;

            bar.group
                .transition()
                .duration(duration)
                .attr('transform', `translate(${newX}, 0)`)
                .style('opacity', 1)
                .style('pointer-events', 'auto');

            if (scaleWidth) {
                const isTeachingQuality = bar.subKey === 'teachingQuality';

                if (isTeachingQuality && updateTeachingQualityLayoutFn) {
                    updateTeachingQualityLayoutFn(bar.group, newBarWidth, duration);
                } else if (!isTeachingQuality) {
                    bar.group
                        .selectAll('rect')
                        .transition()
                        .duration(duration)
                        .attr('width', newBarWidth);
                }

                bar.group
                    .selectAll(BAR_LABEL_SELECTOR)
                    .transition()
                    .duration(duration)
                    .attr('x', newBarWidth / 2);
            }

            visibleIndex++;
        } else {
            bar.group
                .transition()
                .duration(duration)
                .style('opacity', 0)
                .style('pointer-events', 'none');
        }
    });

    return scaleWidth ? newBarWidth : null;
}

/**
 * Apply the legend state to the SVG. A Kompetenzstufen change re-stacks the
 * segments inside every bar; a domain/comparison/class change redistributes
 * the bars. With no `group` both run — the re-render path, restoring a
 * viewer's earlier toggles on a fresh chart.
 * @param {object} renderer - The chart renderer whose bars are restyled.
 * @param {object} state - The legend state (`domain`, `comparison`, `individual-class`, `competency-level` groups).
 * @param {object} context - What this render's geometry depends on.
 * @param {object} context.groupingConfig - How the bars group.
 * @param {Map<string,string>|null} context.ksLevelToGroup - Level → legend group of this render.
 * @param {(value: number) => number} context.yScale - The bar y-scale of this render.
 * @param {string|null} context.group - The legend group that changed, or null to apply everything.
 * @param {number} [context.duration] - Transition length in ms; defaults to the chart animation.
 */
export function applyDetailLegendState(
    renderer,
    state,
    { groupingConfig, ksLevelToGroup, yScale, group, duration = CHART_CONFIG.ANIMATION.DURATION },
) {
    if (group === null || group === 'competency-level') {
        updateDetailKsSegmentVisibility(renderer, state, ksLevelToGroup, yScale, duration);
    }
    if (group !== 'competency-level') {
        const svg = d3.select(`#${renderer.containerId} svg`);
        updateDetailChartVisibility(
            svg,
            renderer.chartData,
            state,
            groupingConfig,
            getSortedClassNames(renderer.chartData),
            duration,
        );
    }
}

/**
 * Restack visible KS segments within each bar after a competency-level toggle.
 *
 * `yScale` is passed in rather than read off the renderer. It used to be taken
 * from a `_detailRenderState` field that only the teaching-quality axis ever
 * populated, so on any chart without Unterrichtsqualität data it was `null` and
 * every KS toggle was silently swallowed here. That field is gone; the scale now
 * comes from the render that built this legend.
 * @param {object} renderer - The chart renderer whose segments are re-stacked.
 * @param {object} visibilityState - The legend state.
 * @param {Map<string,string>|null} ksLevelToGroup - Level → legend group; without it there is nothing to re-stack.
 * @param {((value: number) => number)|null} yScale - The bar y-scale of this render.
 * @param {number} duration - Transition length in ms.
 */
function updateDetailKsSegmentVisibility(
    renderer,
    visibilityState,
    ksLevelToGroup,
    yScale,
    duration,
) {
    if (!ksLevelToGroup || !yScale) return;

    const svg = d3.select(`#${renderer.containerId} svg`);
    svg.selectAll('.bar-group').each(function () {
        const data = d3.select(this).datum();
        if (!data?.distribution) return;
        const positions = computeKsSegmentPositions(
            ksLevelToGroup,
            visibilityState['competency-level'] ?? {},
            data.distribution,
            yScale,
        );
        applyKsSegmentPositions(
            d3.select(this).selectAll(KS_SEGMENT_RECTS),
            positions,
            yScale,
            duration,
        );
    });
}

/**
 * Drive bar redistribution animation based on current visibility toggle state.
 * @param {d3.Selection} svg - The chart root holding the bars.
 * @param {Array<object>} chartData - The prepared rows.
 * @param {object} visibilityState - The legend state.
 * @param {object} groupingConfig - How the bars group.
 * @param {string[]} uniqueClassNames - The classes present.
 * @param {number} animationDuration - Transition length in ms.
 */
function updateDetailChartVisibility(
    svg,
    chartData,
    visibilityState,
    groupingConfig,
    uniqueClassNames,
    animationDuration,
) {
    const paddingRatio = CHART_CONFIG.PADDING.BAR_PADDING_RATIO;

    const isDomainBasedVisibility = !groupingConfig.groupBySubject;

    const hasDomainGroups = svg.selectAll('.domain-group').size() > 0;
    const hasSubBarGroups = svg.selectAll('.sub-bar-group').size() > 0;

    const storedData = svg.select('g').datum() || {};

    // Single-domain mode
    if (!hasDomainGroups && !hasSubBarGroups) {
        const barWidthWithPadding = storedData.barWidthWithPadding || 50;

        const allBars = [];
        svg.selectAll('.bar-group').each((_, i, nodes) => {
            const group = d3.select(nodes[i]);
            const data = chartData[i];
            if (!data) return;

            const subKey =
                data.type === 'landesschnitt'
                    ? 'landesschnitt'
                    : data.type === 'school'
                      ? 'school'
                      : 'class';
            allBars.push({
                group,
                data,
                subKey,
                visible: isBarVisible(
                    subKey,
                    data,
                    visibilityState,
                    isDomainBasedVisibility,
                    groupingConfig,
                    uniqueClassNames,
                ),
            });
        });

        redistributeBars(allBars, barWidthWithPadding, animationDuration, paddingRatio, false);
        return;
    }

    // Multi-domain mode
    const uniformBarWidth = storedData.uniformBarWidth || 30;
    const barWidthWithPadding = storedData.barWidthWithPadding || uniformBarWidth * 1.1;

    svg.selectAll('.domain-group').each((_, i, nodes) => {
        const domainGroup = d3.select(nodes[i]);

        const subBars = [];
        domainGroup.selectAll('.sub-bar-group').each((_, j, subNodes) => {
            const subGroup = d3.select(subNodes[j]);
            const subKey = subGroup.attr('data-sub-key');
            if (!subKey) return;

            let matchingData = null;
            if (subKey === 'teachingQuality') {
                matchingData = { type: 'teachingQuality' };
            } else if (groupingConfig.groupBySubject) {
                const baseType = subKey.replace(/_d\d$/, '');
                matchingData = chartData.find(
                    (d) => d.type === baseType || d.type === subKey || d.renderKey === baseType,
                );
            } else {
                matchingData = chartData.find(
                    (d) => `${d.subject}|${d.domainLabel}` === subKey || d.name === subKey,
                );
            }

            subBars.push({
                group: subGroup,
                subKey,
                data: matchingData,
                visible: isBarVisible(
                    subKey,
                    matchingData,
                    visibilityState,
                    isDomainBasedVisibility,
                    groupingConfig,
                    uniqueClassNames,
                ),
            });
        });

        const updateTQLayout = (group, newBarWidth, dur) =>
            updateTeachingQualityLayout(group, newBarWidth, dur);
        const newBarWidth = redistributeBars(
            subBars,
            barWidthWithPadding,
            animationDuration,
            paddingRatio,
            true,
            updateTQLayout,
        );

        if (newBarWidth && groupingConfig.groupBySubject) {
            const visibleSubBars = subBars.filter((b) => b.visible);
            const originalGroupWidth = subBars.length * barWidthWithPadding;
            const newBarWidthWithPadding =
                visibleSubBars.length > 0
                    ? originalGroupWidth / visibleSubBars.length
                    : barWidthWithPadding;
            updateDomainLabelsPosition(
                domainGroup,
                subBars,
                newBarWidthWithPadding,
                newBarWidth,
                animationDuration,
            );
        }
    });
}

/**
 * Dispatch: check if a sub-bar (domain or type) should be visible given current toggle state.
 * @param {string} subKey - The bar's key within its group.
 * @param {object} data - The row the bar stands for.
 * @param {object} visibilityState - The live toggle state.
 * @param {boolean} isDomainBasedVisibility - Whether the pills toggle Domänen rather than row types.
 * @param {object} groupingConfig - How the bars group.
 * @param {string[]} uniqueClassNames - The classes present.
 * @returns {boolean} True when the bar should be drawn.
 */
function isBarVisible(
    subKey,
    data,
    visibilityState,
    isDomainBasedVisibility,
    groupingConfig,
    uniqueClassNames,
) {
    if (subKey === 'teachingQuality') {
        return visibilityState.comparison?.teachingQuality !== false;
    }
    if (isDomainBasedVisibility) {
        return isDomainBarVisible(subKey, data, visibilityState);
    }
    return isTypeBarVisible(subKey, visibilityState, groupingConfig, uniqueClassNames);
}

/**
 * Check visibility for a domain-based sub-bar key (e.g. 'school_d1').
 * @param {string} subKey - The bar's key within its group.
 * @param {object} data - The row the bar stands for, read for its Fach and Domäne.
 * @param {object} visibilityState - The live toggle state.
 * @returns {boolean} True when the bar's Fach/Domäne pill is on.
 */
function isDomainBarVisible(subKey, data, visibilityState) {
    const domains = visibilityState.domain ?? {};
    if (data && data.subject && data.domainLabel) {
        const compositeKey = `${data.subject}|${data.domainLabel}`;
        if (domains[compositeKey] !== undefined) {
            return domains[compositeKey] !== false;
        }
        return domains[data.domainLabel] !== false;
    }
    const parts = subKey.split('|');
    if (parts.length === 2) {
        if (domains[subKey] !== undefined) {
            return domains[subKey] !== false;
        }
        return domains[parts[1]] !== false;
    }
    return true;
}

/**
 * Check visibility for a type-based sub-bar key (landesschnitt/school/class).
 * @param {string} subKey - The bar's key within its group.
 * @param {object} visibilityState - The live toggle state.
 * @param {object} groupingConfig - How the bars group.
 * @param {string[]} uniqueClassNames - The classes present.
 * @returns {boolean} True when the bar's type pill is on.
 */
function isTypeBarVisible(subKey, visibilityState, groupingConfig, uniqueClassNames) {
    const subKeyLower = subKey.toLowerCase();
    // One state track per delivered Landesschnitt: the sub-scale key is the track's
    // own render key (optionally domain-suffixed), and that is the key its legend
    // pill toggles. Reading `visibilityState.landesschnitt` here would read a key no
    // pill ever writes, leaving every state bar permanently visible.
    const comparison = visibilityState.comparison ?? {};
    const stateBaseKey = subKey.replace(/_d\d$/, '');
    if (isStateRenderKey(stateBaseKey)) {
        return comparison[stateBaseKey] !== false;
    }
    if (subKeyLower.startsWith('landesschnitt') || subKey === 'Landesschnitt') {
        return comparison.landesschnitt !== false;
    }
    if (subKeyLower.startsWith('school') || subKey === 'Schulschnitt') {
        return comparison.school !== false;
    }
    if (
        subKeyLower.startsWith('class') ||
        subKey.includes('|') ||
        uniqueClassNames.includes(subKey)
    ) {
        // Without a Klassen section (one class) there is nothing to hide.
        const classes = visibilityState['individual-class'];
        if (!classes) return true;
        if (groupingConfig.groupBySubject) {
            if (uniqueClassNames.length === 1) {
                return classes[uniqueClassNames[0]] !== false;
            }
            return Object.values(classes).some((v) => v);
        }
        if (groupingConfig.groupByDomain && uniqueClassNames.includes(subKey)) {
            return classes[subKey] !== false;
        }
        return true;
    }
    return true;
}

/**
 * Animate D0/D1 domain label positions when bars are shown/hidden in subject-grouped mode.
 * @param {d3.Selection} domainGroup - The group holding this subject's bars and labels.
 * @param {Array<object>} subBars - The group's bars with their current visibility.
 * @param {number} barWidthWithPadding - New pitch between visible bars.
 * @param {number} barWidth - New bar width in px.
 * @param {number} duration - Transition length in ms.
 */
function updateDomainLabelsPosition(domainGroup, subBars, barWidthWithPadding, barWidth, duration) {
    duration = motionDuration(duration);
    let visibleIndex = 0;
    const d0Positions = [];
    const d1Positions = [];

    subBars
        .filter((b) => b.visible)
        .forEach((bar) => {
            const newX = visibleIndex * barWidthWithPadding;
            if (bar.subKey.endsWith('_d0')) d0Positions.push(newX);
            else if (bar.subKey.endsWith('_d1')) d1Positions.push(newX);
            visibleIndex++;
        });

    const d0Label = domainGroup.select('.domain-label[data-domain="d0"]');
    if (!d0Label.empty()) {
        if (d0Positions.length > 0) {
            const d0Left = Math.min(...d0Positions);
            const d0Right = Math.max(...d0Positions) + barWidth;
            d0Label
                .transition()
                .duration(duration)
                .attr('x', (d0Left + d0Right) / 2)
                .style('opacity', 1);
        } else {
            d0Label.transition().duration(duration).style('opacity', 0);
        }
    }

    const d1Label = domainGroup.select('.domain-label[data-domain="d1"]');
    if (!d1Label.empty()) {
        if (d1Positions.length > 0) {
            const d1Left = Math.min(...d1Positions);
            const d1Right = Math.max(...d1Positions) + barWidth;
            d1Label
                .transition()
                .duration(duration)
                .attr('x', (d1Left + d1Right) / 2)
                .style('opacity', 1);
        } else {
            d1Label.transition().duration(duration).style('opacity', 0);
        }
    }
}
