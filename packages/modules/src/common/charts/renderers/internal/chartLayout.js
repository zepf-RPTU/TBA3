/**
 * Pure chart layout solver.
 *
 * Allocates the container box into axis bands, legend slots and the chart
 * rect. Intentionally DOM-free: container size, resolved layout config and
 * the CSS legend gap are passed in, and legend measurement is injected as a
 * callback — it receives the RUNNING available size because stacked legends
 * constrain themselves to the space earlier slots left over, so measurement
 * cannot be precomputed before the loop. ChartRenderer owns dimension
 * gathering, the axis-consumption warning and the `layout`/`_chartTooSmall`
 * state around this solver.
 *
 * Slot quirks preserved on purpose (pinned by chartLayoutCharacterization):
 * legend rects reach back into axis space (+axes.right / −axes.left /
 * −axes.top / +axes.bottom) so legends sit beside axis labels rather than
 * beside the plot, and the bottom branch records its rect BEFORE shrinking
 * the available height while the other three shrink first.
 */

/**
 * @callback MeasureLegend
 * @param {object} legendConfig - The legend config for this slot
 * @param {{ position: string, availWidth: number, availHeight: number }} constraints
 * @returns {{width: number, height: number, stackLayout: object | null}}
 */

/**
 * Compute the chart layout from pure inputs.
 * @param {object} inputs - The container box, the resolved layout config, and any measured overrides.
 * @param {{ width: number, height: number }} inputs.container - Container content box
 * @param {object} inputs.layoutConfig - Resolved layout config
 *   ({ legends, axis, axisExtra, padding, aspectRatio } — all sides present)
 * @param {object} [inputs.axisOverrides] - Measured per-side axis space; replaces
 *   `layoutConfig.axis` per side (axisExtra is still added on top)
 * @param {Array<object>} [inputs.legendConfigs] - Legend configs per layout slot;
 *   a missing entry falls back to the slot's width/height hints
 * @param {number} inputs.legendGap - Gap fallback when a slot has no explicit gap
 * @param {MeasureLegend} measureLegend - Injected legend measurement
 * @returns {{ chart: object, legends: Array<object>, legendStackLayouts: Array<object|null>,
 *   axes: object, container: object, chartTooSmall: boolean }} The plot rect, each legend’s slot, the axis reservations, and whether the plot has collapsed below a usable size.
 */
export function computeChartLayout(
    { container, layoutConfig, axisOverrides = {}, legendConfigs = [], legendGap },
    measureLegend,
) {
    let availX = layoutConfig.padding.left;
    let availY = layoutConfig.padding.top;
    let availW = container.width - layoutConfig.padding.left - layoutConfig.padding.right;
    let availH = container.height - layoutConfig.padding.top - layoutConfig.padding.bottom;

    // --- Axis space ---
    const extra = layoutConfig.axisExtra;
    const axes = {
        top: (axisOverrides.top ?? layoutConfig.axis.top) + extra.top,
        right: (axisOverrides.right ?? layoutConfig.axis.right) + extra.right,
        bottom: (axisOverrides.bottom ?? layoutConfig.axis.bottom) + extra.bottom,
        left: (axisOverrides.left ?? layoutConfig.axis.left) + extra.left,
    };

    availX += axes.left;
    availY += axes.top;
    availW -= axes.left + axes.right;
    availH -= axes.top + axes.bottom;

    // --- Legend space ---
    const legendLayouts = [];
    const legendStackLayouts = [];
    const legendEntries = layoutConfig.legends;

    for (let i = 0; i < legendEntries.length; i++) {
        const entry = legendEntries[i];
        const gap = entry.gap ?? legendGap;
        const position = entry.position || 'bottom';

        // Measure legend if config provided, else use entry.width/height hints
        let legendW, legendH;
        const legendConfig = legendConfigs[i];
        let legendStackLayout = null;
        if (legendConfig) {
            const measured = measureLegend(legendConfig, {
                position,
                availWidth: availW,
                availHeight: availH,
            });
            legendW = measured.width;
            legendH = measured.height;
            legendStackLayout = measured.stackLayout ?? null;
        } else {
            legendW = entry.width || 0;
            legendH = entry.height || 0;
        }

        let lx, ly;
        if (position === 'right') {
            lx = availX + availW - legendW + axes.right;
            ly = availY;
            availW -= legendW + gap;
            legendLayouts.push({
                x: lx,
                y: ly,
                width: Math.max(0, legendW),
                height: Math.max(0, availH),
                position,
            });
            legendStackLayouts.push(legendStackLayout);
        } else if (position === 'left') {
            lx = availX - axes.left;
            ly = availY;
            availX += legendW + gap;
            availW -= legendW + gap;
            legendLayouts.push({
                x: lx,
                y: ly,
                width: Math.max(0, legendW),
                height: Math.max(0, availH),
                position,
            });
            legendStackLayouts.push(legendStackLayout);
        } else if (position === 'top') {
            lx = availX;
            ly = availY - axes.top;
            availY += legendH + gap;
            availH -= legendH + gap;
            legendLayouts.push({
                x: lx,
                y: ly,
                width: Math.max(0, availW),
                height: Math.max(0, legendH),
                position,
            });
            legendStackLayouts.push(legendStackLayout);
        } else {
            // bottom (default)
            legendLayouts.push({
                x: availX,
                y: availY + availH - legendH + axes.bottom,
                width: Math.max(0, availW),
                height: Math.max(0, legendH),
                position,
            });
            availH -= legendH + gap;
            legendStackLayouts.push(legendStackLayout);
        }
    }

    // --- Aspect ratio constraint ---
    let chartX = availX;
    let chartY = availY;
    let chartW = Math.max(0, availW);
    let chartH = Math.max(0, availH);

    if (layoutConfig.aspectRatio != null && layoutConfig.aspectRatio > 0) {
        const targetRatio = layoutConfig.aspectRatio; // width / height
        const currentRatio = chartW / chartH;

        if (currentRatio > targetRatio) {
            // Too wide — shrink width, center horizontally
            const newW = chartH * targetRatio;
            chartX += (chartW - newW) / 2;
            chartW = newW;
        } else {
            // Too tall — shrink height, center vertically
            const newH = chartW / targetRatio;
            chartY += (chartH - newH) / 2;
            chartH = newH;
        }
    }

    return {
        chart: { x: chartX, y: chartY, width: Math.max(0, chartW), height: Math.max(0, chartH) },
        legends: legendLayouts,
        legendStackLayouts,
        axes,
        container: { width: container.width, height: container.height },
        chartTooSmall: chartW < 50 || chartH < 50,
    };
}
