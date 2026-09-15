/**
 * Pure SVG legend layout helpers.
 *
 * ChartRenderer remains the public facade. These helpers keep geometry and
 * candidate-scoring logic out of the renderer lifecycle class.
 */

/**
 * Layout defaults shared by legend measurement and rendering. One home —
 * measure and render used to carry their own copies of these literals, which
 * is exactly the kind of drift that let their formulas diverge.
 */
export const LEGEND_DEFAULTS = Object.freeze({
    spacing: Object.freeze({ vertical: 25, horizontal: 120 }),
    symbolTextGap: Object.freeze({ vertical: 15, horizontal: 12 }),
    columns: 1,
    columnGap: 10,
    symbolSize: 6,
});

/**
 * The x offset where a legend item’s label starts, after its symbol and the gap.
 * @param {object} item - The legend item being sized.
 * @param {object} [options] - Symbol and gap defaults, plus any measured `textWidth`.
 * @returns {number} Offset in px from the item’s own origin.
 */
export function getLegendItemTextX(item, options = {}) {
    const {
        defaultSymbolSize = LEGEND_DEFAULTS.symbolSize,
        symbolTextGap = LEGEND_DEFAULTS.symbolTextGap.horizontal,
    } = options;
    const symbol = item?.symbol || 'circle';
    const symbolSize = item?.symbolSize ?? defaultSymbolSize;

    if (symbol === 'line') return symbolSize * 3 + 5;
    if (symbol === 'lollipop') return symbolSize * 4 + 5;
    if (symbol === 'rect') return symbolSize + symbolTextGap - 6;
    return symbolTextGap;
}

/**
 * How far a symbol’s drawn extent reaches left of its anchor point.
 * Symbols anchor differently — a circle at its centre, a square at its corner — so the
 * row cannot be laid out from the anchor alone.
 * @param {object} item - The legend item being sized.
 * @param {object} [options] - Symbol size default.
 * @returns {number} Offset in px.
 */
function getLegendItemAnchorOffset(item, options = {}) {
    const { defaultSymbolSize = LEGEND_DEFAULTS.symbolSize } = options;
    const symbol = item?.symbol || 'circle';
    const symbolSize = item?.symbolSize ?? defaultSymbolSize;

    if (symbol === 'rect' || symbol === 'line' || symbol === 'lollipop') return 0;
    return symbolSize;
}

/**
 * The full rendered width of one horizontal legend item: symbol, gap and label.
 * @param {object} item - The legend item being sized.
 * @param {object} [options] - Symbol and gap defaults, plus any measured `textWidth`.
 * @returns {number} Width in px.
 */
export function estimateLegendItemWidth(item, options = {}) {
    const {
        defaultSymbolSize = LEGEND_DEFAULTS.symbolSize,
        symbolTextGap = LEGEND_DEFAULTS.symbolTextGap.horizontal,
        textWidth = 0,
    } = options;

    return (
        getLegendItemAnchorOffset(item, { defaultSymbolSize }) +
        getLegendItemTextX(item, { defaultSymbolSize, symbolTextGap }) +
        textWidth
    );
}

/**
 * Resolve the complete geometry of one SVG legend from a single interpretation
 * of its config: the measured extent (what the layout solver reserves), the
 * root-group anchor (slot position plus centering), the title offset, and every
 * item's position within the group. `measureLegendSize` returns `.size` and
 * `createLegend` draws at `.anchor`/`.itemPositions`, so measurement and
 * rendering cannot drift apart again.
 *
 * One historical quirk is preserved on purpose: horizontal auto-centering uses
 * the nominal width (`items * spacing`, or summed item widths in itemGap mode),
 * not the measured extent — changing that would shift every centered legend.
 * @param {object} config - Same shape as createLegend()/measureLegendSize()
 * @param {object} context - The measuring adapter, the resolved font size, and the slot when rendering into one.
 * @param {function(string, object=): {width: number, height: number}} context.measureText
 *   - Text measurement adapter; receives (text, {fontWeight}) and measures at the
 *     resolved legend font
 * @param {number} context.fontSize - Resolved legend font size (px)
 * @param {{x: number, y: number, width: number, height: number}|null} [context.slot]
 *   - Computed-layout slot for `config.legendIndex`, when rendering into one
 * @returns {{ size: {width: number, height: number}, anchor: {x: number, y: number},
 *   titleOffset: number, itemPositions: Array<{x: number, y: number}> }} The measured extent, the root-group anchor, the title offset, and every item’s position.
 */
