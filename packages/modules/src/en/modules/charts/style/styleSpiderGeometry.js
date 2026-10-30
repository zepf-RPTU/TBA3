/**
 * The style spider's polar math: spoke angles, the web's radius inside its square,
 * label anchors and how far the labels reach past the square, and the fit loop that
 * settles square size against that reach. No DOM access; the renderer measures the
 * label widths and passes them in. Lengths are in px, angles in degrees clockwise from
 * the top.
 */

import * as d3 from 'd3';

const GEOMETRY = {
    LABEL_OFFSET_PX: 25,
    LABEL_BOUNDS_PADDING_PX: 4,
    LABEL_FIT_MAX_PASSES: 5,
    LABEL_MARGIN_PX: 40,
    LABEL_CENTRE_TOLERANCE_PX: 5,
};

/**
 * Compute the axis angle for a category.
 * Domain0 occupies the left half-circle (top→left→bottom),
 * domain1 occupies the right half-circle (top→right→bottom).
 * First style starts at the top for each domain.
 * @param {number} domainIndex - Position of the domain in `enConfig.domainIds`; picks the half-circle.
 * @param {number} styleIndex - Position of the style in `enConfig.styleCategories`.
 * @param {number} styleCount - Style categories per domain.
 * @returns {number}
 */
export function calculateCategoryAngle(domainIndex, styleIndex, styleCount) {
    const spacing = 180 / styleCount;
    const half = spacing / 2;

    if (domainIndex === 0) {
        return (360 - half - styleIndex * spacing) % 360;
    }
    return half + styleIndex * spacing;
}

/**
 * @param {number} angle
 * @param {number} radius - From the centre.
 * @returns {{x: number, y: number}} Offset from the chart centre.
 */
export function angleToCoordinate(angle, radius) {
    const [x, y] = d3.pointRadial((angle * Math.PI) / 180, radius);
    return { x, y };
}

/**
 * Where a spoke's label sits: a fixed offset past the outer ring.
 * @param {number} angle - Of the spoke.
 * @param {number} radius - Of the outer ring.
 * @returns {{x: number, y: number}} Offset from the chart centre.
 */
export function labelCoordinate(angle, radius) {
    return angleToCoordinate(angle, radius + GEOMETRY.LABEL_OFFSET_PX);
}

/**
 * The web's radius inside a square of the given side: the label margin stays free.
 * @param {number} chartSize - The square's side.
 * @returns {number} The outer ring's radius.
 */
export function radiusFor(chartSize) {
    return Math.max(0, chartSize / 2 - GEOMETRY.LABEL_MARGIN_PX);
}

/**
 * The text-anchor for a label positioned at the given x coordinate (local chart
 * g coordinates). Labels push away from the chart center so the text doesn't
 * bleed back over the polygon area.
 * @param {number} labelX
 * @returns {'start'|'end'|'middle'} Labels near the vertical axis stay centred.
 */
export function getLabelAnchor(labelX) {
    if (labelX > GEOMETRY.LABEL_CENTRE_TOLERANCE_PX) return 'start';
    if (labelX < -GEOMETRY.LABEL_CENTRE_TOLERANCE_PX) return 'end';
    return 'middle';
}

/**
 * Add a small anti-aliasing buffer only when labels exceed the chart square.
 * @param {number} overflow - Zero or less means the labels stay inside.
 * @returns {number} The padded overflow, or `0` when there is nothing to reserve.
 */
function withLabelBoundsPadding(overflow) {
    return overflow > 0 ? Math.ceil(overflow + GEOMETRY.LABEL_BOUNDS_PADDING_PX) : 0;
}

/**
 * How far category labels extend beyond the chart square.
 * @param {number} chartSize - Square chart side length before label overflow.
 * @param {number[]} angles - In category order.
 * @param {number[]} labelWidths - Measured, in category order.
 * @returns {{left: number, right: number}} Past each side of the square.
 */
function measureLabelOverflow(chartSize, angles, labelWidths) {
    if (!Number.isFinite(chartSize) || chartSize <= 0) {
        return { left: 0, right: 0 };
    }

    const radius = radiusFor(chartSize);
    let minX = Infinity;
    let maxX = -Infinity;

    angles.forEach((angle, index) => {
        const labelPoint = labelCoordinate(angle, radius);
        const textAnchor = getLabelAnchor(labelPoint.x);
        const labelWidth = labelWidths[index];

        let labelMinX = labelPoint.x;
        let labelMaxX = labelPoint.x;
        if (textAnchor === 'end') {
            labelMinX -= labelWidth;
        } else if (textAnchor === 'start') {
            labelMaxX += labelWidth;
        } else {
            labelMinX -= labelWidth / 2;
            labelMaxX += labelWidth / 2;
        }

        minX = Math.min(minX, labelMinX);
        maxX = Math.max(maxX, labelMaxX);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
        return { left: 0, right: 0 };
    }

    const halfChartSize = chartSize / 2;
    return {
        left: withLabelBoundsPadding(Math.max(0, -halfChartSize - minX)),
        right: withLabelBoundsPadding(Math.max(0, maxX - halfChartSize)),
    };
}

/**
 * Fit chart size to available width after measured label overflow is known: the
 * labels' reach past the square depends on the square's size, so the two settle
 * over a few passes.
 * @param {number} maxChartSize - Largest square side length allowed by height.
 * @param {number} availableWidth - Width available for chart square plus reserved labels.
 * @param {number[]} angles - In category order.
 * @param {number[]} labelWidths - Measured, in category order; independent of the square's size.
 * @returns {{chartSize: number, labelOverflow: {left: number, right: number}}} The settled square side and the overflow it implies.
 */
export function fitChartSizeForLabelOverflow(maxChartSize, availableWidth, angles, labelWidths) {
    const safeMaxChartSize = Number.isFinite(maxChartSize) ? Math.max(0, maxChartSize) : 0;
    const safeAvailableWidth = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
    let chartSize = Math.min(safeMaxChartSize, safeAvailableWidth);
    let labelOverflow = { left: 0, right: 0 };

    for (let pass = 0; pass < GEOMETRY.LABEL_FIT_MAX_PASSES; pass += 1) {
        labelOverflow = measureLabelOverflow(chartSize, angles, labelWidths);
        const nextChartSize = Math.min(
            safeMaxChartSize,
            Math.max(0, safeAvailableWidth - labelOverflow.left - labelOverflow.right),
        );

        const settled = Math.abs(nextChartSize - chartSize) < 0.5;
        chartSize = nextChartSize;
        if (settled) break;
    }

    labelOverflow = measureLabelOverflow(chartSize, angles, labelWidths);
    return { chartSize, labelOverflow };
}
