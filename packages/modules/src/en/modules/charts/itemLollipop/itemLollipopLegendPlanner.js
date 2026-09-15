/**
 * Item-lollipop legend layout planner — pure fit-to-slot geometry for the EN item
 * lollipop legend.
 *
 * These functions are pure: given the two legend item-descriptor lists (built by the
 * renderer, which owns their colors/visibility/cache) plus measurements, they decide
 * the legend's stack config, whether it fits a slot, and whether it should sit to the
 * right or flip to the bottom. The one dependency on the shared `LegendRenderer` — the
 * measurement of a stacked layout — is injected as `measureStackLayout`, so the
 * right-vs-bottom decision is unit-testable with a stub measurer (no live renderer/DOM).
 * The renderer feeds the returned plan/config back to `this.legend` to draw it.
 */

// Legend layout tuning. LEGEND_GAP (chart↔legend gap) is also consumed by the
// renderer's default legend-slot config, so it is exported; the rest are internal
// to the fit decision (min chart sizes before flipping to a bottom legend) and the
// bottom-legend inner gaps.
export const LEGEND_GAP = 15;
const MIN_RIGHT_LEGEND_CHART_WIDTH = 280;
const MIN_BOTTOM_LEGEND_CHART_HEIGHT = 120;
const BOTTOM_STACK_GAP = 12;
const BOTTOM_AVERAGE_ITEM_GAP = 18;
const BOTTOM_NIVEAU_COLUMN_GAP = 12;

/**
 * Build the stacked-legend config (niveau stack + average stack, with per-position
 * candidate layouts the LegendRenderer tries in order to fit its slot).
 * @param {Array} niveauItems - Niveau legend item descriptors.
 * @param {Array} averageItems - Average (school/state) legend item descriptors.
 * @param {{position?: 'right'|'bottom', maxHeight?: number, maxWidth?: number}} [options] - Where the legend will sit and the space it may occupy there.
 * @returns {{stacked: any[], stackOptions: {gap: number, maxHeight?: number, maxWidth?: number}}} The two stacks plus the options the LegendRenderer measures them with.
 */
export function buildLegendStackConfig(niveauItems, averageItems, options = {}) {
    const position = options.position ?? 'right';
    const isBottomLegend = position === 'bottom';

    return {
        stacked: [
            {
                config: {
                    items: niveauItems,
                    layout: isBottomLegend
                        ? { direction: 'vertical', columns: 4, columnGap: BOTTOM_NIVEAU_COLUMN_GAP }
                        : { direction: 'vertical' },
                    title: 'Niveau',
                    cssClass: 'niveau-legend',
                },
                candidates: isBottomLegend
                    ? [
                          {
                              layout: {
                                  direction: 'vertical',
                                  columns: 4,
                                  columnGap: BOTTOM_NIVEAU_COLUMN_GAP,
                              },
                          },
                          {
                              layout: {
                                  direction: 'vertical',
                                  columns: 3,
                                  columnGap: BOTTOM_NIVEAU_COLUMN_GAP,
                              },
                          },
                          {
                              layout: {
                                  direction: 'vertical',
                                  columns: 2,
                                  columnGap: BOTTOM_NIVEAU_COLUMN_GAP,
                              },
                          },
                          { layout: { direction: 'vertical', columns: 1 } },
                      ]
                    : [
                          { layout: { direction: 'vertical', columns: 1 } },
                          { layout: { direction: 'vertical', columns: 2 } },
                      ],
            },
            {
                config: {
                    items: averageItems,
                    layout: isBottomLegend
                        ? { direction: 'horizontal', itemGap: BOTTOM_AVERAGE_ITEM_GAP }
                        : { direction: 'vertical' },
                    cssClass: 'average-legend',
                },
                candidates: isBottomLegend
                    ? [
                          { layout: { direction: 'horizontal', itemGap: BOTTOM_AVERAGE_ITEM_GAP } },
                          { layout: { direction: 'vertical' } },
                      ]
                    : undefined,
            },
        ],
        stackOptions: {
            gap: isBottomLegend ? BOTTOM_STACK_GAP : 20,
            maxHeight: options.maxHeight,
            maxWidth: options.maxWidth,
        },
    };
}