export function resolveLegendGeometry(config, context) {
    const {
        items = [],
        layout = {},
        title = null,
        symbolSize: defaultSymbolSize = LEGEND_DEFAULTS.symbolSize,
    } = config;
    const { measureText, fontSize, slot = null } = context;

    const direction = layout.direction ?? 'horizontal';
    const isVertical = direction === 'vertical';
    const spacing =
        layout.spacing ?? LEGEND_DEFAULTS.spacing[isVertical ? 'vertical' : 'horizontal'];
    const symbolTextGap =
        layout.symbolTextGap ??
        LEGEND_DEFAULTS.symbolTextGap[isVertical ? 'vertical' : 'horizontal'];
    const columns = layout.columns ?? LEGEND_DEFAULTS.columns;
    const columnGap = layout.columnGap ?? LEGEND_DEFAULTS.columnGap;
    const itemGap = layout.itemGap ?? null;

    const measure = (text, options = {}) => {
        const label = String(text ?? '');
        return label ? measureText(label, options) : { width: 0, height: 0 };
    };
    const textWidthOf = (item) =>
        Number.isFinite(item?.textWidth) ? item.textWidth : measure(item?.label).width;
    const itemWidthOf = (item) =>
        estimateLegendItemWidth(item, {
            defaultSymbolSize,
            symbolTextGap,
            textWidth: textWidthOf(item),
        });

    let maxTextWidth = 0;
    let maxTextHeight = 0;
    items.forEach((item) => {
        const measured = measure(item?.label);
        maxTextWidth = Math.max(maxTextWidth, measured.width);
        maxTextHeight = Math.max(maxTextHeight, measured.height);
    });

    const titleOffset = title ? fontSize * 2 : 0; // title line + gap to first item
    const symWidth = defaultSymbolSize * 2; // symbol rendering width

    // The render draws the bold title at natural width in every direction, so
    // the measured width can never be narrower than the title.
    const clampToTitleWidth = (width) =>
        title ? Math.max(width, measure(title, { fontWeight: 'bold' }).width) : width;

    const variableWidth = itemGap != null && !isVertical;
    const distributedHorizontal =
        !isVertical &&
        layout.distributeItems === true &&
        Number.isFinite(layout.distributeInWidth) &&
        items.length > 0;

    // --- Measured extent (what the layout solver reserves) ---
    let size;
    if (distributedHorizontal) {
        size = {
            width: clampToTitleWidth(layout.distributeInWidth),
            height: titleOffset + maxTextHeight,
        };
    } else if (isVertical) {
        const rowCount = Math.ceil(items.length / columns);
        // Rows sit at `row * spacing`; the extent ends one text line below the
        // last row's baseline (same formula the vertical centering uses).
        const height =
            rowCount > 0 ? titleOffset + (rowCount - 1) * spacing + fontSize : titleOffset;
        const colWidth = symWidth + symbolTextGap + maxTextWidth;
        size = {
            width: clampToTitleWidth(columns * colWidth + (columns - 1) * columnGap),
            height,
        };
    } else if (variableWidth) {
        let totalWidth = 0;
        items.forEach((item, i) => {
            totalWidth += itemWidthOf(item);
            if (i < items.length - 1) totalWidth += itemGap;
        });
        size = { width: clampToTitleWidth(totalWidth), height: titleOffset + maxTextHeight };
    } else {
        // Plain horizontal: items anchor at `i * spacing`, so the extent ends
        // after the LAST item's actual content.
        const width =
            items.length > 0
                ? (items.length - 1) * spacing + itemWidthOf(items[items.length - 1])
                : 0;
        size = { width: clampToTitleWidth(width), height: titleOffset + maxTextHeight };
    }

    // --- Root-group anchor (slot position plus centering) ---
    const position = slot ? { x: slot.x, y: slot.y } : (layout.position ?? { x: 0, y: 0 });
    const autoCenter = layout.centerInWidth ?? (slot && !isVertical ? slot.width : null);
    let anchorX = position.x;
    let anchorY = position.y;
    if (autoCenter != null && !isVertical && !distributedHorizontal) {
        let totalWidth;
        if (variableWidth) {
            totalWidth =
                items.reduce(
                    (sum, item) => sum + defaultSymbolSize + symbolTextGap + textWidthOf(item),
                    0,
                ) +
                Math.max(0, items.length - 1) * itemGap;
        } else {
            totalWidth = items.length * spacing;
        }
        anchorX = position.x + (autoCenter - totalWidth) / 2;
    }
    if (layout.verticalCenter && isVertical && slot?.height) {
        anchorY = slot.y + Math.max(0, (slot.height - size.height) / 2);
    }

    // --- Per-item positions within the group ---
    const itemsPerCol =
        isVertical && columns > 1 ? Math.ceil(items.length / columns) : items.length;
    const multiColWidth =
        isVertical && columns > 1 ? symWidth + symbolTextGap + maxTextWidth + columnGap : 0;
    let cursorX = defaultSymbolSize; // initial offset for the first symbol center
    const itemPositions = items.map((item, i) => {
        if (distributedHorizontal) {
            const slotWidth = (layout.distributeInWidth ?? 0) / items.length;
            const startX = i * slotWidth + Math.max(0, (slotWidth - itemWidthOf(item)) / 2);
            return {
                x: startX + getLegendItemAnchorOffset(item, { defaultSymbolSize }),
                y: titleOffset,
            };
        }
        if (variableWidth) {
            const x = cursorX;
            cursorX += symbolTextGap + textWidthOf(item);
            if (i < items.length - 1) cursorX += itemGap ?? 0;
            return { x, y: titleOffset };
        }
        if (isVertical) {
            if (columns > 1) {
                const col = Math.floor(i / itemsPerCol);
                const row = i % itemsPerCol;
                return { x: col * multiColWidth, y: row * spacing + titleOffset };
            }
            return { x: 0, y: i * spacing + titleOffset };
        }
        return { x: i * spacing, y: titleOffset };
    });

    return { size, anchor: { x: anchorX, y: anchorY }, titleOffset, itemPositions };
}

