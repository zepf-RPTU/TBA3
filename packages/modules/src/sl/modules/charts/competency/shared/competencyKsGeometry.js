/**
 * Kompetenzstufen segment geometry.
 *
 * `computeKsSegmentPositions` is pure (see tests/unit/sl/modules/charts/competency/shared/ksSegmentRestack.test.js);
 * `applyKsSegmentPositions` is the D3 applier that writes its output to a selection.
 */

import { motionDuration } from '../../../../../common/charts/motionPreference.js';
import {
    SVG_BAR_CONFIG,
    computeStackedBarRects,
} from '../../../../../common/charts/stackedBarUtils.js';
import * as d3 from 'd3';

/** The rects a KS re-stack has to move, keyed by `data-level`. */
export const KS_SEGMENT_RECTS = 'rect.bar-segment.competency-level';

/**
 * Compute per-level `{ y, height }` positions for a single bar's KS segments,
 * collapsing levels whose legend group is toggled off and re-stacking the
 * remainder from the baseline. Shared by both renderers' competency-level toggle.
 * @param {Map<string,string>} ksLevelToGroup - raw level -> legend group
 * @param {{[group: string]: boolean}} groupVisibility - Per legend group, whether it is on; `false` collapses its levels.
 * @param {object} distribution - level -> percentage
 * @param {function(number): number} yScale - d3 linear scale (0..100 -> px)
 * @returns {Map<string,{y:number,height:number}>} Per level, where its rect goes; a hidden level gets a zero-height rect at the baseline rather than being removed.
 */
export function computeKsSegmentPositions(ksLevelToGroup, groupVisibility, distribution, yScale) {
    const segments = [...ksLevelToGroup].map(([rawLevel, group]) => ({
        field: rawLevel,
        value: distribution[rawLevel] ?? 0,
        group,
    }));

    // Same geometry authority as the initial render (createSVGStackedBar), so a
    // legend-toggle re-stack cannot drift from the first paint again. The gap is
    // passed explicitly to make the shared-constant coupling visible.
    const rects = computeStackedBarRects(segments, {
        positionScale: yScale,
        bandSize: 0,
        isHorizontal: false,
        gap: SVG_BAR_CONFIG.segmentGap,
        isVisible: (segment) => groupVisibility[segment.group] !== false,
    });

    return new Map(rects.map((rect) => [rect.segment.field, { y: rect.y, height: rect.height }]));
}

/**
 * Animate a selection of KS bar-segment rects to the positions computed by
 * {@link computeKsSegmentPositions}, keyed by each rect's `data-level`. A segment's
 * label, which sits beside the rect in its segment group, follows it and fades out
 * while the segment is collapsed.
 * @param {d3.Selection} selection - The segment rects to animate.
 * @param {Map<string,{y: number, height: number}>} positions - Target geometry per level.
 * @param {Function} yScale - Percentage scale, used for the baseline a level with no computed position falls back to.
 * @param {number} duration - Transition length in ms, passed through the motion-preference filter.
 */
export function applyKsSegmentPositions(selection, positions, yScale, duration) {
    duration = motionDuration(duration);
    selection
        .transition()
        .duration(duration)
        .attr('y', function () {
            return positions.get(this.getAttribute('data-level'))?.y ?? yScale(0);
        })
        .attr('height', function () {
            return positions.get(this.getAttribute('data-level'))?.height ?? 0;
        });

    selection.each(function () {
        const label = d3.select(this.parentNode).select('text.bar-label');
        if (label.empty()) return;
        const position = positions.get(this.getAttribute('data-level'));
        const height = position?.height ?? 0;
        const centre = position ? position.y + height / 2 : yScale(0);
        // The label's `y` is its first-paint centre and is never rewritten, so the
        // offset is absolute and stays right across any number of toggles.
        const shift = centre - Number(label.attr('y'));
        label
            .transition()
            .duration(duration)
            .attr('transform', `translate(0, ${shift})`)
            .style('opacity', height > 0 ? 1 : 0);
    });
}