/**
 * True when a measured stacked-legend layout fits within a slot (with a 0.5px
 * tolerance). A non-finite slot dimension is treated as unbounded.
 * @param {{size?: {width: number, height: number}}|null|undefined} stackLayout - A measured layout; an unmeasured one never fits.
 * @param {{width?: number, height?: number}|null|undefined} slot - The space the legend has been given.
 * @returns {boolean} True when the layout can be rendered in that slot without clipping.
 */
export function legendLayoutFitsSlot(stackLayout, slot) {
    if (!stackLayout?.size || !slot) return false;

    const slotWidth = Number.isFinite(slot.width) ? /** @type {number} */ (slot.width) : Infinity;
    const slotHeight = Number.isFinite(slot.height)
        ? /** @type {number} */ (slot.height)
        : Infinity;

    return stackLayout.size.width <= slotWidth + 0.5 && stackLayout.size.height <= slotHeight + 0.5;
}

/**
 * Decide whether the legend sits to the right or flips to the bottom, and return the
 * matching stack config + alignment. The legend flips to the bottom when the right
 * layout would squeeze the chart below its minimum width and a bottom layout leaves
 * enough chart height. A `forcedPosition` (from a locked slot) overrides the decision.
 * @param {{
 *   niveauItems: Array,
 *   averageItems: Array,
 *   measurements: {containerWidth: number, containerHeight: number, axisLeftSpace: number, axisBottomSpace: number},
 *   layoutPadding: {left?: number, right?: number, top?: number, bottom?: number}|null|undefined,
 *   measureStackLayout: (stacked: any[], stackOptions: any) => {size: {width: number, height: number}},
 *   forcedPosition?: 'right'|'bottom'|null
 * }} params - The legend entries, the measured space the chart has, the caller's measuring function, and an optional forced position.
 * @returns {{position: 'right'|'bottom', legendStackConfig: any, stackAlign: 'start'|'center'}} Where the legend goes, the stack config for that position, and how the stacks align there.
 */
export function resolveLegendPlan({
    niveauItems,
    averageItems,
    measurements,
    layoutPadding,
    measureStackLayout,
    forcedPosition = null,
}) {
    const rightLegendConfig = buildLegendStackConfig(niveauItems, averageItems, {
        position: 'right',
        maxHeight: Math.max(0, measurements.containerHeight - 10 - measurements.axisBottomSpace),
    });
    const rightLegendLayout = measureStackLayout(
        rightLegendConfig.stacked,
        rightLegendConfig.stackOptions,
    );

    const horizontalPadding =
        Math.max(4, layoutPadding?.left ?? 0) + Math.max(4, layoutPadding?.right ?? 0);
    const verticalPadding =
        Math.max(4, layoutPadding?.top ?? 0) + Math.max(4, layoutPadding?.bottom ?? 0);
    const rightChartWidth = Math.max(
        0,
        measurements.containerWidth -
            horizontalPadding -
            measurements.axisLeftSpace -
            rightLegendLayout.size.width -
            LEGEND_GAP,
    );

    const bottomLegendConfig = buildLegendStackConfig(niveauItems, averageItems, {
        position: 'bottom',
        maxWidth: Math.max(
            0,
            measurements.containerWidth - horizontalPadding - measurements.axisLeftSpace,
        ),
    });
    const bottomLegendLayout = measureStackLayout(
        bottomLegendConfig.stacked,
        bottomLegendConfig.stackOptions,
    );
    const bottomChartHeight = Math.max(
        0,
        measurements.containerHeight -
            verticalPadding -
            measurements.axisBottomSpace -
            bottomLegendLayout.size.height -
            LEGEND_GAP,
    );

    const useBottomLegend =
        forcedPosition === 'bottom' ||
        (forcedPosition === null &&
            rightChartWidth < MIN_RIGHT_LEGEND_CHART_WIDTH &&
            bottomChartHeight >= MIN_BOTTOM_LEGEND_CHART_HEIGHT);

    return {
        position: useBottomLegend ? 'bottom' : 'right',
        legendStackConfig: useBottomLegend ? bottomLegendConfig : rightLegendConfig,
        stackAlign: useBottomLegend ? 'center' : 'start',
    };
}