/**
 * Whether equal-width slots across `availableWidth` hold every item.
 * @param {Array<object>} items - The legend items to place.
 * @param {number} availableWidth - Width the row has to fit into.
 * @param {function(object): number} getItemWidth - Measures one item.
 * @returns {boolean} True when the row layout can be used; false for an empty list or no width.
 */
export function canDistributeLegendItemsEvenly(items, availableWidth, getItemWidth) {
    if (!Array.isArray(items) || items.length === 0 || availableWidth <= 0) {
        return false;
    }

    const slotWidth = availableWidth / items.length;
    return items.every((item) => getItemWidth(item) <= slotWidth);
}

/**
 * Pick the first candidate legend config that fits the constraints, measuring each in turn.
 * @param {object} legendConfig - Base config, used when no candidates are supplied.
 * @param {Array<object>} candidates - Alternative configs, in preference order.
 * @param {object} constraints - `maxWidth` and `maxHeight` budgets; unset means unbounded.
 * @param {function(object): {width: number, height: number}} measureLegendSize - Measures one candidate.
 * @returns {object} The winning candidate with its measured geometry; `fits` is false when even the last overflows.
 */
export function resolveMeasuredLegendLayout(
    legendConfig,
    candidates = [],
    constraints = {},
    measureLegendSize,
) {
    const maxWidth = Number.isFinite(constraints.maxWidth) ? constraints.maxWidth : Infinity;
    const maxHeight = Number.isFinite(constraints.maxHeight) ? constraints.maxHeight : Infinity;
    const layoutCandidates =
        Array.isArray(candidates) && candidates.length > 0
            ? candidates
            : [{ layout: legendConfig.layout || {} }];

    const measuredCandidates = layoutCandidates.map((candidate, index) => {
        const { layout = {}, ...candidateOverrides } = candidate;
        const config = {
            ...legendConfig,
            ...candidateOverrides,
            layout: {
                ...(legendConfig.layout || {}),
                ...layout,
            },
        };
        const size = measureLegendSize(config);
        const overflowWidth = Math.max(0, size.width - maxWidth);
        const overflowHeight = Math.max(0, size.height - maxHeight);

        return {
            config,
            layout: config.layout,
            size,
            candidate,
            index,
            fits: overflowWidth === 0 && overflowHeight === 0,
            overflowWidth,
            overflowHeight,
            overflowArea: overflowWidth * overflowHeight,
            overflowTotal: overflowWidth + overflowHeight,
        };
    });

    return (
        measuredCandidates.find((result) => result.fits) ||
        [...measuredCandidates].sort((a, b) => {
            if (a.overflowTotal !== b.overflowTotal) return a.overflowTotal - b.overflowTotal;
            if (a.overflowArea !== b.overflowArea) return a.overflowArea - b.overflowArea;
            return a.index - b.index;
        })[0]
    );
}

/**
 * Resolve several legend blocks sharing one vertical slot, stacked with a gap.
 * @param {Array<object>} entries - The blocks, in stack order, each with its own candidates.
 * @param {object} options - The `gap` between blocks and the slot’s `maxWidth`/`maxHeight`.
 * @param {Function} resolveEntryLayout - Resolves one block against the remaining space.
 * @returns {object} One resolved entry per block, plus the stack’s total size.
 */
