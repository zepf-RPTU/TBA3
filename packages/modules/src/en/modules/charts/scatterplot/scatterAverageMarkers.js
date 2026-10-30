/**
 * The scatterplot's average markers: the group's own point and one marker per
 * delivered comparison group, each in its role's shape and shade, with the ordinal
 * tag that tells several Landesschnitte apart. One keyed join, run at render and
 * again on zoom, so a marker never changes shape or loses its dot or tag as it moves.
 */

import {
    joinAverageMarkers,
    joinComparisonMarkers,
} from '../../../../common/charts/averageMarkers.js';
import { markerHalfExtent } from '../../../../common/charts/markerSymbols.js';
import {
    comparisonSeriesClass,
    comparisonSeriesVisual,
    markerPaintForIndex,
} from '../../../../common/charts/comparisonSeries.js';
import { AVERAGE_MARKER_SIZE_PX, GROUP_VISUAL } from './scatterplotConstants.js';
import { VALUE_LABEL } from '../../../../common/charts/chartValueLabels.js';
import { applyChartTextSize } from '../../../../common/charts/chartTypography.js';
import { fontWeightToken } from '../../../../common/utils/fontTokens.js';
import { animate } from '../../../../common/charts/motionPreference.js';

/** @typedef {import('./scatterplot.js').Scatterplot} Scatterplot */

/** @typedef {import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup} StyleComparisonGroup */

/**
 * Join the group marker plus one marker per drawn comparison group (`chart.drawnAverages`)
 * at the scales' current domain: drawn on the first call, moved on the next.
 * @param {Scatterplot} chart - The renderer, its scales set to the domain to show.
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g
 * @param {number} durationMs - `0` draws immediately.
 */
export function joinAveragePoints(chart, g, durationMs) {
    const [xDomain, yDomain] = chart.axisDomainIds;
    const { groupAverages, comparisons } = chart.drawnAverages;
    const getX = (/** @type {StyleComparisonGroup} */ group) =>
        chart.xScale(group.domainAverages[xDomain]);
    const getY = (/** @type {StyleComparisonGroup} */ group) =>
        chart.yScale(group.domainAverages[yDomain]);
    const shared = {
        sizePx: AVERAGE_MARKER_SIZE_PX,
        key: (/** @type {{id: string}} */ d) => d.id,
        durationMs,
        transitionName: 'avg',
    };

    // Comparison groups first, in payload order, so the group marker is painted
    // last and stays visible over a comparison it coincides with.
    joinComparisonMarkers(chart, g, chart.comparisons, {
        ...shared,
        baseClass: 'comparison-average-point',
        dataFor: (group) => (comparisons.includes(group) ? [group] : []),
        getX,
        getY,
        tooltipFor: (group) => ({
            getTooltipContent: () =>
                chart.formatAverageTooltipContent(group.name, group.domainAverages),
        }),
    });

    joinAverageMarkers(chart, g, groupAverages ? [{ id: 'group' }] : [], {
        ...shared,
        selector: 'group-average-point',
        classFn: () => 'group-average-point',
        shape: GROUP_VISUAL.symbol,
        getX: () => chart.xScale(chart.groupAverages[xDomain]),
        getY: () => chart.yScale(chart.groupAverages[yDomain]),
        // The first, filled form of a comparison marker, in the group's colour.
        paint: markerPaintForIndex(GROUP_VISUAL.color, 0),
        visible: () => true,
        tooltip: {
            // Drawn only from the group's own aggregation, which names it.
            getTooltipContent: () =>
                chart.formatAverageTooltipContent(
                    /** @type {string} */ (chart.groupName),
                    chart.groupAverages,
                ),
        },
    });

    joinMarkerTags(
        chart,
        g,
        comparisons.filter((group) => group.shortLabel),
        { getX, getY, durationMs },
    );
}

/**
 * Tag each comparison marker with its ordinal (`L1`, `L2`, …).
 *
 * Only drawn when the payload delivers several groups of one type: those markers
 * share a shape and differ only in shade, so the ordinal on the mark is what the
 * legend's `L1 = …` decodes. The tag sits clear of its marker's right edge,
 * slightly above its centre, and moves with it on zoom.
 * @param {Scatterplot} chart
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g
 * @param {StyleComparisonGroup[]} groups
 * @param {{getX: (group: StyleComparisonGroup) => number, getY: (group: StyleComparisonGroup) => number, durationMs: number}} spec - `getX`/`getY` give the marker's centre.
 */
function joinMarkerTags(chart, g, groups, { getX, getY, durationMs }) {
    const place = (
        /** @type {d3.Selection<SVGTextElement, StyleComparisonGroup, any, any>} */ sel,
    ) =>
        sel
            .attr(
                'x',
                (group) =>
                    getX(group) +
                    markerHalfExtent(comparisonSeriesVisual(group).symbol, AVERAGE_MARKER_SIZE_PX) +
                    VALUE_LABEL.gapPx,
            )
            .attr('y', (group) => getY(group) - VALUE_LABEL.gapPx);

    /** @type {d3.Selection<SVGTextElement, StyleComparisonGroup, SVGGElement, unknown>} */ (
        g.selectAll('.comparison-average-tag')
    )
        .data(groups, (group) => group.id)
        .join(
            (enter) => {
                const tag = place(
                    enter
                        .append('text')
                        // The marker's series class, so the tag fades with it.
                        .attr(
                            'class',
                            (group) =>
                                `comparison-average-tag ${comparisonSeriesClass(chart.comparisons.indexOf(group))}`,
                        )
                        .attr('text-anchor', 'start')
                        .style('fill', 'var(--text-color)')
                        .style('font-weight', fontWeightToken('bold'))
                        // Hoverable, the tags would swallow the tooltips of the points
                        // beneath them. An attribute, not an inline style, so a
                        // visibility pass that clears the style on show leaves it inert.
                        .attr('pointer-events', 'none')
                        .style('opacity', (group) => (chart.visibilityState[group.id] ? 1 : 0))
                        .text((group) => group.shortLabel),
                );
                applyChartTextSize(tag, 'sm');
                return tag;
            },
            (update) => {
                place(animate(update, { durationMs, name: 'avg' }));
                return update;
            },
        );
}
