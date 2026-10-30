/**
 * The style lollipop's geometry: its size constants and the pure row layout — the
 * band scales every mode shares and the minimum chart height those bands still fit in.
 * No DOM access; the renderer measures the head and passes its height in.
 */

import * as d3 from 'd3';

export const CHART_CONFIG = {
    HEAD: {
        MIN_WIDTH_PX: 38,
        MIN_HEIGHT_PX: 18,
        PADDING_X_PX: 7,
        PADDING_Y_PX: 2,
        HOVER_GROWTH_PX: 2,
        RIGHT_GAP_PX: 8,
        MIN_PAIR_CLEARANCE_PX: 2,
    },
    STYLE_BANDS: {
        PADDING_CANDIDATES: [
            { outerInner: 0.12, outerOuter: 0.04, inner: 0.08 },
            { outerInner: 0.08, outerOuter: 0.03, inner: 0.06 },
            { outerInner: 0.03, outerOuter: 0.015, inner: 0.03 },
            { outerInner: 0.01, outerOuter: 0.01, inner: 0.02 },
        ],
    },
    LAYOUT: {
        TOP_PADDING_PX: 4,
    },
    /** Where the domain letter sits, just inside the stem base. */
    DOMAIN_TAG: {
        X_PX: 3,
    },
    /**
     * The selected person's mark: a hollow pill on the value, in the geometry and
     * colour of the group's filled pill, so fill mode tells the two apart.
     */
    STUDENT: {
        /** When the two pills would overlap, the student's rises off the stem by this gap. */
        LIFT_GAP_PX: 2,
    },
};

/**
 * The rows' bands in every mode: an outer band per style, an inner band per drawn domain.
 * The padding is the loosest whose inner bands still part both domains' pills, else the
 * tightest; it depends on the height alone, so a mode switch moves no style band. A single
 * drawn domain has one inner band, centred in the style band.
 * @param {string[]} bandLabels
 * @param {string[]} domainKeys - Both domains.
 * @param {string[]} drawnDomainKeys - The domains whose rows are drawn.
 * @param {number} chartHeightPx
 * @param {number} headHeightPx - Measured.
 * @returns {{yScaleOuter: import('d3').ScaleBand<string>, yScaleInner: import('d3').ScaleBand<string>}}
 */
export function resolveStyleBandScales(
    bandLabels,
    domainKeys,
    drawnDomainKeys,
    chartHeightPx,
    headHeightPx,
) {
    const requiredCenterGap = headHeightPx + CHART_CONFIG.HEAD.MIN_PAIR_CLEARANCE_PX;

    const scalesFor = (
        /** @type {{outerInner: number, outerOuter: number, inner: number}} */ candidate,
    ) => {
        const yScaleOuter = d3
            .scaleBand()
            .domain(bandLabels)
            .range([0, chartHeightPx])
            .paddingInner(candidate.outerInner)
            .paddingOuter(candidate.outerOuter);
        const yScaleInner = d3
            .scaleBand()
            .domain(domainKeys)
            .range([0, yScaleOuter.bandwidth()])
            .padding(candidate.inner);
        return { yScaleOuter, yScaleInner };
    };

    const candidates = CHART_CONFIG.STYLE_BANDS.PADDING_CANDIDATES;
    const { yScaleOuter, yScaleInner } =
        candidates
            .map(scalesFor)
            .find((scales) => scales.yScaleInner.step() >= requiredCenterGap) ??
        scalesFor(candidates[candidates.length - 1]);
    return { yScaleOuter, yScaleInner: yScaleInner.domain(drawnDomainKeys) };
}

/**
 * Minimum chart height (row-band area only, without axis and legend chrome) at which the
 * rows still fit their own minimum size in every mode: the style band holds both domains'
 * pills, and with a student the lifted pill above a single row too. Inverts the outer
 * d3.scaleBand math of resolveStyleBandScales at its loosest padding candidate (index 0),
 * not the tightest fallback.
 * @param {number} categoryCount - Style categories, i.e. style bands.
 * @param {number} headHeightPx - Measured.
 * @param {boolean} hasStudent - Whether a student is selected, whose pill may lift above the stem.
 * @returns {number} In px.
 */
export function computeMinChartHeight(categoryCount, headHeightPx, hasStudent) {
    const { outerInner, outerOuter, inner } = CHART_CONFIG.STYLE_BANDS.PADDING_CANDIDATES[0];
    const pairBand = (headHeightPx + CHART_CONFIG.HEAD.MIN_PAIR_CLEARANCE_PX) * (2 + inner);
    // The stem sits at the band centre, so the lifted pill needs a pill height plus gap on
    // either side of the group pill.
    const liftedBand = hasStudent ? headHeightPx * 3 + CHART_CONFIG.STUDENT.LIFT_GAP_PX * 2 : 0;
    const bandHeight = Math.max(pairBand, liftedBand);
    return (bandHeight * (categoryCount - outerInner + 2 * outerOuter)) / (1 - outerInner);
}