export function resolveStackedLegendLayout(entries, options = {}, resolveEntryLayout) {
    const gap = options.gap ?? 20;
    const maxWidth = Number.isFinite(options.maxWidth) ? options.maxWidth : Infinity;
    const maxHeight = Number.isFinite(options.maxHeight) ? options.maxHeight : Infinity;
    const candidateSets = entries.map((entry) => {
        const candidates =
            Array.isArray(entry.candidates) && entry.candidates.length > 0
                ? entry.candidates
                : [{ layout: entry.config.layout || {} }];

        return candidates.map((candidate) =>
            resolveEntryLayout(entry.config, [candidate], {
                maxWidth,
                maxHeight,
            }),
        );
    });

    const combinations = candidateSets.reduce(
        (acc, set) => {
            const next = [];
            acc.forEach((combo) => {
                set.forEach((result) => next.push([...combo, result]));
            });
            return next;
        },
        [[]],
    );

    const scored = combinations.map((combo, index) => {
        const width = combo.reduce((max, result) => Math.max(max, result.size.width), 0);
        const height =
            combo.reduce((sum, result) => sum + result.size.height, 0) +
            Math.max(0, combo.length - 1) * gap;
        const overflowWidth = Math.max(0, width - maxWidth);
        const overflowHeight = Math.max(0, height - maxHeight);

        return {
            entries: combo,
            size: { width, height },
            gap,
            fits: overflowWidth === 0 && overflowHeight === 0,
            overflowWidth,
            overflowHeight,
            overflowTotal: overflowWidth + overflowHeight,
            index,
        };
    });

    return (
        scored.find((result) => result.fits) ||
        [...scored].sort((a, b) => {
            if (a.overflowTotal !== b.overflowTotal) return a.overflowTotal - b.overflowTotal;
            return a.index - b.index;
        })[0]
    );
}

/**
 * Resolve a legend by the shared overflow strategy: horizontal distributed row,
 * then multi-column vertical, then single-column vertical.
 * @param {Array<object>} items - The legend items to place.
 * @param {number} availableWidth - Width the legend has to fit into.
 * @param {object} [options] - Measurement overrides and layout constraints, forwarded to each strategy.
 * @param {object} [context] - The measuring and resolving collaborators the strategies call back into.
 * @returns {object} The first strategy’s layout that fits, or the single-column fallback.
 */
export function resolveAdaptiveLegendLayout(items, availableWidth, options = {}, context = {}) {
    const measureOptions = context.getMeasurementOptions(options);
    const { fontSize, fontFamily, defaultSymbolSize, symbolTextGap } = measureOptions;
    const { columnGap = 10, horizontalLayout = {} } = options;
    // The vertical fallbacks stack rows one text line plus a gap apart, and try at
    // most two columns before settling on a single one.
    const verticalSpacing = fontSize + 10;
    const maxColumns = 2;

    if (!Array.isArray(items) || items.length === 0) {
        return { direction: 'horizontal', symbolTextGap, ...horizontalLayout };
    }

    if (
        context.canDistributeItems(items, availableWidth, {
            defaultSymbolSize,
            symbolTextGap,
            fontSize,
            fontFamily,
        })
    ) {
        return {
            direction: 'horizontal',
            distributeItems: true,
            distributeInWidth: availableWidth,
            symbolTextGap,
            ...horizontalLayout,
        };
    }

    const resolvedMaxColumns = Math.min(Math.max(1, maxColumns), items.length);
    const candidates = [];
    for (let columns = resolvedMaxColumns; columns >= 2; columns--) {
        candidates.push({
            layout: {
                direction: 'vertical',
                columns,
                columnGap,
                spacing: verticalSpacing,
                symbolTextGap,
            },
        });
    }
    candidates.push({
        layout: {
            direction: 'vertical',
            columns: 1,
            spacing: verticalSpacing,
            symbolTextGap,
        },
    });

    return context.resolveMeasuredLayout({ items, fontSize, layout: {} }, candidates, {
        maxWidth: availableWidth,
    }).layout;
}

/**
 * Apply a computed slot to a legend config, centring it within the slot.
 * @param {object} legendConfig - The config to place.
 * @param {object|null} slot - The slot to place it in; null anchors it at the origin.
 * @param {function(object): {width: number, height: number}} measureLegendSize - Measures the legend, to centre it.
 * @returns {object} The config with slot-derived anchor and item positions applied.
 */
export function resolveLegendLayoutForSlot(legendConfig, slot, measureLegendSize) {
    const nextConfig = {
        ...legendConfig,
        layout: { ...(legendConfig.layout || {}) },
    };

    if (!slot) return nextConfig;

    nextConfig.layout.position = { x: slot.x, y: slot.y };

    if (nextConfig.layout.direction === 'horizontal') {
        if (nextConfig.layout.distributeItems) {
            nextConfig.layout.distributeInWidth = slot.width;
        } else {
            nextConfig.layout.centerInWidth = slot.width;
        }
    } else {
        const measured = measureLegendSize(nextConfig);
        nextConfig.layout.position.x = slot.x + Math.max(0, (slot.width - measured.width) / 2);
    }

    return nextConfig;
}
