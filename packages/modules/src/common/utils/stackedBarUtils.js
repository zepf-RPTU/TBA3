/**
 * Segments and stacked-bar geometry (`buildStackedSegments`, `computeStackedBarRects`).
 */

import { getCompetenceAppearance } from '../services/themeService.js';
import { formatPercent } from './numberFormat.js';

/**
 * One stacked segment as `buildStackedSegments` produces it: its
 * field, label and share of the bar, which is what a bar stacks by. Callers hang more
 * on it (`group`, `count`, `metadata`, …), hence the open tail.
 * @typedef {{
 *   field: string,
 *   label: string,
 *   percentage: number,
 *   color?: string,
 *   appearance?: import('../services/competenceLevelPaint.js').CompetenceAppearance|null,
 *   [extra: string]: any,
 * }} StackedSegment
 */

/**
 * Surface gap shown between adjacent stacked fills. The DOM bars stamp it as
 * --stacked-bar-segment-gap (stackedBarCell.js), so both draw the same gap.
 */
export const SEGMENT_GAP_PX = 2;

/**
 * A segment's share of its bar as whole percent, `32 %`.
 * @param {{percentage: number}} segment
 * @returns {string}
 */
export function formatSegmentShare(segment) {
    return formatPercent(segment.percentage, 0);
}

/**
 * The tiered segment label every stacked competence bar uses: `A2 · 32 %` when the
 * renderer has room for it on one line, `['A2', '32 %']` for a tall vertical
 * segment that only holds it on two, the level alone otherwise (see
 * `SegmentLabelFormatter`).
 * @param {{label?: string, field?: string, percentage: number}} segment
 * @param {{withShare?: boolean, lines?: boolean}} [tier] - Whether the share goes beside the level, and whether as separate lines.
 * @returns {string | string[]}
 */
export function levelShareLabelFormatter(segment, { withShare = false, lines = false } = {}) {
    const level = segment.label || segment.field || '';
    if (!withShare) return level;
    const share = formatSegmentShare(segment);
    return lines ? [level, share] : `${level} \u00b7 ${share}`;
}

/**
 * Inset a stacked segment along the stacking axis so a `SEGMENT_GAP_PX` strip of the
 * surface shows between adjacent fills.
 *
 * The inset is symmetric, so segment centers (and labels) stay put. A segment thinner
 * than the gap is left alone so it does not vanish.
 * @param {number} base Position along the stacking axis before insetting.
 * @param {number} size Extent along the stacking axis before insetting.
 * @returns {{ pos: number, size: number }}
 */
function insetStackedSegment(base, size) {
    return size > SEGMENT_GAP_PX
        ? { pos: base + SEGMENT_GAP_PX / 2, size: size - SEGMENT_GAP_PX }
        : { pos: base, size };
}

/**
 * Builds stacked-bar segments from a per-level entry: one per level, in stacking order,
 * its `percentage` read from `entry[level]`.
 * Each competence level gets its band `appearance` (null for none) and its colour (the
 * neutral bar colour for none) here, resolved on the entry's string `scaleId` when it
 * carries one (a page can hold two ladders sharing a level name), on the
 * bare name otherwise.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {{[key: string]: any}} entry - Per-level shares (e.g. `{ I: 40, II: 60 }`)
 * @param {string[]} levels - Level keys in stacking order
 * @param {object} [options]
 * @param {{[level: string]: number}} [options.counts] - Headcount per level; stamps each segment's `count`, and `total`.
 * @param {number} [options.total] - The headcount the counts are of.
 * @returns {StackedSegment[]} Canonical stacked segments (unfiltered)
 */
export function buildStackedSegments(palette, entry, levels, { counts, total } = {}) {
    const scaleId = typeof entry?.scaleId === 'string' ? entry.scaleId : undefined;

    return levels.map((levelKey) => {
        const appearance = getCompetenceAppearance(palette, levelKey, scaleId);
        /** @type {StackedSegment} */
        const segment = {
            field: levelKey,
            label: levelKey,
            percentage: entry[levelKey] ?? 0,
            color: appearance?.baseColor ?? 'var(--default-bar-color)',
            appearance,
        };
        if (counts) {
            segment.count = counts[levelKey] ?? 0;
            segment.total = total;
        }
        return segment;
    });
}

/**
 * The rects of a stacked bar: stacks the segments by their `percentage`, contiguously
 * and in order, and applies the position scale, the orientation and the surface-gap
 * inset. Every path that positions stacked segments goes through it, so all
 * of them draw the same gaps. An
 * empty segment collapses to a zero-size rect at the baseline.
 *
 * A rect spans between its two scaled ends whichever way the scale runs, so a mirrored
 * scale (range `[0, -width]`) grows the bar away from zero.
 * @template {{percentage: number}} TSegment
 * @param {TSegment[]} segments - Canonical stacked segments
 * @param {object} options
 * @param {(percent: number) => number} options.positionScale - Percent → px along the stacking axis
 * @param {number} options.bandSizePx - Thickness along the cross axis.
 * @param {number} [options.crossOffsetPx] - Offset along the cross axis.
 * @param {boolean} [options.isHorizontal] - Stack along x rather than y.
 * @returns {Array<{x: number, y: number, width: number, height: number, segment: TSegment}>}
 *   One rect per segment, in order, inset by the surface gap.
 */
export function computeStackedBarRects(
    segments,
    { positionScale: scale, bandSizePx, crossOffsetPx = 0, isHorizontal = false },
) {
    const toRect = (/** @type {number} */ pos, /** @type {number} */ size) => ({
        x: isHorizontal ? pos : crossOffsetPx,
        y: isHorizontal ? crossOffsetPx : pos,
        width: isHorizontal ? size : bandSizePx,
        height: isHorizontal ? bandSizePx : size,
    });

    let cumulative = 0;
    return segments.map((segment) => {
        if (!(segment.percentage > 0)) {
            return { ...toRect(scale(0), 0), segment };
        }
        const from = scale(cumulative);
        cumulative += segment.percentage;
        const to = scale(cumulative);
        const inset = insetStackedSegment(Math.min(from, to), Math.abs(to - from));

        return { ...toRect(inset.pos, inset.size), segment };
    });
}
